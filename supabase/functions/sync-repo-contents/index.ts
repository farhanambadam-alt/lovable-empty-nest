import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { createOrGetBranch } from '../_shared/github-helper.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const syncRepoSchema = z.object({
  sourceRepo: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid source repo name'),
  destRepo: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid dest repo name'),
  sourceBranch: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid source branch'),
  destBranch: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/, 'Invalid dest branch'),
  provider_token: z.string().min(1, 'GitHub token required'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = syncRepoSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sourceRepo, destRepo, sourceBranch, destBranch, provider_token } = validation.data;

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

    const githubToken = provider_token;
    const owner = profile.github_username;

    console.log(`Syncing ${owner}/${sourceRepo}:${sourceBranch} -> ${owner}/${destRepo}:${destBranch}`);

    // Validate both repositories exist and belong to user
    const validateRepo = async (repo: string) => {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'RepoPush',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Repository ${repo} not found or not accessible`);
      }
      
      const repoData = await response.json();
      if (repoData.owner.login !== owner) {
        throw new Error(`Repository ${repo} does not belong to user ${owner}`);
      }
    };

    try {
      await validateRepo(sourceRepo);
      await validateRepo(destRepo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Repository validation failed';
      console.error('Repository validation error:', errorMessage);
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure destination branch exists
    const branchResult = await createOrGetBranch(owner, destRepo, destBranch, githubToken);
    if (!branchResult.success) {
      return new Response(
        JSON.stringify({ error: `Failed to create/access destination branch: ${branchResult.error}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get source repository tree
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${sourceRepo}/git/trees/${sourceBranch}?recursive=1`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
      }
    );

    if (!treeResponse.ok) {
      const errorText = await treeResponse.text();
      console.error('Failed to fetch repository tree:', errorText);
      
      if (treeResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Your GitHub token is invalid or has expired. Please log out and log back in.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Failed to fetch source repository tree. Please verify the branch exists.');
    }

    const treeData = await treeResponse.json();
    const files = treeData.tree.filter((item: any) => item.type === 'blob');

    console.log(`Found ${files.length} files to sync`);

    let syncedCount = 0;
    const MAX_FILES = 100; // Limit to prevent timeouts

    for (const file of files.slice(0, MAX_FILES)) {
      try {
        // Get file content
        const fileResponse = await fetch(
          `https://api.github.com/repos/${owner}/${sourceRepo}/contents/${file.path}?ref=${sourceBranch}`,
          {
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'RepoPush',
            },
          }
        );

        if (fileResponse.ok) {
          const fileData = await fileResponse.json();
          
          // Push to destination
          // Check if file already exists in destination
          const checkResponse = await fetch(
            `https://api.github.com/repos/${owner}/${destRepo}/contents/${file.path}?ref=${destBranch}`,
            {
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'RepoPush',
              },
            }
          );
          
          const fileExists = checkResponse.ok;
          const existingFile = fileExists ? await checkResponse.json() : null;
          
          const uploadResponse = await fetch(
            `https://api.github.com/repos/${owner}/${destRepo}/contents/${file.path}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'RepoPush',
              },
              body: JSON.stringify({
                message: `Sync: Merged ${file.path} from ${sourceRepo}:${sourceBranch}`,
                content: fileData.content,
                branch: destBranch,
                ...(fileExists && existingFile?.sha ? { sha: existingFile.sha } : {}),
              }),
            }
          );

          if (uploadResponse.ok) {
            syncedCount++;
            console.log(`Synced: ${file.path}`);
          } else {
            const errorText = await uploadResponse.text();
            console.error(`Failed to sync ${file.path}:`, errorText);
          }
        }
      } catch (err) {
        console.error(`Error syncing ${file.path}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        files_synced: syncedCount,
        total_files: files.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-repo-contents function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
