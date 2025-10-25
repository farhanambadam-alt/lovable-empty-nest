import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGitHubRepos } from "@/hooks/useGitHubRepos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BottomNav } from "@/components/BottomNav";

const Sync = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState<string | null>(null);
  
  const [sourceRepo, setSourceRepo] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [destRepo, setDestRepo] = useState("");
  const [destBranch, setDestBranch] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");

  const {
    repos,
    branches: sourceBranches,
    loadingRepos,
    loadingBranches: loadingSourceBranches,
    fetchRepos,
    fetchBranches: fetchSourceBranches,
  } = useGitHubRepos();

  const [destBranches, setDestBranches] = useState<any[]>([]);
  const [loadingDestBranches, setLoadingDestBranches] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
        fetchRepos();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        navigate("/auth");
      } else if (session) {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("github_username")
      .eq("id", userId)
      .single();

    if (!error && data) {
      setUsername(data.github_username);
    }
  };

  useEffect(() => {
    if (sourceRepo) {
      fetchSourceBranches(sourceRepo);
    }
  }, [sourceRepo]);

  useEffect(() => {
    if (destRepo) {
      fetchDestBranches();
    }
  }, [destRepo]);

  const fetchDestBranches = async () => {
    if (!destRepo) return;
    
    setLoadingDestBranches(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('get-repo-branches', {
        body: { 
          repositoryName: destRepo,
          provider_token: session?.provider_token,
        }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      setDestBranches(data.branches || []);
    } catch (error: any) {
      console.error('Error fetching dest branches:', error);
      toast({
        variant: "destructive",
        title: "Failed to fetch branches",
        description: error.message || "Please try again",
      });
      setDestBranches([]);
    } finally {
      setLoadingDestBranches(false);
    }
  };

  const handleSync = async () => {
    if (!sourceRepo || !sourceBranch || !destRepo || !destBranch) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select all repositories and branches",
      });
      return;
    }

    if (sourceRepo === destRepo && sourceBranch === destBranch) {
      toast({
        variant: "destructive",
        title: "Invalid Selection",
        description: "Source and destination must be different",
      });
      return;
    }

    setIsLoading(true);
    setSyncProgress("Initiating sync...");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('sync-repo-contents', {
        body: {
          sourceRepo,
          sourceBranch,
          destRepo,
          destBranch,
          provider_token: session?.provider_token,
        },
      });

      if (error) throw error;
      if (data?.error) {
        if (data.error.includes('token') || data.error.includes('expired')) {
          throw new Error('Your GitHub session has expired. Please log out and log back in.');
        }
        throw new Error(data.error);
      }

      setSyncProgress(`Synced ${data.files_synced} of ${data.total_files} files successfully`);
      
      toast({
        title: "Success!",
        description: `Successfully synced ${data.files_synced} of ${data.total_files} files`,
      });

    } catch (error: any) {
      console.error('Error syncing repos:', error);
      setSyncProgress("");
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: error.message || "Unable to sync repositories. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header username={username} showNav={true} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center">
            <RefreshCw className="h-16 w-16 mx-auto mb-4 text-primary" />
            <h2 className="text-3xl font-bold mb-2">Sync Repositories</h2>
            <p className="text-muted-foreground">
              Copy content from one branch to another
            </p>
          </div>

          <Card className="shadow-elevated gradient-card">
            <CardHeader>
              <CardTitle>Repository Sync Configuration</CardTitle>
              <CardDescription>
                Select source and destination to sync content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This will overwrite files in the destination branch. Use with caution.
                </AlertDescription>
              </Alert>

              <div className="space-y-5">
                <h3 className="font-semibold text-xl md:text-lg">Source</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-4">
                  <div className="space-y-3">
                    <Label htmlFor="sourceRepo" className="text-base md:text-sm font-semibold">Source Repository</Label>
                    <Select value={sourceRepo} onValueChange={setSourceRepo} disabled={loadingRepos}>
                      <SelectTrigger className="bg-secondary h-12 md:h-10 text-base md:text-sm touch-manipulation">
                        <SelectValue placeholder={loadingRepos ? "Loading..." : "Select repository"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {repos.map((repo) => (
                          <SelectItem key={repo.name} value={repo.name} className="text-base md:text-sm py-3 md:py-2">
                            {repo.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="sourceBranch" className="text-base md:text-sm font-semibold">Source Branch</Label>
                    <Select value={sourceBranch} onValueChange={setSourceBranch} disabled={loadingSourceBranches || !sourceRepo}>
                      <SelectTrigger className="bg-secondary h-12 md:h-10 text-base md:text-sm touch-manipulation">
                        <SelectValue placeholder={loadingSourceBranches ? "Loading..." : "Select branch"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {sourceBranches.map((branch) => (
                          <SelectItem key={branch.name} value={branch.name} className="text-base md:text-sm py-3 md:py-2">
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <h3 className="font-semibold text-xl md:text-lg">Destination</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-4">
                  <div className="space-y-3">
                    <Label htmlFor="destRepo" className="text-base md:text-sm font-semibold">Destination Repository</Label>
                    <Select value={destRepo} onValueChange={setDestRepo} disabled={loadingRepos}>
                      <SelectTrigger className="bg-secondary h-12 md:h-10 text-base md:text-sm touch-manipulation">
                        <SelectValue placeholder={loadingRepos ? "Loading..." : "Select repository"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {repos.map((repo) => (
                          <SelectItem key={repo.name} value={repo.name} className="text-base md:text-sm py-3 md:py-2">
                            {repo.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="destBranch" className="text-base md:text-sm font-semibold">Destination Branch</Label>
                    <Select value={destBranch} onValueChange={setDestBranch} disabled={loadingDestBranches || !destRepo}>
                      <SelectTrigger className="bg-secondary h-12 md:h-10 text-base md:text-sm touch-manipulation">
                        <SelectValue placeholder={loadingDestBranches ? "Loading..." : "Select branch"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {destBranches.map((branch) => (
                          <SelectItem key={branch.name} value={branch.name} className="text-base md:text-sm py-3 md:py-2">
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {syncProgress && (
                <div className="p-4 bg-primary/10 rounded-lg">
                  <p className="text-sm">{syncProgress}</p>
                </div>
              )}

              <Button
                onClick={handleSync}
                disabled={isLoading || !sourceRepo || !sourceBranch || !destRepo || !destBranch}
                className="w-full h-12 text-base font-medium transition-smooth hover:shadow-glow"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-5 w-5" />
                    Initiate Sync
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      
      <BottomNav username={username} />
    </div>
  );
};

export default Sync;
