import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { sanitizeGitHubError } from '../_shared/error-sanitizer.ts';
import { ownerField, repoField, pathField, branchField, MAX_BATCH_SIZE } from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const moveFilesSchema = z.object({
  owner: ownerField,
  repo: repoField,
  files: z.array(z.object({
    path: pathField,
    sha: z.string().min(1).max(100),
    type: z.enum(['file', 'dir']),
  })).min(1).max(MAX_BATCH_SIZE),
  destination: pathField,
  branch: branchField.default('main'),
  provider_token: z.string().min(1, 'GitHub token required'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = moveFilesSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { owner, repo, files, destination, branch, provider_token } = validation.data;

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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify ownership
    if (owner !== profile.github_username) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: can only access your own repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Moving ${files.length} items to ${destination}`);

    const ghHeaders = {
      'Authorization': `Bearer ${provider_token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'RepoPush',
    };

    // Helper to list all files within a directory recursively
    const listFilesRecursively = async (dirPath: string): Promise<Array<{ path: string; sha: string }>> => {
      const results: Array<{ path: string; sha: string }> = [];
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`,
        { headers: ghHeaders }
      );
      if (!res.ok) return results;
      const items = await res.json();
      for (const item of items) {
        if (item.type === 'file') {
          results.push({ path: item.path, sha: item.sha });
        } else if (item.type === 'dir') {
          const sub = await listFilesRecursively(item.path);
          results.push(...sub);
        }
      }
      return results;
    };

    // Move a single file safely (create new, then delete old)
    const moveSingleFile = async (srcPath: string, srcSha: string, destPath: string) => {
      // No-op move (same path)
      if (srcPath === destPath) {
        console.log(`Skipping no-op move for ${srcPath}`);
        return { status: 'skipped', reason: 'same path' };
      }

      // Get source content (base64)
      const getSrc = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${srcPath}?ref=${branch}`,
        { headers: ghHeaders }
      );
      if (!getSrc.ok) {
        const rawError = await getSrc.text();
        const sanitized = sanitizeGitHubError(getSrc.status, rawError);
        console.error(`Failed to fetch ${srcPath}:`, sanitized.message);
        throw new Error(sanitized.message);
      }
      const srcData = await getSrc.json();

      // Check if destination exists
      const checkDest = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${destPath}?ref=${branch}`,
        { headers: ghHeaders }
      );

      const putBody: Record<string, unknown> = {
        message: `Move ${srcPath} to ${destPath}`,
        content: srcData.content,
        branch,
      };

      // If destination exists, include its sha to update instead of failing
      if (checkDest.ok) {
        const destData = await checkDest.json();
        putBody.sha = destData.sha;
      }

      const createRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${destPath}`,
        {
          method: 'PUT',
          headers: ghHeaders,
          body: JSON.stringify(putBody),
        }
      );

      if (!createRes.ok) {
        const rawError = await createRes.text();
        const sanitized = sanitizeGitHubError(createRes.status, rawError);
        console.error(`Failed to create ${destPath}:`, sanitized.message);
        throw new Error(sanitized.message);
      }

      // Only delete after successful create/update
      const deleteRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${srcPath}`,
        {
          method: 'DELETE',
          headers: ghHeaders,
          body: JSON.stringify({
            message: `Delete old file ${srcPath}`,
            sha: srcSha,
            branch,
          }),
        }
      );

      if (!deleteRes.ok) {
        const rawError = await deleteRes.text();
        const sanitized = sanitizeGitHubError(deleteRes.status, rawError);
        console.error(`Failed to delete ${srcPath}:`, sanitized.message);
        throw new Error(sanitized.message);
      }

      return { status: 'moved' };
    };

    let movedCount = 0;
    let skippedCount = 0;
    const details: Array<{ src: string; dest: string; status: string }> = [];

    for (const file of files) {
      const fileName = file.path.split('/').pop()!;
      const sourceDir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

      // Prevent no-op moves (same folder)
      if (file.type === 'file') {
        // For files: check if destination is same as source directory
        if ((destination ?? '') === sourceDir) {
          console.log(`Skipping file already in destination: ${file.path}`);
          skippedCount++;
          details.push({ src: file.path, dest: destination || 'root', status: 'skipped (same folder)' });
          continue;
        }
      } else if (file.type === 'dir') {
        // For directories: check if destination is same as parent directory
        const parentDir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
        if ((destination ?? '') === parentDir) {
          console.log(`Skipping directory already in destination parent: ${file.path}`);
          skippedCount++;
          details.push({ src: file.path, dest: destination || 'root', status: 'skipped (same parent)' });
          continue;
        }

        // Block moving folder into itself or its descendant
        if (destination === file.path || (destination && destination.startsWith(file.path + '/'))) {
          console.error(`Invalid move: cannot move ${file.path} into itself or descendant ${destination}`);
          return new Response(
            JSON.stringify({ 
              error: `Cannot move folder "${file.path}" into itself or its descendant "${destination}"` 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (file.type === 'dir') {
        // Move all files within the directory, preserving structure with folder name
        const dirBaseName = file.path.split('/').pop()!;
        const targetDir = destination ? `${destination}/${dirBaseName}` : dirBaseName;
        
        const dirFiles = await listFilesRecursively(file.path);
        console.log(`Moving directory ${file.path} with ${dirFiles.length} files to ${targetDir}`);
        
        for (const df of dirFiles) {
          const relative = df.path.slice(file.path.length).replace(/^\//, '');
          const newPath = `${targetDir}/${relative}`;
          const result = await moveSingleFile(df.path, df.sha, newPath);
          
          if (result.status === 'moved') {
            movedCount++;
          } else {
            skippedCount++;
          }
          details.push({ src: df.path, dest: newPath, status: result.status });
        }
      } else {
        // Move single file
        const newPath = destination ? `${destination}/${fileName}` : fileName;
        const result = await moveSingleFile(file.path, file.sha, newPath);
        
        if (result.status === 'moved') {
          movedCount++;
        } else {
          skippedCount++;
        }
        details.push({ src: file.path, dest: newPath, status: result.status });
      }
    }

    console.log(`Move complete: ${movedCount} moved, ${skippedCount} skipped`);
    return new Response(
      JSON.stringify({ 
        success: true, 
        moved: movedCount, 
        skipped: skippedCount,
        details 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in move-files function:', error);
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
