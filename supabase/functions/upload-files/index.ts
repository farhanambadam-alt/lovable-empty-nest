import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { sanitizeGitHubError } from '../_shared/error-sanitizer.ts';
import { ownerField, repoField, requiredPathField, contentField, branchField, commitMessageField } from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const uploadFilesSchema = z.object({
  owner: ownerField,
  repo: repoField,
  files: z.array(
    z.object({
      path: requiredPathField,
      content: contentField,
    })
  ).min(1).max(100),
  message: commitMessageField.optional(),
  branch: branchField.optional(),
  provider_token: z.string().min(1, 'GitHub token required'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = uploadFilesSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { owner, repo, files, message, branch, provider_token } = validation.data;

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

    // Authorization check: verify user owns the repository
    if (owner !== profile.github_username) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: can only access your own repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Uploading ${files.length} files...`);

    const results = await Promise.all(
      files.map(async (file: { path: string; content: string }) => {
        const uploadWithRetry = async (retries = 3): Promise<any> => {
          try {
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`;
            
            // Fetch the latest SHA if file exists
            let existingSha: string | undefined;
            try {
              const checkResponse = await fetch(`${url}?ref=${branch || 'main'}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${provider_token}`,
                  'Accept': 'application/vnd.github.v3+json',
                  'User-Agent': 'RepoPush',
                },
              });
              
              if (checkResponse.ok) {
                const existingFile = await checkResponse.json();
                existingSha = existingFile.sha;
                console.log(`File ${file.path} exists with SHA: ${existingSha}`);
              }
            } catch (checkErr) {
              console.log(`File ${file.path} is new`);
            }
            
            const githubResponse = await fetch(url, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${provider_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'RepoPush',
              },
              body: JSON.stringify({
                message: message || `Upload ${file.path}`,
                content: file.content,
                branch: branch || 'main',
                ...(existingSha && { sha: existingSha }),
              }),
            });

            if (!githubResponse.ok) {
              const rawError = await githubResponse.text();
              
              // Retry on 409 conflicts (SHA mismatch)
              if (githubResponse.status === 409 && retries > 0) {
                console.log(`SHA conflict for ${file.path}, retrying... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
                return uploadWithRetry(retries - 1);
              }
              
              const sanitized = sanitizeGitHubError(githubResponse.status, rawError);
              console.error(`Failed to upload ${file.path}:`, sanitized.message);
              return {
                path: file.path,
                success: false,
                error: sanitized.message,
              };
            }

            console.log(`Successfully uploaded ${file.path}`);
            return {
              path: file.path,
              success: true,
            };
          } catch (err) {
            console.error(`Exception uploading ${file.path}:`, err);
            return {
              path: file.path,
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            };
          }
        };

        return uploadWithRetry();
      })
    );

    const successCount = results.filter(r => r.success).length;
    console.log(`Upload complete: ${successCount}/${files.length} successful`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        summary: {
          total: files.length,
          successful: successCount,
          failed: files.length - successCount,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in upload-files function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
