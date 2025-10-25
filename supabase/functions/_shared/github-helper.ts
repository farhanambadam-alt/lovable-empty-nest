import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

export interface GitHubProfile {
  github_access_token: string;
  github_username: string;
}

/**
 * SECURITY: Gets GitHub token from request (passed from client session)
 * 
 * This approach provides:
 * - Token stays in encrypted session on client
 * - Passed over HTTPS to edge function
 * - Validated against authenticated user
 * - Zero database storage of sensitive tokens
 */
export async function getGitHubToken(req: Request, providerToken?: string): Promise<GitHubProfile | null> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Authentication error:', authError);
      return null;
    }

    // Get GitHub token from parameter or request body (passed from client)
    let githubToken = providerToken;
    if (!githubToken) {
      const body = await req.json();
      githubToken = body.provider_token;
    }
    
    if (!githubToken) {
      console.error('No provider token in request. User may need to re-authenticate.');
      return null;
    }

    // Get username from profile table (non-sensitive data)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('github_username')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.github_username) {
      console.error('Profile fetch error:', profileError);
      return null;
    }

    return {
      github_access_token: githubToken,
      github_username: profile.github_username,
    };
  } catch (error) {
    console.error('Error in getGitHubToken:', error);
    return null;
  }
}

export async function createOrGetBranch(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if branch exists
    const branchResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
      }
    );

    if (branchResponse.ok) {
      console.log(`Branch ${branch} already exists`);
      return { success: true };
    }

    // Branch doesn't exist, create it from default branch
    console.log(`Creating new branch: ${branch}`);
    
    // Get the default branch SHA
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
      }
    );

    if (!repoResponse.ok) {
      return { success: false, error: 'Failed to fetch repository info' };
    }

    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch;

    // Get the SHA of the default branch
    const refResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
      }
    );

    if (!refResponse.ok) {
      return { success: false, error: 'Failed to fetch default branch ref' };
    }

    const refData = await refResponse.json();
    const sha = refData.object.sha;

    // Create new branch
    const createBranchResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'RepoPush',
        },
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: sha,
        }),
      }
    );

    if (!createBranchResponse.ok) {
      const error = await createBranchResponse.text();
      console.error('Failed to create branch:', error);
      return { success: false, error: 'Failed to create branch' };
    }

    console.log(`Successfully created branch: ${branch}`);
    return { success: true };

  } catch (error) {
    console.error('Error in createOrGetBranch:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
