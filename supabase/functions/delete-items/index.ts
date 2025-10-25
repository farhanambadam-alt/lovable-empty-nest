import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const deleteItemsSchema = z.object({
  owner: z.string().min(1).max(39).regex(/^[a-zA-Z0-9-]+$/, 'Invalid owner name'),
  repo: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repo name'),
  branch: z.string().min(1).max(255).optional(),
  provider_token: z.string().min(1, 'GitHub token required'),
  items: z.array(z.object({
    path: z.string().min(1).max(4096).refine(
      (p) => !p.includes('..') && !p.startsWith('/'),
      'Path traversal not allowed'
    ),
    type: z.enum(['file', 'dir'])
  })).min(1)
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = deleteItemsSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { owner, repo, items, branch, provider_token } = validation.data;

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
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (owner !== profile.github_username) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: can only access your own repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const githubToken = provider_token;

    const branchName = branch || 'main';
    console.log(`Batch delete on ${owner}/${repo} (${branchName}) for ${items.length} items`);

    // Get current branch ref
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
      const error = await refResponse.text();
      console.error('Failed to get branch reference:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to get branch reference' }),
        { status: refResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const refData = await refResponse.json();
    const currentCommitSha = refData.object.sha;

    // Get current commit
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
      const error = await commitResponse.text();
      console.error('Failed to get commit:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to get commit' }),
        { status: commitResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const commitData = await commitResponse.json();
    const baseTreeSha = commitData.tree.sha;

    // Get full tree
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
      const error = await treeResponse.text();
      console.error('Failed to get tree:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to get tree' }),
        { status: treeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const treeData = await treeResponse.json();

    // Build exclusion sets
    const dirPaths = items
      .filter((i: any) => i.type === 'dir')
      .map((d: any) => d.path.endsWith('/') ? d.path : `${d.path}/`);

    const filePaths = new Set(items.filter((i: any) => i.type === 'file').map((f: any) => f.path));

    // Filter tree: remove files in selected dirs and selected files
    const newTree = treeData.tree
      .filter((item: any) => {
        const inDeletedDir = dirPaths.some((dp) => item.path.startsWith(dp));
        const isDeletedFile = filePaths.has(item.path);
        // Keep only items not in deleted targets
        return !inDeletedDir && !isDeletedFile;
      })
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
        body: JSON.stringify({ tree: newTree }),
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
    const deleteSummary = items
      .map((i: any) => `${i.type === 'dir' ? 'dir' : 'file'}:${i.path}`)
      .slice(0, 10) // limit length
      .join(', ');

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
          message: `Batch delete ${items.length} item(s): ${deleteSummary}${items.length > 10 ? '…' : ''}`,
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

    // Update branch ref
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
        body: JSON.stringify({ sha: newCommitData.sha }),
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

    console.log('Batch delete succeeded');

    return new Response(
      JSON.stringify({ success: true, deleted: items.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in delete-items function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
