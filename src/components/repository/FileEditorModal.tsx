import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CodeEditor from "@uiw/react-textarea-code-editor";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { commitMessageSchema, fileContentSchema, validateInput } from "@/lib/input-validation";

interface FileEditorModalProps {
  file: { name: string; path: string; sha: string; download_url?: string };
  owner: string;
  repo: string;
  branch: string;
  onClose: () => void;
  onSave: () => void;
}

export function FileEditorModal({
  file,
  owner,
  repo,
  branch,
  onClose,
  onSave,
}: FileEditorModalProps) {
  const isMobile = useIsMobile();
  const [content, setContent] = useState("");
  const [commitMessage, setCommitMessage] = useState(`Update ${file.name}`);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Determine language from file extension
  const getLanguage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sql': 'sql',
      'sh': 'shell',
      'bash': 'shell',
    };
    return languageMap[ext || ''] || 'text';
  };

  useEffect(() => {
    fetchFileContent();
  }, [file.path]);

  const fetchFileContent = async () => {
    setIsLoading(true);
    try {
      if (!file.download_url) {
        toast({
          title: "Cannot edit file",
          description: "This file type can't be edited here.",
          variant: "destructive",
        });
        onClose();
        return;
      }

      // Add cache-busting to ensure fresh content
      const url = `${file.download_url}${file.download_url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      
      if (!response.ok) {
        const { getHumanFriendlyError } = await import('@/lib/error-messages');
        const friendlyError = getHumanFriendlyError({
          status: response.status,
          operation: 'fetch'
        });
        toast({
          title: friendlyError.title,
          description: friendlyError.description,
          variant: "destructive",
        });
        return;
      }
      
      const text = await response.text();
      setContent(text);
    } catch (err) {
      console.error('Error fetching file content:', err);
      const { getHumanFriendlyError, extractErrorMessage } = await import('@/lib/error-messages');
      const friendlyError = getHumanFriendlyError({
        message: extractErrorMessage(err),
        operation: 'fetch'
      });
      toast({
        title: friendlyError.title,
        description: friendlyError.description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
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

    // Validate file content size
    const contentError = validateInput(fileContentSchema, content);
    if (contentError) {
      toast({
        title: "Invalid file content",
        description: contentError,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('update-file', {
        body: {
          owner,
          repo,
          path: file.path,
          content,
          sha: file.sha,
          message: commitMessage,
          branch,
          provider_token: session?.provider_token,
        }
      });

      if (error) {
        console.error('Error updating file:', error);
        const { getHumanFriendlyError, extractErrorStatus, extractErrorMessage } = await import('@/lib/error-messages');
        const friendlyError = getHumanFriendlyError({
          status: extractErrorStatus(error),
          message: extractErrorMessage(error),
          operation: 'update'
        });
        toast({
          title: friendlyError.title,
          description: friendlyError.description,
          variant: "destructive",
        });
        return;
      }

      onSave();
    } catch (err) {
      console.error('Exception updating file:', err);
      const { getHumanFriendlyError, extractErrorMessage } = await import('@/lib/error-messages');
      const friendlyError = getHumanFriendlyError({
        message: extractErrorMessage(err),
        operation: 'update'
      });
      toast({
        title: friendlyError.title,
        description: friendlyError.description,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent 
        className={cn(
          "flex flex-col file-editor-modal",
          isMobile 
            ? "fixed inset-0 max-w-full w-full h-full max-h-full m-0 rounded-none p-4" 
            : "max-w-4xl max-h-[90vh]"
        )}
      >
        <DialogHeader className={isMobile ? "pb-4" : ""}>
          <DialogTitle>Edit {file.name}</DialogTitle>
          <VisuallyHidden>
            <DialogDescription>Edit file content and commit changes</DialogDescription>
          </VisuallyHidden>
        </DialogHeader>

        <div className={cn(
          "overflow-auto space-y-4",
          isMobile ? "flex-1" : "flex-1"
        )}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="commit-message">Commit Message</Label>
                <Input
                  id="commit-message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Update file..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file-content">File Content</Label>
                <div className="code-editor-container">
                  <CodeEditor
                    value={content}
                    language={getLanguage(file.name)}
                    placeholder="File content..."
                    onChange={(e) => setContent(e.target.value)}
                    padding={15}
                    style={{
                      fontSize: isMobile ? 12 : 13,
                      backgroundColor: "hsl(var(--background))",
                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                      minHeight: isMobile ? '300px' : '400px',
                      borderRadius: '6px',
                      border: '1px solid hsl(var(--border))',
                    }}
                    className="w-full"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className={cn(
          isMobile ? "flex-row gap-2 pt-4" : ""
        )}>
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isSaving}
            className={isMobile ? "flex-1" : ""}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || isLoading}
            className={isMobile ? "flex-1" : ""}
          >
            {isSaving && <Loader2 className="h-6 w-6 sm:h-5 sm:w-5 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
