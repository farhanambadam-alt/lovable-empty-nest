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
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface RenameRepoDialogProps {
  owner: string;
  repo: string;
  onClose: () => void;
  onRename: (newName: string) => void;
}

export function RenameRepoDialog({
  owner,
  repo,
  onClose,
  onRename,
}: RenameRepoDialogProps) {
  const [newName, setNewName] = useState(repo);
  const [isRenaming, setIsRenaming] = useState(false);

  const handleRename = async () => {
    if (!newName || newName === repo) {
      toast({
        title: "Invalid name",
        description: "Please enter a different repository name.",
        variant: "destructive",
      });
      return;
    }

    setIsRenaming(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('rename-repo', {
        body: { 
          owner, 
          repo, 
          new_name: newName,
          provider_token: session?.provider_token,
        }
      });

      if (error) {
        console.error('Error renaming repository:', error);
        toast({
          title: "Rename failed",
          description: "Could not rename the repository. Please try again.",
          variant: "destructive",
        });
        return;
      }

      onRename(newName);
      toast({
        title: "Renamed ✓",
        description: `Repository renamed to ${newName}.`,
      });
    } catch (err) {
      console.error('Exception renaming repository:', err);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Repository</DialogTitle>
          <DialogDescription>
            Enter a new name for {repo}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="repo-name">Repository Name</Label>
            <Input
              id="repo-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="my-awesome-repo"
              disabled={isRenaming}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isRenaming}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={isRenaming}>
            {isRenaming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
