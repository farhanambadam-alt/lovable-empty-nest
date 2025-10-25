import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { branchNameSchema, validateInput } from "@/lib/input-validation";

const repoSettingsSchema = z.object({
  description: z.string().max(350, "Description must be less than 350 characters").optional(),
  homepage: z.string().max(255, "Homepage URL must be less than 255 characters").optional(),
  private: z.boolean(),
  default_branch: z.string().optional(),
  topics: z.string().optional(),
});

type RepoSettingsForm = z.infer<typeof repoSettingsSchema>;

interface Repository {
  name: string;
  full_name: string;
  description: string | null;
  homepage: string | null;
  private: boolean;
  default_branch?: string;
  topics?: string[];
}

interface RepositorySettingsDialogProps {
  repo: Repository | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export const RepositorySettingsDialog = ({
  repo,
  open,
  onOpenChange,
  onUpdate,
}: RepositorySettingsDialogProps) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  const [showRenameBranch, setShowRenameBranch] = useState(false);
  const [selectedBranchToRename, setSelectedBranchToRename] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [isRenamingBranch, setIsRenamingBranch] = useState(false);
  const [showDeleteBranch, setShowDeleteBranch] = useState(false);
  const [selectedBranchToDelete, setSelectedBranchToDelete] = useState("");
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);
  const [confirmBranchName, setConfirmBranchName] = useState("");

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<RepoSettingsForm>({
    resolver: zodResolver(repoSettingsSchema),
    defaultValues: {
      description: "",
      homepage: "",
      private: false,
      default_branch: "",
      topics: "",
    },
    values: repo ? {
      description: repo.description || "",
      homepage: repo.homepage || "",
      private: repo.private,
      default_branch: repo.default_branch || "",
      topics: repo.topics?.join(", ") || "",
    } : undefined,
  });

  useEffect(() => {
    if (repo && open) {
      // Reset state when dialog opens
      setBranches([]);
      setShowRenameBranch(false);
      setShowDeleteBranch(false);
      setSelectedBranchToRename("");
      setSelectedBranchToDelete("");
      setNewBranchName("");
      setConfirmBranchName("");
      fetchBranches();
    }
  }, [repo, open]);

  const fetchBranches = async () => {
    if (!repo) return;
    
    setIsFetchingBranches(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.provider_token) {
        console.error('No provider token available');
        toast({
          variant: "destructive",
          title: "Authentication required",
          description: "Please sign in again to manage branches",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('get-repo-branches', {
        body: { 
          repositoryName: repoName,
          provider_token: session.provider_token,
        }
      });
      
      if (error) {
        console.error('Error invoking get-repo-branches:', error);
        toast({
          variant: "destructive",
          title: "Failed to fetch branches",
          description: "Unable to load branches. Please try again.",
        });
        return;
      }
      
      if (data?.error) {
        console.error('API error fetching branches:', data.error);
        toast({
          variant: "destructive",
          title: "Failed to fetch branches",
          description: data.error,
        });
        return;
      }
      
      if (data?.branches && Array.isArray(data.branches)) {
        const branchNames = data.branches.map((b: any) => b.name);
        console.log('Fetched branches:', branchNames);
        setBranches(branchNames);
      } else {
        console.error('Unexpected response format:', data);
        setBranches([]);
      }
    } catch (err) {
      console.error('Exception fetching branches:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch branches. Please try again.",
      });
      setBranches([]);
    } finally {
      setIsFetchingBranches(false);
    }
  };

  const isPrivate = watch("private");

  const onSubmit = async (data: RepoSettingsForm) => {
    if (!repo) return;

    setIsSaving(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      
      // Prepare topics array
      const topicsArray = data.topics 
        ? data.topics.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('update-repo', {
        body: {
          owner,
          repo: repoName,
          description: data.description || "",
          homepage: data.homepage || "",
          private: data.private,
          default_branch: data.default_branch || repo.default_branch,
          topics: topicsArray,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Settings updated",
        description: "Repository settings have been saved successfully",
      });

      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update repository settings",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRepo = async () => {
    if (!repo) return;
    
    setIsDeleting(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('delete-repo', {
        body: { 
          owner, 
          repo: repoName,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Repository deleted",
        description: `${repo.name} has been permanently deleted`,
      });

      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete repository",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameBranch = async () => {
    if (!repo || !selectedBranchToRename || !newBranchName) return;
    
    // Validate new branch name
    const error = validateInput(branchNameSchema, newBranchName);
    if (error) {
      toast({
        variant: "destructive",
        title: "Invalid branch name",
        description: error,
      });
      return;
    }
    
    setIsRenamingBranch(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('rename-branch', {
        body: {
          owner,
          repo: repoName,
          old_name: selectedBranchToRename,
          new_name: newBranchName,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Branch renamed",
        description: `${selectedBranchToRename} has been renamed to ${newBranchName}`,
      });

      setShowRenameBranch(false);
      setSelectedBranchToRename("");
      setNewBranchName("");
      // Wait a moment for GitHub to update before refetching
      setTimeout(() => fetchBranches(), 500);
      onUpdate();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to rename branch",
      });
    } finally {
      setIsRenamingBranch(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!repo || !selectedBranchToDelete || confirmBranchName !== selectedBranchToDelete) return;
    
    setIsDeletingBranch(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('delete-branch', {
        body: {
          owner,
          repo: repoName,
          branch: selectedBranchToDelete,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Branch deleted",
        description: `${selectedBranchToDelete} has been permanently deleted`,
      });

      setShowDeleteBranch(false);
      setSelectedBranchToDelete("");
      setConfirmBranchName("");
      // Wait a moment for GitHub to update before refetching
      setTimeout(() => fetchBranches(), 500);
      onUpdate();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete branch",
      });
    } finally {
      setIsDeletingBranch(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl">Repository Settings</DialogTitle>
          <DialogDescription>
            Update settings for {repo?.name}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
            
            {/* Basic Information Section */}
            <section className="space-y-3 p-3 sm:p-4 rounded-lg border bg-card">
              <h3 className="font-semibold text-sm sm:text-base">Basic Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="A short description of your repository"
                  className="min-h-[48px]"
                  {...register("description")}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="homepage">Homepage URL</Label>
                <Input
                  id="homepage"
                  type="url"
                  placeholder="https://example.com"
                  className="min-h-[48px]"
                  {...register("homepage")}
                />
                {errors.homepage && (
                  <p className="text-sm text-destructive">{errors.homepage.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="topics">Topics</Label>
                <Input
                  id="topics"
                  placeholder="e.g. react, typescript, web"
                  className="min-h-[48px]"
                  {...register("topics")}
                />
                <p className="text-xs text-muted-foreground">
                  Separate topics with commas
                </p>
              </div>
            </section>

            {/* Branch Settings Section */}
            <section className="space-y-3 p-3 sm:p-4 rounded-lg border bg-card">
              <h3 className="font-semibold text-sm sm:text-base">Branch Settings</h3>
              
              <div className="space-y-2">
                <Label htmlFor="default_branch">Default Branch</Label>
                <Select
                  value={watch("default_branch") || repo?.default_branch}
                  onValueChange={(value) => setValue("default_branch", value)}
                >
                  <SelectTrigger id="default_branch" className="min-h-[48px]">
                    <SelectValue placeholder="Select default branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        {branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The default branch for pull requests and code commits
                </p>
              </div>

              <div className="space-y-3">
                <Label>Branch Management</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-h-[48px]"
                  onClick={() => setShowRenameBranch(!showRenameBranch)}
                >
                  {showRenameBranch ? "Cancel Rename" : "Rename Branch"}
                </Button>
                
                {showRenameBranch && (
                  <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <Label htmlFor="branch_to_rename">Select Branch to Rename</Label>
                      <Select
                        value={selectedBranchToRename}
                        onValueChange={setSelectedBranchToRename}
                      >
                        <SelectTrigger id="branch_to_rename" className="min-h-[48px]">
                          <SelectValue placeholder="Choose a branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch} value={branch}>
                              {branch}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {selectedBranchToRename && (
                      <div className="space-y-2">
                        <Label htmlFor="new_branch_name">New Branch Name</Label>
                        <Input
                          id="new_branch_name"
                          placeholder="Enter new branch name"
                          className="min-h-[48px]"
                          value={newBranchName}
                          onChange={(e) => setNewBranchName(e.target.value)}
                        />
                        <Button
                          type="button"
                          className="w-full min-h-[48px]"
                          onClick={handleRenameBranch}
                          disabled={!selectedBranchToRename || !newBranchName || isRenamingBranch}
                        >
                          {isRenamingBranch ? "Renaming..." : "Confirm Rename"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Repository Access Section */}
            <section className="space-y-3 p-3 sm:p-4 rounded-lg border bg-card">
              <h3 className="font-semibold text-sm sm:text-base">Repository Access</h3>
              
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="private" className="text-base">Private Repository</Label>
                  <p className="text-sm text-muted-foreground">
                    {isPrivate ? "Only you can see this repository" : "Anyone can see this repository"}
                  </p>
                </div>
                <Switch
                  id="private"
                  checked={isPrivate ?? false}
                  onCheckedChange={(checked) => setValue("private", checked)}
                  className="mt-1 min-h-[32px] min-w-[52px]"
                />
              </div>
            </section>

            {/* Danger Zone Section */}
            <section className="space-y-3 p-3 sm:p-4 rounded-lg border-2 border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                <h3 className="font-semibold text-sm sm:text-base text-destructive">Danger Zone</h3>
              </div>
              
              <div className="space-y-4">
                {/* Delete Branch */}
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm">Delete a branch</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Permanently delete a branch. This action cannot be undone.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-[48px] border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setShowDeleteBranch(!showDeleteBranch)}
                  >
                    {showDeleteBranch ? "Cancel" : "Delete Branch"}
                  </Button>

                  {showDeleteBranch && (
                    <div className="space-y-3 p-4 border border-destructive/30 rounded-lg bg-background">
                      <div className="space-y-2">
                        <Label htmlFor="branch_to_delete">Select Branch to Delete</Label>
                        <Select
                          value={selectedBranchToDelete}
                          onValueChange={(value) => {
                            setSelectedBranchToDelete(value);
                            setConfirmBranchName("");
                          }}
                        >
                          <SelectTrigger id="branch_to_delete" className="min-h-[48px]">
                            <SelectValue placeholder="Choose a branch" />
                          </SelectTrigger>
                          <SelectContent>
                            {isFetchingBranches ? (
                              <div className="p-2 text-sm text-muted-foreground">Loading branches...</div>
                            ) : branches.length === 0 ? (
                              <div className="p-2 text-sm text-muted-foreground">No branches found</div>
                            ) : branches.filter(branch => branch !== repo?.default_branch).length === 0 ? (
                              <div className="p-2 text-sm text-muted-foreground">No branches available to delete</div>
                            ) : (
                              branches
                                .filter(branch => branch !== repo?.default_branch)
                                .map((branch) => (
                                  <SelectItem key={branch} value={branch}>
                                    {branch}
                                  </SelectItem>
                                ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedBranchToDelete && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">
                            Type <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{selectedBranchToDelete}</code> to confirm:
                          </p>
                          <Input
                            placeholder={selectedBranchToDelete}
                            value={confirmBranchName}
                            className="min-h-[48px]"
                            onChange={(e) => setConfirmBranchName(e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            className="w-full min-h-[48px]"
                            onClick={handleDeleteBranch}
                            disabled={confirmBranchName !== selectedBranchToDelete || isDeletingBranch}
                          >
                            {isDeletingBranch ? "Deleting..." : "Delete Branch Permanently"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Separator className="bg-destructive/20" />

                {/* Delete Repository */}
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm">Delete this repository</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Once deleted, it will be gone forever. Please be certain.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full min-h-[48px]"
                    onClick={() => setShowDangerZone(!showDangerZone)}
                  >
                    {showDangerZone ? "Cancel" : "Delete Repository"}
                  </Button>

                  {showDangerZone && (
                    <div className="space-y-3 p-4 border border-destructive rounded-lg bg-background">
                      <p className="text-sm font-medium">
                        Type <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{repo?.name}</code> to confirm deletion:
                      </p>
                      <Input
                        placeholder={repo?.name}
                        className="min-h-[48px]"
                        onChange={(e) => {
                          if (e.target.value === repo?.name) {
                            e.target.dataset.confirmed = "true";
                          } else {
                            delete e.target.dataset.confirmed;
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full min-h-[48px]"
                        onClick={handleDeleteRepo}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : "I understand, delete this repository"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Sticky Footer */}
          <DialogFooter className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t bg-background sticky bottom-0 z-10">
            <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:justify-end">
              <Button 
                type="button" 
                variant="outline" 
                className="w-full sm:w-auto min-h-[48px]"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSaving}
                className="w-full sm:w-auto min-h-[48px] font-semibold"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
