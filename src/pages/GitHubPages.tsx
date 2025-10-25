import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, ArrowRight, ArrowLeft, Rocket, ExternalLink, CheckCircle2, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StepIndicator } from "@/components/wizard/StepIndicator";
import { WizardStep } from "@/components/wizard/WizardStep";
import { useGitHubRepos } from "@/hooks/useGitHubRepos";
import { BottomNav } from "@/components/BottomNav";
import { invokeFunction } from "@/lib/supabase-functions";
import { LivePagesDashboard } from "@/components/pages/LivePagesDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const GitHubPages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"deploy" | "live">("deploy");
  const [currentStep, setCurrentStep] = useState(0);
  
  // Step 1: Repository Selection
  const [selectedRepo, setSelectedRepo] = useState("");
  
  // Step 2: Configuration
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedPath, setSelectedPath] = useState<"/" | "/docs">("/");
  
  // Step 3: Result
  const [pagesUrl, setPagesUrl] = useState<string>("");
  const [isEnabled, setIsEnabled] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  
  const { repos, branches, loadingRepos, loadingBranches, fetchRepos, fetchBranches } = useGitHubRepos();

  const steps = ["Select Repository", "Configure Source", "Enable & Review"];

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
    } else {
      toast({
        variant: "destructive",
        title: "Error loading profile",
        description: "Could not load your GitHub profile.",
      });
    }
  };

  useEffect(() => {
    if (selectedRepo) {
      fetchBranches(selectedRepo);
      checkPagesStatus();
    }
  }, [selectedRepo]);

  const checkPagesStatus = async () => {
    if (!selectedRepo || !username) return;
    
    setIsCheckingStatus(true);
    try {
      const { data, error } = await invokeFunction<{ enabled: boolean; url?: string; status?: string }>(
        'get-pages-info',
        {
          owner: username,
          repo: selectedRepo,
        }
      );

      if (error) {
        console.log('Error checking Pages status (may not be enabled yet):', error);
        setIsEnabled(false);
        return;
      }

      if (data?.enabled) {
        setIsEnabled(true);
        setPagesUrl(data.url || '');
        toast({
          title: "GitHub Pages Already Enabled",
          description: `This repository already has GitHub Pages enabled at: ${data.url}`,
        });
      } else {
        setIsEnabled(false);
        setPagesUrl('');
      }
    } catch (error) {
      console.error('Error checking Pages status:', error);
      setIsEnabled(false);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 0) {
      if (!selectedRepo) {
        toast({
          variant: "destructive",
          title: "Repository Required",
          description: "Please select a repository to continue.",
        });
        return;
      }
    } else if (currentStep === 1) {
      if (!selectedBranch) {
        toast({
          variant: "destructive",
          title: "Branch Required",
          description: "Please select a branch to deploy from.",
        });
        return;
      }
    }
    
    setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleConfigureRepo = (repoName: string) => {
    setSelectedRepo(repoName);
    setActiveView("deploy");
    setCurrentStep(0);
  };

  const handleEnablePages = async () => {
    if (!selectedRepo || !selectedBranch || !username) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please ensure repository and branch are selected.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await invokeFunction<{ success: boolean; url: string; message: string }>(
        'enable-github-pages',
        {
          owner: username,
          repo: selectedRepo,
          branch: selectedBranch,
          path: selectedPath,
        }
      );

      if (error) {
        throw error;
      }

      if (data?.success) {
        setPagesUrl(data.url);
        setIsEnabled(true);
        toast({
          title: "GitHub Pages Enabled!",
          description: data.message || "Your site will be published shortly.",
        });
      }
    } catch (error: any) {
      console.error('Error enabling GitHub Pages:', error);
      toast({
        variant: "destructive",
        title: "Failed to Enable GitHub Pages",
        description: error?.message || "An error occurred while enabling GitHub Pages.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header username={username} showNav={true} />
      
      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-6xl pb-24 md:pb-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            GitHub Pages
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Deploy and manage your static websites
          </p>
        </div>

        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "deploy" | "live")} className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="deploy" className="flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Deploy New
            </TabsTrigger>
            <TabsTrigger value="live" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Live Sites
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deploy" className="space-y-6">
            <Card className="shadow-lg">
          <CardHeader>
            <StepIndicator steps={steps} currentStep={currentStep} />
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step 1: Select Repository */}
            <WizardStep isActive={currentStep === 0} isCompleted={currentStep > 0}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="repository" className="text-base font-semibold">
                    Select Repository
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Choose the repository you want to deploy with GitHub Pages
                  </p>
                  <Select 
                    value={selectedRepo} 
                    onValueChange={setSelectedRepo}
                    disabled={loadingRepos}
                  >
                    <SelectTrigger id="repository" className="h-11">
                      <SelectValue placeholder={loadingRepos ? "Loading repositories..." : "Select a repository"} />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.name} value={repo.name}>
                          {repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isCheckingStatus && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking GitHub Pages status...
                  </div>
                )}

                {isEnabled && (
                  <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-2 flex-1">
                        <p className="text-sm font-medium">GitHub Pages is already enabled for this repository</p>
                        {pagesUrl && (
                          <a
                            href={pagesUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            View your site <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </WizardStep>

            {/* Step 2: Configure Source */}
            <WizardStep isActive={currentStep === 1} isCompleted={currentStep > 1}>
              <div className="space-y-6">
                <div>
                  <Label htmlFor="branch" className="text-base font-semibold">
                    Source Branch
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select the branch to deploy from
                  </p>
                  <Select 
                    value={selectedBranch} 
                    onValueChange={setSelectedBranch}
                    disabled={loadingBranches || !selectedRepo}
                  >
                    <SelectTrigger id="branch" className="h-11">
                      <SelectValue placeholder={loadingBranches ? "Loading branches..." : "Select a branch"} />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-base font-semibold">
                    Deploy Folder
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Choose which folder to publish
                  </p>
                  <RadioGroup value={selectedPath} onValueChange={(value) => setSelectedPath(value as "/" | "/docs")}>
                    <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                      <RadioGroupItem value="/" id="root" />
                      <Label htmlFor="root" className="flex-1 cursor-pointer">
                        <div>
                          <div className="font-medium">/ (root)</div>
                          <div className="text-sm text-muted-foreground">Deploy from the repository root</div>
                        </div>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                      <RadioGroupItem value="/docs" id="docs" />
                      <Label htmlFor="docs" className="flex-1 cursor-pointer">
                        <div>
                          <div className="font-medium">/docs</div>
                          <div className="text-sm text-muted-foreground">Deploy from the /docs folder</div>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </WizardStep>

            {/* Step 3: Enable & Review */}
            <WizardStep isActive={currentStep === 2} isCompleted={false}>
              <div className="space-y-6">
                <div className="p-6 bg-muted/50 rounded-lg space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-primary" />
                    Deployment Summary
                  </h3>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Repository:</span>
                      <span className="font-medium">{selectedRepo}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Branch:</span>
                      <span className="font-medium">{selectedBranch}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Folder:</span>
                      <span className="font-medium">{selectedPath}</span>
                    </div>
                    {username && (
                      <div className="flex justify-between py-2">
                        <span className="text-muted-foreground">Expected URL:</span>
                        <span className="font-medium text-primary">
                          {username}.github.io/{selectedRepo}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {isEnabled && pagesUrl ? (
                  <div className="p-6 bg-primary/10 border border-primary/20 rounded-lg text-center space-y-4">
                    <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                    <div>
                      <h3 className="text-lg font-semibold mb-2">GitHub Pages is Enabled!</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Your site is live and accessible at:
                      </p>
                      <a
                        href={pagesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                      >
                        {pagesUrl} <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <Button 
                    onClick={handleEnablePages}
                    disabled={isLoading}
                    className="w-full h-12 text-base"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Enabling GitHub Pages...
                      </>
                    ) : (
                      <>
                        <Rocket className="mr-2 h-5 w-5" />
                        Enable GitHub Pages
                      </>
                    )}
                  </Button>
                )}

                <p className="text-xs text-muted-foreground text-center">
                  Note: It may take a few minutes for your site to be published after enabling GitHub Pages.
                </p>
              </div>
            </WizardStep>

            {/* Navigation Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0 || isLoading}
                className="flex-1 h-11"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              
              {currentStep < steps.length - 1 && (
                <Button
                  onClick={handleNext}
                  disabled={isLoading}
                  className="flex-1 h-11"
                >
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="live" className="space-y-6">
            <LivePagesDashboard
              onDeployNew={() => setActiveView("deploy")}
              onConfigure={handleConfigureRepo}
            />
          </TabsContent>
        </Tabs>
      </main>

      <BottomNav username={username} />
    </div>
  );
};

export default GitHubPages;
