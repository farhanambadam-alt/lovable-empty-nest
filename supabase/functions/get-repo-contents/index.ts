import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { sanitizeGitHubError } from '../_shared/error-sanitizer.ts';
import { ownerField, repoField, pathField, refField } from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getContentsSchema = z.object({
  owner: ownerField,
  repo: repoField,
  path: pathField.optional().default(''),
  ref: refField.optional(),
  provider_token: z.string().min(1, 'GitHub token required'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = getContentsSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { owner, repo, path, ref, provider_token } = validation.data;

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('github_username')
      .eq('id', user.id)
      .single();

    if (!profile?.github_username) {
      return new Response(
        JSON.stringify({ error: 'GitHub profile not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: verify user owns the repository
    if (owner !== profile.github_username) {
      console.error(`Unauthorized access attempt: user ${profile.github_username} tried to access ${owner}/${repo}`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: can only access your own repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First, fetch repository metadata to get default branch
    console.log(`Fetching repository metadata for: ${owner}/${repo}`);
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          'Authorization': `Bearer ${provider_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
      }
    );

    if (!repoResponse.ok) {
      const rawError = await repoResponse.text();
      const sanitized = sanitizeGitHubError(repoResponse.status, rawError);
      return new Response(
        JSON.stringify({ error: sanitized.message }),
        { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const repoMetadata = await repoResponse.json();
    const defaultBranch = repoMetadata.default_branch;
    console.log(`Repository default branch: ${defaultBranch}`);

    // Use the provided ref or fall back to default branch
    const effectiveRef = ref || defaultBranch;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${effectiveRef}`;
    console.log('Fetching contents from:', url);

    const githubResponse = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${provider_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'RepoPush',
      },
    });

    if (!githubResponse.ok) {
      const rawError = await githubResponse.text();
      const sanitized = sanitizeGitHubError(githubResponse.status, rawError);
      return new Response(
        JSON.stringify({ error: sanitized.message }),
        { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contents = await githubResponse.json();
    console.log('Successfully fetched contents');

    return new Response(
      JSON.stringify({ 
        contents,
        default_branch: defaultBranch,
        repository: {
          name: repoMetadata.name,
          full_name: repoMetadata.full_name,
          private: repoMetadata.private,
          default_branch: defaultBranch
        }
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        } 
      }
    );

  } catch (error) {
    console.error('Error in get-repo-contents function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
