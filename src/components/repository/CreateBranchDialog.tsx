import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "@/hooks/use-toast";
import { branchNameSchema, validateInput } from "@/lib/input-validation";

interface CreateBranchDialogProps {
  open: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  currentBranch: string;
  onBranchCreated: (branchName: string) => void;
}

export const CreateBranchDialog = ({
  open,
  onClose,
  owner,
  repo,
  currentBranch,
  onBranchCreated,
}: CreateBranchDialogProps) => {
  const [branchName, setBranchName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    // Validate branch name
    const error = validateInput(branchNameSchema, branchName);
    if (error) {
      toast({
        title: "Invalid branch name",
        description: error,
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('create-branch', {
        body: {
          owner,
          repo,
          branchName: branchName.trim(),
          sourceBranch: currentBranch,
          provider_token: session?.provider_token,
        },
      });

      if (error) {
        console.error('Error creating branch:', error);
        toast({
          title: "Failed to create branch",
          description: error.message || "An error occurred while creating the branch.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Branch created ✓",
        description: `${branchName} has been created from ${currentBranch}.`,
      });

      onBranchCreated(branchName);
      setBranchName("");
      onClose();
    } catch (err) {
      console.error('Exception creating branch:', err);
      toast({
        title: "Error",
        description: "Failed to create branch. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setBranchName("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Branch</DialogTitle>
          <DialogDescription>
            Create a new branch from <span className="font-medium">{currentBranch}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch name</Label>
            <Input
              id="branch-name"
              placeholder="feature/my-new-branch"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreating) {
                  handleCreate();
                }
              }}
              disabled={isCreating}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Create Branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};