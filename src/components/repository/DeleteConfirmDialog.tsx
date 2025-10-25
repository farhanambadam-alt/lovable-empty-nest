import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DeleteConfirmDialogProps {
  files: { name: string; path: string; sha: string; type: "file" | "dir" }[];
  owner: string;
  repo: string;
  branch: string;
  onClose: () => void;
  onDelete: () => void;
}

export function DeleteConfirmDialog({
  files,
  owner,
  repo,
  branch,
  onClose,
  onDelete,
}: DeleteConfirmDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const isBulkDelete = files.length > 1;
  console.log('[DeleteConfirmDialog] Opening for', files.length, 'items', files.map(f => f.path));

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Normalize directory paths and remove files contained in selected directories
      const dirPaths = files
        .filter(f => f.type === 'dir')
        .map(d => d.path.endsWith('/') ? d.path : `${d.path}/`);

      const filtered = files.filter(f => {
        if (f.type === 'dir') return true;
        // Exclude files that are inside a directory we are deleting
        return !dirPaths.some(dp => f.path.startsWith(dp));
      });

      // Build a compact list of items to delete (dirs + files not inside selected dirs)
      const items = filtered.map(i => ({ path: i.path, type: i.type }));

      console.log('[DeleteConfirmDialog] Batch deleting items:', items.map(i => i.path));

      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('delete-items', {
        body: { 
          owner, 
          repo, 
          branch, 
          items,
          provider_token: session?.provider_token 
        }
      });

      if (error) {
        console.error('Batch deletion failed:', error);
        toast({
          title: 'Deletion failed',
          description: 'Could not delete selected items. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      onDelete();
    } catch (err) {
      console.error('Exception deleting:', err);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const folderCount = files.filter(f => f.type === "dir").length;
  const fileCount = files.filter(f => f.type === "file").length;
  const hasFolder = folderCount > 0;

  return (
    <AlertDialog open onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBulkDelete 
              ? `Delete ${files.length} items?` 
              : `Delete ${files[0].type === "dir" ? "Folder" : "File"}?`
            }
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isBulkDelete ? (
              <>
                Are you sure you want to delete <strong>{files.length} items</strong>
                {folderCount > 0 && fileCount > 0 && ` (${folderCount} folder${folderCount > 1 ? 's' : ''}, ${fileCount} file${fileCount > 1 ? 's' : ''})`}
                {folderCount > 0 && fileCount === 0 && ` (${folderCount} folder${folderCount > 1 ? 's' : ''})`}
                {fileCount > 0 && folderCount === 0 && ` (${fileCount} file${fileCount > 1 ? 's' : ''})`}?
                {hasFolder && (
                  <span className="block mt-2 text-destructive">
                    This will delete all selected folders and their contents.
                  </span>
                )}
              </>
            ) : (
              <>
                Are you sure you want to delete <strong>{files[0].name}</strong>?
                {files[0].type === "dir" && (
                  <span className="block mt-2 text-destructive">
                    This will delete the folder and all its contents.
                  </span>
                )}
              </>
            )}
            <span className="block mt-2">
              This action cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting && <Loader2 className="h-6 w-6 sm:h-5 sm:w-5 mr-2 animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
