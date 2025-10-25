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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Download, Trash2, Loader2, FileText, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface FileViewerModalProps {
  file: { name: string; path: string; sha: string; download_url?: string };
  owner: string;
  repo: string;
  branch: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

export function FileViewerModal({
  file,
  owner,
  repo,
  branch,
  onClose,
  onEdit,
  onDelete,
  onDownload,
}: FileViewerModalProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [fileType, setFileType] = useState<"text" | "image" | "pdf" | "markdown" | "binary">("text");

  useEffect(() => {
    fetchFileContent();
  }, [file.path]);

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const getLanguageFromExtension = (ext: string): string => {
    const languageMap: Record<string, string> = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
      py: 'python', rb: 'ruby', java: 'java', go: 'go',
      json: 'json', html: 'html', css: 'css', md: 'markdown',
    };
    return languageMap[ext] || 'text';
  };

  const fetchFileContent = async () => {
    setIsLoading(true);
    try {
      if (!file.download_url) {
        setFileType("binary");
        setIsLoading(false);
        return;
      }

      const ext = getFileExtension(file.name);
      
      if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
        setFileType("image");
        setContent(file.download_url);
      } else if (ext === 'pdf') {
        setFileType("pdf");
        setContent(file.download_url);
      } else if (ext === 'md') {
        setFileType("markdown");
        const response = await fetch(file.download_url);
        const text = await response.text();
        setContent(text);
      } else {
        const response = await fetch(file.download_url);
        const text = await response.text();
        
        if (text.includes('\0')) {
          setFileType("binary");
        } else {
          setFileType("text");
          setContent(text);
        }
      }
    } catch (err) {
      console.error('Error fetching file content:', err);
      toast({
        title: "Failed to load file",
        description: "Could not fetch file content.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    switch (fileType) {
      case "image":
        return (
          <div className="flex items-center justify-center p-4">
            <img 
              src={content} 
              alt={file.name}
              className="max-w-full max-h-[60vh] object-contain rounded-lg"
            />
          </div>
        );
      
      case "pdf":
        return (
          <div className="h-[60vh]">
            <iframe 
              src={content}
              className="w-full h-full rounded-lg border"
              title={file.name}
            />
          </div>
        );
      
      case "markdown":
        return (
          <Tabs defaultValue="preview" className="w-full">
            <TabsList>
              <TabsTrigger value="preview"><Eye className="h-6 w-6 sm:h-5 sm:w-5 mr-2" />Preview</TabsTrigger>
              <TabsTrigger value="raw"><FileText className="h-6 w-6 sm:h-5 sm:w-5 mr-2" />Raw</TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="max-h-[60vh] overflow-auto">
              <div className="prose prose-sm dark:prose-invert max-w-none p-4 bg-muted rounded-lg">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </TabsContent>
            <TabsContent value="raw" className="max-h-[60vh] overflow-auto">
              <SyntaxHighlighter language="markdown" style={vscDarkPlus} customStyle={{ margin: 0, borderRadius: '0.5rem' }} showLineNumbers>
                {content}
              </SyntaxHighlighter>
            </TabsContent>
          </Tabs>
        );
      
      case "text":
        const language = getLanguageFromExtension(getFileExtension(file.name));
        return (
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <SyntaxHighlighter language={language} style={vscDarkPlus} customStyle={{ margin: 0, borderRadius: '0.5rem', maxHeight: '60vh' }} showLineNumbers wrapLines={false} wrapLongLines={false}>
              {content}
            </SyntaxHighlighter>
          </div>
        );
      
      case "binary":
        return (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Cannot preview binary file - download to view</p>
          </div>
        );
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{file.name}</DialogTitle>
          <VisuallyHidden>
            <DialogDescription>View and manage file content</DialogDescription>
          </VisuallyHidden>
        </DialogHeader>
        <div className="flex-1 overflow-auto">{renderContent()}</div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDownload}><Download className="h-6 w-6 sm:h-5 sm:w-5 mr-2" />Download</Button>
          {fileType === "text" && <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-6 w-6 sm:h-5 sm:w-5 mr-2" />Edit</Button>}
          <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive"><Trash2 className="h-6 w-6 sm:h-5 sm:w-5 mr-2" />Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
