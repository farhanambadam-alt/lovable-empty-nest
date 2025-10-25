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
import { fileNameSchema, folderNameSchema, validateInput } from "@/lib/input-validation";

interface RenameItemDialogProps {
  file: { name: string; path: string; sha: string; type: "file" | "dir" };
  owner: string;
  repo: string;
  branch: string;
  currentPath: string;
  onClose: () => void;
  onRename: () => void;
}

export function RenameItemDialog({
  file,
  owner,
  repo,
  branch,
  currentPath,
  onClose,
  onRename,
}: RenameItemDialogProps) {
  const [newName, setNewName] = useState(file.name);
  const [isRenaming, setIsRenaming] = useState(false);

  const handleRename = async () => {
    // Check if name actually changed
    if (newName === file.name) {
      toast({
        title: "No change",
        description: "Please enter a different name.",
        variant: "destructive",
      });
      return;
    }

    // Validate the new name
    const nameSchema = file.type === "dir" ? folderNameSchema : fileNameSchema;
    const error = validateInput(nameSchema, newName);
    if (error) {
      toast({
        title: "Invalid name",
        description: error,
        variant: "destructive",
      });
      return;
    }

    if (file.type === "dir") {
      toast({
        title: "Cannot rename folders",
        description: "Renaming folders is not currently supported. Please rename individual files instead.",
        variant: "destructive",
      });
      return;
    }

    setIsRenaming(true);
    try {
      const newPath = currentPath ? `${currentPath}/${newName}` : newName;
      
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('rename-file', {
        body: {
          owner,
          repo,
          path: file.path,
          new_path: newPath,
          sha: file.sha,
          branch,
          provider_token: session?.provider_token,
        }
      });

      if (error) {
        console.error('Error renaming item:', error);
        toast({
          title: "Rename failed",
          description: "Could not rename the item. Please try again.",
          variant: "destructive",
        });
        return;
      }

      onRename();
      toast({
        title: "Renamed ✓",
        description: `${file.name} renamed to ${newName}.`,
      });
    } catch (err) {
      console.error('Exception renaming item:', err);
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
      <DialogContent className="max-w-lg">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl md:text-2xl">Rename {file.type === "dir" ? "Folder" : "File"}</DialogTitle>
          <DialogDescription className="text-base md:text-sm">
            Enter a new name for {file.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label htmlFor="item-name" className="text-base font-semibold">Name</Label>
            <Input
              id="item-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="new-name"
              disabled={isRenaming}
              className="h-12 md:h-10 text-base md:text-sm"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter className="gap-3 sm:gap-2">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isRenaming}
            className="h-12 md:h-10 text-base md:text-sm min-w-[100px] touch-manipulation"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleRename} 
            disabled={isRenaming}
            className="h-12 md:h-10 text-base md:text-sm min-w-[100px] touch-manipulation"
          >
            {isRenaming && <Loader2 className="h-5 w-5 md:h-4 md:w-4 mr-2 animate-spin" />}
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
