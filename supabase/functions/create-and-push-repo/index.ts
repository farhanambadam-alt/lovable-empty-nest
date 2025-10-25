import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { createOrGetBranch } from '../_shared/github-helper.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const pushRepoSchema = z.object({
  repositoryName: z.string().min(1),
  provider_token: z.string().min(1, 'GitHub token required'),
  fileMap: z.record(z.string()).optional(),
  githubUrl: z.string().optional(),
  importMode: z.string().optional(),
  targetBranch: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = pushRepoSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { repositoryName, fileMap, importMode, githubUrl, targetBranch, provider_token } = validation.data;

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
    const branch = targetBranch || 'main';

    console.log(`Processing repository: ${repositoryName} for user: ${owner}, mode: ${importMode}, branch: ${branch}`);

    // Check if repository exists
    const checkRepoResponse = await fetch(`https://api.github.com/repos/${owner}/${repositoryName}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'RepoPush',
      },
    });

    const repoExists = checkRepoResponse.ok;
    let repoData: any;

    if (repoExists) {
      console.log(`Repository ${repositoryName} already exists`);
      
      if (importMode === 'overwrite') {
        console.log('Overwrite mode: attempting to delete existing repository...');
        const deleteResponse = await fetch(`https://api.github.com/repos/${owner}/${repositoryName}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'RepoPush',
          },
        });
        
        if (deleteResponse.ok) {
          console.log('Repository deleted successfully');
          // Wait for GitHub to process deletion
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (deleteResponse.status === 403) {
          const errorText = await deleteResponse.text();
          console.error('Permission denied to delete repository:', errorText);
          return new Response(
            JSON.stringify({ 
              error: 'Cannot overwrite: Missing permissions. Please log out and log back in to grant the required "delete_repo" permission, or manually delete the repository on GitHub first.' 
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          const deleteError = await deleteResponse.text();
          console.error('Failed to delete repository:', deleteError);
          return new Response(
            JSON.stringify({ 
              error: `Failed to delete existing repository: ${deleteResponse.statusText}. Please delete it manually on GitHub or use "Add" mode.` 
            }),
            { status: deleteResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create new repository after deletion
        const createRepoResponse = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'RepoPush',
          },
          body: JSON.stringify({
            name: repositoryName,
            auto_init: true,
            private: false,
          }),
        });

        if (!createRepoResponse.ok) {
          const error = await createRepoResponse.text();
          console.error('Failed to create repository:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to create repository on GitHub' }),
            { status: createRepoResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        repoData = await createRepoResponse.json();
        console.log('Repository created successfully:', repoData.html_url);
        
        // Ensure the target branch exists after recreating repo
        if (branch !== 'main') {
          console.log(`Creating target branch: ${branch} after repo recreation`);
          const branchResult = await createOrGetBranch(owner, repositoryName, branch, githubToken);
          if (!branchResult.success) {
            return new Response(
              JSON.stringify({ error: `Failed to create/access branch: ${branchResult.error}` }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } else {
        // Add mode: use existing repository
        console.log('Add mode: using existing repository');
      repoData = await checkRepoResponse.json();
      
      // Ensure the target branch exists
      const branchResult = await createOrGetBranch(owner, repositoryName, branch, githubToken);
      if (!branchResult.success) {
        return new Response(
          JSON.stringify({ error: `Failed to create/access branch: ${branchResult.error}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      }
    } else {
      // Repository doesn't exist, create it
      console.log(`Creating new repository: ${repositoryName}`);
      const createRepoResponse = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'RepoPush',
        },
        body: JSON.stringify({
          name: repositoryName,
          auto_init: true,
          private: false,
        }),
      });

      if (!createRepoResponse.ok) {
        const error = await createRepoResponse.text();
        console.error('Failed to create repository:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to create repository on GitHub' }),
          { status: createRepoResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      repoData = await createRepoResponse.json();
      console.log('Repository created successfully:', repoData.html_url);
      
      // Ensure the target branch exists for new repos
      if (branch !== 'main') {
        console.log(`Creating target branch: ${branch}`);
        const branchResult = await createOrGetBranch(owner, repositoryName, branch, githubToken);
        if (!branchResult.success) {
          return new Response(
            JSON.stringify({ error: `Failed to create/access branch: ${branchResult.error}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    let finalFileMap = fileMap;

    // If GitHub URL is provided, fetch the repository contents
    if (githubUrl) {
      console.log('Fetching repository contents from GitHub URL:', githubUrl);
      
      // Parse GitHub URL to extract owner and repo
      const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (!urlMatch) {
        return new Response(
          JSON.stringify({ error: 'Invalid GitHub URL format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const [, sourceOwner, sourceRepo] = urlMatch;
      
      // File limit to prevent timeouts
      const MAX_FILES = 500;
      
      try {
        // Fetch the repository tree recursively
        const treeResponse = await fetch(
          `https://api.github.com/repos/${sourceOwner}/${sourceRepo}/git/trees/main?recursive=1`,
          {
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'RepoPush',
            },
          }
        );

        if (!treeResponse.ok) {
          // Try 'master' branch if 'main' doesn't exist
          const masterTreeResponse = await fetch(
            `https://api.github.com/repos/${sourceOwner}/${sourceRepo}/git/trees/master?recursive=1`,
            {
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'RepoPush',
              },
            }
          );

          if (!masterTreeResponse.ok) {
            throw new Error('Failed to fetch repository tree');
          }

          const masterTreeData = await masterTreeResponse.json();
          finalFileMap = {};

          // Check file count
          const fileCount = masterTreeData.tree.filter((item: any) => item.type === 'blob').length;
          if (fileCount > MAX_FILES) {
            return new Response(
              JSON.stringify({ 
                error: `Repository is too large (${fileCount} files). Maximum ${MAX_FILES} files allowed. Please use a smaller repository or clone it manually.` 
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Fetch each file's content
          let filesProcessed = 0;
          for (const item of masterTreeData.tree) {
            if (item.type === 'blob' && filesProcessed < MAX_FILES) {
              const fileResponse = await fetch(
                `https://api.github.com/repos/${sourceOwner}/${sourceRepo}/contents/${item.path}`,
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
                // Decode base64 content
                finalFileMap[item.path] = atob(fileData.content);
                filesProcessed++;
              }
            }
          }
        } else {
          const treeData = await treeResponse.json();
          finalFileMap = {};

          // Check file count
          const fileCount = treeData.tree.filter((item: any) => item.type === 'blob').length;
          if (fileCount > MAX_FILES) {
            return new Response(
              JSON.stringify({ 
                error: `Repository is too large (${fileCount} files). Maximum ${MAX_FILES} files allowed. Please use a smaller repository or clone it manually.` 
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Fetch each file's content
          let filesProcessed = 0;
          for (const item of treeData.tree) {
            if (item.type === 'blob' && filesProcessed < MAX_FILES) {
              const fileResponse = await fetch(
                `https://api.github.com/repos/${sourceOwner}/${sourceRepo}/contents/${item.path}`,
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
                // Decode base64 content
                finalFileMap[item.path] = atob(fileData.content);
                filesProcessed++;
              }
            }
          }
        }

        console.log(`Fetched ${Object.keys(finalFileMap).length} files from source repository`);
      } catch (err) {
        console.error('Error fetching repository contents:', err);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch repository contents from GitHub' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Upload files if we have any
    if (finalFileMap && Object.keys(finalFileMap).length > 0) {
      console.log(`Uploading ${Object.keys(finalFileMap).length} files using Git Data API...`);
      
      try {
        // Get the current branch reference
        const refResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repositoryName}/git/ref/heads/${branch}`,
          {
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'RepoPush',
            },
          }
        );

        if (!refResponse.ok) {
          throw new Error(`Failed to get branch reference: ${await refResponse.text()}`);
        }

        const refData = await refResponse.json();
        const currentCommitSha = refData.object.sha;
        console.log(`Current commit SHA: ${currentCommitSha}`);

        // Get the current commit to access its tree
        const commitResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repositoryName}/git/commits/${currentCommitSha}`,
          {
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'RepoPush',
            },
          }
        );

        if (!commitResponse.ok) {
          throw new Error(`Failed to get commit: ${await commitResponse.text()}`);
        }

        const commitData = await commitResponse.json();
        const baseTreeSha = commitData.tree.sha;

        // Create blobs for all files
        console.log(`Creating blobs for ${Object.keys(finalFileMap).length} files...`);
        const blobPromises = Object.entries(finalFileMap).map(async ([path, content]) => {
          let base64Content: string;
          try {
            base64Content = btoa(content as string);
          } catch {
            const encoder = new TextEncoder();
            const uint8Array = encoder.encode(content as string);
            const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
            base64Content = btoa(binaryString);
          }

          const blobResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repositoryName}/git/blobs`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'RepoPush',
              },
              body: JSON.stringify({
                content: base64Content,
                encoding: 'base64',
              }),
            }
          );

          if (!blobResponse.ok) {
            console.error(`Failed to create blob for ${path}`);
            return null;
          }

          const blobData = await blobResponse.json();
          return {
            path,
            mode: '100644',
            type: 'blob',
            sha: blobData.sha,
          };
        });

        const treeItems = (await Promise.all(blobPromises)).filter(item => item !== null);
        console.log(`Created ${treeItems.length} blobs successfully`);

        // Create a new tree
        const treeResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repositoryName}/git/trees`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'RepoPush',
            },
            body: JSON.stringify({
              base_tree: baseTreeSha,
              tree: treeItems,
            }),
          }
        );

        if (!treeResponse.ok) {
          throw new Error(`Failed to create tree: ${await treeResponse.text()}`);
        }

        const treeData = await treeResponse.json();
        console.log(`Created tree: ${treeData.sha}`);

        // Create a new commit
        const newCommitResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repositoryName}/git/commits`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'RepoPush',
            },
            body: JSON.stringify({
              message: `Add ${Object.keys(finalFileMap).length} files`,
              tree: treeData.sha,
              parents: [currentCommitSha],
            }),
          }
        );

        if (!newCommitResponse.ok) {
          throw new Error(`Failed to create commit: ${await newCommitResponse.text()}`);
        }

        const newCommitData = await newCommitResponse.json();
        console.log(`Created commit: ${newCommitData.sha}`);

        // Update the branch reference
        const updateRefResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repositoryName}/git/refs/heads/${branch}`,
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
              force: false,
            }),
          }
        );

        if (!updateRefResponse.ok) {
          throw new Error(`Failed to update branch: ${await updateRefResponse.text()}`);
        }

        console.log(`Successfully uploaded all ${Object.keys(finalFileMap).length} files in a single commit`);
      } catch (error) {
        console.error('Error uploading files:', error);
        return new Response(
          JSON.stringify({ error: `Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        repository_url: repoData.html_url,
        repository_name: repositoryName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-and-push-repo function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
