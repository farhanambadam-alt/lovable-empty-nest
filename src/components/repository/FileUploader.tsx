import { useState, useRef } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { commitMessageSchema, fileContentSchema, validateInput } from "@/lib/input-validation";

interface FileUploaderProps {
  owner: string;
  repo: string;
  branch: string;
  currentPath: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

export function FileUploader({
  owner,
  repo,
  branch,
  currentPath,
  onClose,
  onUploadComplete,
}: FileUploaderProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
      setCommitMessage(`Upload ${filesArray.length} file${filesArray.length > 1 ? 's' : ''}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const filesArray = Array.from(e.dataTransfer.files);
      setSelectedFiles(filesArray);
      setCommitMessage(`Upload ${filesArray.length} file${filesArray.length > 1 ? 's' : ''}`);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    // Validate commit message
    const commitError = validateInput(commitMessageSchema, commitMessage);
    if (commitError) {
      toast({
        title: "Invalid commit message",
        description: commitError,
        variant: "destructive",
      });
      return;
    }

    // Validate file sizes
    const MAX_FILE_SIZE = 10485760; // 10MB
    const oversizedFiles = selectedFiles.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast({
        title: "Files too large",
        description: `${oversizedFiles.length} file(s) exceed 10MB limit: ${oversizedFiles.map(f => f.name).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const totalFiles = selectedFiles.length;
      let processedFiles = 0;

      const filesData = await Promise.all(
        selectedFiles.map(async (file) => {
          const content = await readFileAsBase64(file);
          const path = currentPath ? `${currentPath}/${file.name}` : file.name;
          processedFiles++;
          setUploadProgress((processedFiles / totalFiles) * 50); // First 50% for reading
          return { path, content };
        })
      );

      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('upload-files', {
        body: {
          owner,
          repo,
          files: filesData,
          branch,
          message: commitMessage,
          provider_token: session?.provider_token,
        }
      });

      setUploadProgress(100);

      if (error) {
        console.error('Error uploading files:', error);
        toast({
          title: "Upload failed",
          description: error.message || "Could not upload files. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (data?.results) {
        const failed = data.results.filter((r: any) => !r.success);
        if (failed.length > 0) {
          toast({
            title: "Partial upload",
            description: `${data.summary.successful} of ${data.summary.total} files uploaded successfully.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Upload complete",
            description: `Successfully uploaded ${data.summary.successful} file${data.summary.successful > 1 ? 's' : ''}.`,
          });
          onClose();
          onUploadComplete();
        }
      }
    } catch (err) {
      console.error('Exception uploading files:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong during upload.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result?.toString().split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl md:text-2xl font-semibold">Upload Files</DialogTitle>
          <VisuallyHidden>
            <DialogDescription>Upload files to your repository</DialogDescription>
          </VisuallyHidden>
          <p className="text-sm text-muted-foreground">
            Upload to: <span className="font-mono text-primary">{currentPath || '/'}</span>
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div
            className="group border-2 border-dashed rounded-xl p-12 md:p-10 text-center cursor-pointer 
                       hover:border-primary hover:bg-primary/5 transition-all duration-200 
                       touch-manipulation active:scale-[0.98]"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-14 w-14 md:h-12 md:w-12 mx-auto mb-3 text-muted-foreground 
                              group-hover:text-primary transition-colors" />
            <p className="text-base md:text-sm font-semibold mb-1.5">
              Click to browse or drag and drop
            </p>
            <p className="text-sm md:text-xs text-muted-foreground">
              Select multiple files to upload them all at once
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Selected Files ({selectedFiles.length})
                </Label>
                <p className="text-xs text-muted-foreground">
                  {(selectedFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} MB total
                </p>
              </div>
              <div className="max-h-[250px] md:max-h-[200px] overflow-auto space-y-2 border rounded-lg p-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 md:p-2.5 bg-muted/50 
                               hover:bg-muted rounded-lg transition-colors group"
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-sm md:text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      disabled={isUploading}
                      className="h-9 w-9 md:h-8 md:w-8 touch-manipulation opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <Label htmlFor="commit-message" className="text-sm font-semibold">Commit Message</Label>
            <Input
              id="commit-message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Upload files..."
              disabled={isUploading}
              className="h-11 md:h-10 text-base md:text-sm"
            />
          </div>

          {isUploading && (
            <div className="space-y-2.5 bg-muted/30 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Uploading files...</Label>
                <span className="text-xs text-muted-foreground">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-3 sm:gap-2">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isUploading}
            className="h-12 md:h-10 text-base md:text-sm min-w-[100px] touch-manipulation"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || isUploading}
            className="h-12 md:h-10 text-base md:text-sm min-w-[120px] touch-manipulation"
          >
            {isUploading && <Loader2 className="h-5 w-5 md:h-4 md:w-4 mr-2 animate-spin" />}
            Upload {selectedFiles.length > 0 && `(${selectedFiles.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
