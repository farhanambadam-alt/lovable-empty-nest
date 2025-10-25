import { useState, useCallback } from 'react';
import { invokeFunction } from '@/lib/supabase-functions';
import { useToast } from '@/hooks/use-toast';

export interface LivePagesSite {
  repository: string;
  owner: string;
  branch: string;
  url: string;
  status: string;
  source: {
    branch: string;
    path: string;
  };
  updated_at?: string;
}

export function useLivePages() {
  const [sites, setSites] = useState<LivePagesSite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchLivePages = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await invokeFunction<{ sites: LivePagesSite[] }>(
        'list-pages-sites',
        {}
      );

      if (error) {
        throw error;
      }

      setSites(data?.sites || []);
    } catch (error: any) {
      console.error('Error fetching live pages:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to Load Live Pages',
        description: error?.message || 'Could not fetch your GitHub Pages sites.',
      });
      setSites([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return {
    sites,
    isLoading,
    fetchLivePages,
  };
}
