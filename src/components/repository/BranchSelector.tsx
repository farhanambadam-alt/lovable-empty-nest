import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { GitBranch, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface BranchSelectorProps {
  owner: string;
  repo: string;
  currentBranch: string;
  onBranchChange: (branch: string) => void;
}

export function BranchSelector({ 
  owner, 
  repo, 
  currentBranch, 
  onBranchChange 
}: BranchSelectorProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (repo) {
      fetchBranches();
    }
  }, [owner, repo]);

  const fetchBranches = async () => {
    if (!repo) return;
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('get-repo-branches', {
        body: { 
          repositoryName: repo,
          provider_token: session?.provider_token 
        }
      });

      if (error) {
        console.error('Error fetching branches:', error);
        toast({
          title: "Failed to load branches",
          description: "Could not fetch repository branches.",
          variant: "destructive",
        });
        return;
      }

      if (data?.branches) {
        setBranches(data.branches.map((b: any) => b.name));
      }
    } catch (err) {
      console.error('Exception fetching branches:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center w-full sm:w-auto sm:min-w-[140px]">
      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-2 sm:py-1.5 bg-secondary rounded-md border border-border w-full sm:w-auto">
          <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      ) : (
        <Select value={currentBranch} onValueChange={onBranchChange}>
          <SelectTrigger className="h-10 sm:h-8 px-3 bg-secondary hover:bg-muted border-border text-base sm:text-sm font-normal gap-2 w-full sm:w-auto touch-manipulation">
            <GitBranch className="h-5 w-5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Select branch" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50 max-h-[60vh]">
            {branches.map((branch) => (
              <SelectItem 
                key={branch} 
                value={branch}
                className="text-base sm:text-sm py-3 sm:py-2 hover:bg-muted cursor-pointer touch-manipulation"
              >
                {branch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
