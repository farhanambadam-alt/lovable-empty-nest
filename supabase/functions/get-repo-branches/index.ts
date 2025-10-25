import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getBranchesSchema = z.object({
  repositoryName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name'),
  provider_token: z.string().min(1),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validation = getBranchesSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { repositoryName, provider_token } = validation.data;

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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const githubToken = provider_token;
    const owner = profile.github_username;

    // Authorization: verify repository name belongs to user's account
    // The repositoryName from client should match a repo owned by this user
    console.log(`Fetching branches for repository: ${owner}/${repositoryName}`);

    
    // First verify the repository exists and belongs to the user
    const repoCheckResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repositoryName}`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
      }
    );

    if (!repoCheckResponse.ok) {
      console.error('Repository not found or not accessible');
      return new Response(
        JSON.stringify({ error: 'Repository not found or not accessible' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const repoData = await repoCheckResponse.json();
    if (repoData.owner.login !== owner) {
      console.error(`Unauthorized: Repository ${repositoryName} does not belong to user ${owner}`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: can only access your own repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const branchesResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repositoryName}/branches`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoPush',
        },
      }
    );

    if (!branchesResponse.ok) {
      const errorText = await branchesResponse.text();
      console.error('Failed to fetch branches:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch branches from GitHub' }),
        { status: branchesResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const branches = await branchesResponse.json();
    console.log(`Found ${branches.length} branches`);

    return new Response(
      JSON.stringify({ branches }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-repo-branches function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
