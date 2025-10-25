import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  VisuallyHidden,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fileNameSchema, folderNameSchema, fileContentSchema, validateInput } from "@/lib/input-validation";

interface CreateItemModalProps {
  owner: string;
  repo: string;
  branch: string;
  currentPath: string;
  onClose: () => void;
  onCreate: () => void;
}

export function CreateItemModal({
  owner,
  repo,
  branch,
  currentPath,
  onClose,
  onCreate,
}: CreateItemModalProps) {
  const [itemType, setItemType] = useState<"file" | "folder">("file");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    // Validate file or folder name
    const nameSchema = itemType === "folder" ? folderNameSchema : fileNameSchema;
    const nameError = validateInput(nameSchema, name);
    if (nameError) {
      toast({
        title: "Invalid name",
        description: nameError,
        variant: "destructive",
      });
      return;
    }

    // Validate file content size if creating a file
    if (itemType === "file" && content) {
      const contentError = validateInput(fileContentSchema, content);
      if (contentError) {
        toast({
          title: "Invalid file content",
          description: contentError,
          variant: "destructive",
        });
        return;
      }
    }

    setIsCreating(true);
    try {
      const path = currentPath ? `${currentPath}/${name}` : name;
      const fileContent = itemType === "folder" ? "" : content;
      const filePath = itemType === "folder" ? `${path}/.gitkeep` : path;

      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('create-file', {
        body: {
          owner,
          repo,
          path: filePath,
          content: fileContent,
          message: `Create ${itemType === "folder" ? "folder" : "file"} ${name}`,
          branch,
          provider_token: session?.provider_token,
        }
      });

      if (error) {
        console.error('Error creating item:', error);
        toast({
          title: "Creation failed",
          description: error.message?.includes('already exists')
            ? "A file or folder with this name already exists."
            : "Could not create the item. Please try again.",
          variant: "destructive",
        });
        return;
      }

      onCreate();
    } catch (err) {
      console.error('Exception creating item:', err);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl md:text-2xl">Create New Item</DialogTitle>
          <VisuallyHidden>
            <DialogDescription>Create a new file or folder in your repository</DialogDescription>
          </VisuallyHidden>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Type</Label>
            <RadioGroup value={itemType} onValueChange={(v) => setItemType(v as "file" | "folder")}>
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors touch-manipulation">
                <RadioGroupItem value="file" id="file" className="h-5 w-5" />
                <Label htmlFor="file" className="cursor-pointer text-base flex-1">File</Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors touch-manipulation">
                <RadioGroupItem value="folder" id="folder" className="h-5 w-5" />
                <Label htmlFor="folder" className="cursor-pointer text-base flex-1">Folder</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label htmlFor="name" className="text-base font-semibold">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={itemType === "folder" ? "folder-name" : "file.txt"}
              disabled={isCreating}
              className="h-12 text-base"
            />
          </div>

          {itemType === "file" && (
            <div className="space-y-3">
              <Label htmlFor="content" className="text-base font-semibold">Content (optional)</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="File content..."
                className="font-mono text-sm min-h-[200px] md:min-h-[250px]"
                disabled={isCreating}
              />
            </div>
          )}

          {itemType === "folder" && (
            <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
              A .gitkeep file will be created inside the folder to make it visible in Git.
            </p>
          )}
        </div>

        <DialogFooter className="gap-3 sm:gap-2">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isCreating}
            className="h-12 md:h-10 text-base md:text-sm min-w-[100px] touch-manipulation"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={isCreating}
            className="h-12 md:h-10 text-base md:text-sm min-w-[100px] touch-manipulation"
          >
            {isCreating && <Loader2 className="h-6 w-6 sm:h-5 sm:w-5 mr-2 animate-spin" />}
            Create {itemType}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
