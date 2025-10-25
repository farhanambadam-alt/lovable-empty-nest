import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { sanitizeGitHubError, sanitizeGeneralError } from '../_shared/error-sanitizer.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { corsHeaders } from '../_shared/cors.ts';

const listPagesSitesSchema = z.object({
  provider_token: z.string().min(1, 'GitHub token required'),
});

interface PagesSite {
  repository: string;
  owner: string;
  branch: string;
  url: string;
  status: string;
  source: {
    branch: string;
    path: string;
  };
  updated_at?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const body = await req.json();
    const validation = listPagesSitesSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { provider_token } = validation.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    const rateLimitResult = checkRateLimit(user.id);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            ...getRateLimitHeaders(rateLimitResult),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    // Get GitHub username from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('github_username')
      .eq('id', user.id)
      .single();

    if (!profile?.github_username) {
      return new Response(
        JSON.stringify({ error: 'GitHub profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const username = profile.github_username;
    console.log(`Fetching live GitHub Pages sites for user: ${username}`);

    // Fetch all user repositories
    const reposResponse = await fetch(`https://api.github.com/user/repos?per_page=100&affiliation=owner`, {
      headers: {
        'Authorization': `Bearer ${provider_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'RepoPush',
      },
    });

    if (!reposResponse.ok) {
      const rawError = await reposResponse.text();
      const sanitized = sanitizeGitHubError(reposResponse.status, rawError);
      return new Response(
        JSON.stringify({ error: sanitized.message }),
        { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const repos = await reposResponse.json();
    console.log(`Found ${repos.length} repositories`);

    // Check GitHub Pages status for each repository
    const livePagesSites: PagesSite[] = [];
    
    for (const repo of repos) {
      try {
        const pagesResponse = await fetch(
          `https://api.github.com/repos/${username}/${repo.name}/pages`,
          {
            headers: {
              'Authorization': `Bearer ${provider_token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'RepoPush',
            },
          }
        );

        // If 404, Pages is not enabled for this repo - skip it
        if (pagesResponse.status === 404) {
          continue;
        }

        if (pagesResponse.ok) {
          const pagesInfo = await pagesResponse.json();
          livePagesSites.push({
            repository: repo.name,
            owner: username,
            branch: pagesInfo.source?.branch || 'unknown',
            url: pagesInfo.html_url || `https://${username}.github.io/${repo.name}`,
            status: pagesInfo.status || 'unknown',
            source: {
              branch: pagesInfo.source?.branch || 'unknown',
              path: pagesInfo.source?.path || '/',
            },
            updated_at: pagesInfo.built_at || pagesInfo.updated_at,
          });
          console.log(`Found active Pages for: ${repo.name}`);
        }
      } catch (error) {
        // Log but don't fail the entire request if one repo fails
        console.error(`Error checking Pages for ${repo.name}:`, error);
      }
    }

    console.log(`Total live Pages sites found: ${livePagesSites.length}`);
    
    return new Response(
      JSON.stringify({ sites: livePagesSites }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in list-pages-sites function:', error);
    const sanitizedError = sanitizeGeneralError(error);
    return new Response(
      JSON.stringify({ error: sanitizedError }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
