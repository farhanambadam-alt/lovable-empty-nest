import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { sanitizeGitHubError, sanitizeGeneralError } from '../_shared/error-sanitizer.ts';
import { ownerField, repoField } from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const renameBranchSchema = z.object({
  owner: ownerField,
  repo: repoField,
  old_name: z.string().min(1, 'Branch name required').max(255),
  new_name: z.string().min(1, 'New branch name required').max(255),
  provider_token: z.string().min(1, 'GitHub token required'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { owner, repo, old_name, new_name, provider_token } = renameBranchSchema.parse(body);

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

    if (profile.github_username !== owner) {
      return new Response(
        JSON.stringify({ error: 'You can only rename branches in your own repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Renaming branch: ${old_name} to ${new_name} in ${owner}/${repo}`);

    const githubResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${old_name}/rename`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'RepoPush',
        },
        body: JSON.stringify({ new_name }),
      }
    );

    if (!githubResponse.ok) {
      const rawError = await githubResponse.text();
      const sanitized = sanitizeGitHubError(githubResponse.status, rawError);
      return new Response(
        JSON.stringify({ error: sanitized.message }),
        { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await githubResponse.json();
    console.log('Branch renamed successfully');
    
    return new Response(
      JSON.stringify({ success: true, new_name: result.name }),
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
