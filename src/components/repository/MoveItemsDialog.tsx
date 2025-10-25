import { useState, useEffect, useCallback } from "react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FileItem {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
}

interface MoveItemsDialogProps {
  files: FileItem[];
  owner: string;
  repo: string;
  branch: string;
  currentPath: string;
  onClose: () => void;
  onMove: () => void;
}

export function MoveItemsDialog({
  files,
  owner,
  repo,
  branch,
  currentPath,
  onClose,
  onMove,
}: MoveItemsDialogProps) {
  const [destination, setDestination] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [isLoadingFolders, setIsLoadingFolders] = useState(true);

  const fetchFolders = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('get-repo-folders', {
        body: { 
          owner, 
          repo, 
          ref: branch,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      if (data && typeof data === 'object' && 'folders' in data) {
        const folders = data.folders as string[];
        // Deduplicate and sort
        const uniqueFolders = [...new Set(folders)].sort();
        setFolders(['Root', ...uniqueFolders]);
      }
    } catch (err) {
      console.error('Error fetching folders:', err);
      toast({
        title: "Error",
        description: "Failed to load folders. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFolders(false);
    }
  }, [owner, repo, branch]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Helper: check if a destination is invalid for the selected files
  const isInvalidDestination = (dest: string): { invalid: boolean; reason?: string } => {
    const resolvedDest = dest === 'Root' ? '' : dest;
    const normalizedCurrent = currentPath || '';

    // Check if destination is the same as current path (no-op)
    if (resolvedDest === normalizedCurrent) {
      return { invalid: true, reason: 'same as current folder' };
    }

    // Check if any selected directory would be moved into itself or its descendant
    for (const file of files) {
      if (file.type === 'dir') {
        if (resolvedDest === file.path) {
          return { invalid: true, reason: 'cannot move folder into itself' };
        }
        if (resolvedDest.startsWith(file.path + '/')) {
          return { invalid: true, reason: 'cannot move folder into its descendant' };
        }
      }
    }

    return { invalid: false };
  };

  const handleMove = async () => {
    const resolvedDest = destination === 'Root' ? '' : destination;
    
    // Final validation before move
    const validation = isInvalidDestination(destination);
    if (validation.invalid) {
      toast({
        title: "Invalid move",
        description: `Cannot move: ${validation.reason}`,
        variant: "destructive",
      });
      return;
    }

    setIsMoving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('move-files', {
        body: {
          owner,
          repo,
          files: files.map(f => ({ path: f.path, sha: f.sha, type: f.type })),
          destination: resolvedDest,
          branch,
          provider_token: session?.provider_token,
        }
      });

      if (error) {
        console.error('Error moving items:', error);
        toast({
          title: "Move failed",
          description: error.message || "Could not move the items. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const moved = data?.moved || files.length;
      const skipped = data?.skipped || 0;
      
      onMove();
      onClose();
      toast({
        title: "Moved ✓",
        description: `${moved} item${moved > 1 ? 's' : ''} moved${skipped > 0 ? `, ${skipped} skipped` : ''}`,
      });
    } catch (err) {
      console.error('Exception moving items:', err);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg md:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl md:text-2xl">Move {files.length} Item{files.length > 1 ? 's' : ''}</DialogTitle>
          <DialogDescription className="text-base md:text-sm">
            Select a destination folder
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Destination</Label>
            {isLoadingFolders ? (
              <div className="flex items-center gap-3 text-muted-foreground p-4 bg-muted/50 rounded-lg">
                <Loader2 className="h-6 w-6 sm:h-5 sm:w-5 animate-spin" />
                <span className="text-base md:text-sm">Loading folders...</span>
              </div>
            ) : (
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger className="h-12 md:h-10 text-base md:text-sm">
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover max-h-[300px]">
                  {folders.map((folder) => {
                    const resolvedFolder = folder === 'Root' ? '' : folder;
                    const validation = isInvalidDestination(folder);
                    
                    let label = folder;
                    if (validation.invalid) {
                      if (resolvedFolder === (currentPath || '')) {
                        label = folder === 'Root' ? 'Root (current)' : `${folder} (current)`;
                      } else {
                        label = `${folder} (${validation.reason})`;
                      }
                    }
                    
                    return (
                      <SelectItem 
                        key={folder} 
                        value={folder} 
                        disabled={validation.invalid}
                        className="text-base md:text-sm py-3 md:py-2"
                      >
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter className="gap-3 sm:gap-2">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isMoving}
            className="h-12 md:h-10 text-base md:text-sm min-w-[100px] touch-manipulation"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleMove} 
            disabled={isMoving || !destination || isInvalidDestination(destination).invalid}
            className="h-12 md:h-10 text-base md:text-sm min-w-[100px] touch-manipulation"
          >
            {isMoving && <Loader2 className="h-6 w-6 sm:h-5 sm:w-5 mr-2 animate-spin" />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
