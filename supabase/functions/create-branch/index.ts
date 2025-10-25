import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getGitHubToken } from '../_shared/github-helper.ts';
import { corsHeaders } from '../_shared/cors.ts';

const GITHUB_API_URL = 'https://api.github.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read request body once
    const { owner, repo, branchName, sourceBranch = 'main', provider_token } = await req.json();
    
    const githubProfile = await getGitHubToken(req, provider_token);
    if (!githubProfile) {
      return new Response(
        JSON.stringify({ error: 'GitHub authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!owner || !repo || !branchName) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating branch ${branchName} from ${sourceBranch} in ${owner}/${repo}`);

    // Get the SHA of the source branch
    const refResponse = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${sourceBranch}`,
      {
        headers: {
          'Authorization': `Bearer ${githubProfile.github_access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
      }
    );

    if (!refResponse.ok) {
      const error = await refResponse.text();
      console.error('Failed to fetch source branch:', error);
      return new Response(
        JSON.stringify({ error: `Source branch '${sourceBranch}' not found` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const refData = await refResponse.json();
    const sha = refData.object.sha;

    // Create new branch
    const createResponse = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubProfile.github_access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'RepoPush',
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: sha,
        }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.text();
      console.error('Failed to create branch:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create branch. It may already exist.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully created branch: ${branchName}`);

    return new Response(
      JSON.stringify({ success: true, branch: branchName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-branch function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});