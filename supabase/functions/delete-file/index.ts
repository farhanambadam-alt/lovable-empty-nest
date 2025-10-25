import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { sanitizeGitHubError } from '../_shared/error-sanitizer.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const deleteFileSchema = z.object({
  owner: z.string().min(1).max(39).regex(/^[a-zA-Z0-9-]+$/, 'Invalid owner name'),
  repo: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repo name'),
  path: z.string().min(1).max(4096).refine(
    (p) => !p.includes('..') && !p.startsWith('/'),
    'Path traversal not allowed'
  ),
  sha: z.string().min(1).max(100),
  branch: z.string().min(1).max(255).optional(),
  type: z.enum(['file', 'dir']).optional(),
  provider_token: z.string().min(1, 'GitHub token required'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = deleteFileSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { owner, repo, path, sha, branch, type, provider_token } = validation.data;

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

    // Authorization check: verify user owns the repository
    if (owner !== profile.github_username) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: can only access your own repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const githubToken = provider_token;

    const branchName = branch || 'main';
    console.log(`Deleting ${type === 'dir' ? 'directory' : 'file'}: ${path} on branch: ${branchName}`);

    // For directories, we need to use Git Trees API
    if (type === 'dir') {
      // Get the current branch reference
      const refResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`,
        {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
        }
      );

      if (!refResponse.ok) {
        const rawError = await refResponse.text();
        const sanitized = sanitizeGitHubError(refResponse.status, rawError);
        return new Response(
          JSON.stringify({ error: sanitized.message }),
          { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const refData = await refResponse.json();
      const currentCommitSha = refData.object.sha;

      // Get the current commit
      const commitResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/commits/${currentCommitSha}`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'RepoPush',
          },
        }
      );

      if (!commitResponse.ok) {
        const rawError = await commitResponse.text();
        const sanitized = sanitizeGitHubError(commitResponse.status, rawError);
        return new Response(
          JSON.stringify({ error: sanitized.message }),
          { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const commitData = await commitResponse.json();
      const baseTreeSha = commitData.tree.sha;

      // Get the tree
      const treeResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'RepoPush',
          },
        }
      );

      if (!treeResponse.ok) {
        const rawError = await treeResponse.text();
        const sanitized = sanitizeGitHubError(treeResponse.status, rawError);
        return new Response(
          JSON.stringify({ error: sanitized.message }),
          { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const treeData = await treeResponse.json();
      
      // Filter out all items in the directory
      const pathPrefix = path.endsWith('/') ? path : `${path}/`;
      const newTree = treeData.tree
        .filter((item: any) => {
          // Exclude items in the directory being deleted
          const isInDeletedDir = item.path.startsWith(pathPrefix) || item.path === path;
          return !isInDeletedDir;
        })
        // Only include blobs (files) - GitHub creates tree objects (directories) automatically
        .filter((item: any) => item.type === 'blob')
        .map((item: any) => ({
          path: item.path,
          mode: item.mode,
          type: item.type,
          sha: item.sha,
        }));

      // Create new tree
      const newTreeResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'RepoPush',
          },
          body: JSON.stringify({
            tree: newTree,
          }),
        }
      );

      if (!newTreeResponse.ok) {
        const error = await newTreeResponse.text();
        console.error('Failed to create new tree:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to create new tree' }),
          { status: newTreeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newTreeData = await newTreeResponse.json();

      // Create new commit
      const newCommitResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/commits`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'RepoPush',
          },
          body: JSON.stringify({
            message: `Delete directory ${path}`,
            tree: newTreeData.sha,
            parents: [currentCommitSha],
          }),
        }
      );

      if (!newCommitResponse.ok) {
        const error = await newCommitResponse.text();
        console.error('Failed to create commit:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to create commit' }),
          { status: newCommitResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newCommitData = await newCommitResponse.json();

      // Update branch reference
      const updateRefResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'RepoPush',
          },
          body: JSON.stringify({
            sha: newCommitData.sha,
          }),
        }
      );

      if (!updateRefResponse.ok) {
        const error = await updateRefResponse.text();
        console.error('Failed to update reference:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update branch' }),
          { status: updateRefResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Directory deleted successfully');
    } else {
      // For files, use the simple contents API
      const deleteBody: Record<string, string> = {
        message: `Delete ${path}`,
        sha: sha,
      };
      
      if (branch) {
        deleteBody.branch = branch;
      }

      const githubResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'RepoPush',
          },
          body: JSON.stringify(deleteBody),
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

      console.log('File deleted successfully');
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in delete-file function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
