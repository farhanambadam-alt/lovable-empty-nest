import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { sanitizeGitHubError, sanitizeGeneralError } from '../_shared/error-sanitizer.ts';
import { ownerField, repoField } from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const updateRepoSchema = z.object({
  owner: ownerField,
  repo: repoField,
  description: z.string().max(350).optional(),
  homepage: z.string().max(255).optional().transform(val => val === '' ? undefined : val).refine(val => !val || z.string().url().safeParse(val).success, 'Invalid URL format'),
  private: z.boolean().optional(),
  default_branch: z.string().max(255).optional(),
  topics: z.array(z.string()).optional(),
  provider_token: z.string().min(1, 'GitHub token required'),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { owner, repo, description, homepage, private: isPrivate, default_branch, topics, provider_token } = updateRepoSchema.parse(body);

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

    // Verify ownership
    if (profile.github_username !== owner) {
      return new Response(
        JSON.stringify({ error: 'You can only update your own repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Updating repository: ${owner}/${repo}`);

    const updateData: any = {};
    if (description !== undefined) updateData.description = description;
    if (homepage !== undefined) updateData.homepage = homepage;
    if (isPrivate !== undefined) updateData.private = isPrivate;
    if (default_branch !== undefined) updateData.default_branch = default_branch;
    if (topics !== undefined) updateData.topics = topics;

    const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${provider_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'RepoPush',
      },
      body: JSON.stringify(updateData),
    });

    if (!githubResponse.ok) {
      const rawError = await githubResponse.text();
      const sanitized = sanitizeGitHubError(githubResponse.status, rawError);
      return new Response(
        JSON.stringify({ error: sanitized.message }),
        { status: sanitized.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updatedRepo = await githubResponse.json();
    console.log('Repository updated successfully');
    
    return new Response(
      JSON.stringify({ repository: updatedRepo }),
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
