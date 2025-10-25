import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface GitHubRepo {
  name: string;
  full_name: string;
  default_branch: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
}

export const useGitHubRepos = () => {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const { toast } = useToast();

  const fetchRepos = async () => {
    setLoadingRepos(true);
    try {
      // Get session to access provider token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.provider_token) {
        throw new Error('Your GitHub session has expired. Please log out and log back in.');
      }

      const { data, error } = await supabase.functions.invoke('list-repos', {
        body: { provider_token: session.provider_token }
      });
      
      if (error) throw error;
      if (data?.error) {
        if (data.error.includes('token') || data.error.includes('Unauthorized')) {
          throw new Error('Your GitHub session has expired. Please log out and log back in.');
        }
        throw new Error(data.error);
      }
      
      setRepos(data.repositories || []);
    } catch (error: any) {
      console.error('Error fetching repos:', error);
      toast({
        variant: "destructive",
        title: "Failed to fetch repositories",
        description: error.message || "Unable to connect to GitHub. Please try again.",
      });
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  };

  const fetchBranches = async (repoName: string) => {
    if (!repoName) return;
    
    setLoadingBranches(true);
    setBranches([]); // Clear previous branches
    try {
      // Get session to access provider token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.provider_token) {
        throw new Error('Your GitHub session has expired. Please log out and log back in.');
      }

      const { data, error } = await supabase.functions.invoke('get-repo-branches', {
        body: { 
          repositoryName: repoName,
          provider_token: session.provider_token 
        }
      });
      
      if (error) throw error;
      if (data?.error) {
        if (data.error.includes('token') || data.error.includes('Unauthorized')) {
          throw new Error('Your GitHub session has expired. Please log out and log back in.');
        }
        throw new Error(data.error);
      }
      
      setBranches(data.branches || []);
    } catch (error: any) {
      console.error('Error fetching branches:', error);
      toast({
        variant: "destructive",
        title: "Failed to fetch branches",
        description: error.message || "Unable to fetch repository branches. Please try again.",
      });
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  return {
    repos,
    branches,
    loadingRepos,
    loadingBranches,
    fetchRepos,
    fetchBranches,
  };
};
