import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { sanitizeGitHubError, sanitizeGeneralError } from '../_shared/error-sanitizer.ts';
import { ownerField, repoField, branchField } from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const createPRSchema = z.object({
  repositoryName: repoField,
  title: z.string().min(1).max(256),
  body: z.string().max(10000).optional(), // Reduced from 64KB to 10KB
  head: branchField,
  base: branchField,
  provider_token: z.string().min(1, 'GitHub token required'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { repositoryName, title, body: prBody, head, base, provider_token } = createPRSchema.parse(body);

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
        JSON.stringify({ error: 'GitHub username not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const owner = profile.github_username;

    console.log(`Creating PR for ${owner}/${repositoryName}: ${head} -> ${base}`);

    const prResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repositoryName}/pulls`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'RepoPush',
        },
        body: JSON.stringify({
          title,
          body: prBody || '',
          head,
          base,
        }),
      }
    );

    if (!prResponse.ok) {
      const rawError = await prResponse.text();
      const sanitized = sanitizeGitHubError(prResponse.status, rawError);
      return new Response(
        JSON.stringify({ error: sanitized.message }),
        { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prData = await prResponse.json();
    console.log('PR created successfully:', prData.html_url);

    return new Response(
      JSON.stringify({
        success: true,
        pull_request_url: prData.html_url,
        pull_request_number: prData.number,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const sanitizedError = sanitizeGeneralError(error);
    return new Response(
      JSON.stringify({ error: sanitizedError }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
