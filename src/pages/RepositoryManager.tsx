import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { FileBrowser } from "@/components/repository/FileBrowser";
import { BranchSelector } from "@/components/repository/BranchSelector";
import { Breadcrumbs } from "@/components/repository/Breadcrumbs";
import { FileViewerModal } from "@/components/repository/FileViewerModal";
import { FileEditorModal } from "@/components/repository/FileEditorModal";
import { FileUploader } from "@/components/repository/FileUploader";
import { CreateItemModal } from "@/components/repository/CreateItemModal";
import { DeleteConfirmDialog } from "@/components/repository/DeleteConfirmDialog";
import { RenameItemDialog } from "@/components/repository/RenameItemDialog";
import { MoveItemsDialog } from "@/components/repository/MoveItemsDialog";
import { CreateBranchDialog } from "@/components/repository/CreateBranchDialog";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Upload, GitBranch } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { BottomNav } from "@/components/BottomNav";

interface FileItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  download_url?: string;
}

const RepositoryManager = () => {
  const { repoName } = useParams<{ repoName: string }>();
  const navigate = useNavigate();
  
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [currentBranch, setCurrentBranch] = useState("main");
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [viewMode, setViewMode] = useState<"view" | "edit" | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filesToDelete, setFilesToDelete] = useState<FileItem[]>([]);
  const [fileToRename, setFileToRename] = useState<FileItem | null>(null);
  const [filesToMove, setFilesToMove] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showFAB, setShowFAB] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);

  useEffect(() => {
    if (repoName) {
      const [ownerName, ...repoNameParts] = repoName.split('--');
      setOwner(ownerName);
      setRepo(repoNameParts.join('-'));
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [repoName, navigate]);

  useEffect(() => {
    if (owner && repo) {
      fetchContents();
    }
  }, [owner, repo, currentBranch, currentPath]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("github_username")
      .eq("id", userId)
      .single();

    if (data) {
      setUsername(data.github_username);
    }
  };

  const fetchContents = async (forceFresh = false) => {
    setIsLoading(true);
    try {
      // Add cache-busting parameter to force fresh data
      const cacheBuster = forceFresh ? `&_t=${Date.now()}` : '';
      
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('get-repo-contents', {
        body: { 
          owner, 
          repo, 
          path: currentPath, 
          ref: currentBranch,
          cacheBuster, // This will be ignored by the function but helps bust browser cache
          provider_token: session?.provider_token,
        }
      });

      if (error) {
        console.error('Error fetching contents:', error);
        const { getHumanFriendlyError, extractErrorStatus } = await import('@/lib/error-messages');
        const friendlyError = getHumanFriendlyError({
          status: extractErrorStatus(error),
          operation: 'fetch'
        });
        toast({
          title: friendlyError.title,
          description: friendlyError.description,
          variant: "destructive",
        });
        return;
      }

      if (data?.contents) {
        const sortedFiles = Array.isArray(data.contents) 
          ? [...data.contents].sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'dir' ? -1 : 1;
            })
          : [];
        setFiles(sortedFiles);
      }
    } catch (err) {
      console.error('Exception fetching contents:', err);
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

  const handleFileClick = (file: FileItem) => {
    if (file.type === 'dir') {
      setCurrentPath(file.path);
    } else {
      setSelectedFile(file);
      setViewMode("view");
    }
  };

  const handleBreadcrumbClick = (path: string) => {
    setCurrentPath(path);
  };

  const handleEdit = (file: FileItem) => {
    setSelectedFile(file);
    setViewMode("edit");
  };

  const handleDelete = (files: FileItem | FileItem[]) => {
    const list = Array.isArray(files) ? [...files] : [files];
    console.log('[Delete] Selected count:', list.length, list.map(f => f.path));
    setFilesToDelete(list);
  };
  const handleRename = (file: FileItem) => {
    setFileToRename(file);
  };

  const handleMove = (files: FileItem[]) => {
    setFilesToMove(files);
  };

  const handleToggleSelect = (path: string) => {
    setSelectedFiles(prev =>
      prev.includes(path)
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.map(f => f.path));
    }
  };

  const handleDownload = async (file: FileItem) => {
    if (file.download_url) {
      window.open(file.download_url, '_blank');
      toast({
        title: "Downloading...",
        description: `${file.name} will download shortly.`,
      });
    }
  };

  const handleFileSaved = () => {
    // Force fresh fetch to bypass cache
    fetchContents(true);
    setViewMode(null);
    setSelectedFile(null);
    toast({
      title: "Changes saved ✓",
      description: `${selectedFile?.name} has been updated on GitHub.`,
    });
  };

  const handleFileCreated = () => {
    fetchContents(true);
    setShowCreateModal(false);
    toast({
      title: "Created ✓",
      description: "Your new file is now on GitHub.",
    });
  };

  const handleFileRenamed = () => {
    fetchContents(true);
    setFileToRename(null);
    setSelectedFiles([]);
  };

  const handleFilesMoved = () => {
    fetchContents(true);
    setFilesToMove([]);
    setSelectedFiles([]);
  };

  const handleFileDeleted = () => {
    fetchContents(true);
    const count = filesToDelete.length;
    setFilesToDelete([]);
    setSelectedFiles([]);
    toast({
      title: "Deleted ✓",
      description: count > 1 
        ? `${count} items have been removed from GitHub.`
        : `${filesToDelete[0]?.name} has been removed from GitHub.`,
    });
  };

  const handleFilesUploaded = (count?: number) => {
    // Force fresh fetch to bypass cache
    fetchContents(true);
    setShowUploader(false);
    toast({
      title: "Uploaded ✓",
      description: count ? `${count} file${count > 1 ? 's' : ''} uploaded to GitHub.` : "Files uploaded to GitHub.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header username={username} showNav={true} />
      
      <main className="w-full px-4 sm:px-6 md:container md:mx-auto py-4 sm:py-6">
        <div className="w-full max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header Section */}
          <div className="flex flex-col gap-3 sm:gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/repositories")}
              className="self-start h-10 sm:h-9 px-2 -ml-2 text-sm text-muted-foreground hover:text-foreground touch-manipulation active:scale-95 transition-transform"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Repositories
            </Button>

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold text-foreground truncate">{repo}</h1>
                <p className="text-sm text-muted-foreground mt-1 truncate">{owner}/{repo}</p>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <BranchSelector
                  owner={owner}
                  repo={repo}
                  currentBranch={currentBranch}
                  onBranchChange={setCurrentBranch}
                />
                
                <Button 
                  onClick={() => setShowCreateBranch(true)} 
                  variant="outline" 
                  className="hidden md:flex h-9 text-sm"
                >
                  <GitBranch className="h-4 w-4 mr-1" />
                  New Branch
                </Button>
                <Button 
                  onClick={() => setShowUploader(true)} 
                  variant="outline" 
                  className="hidden md:flex h-9 text-sm"
                >
                  Upload Files
                </Button>
                <Button 
                  onClick={() => setShowCreateModal(true)} 
                  variant="outline"
                  className="hidden md:flex h-9 text-sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </div>
            </div>

            <Breadcrumbs
              currentPath={currentPath}
              onNavigate={handleBreadcrumbClick}
            />
          </div>

          {/* File Browser - VSCode Style */}
          <div className="bg-background rounded-lg">
            <FileBrowser
              files={files}
              isLoading={isLoading}
              selectedFiles={selectedFiles}
              onFileClick={handleFileClick}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDownload={handleDownload}
              onRename={handleRename}
              onMove={handleMove}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
            />
          </div>
        </div>
      </main>

      {/* Floating Action Button (Mobile) */}
      <div className="md:hidden fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 pb-safe">
        <Button
          className="h-14 w-14 rounded-full shadow-glow transition-smooth hover:scale-110 touch-manipulation active:scale-95"
          onClick={() => setShowFAB(!showFAB)}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      {showFAB && (
        <>
          {/* Backdrop */}
          <div 
            className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setShowFAB(false)}
          />
          {/* Action Menu */}
          <div className="md:hidden fixed bottom-40 right-6 flex flex-col gap-3 z-50">
            <Button
              onClick={() => {
                setShowUploader(true);
                setShowFAB(false);
              }}
              className="shadow-lg h-14 px-6 text-base font-medium min-w-[160px] justify-start touch-manipulation active:scale-95 transition-transform"
              variant="secondary"
            >
              <Upload className="h-5 w-5 mr-3" />
              Upload Files
            </Button>
            <Button
              onClick={() => {
                setShowCreateModal(true);
                setShowFAB(false);
              }}
              className="shadow-lg h-14 px-6 text-base font-medium min-w-[160px] justify-start touch-manipulation active:scale-95 transition-transform"
            >
              <Plus className="h-5 w-5 mr-3" />
              New File
            </Button>
          </div>
        </>
      )}

      {/* Modals */}
      {selectedFile && viewMode === "view" && (
        <FileViewerModal
          file={selectedFile}
          owner={owner}
          repo={repo}
          branch={currentBranch}
          onClose={() => {
            setViewMode(null);
            setSelectedFile(null);
          }}
          onEdit={() => setViewMode("edit")}
          onDelete={() => {
            setFilesToDelete([selectedFile]);
            setViewMode(null);
          }}
          onDownload={() => handleDownload(selectedFile)}
        />
      )}

      {selectedFile && viewMode === "edit" && (
        <FileEditorModal
          file={selectedFile}
          owner={owner}
          repo={repo}
          branch={currentBranch}
          onClose={() => {
            setViewMode(null);
            setSelectedFile(null);
          }}
          onSave={handleFileSaved}
        />
      )}

      {showUploader && (
        <FileUploader
          owner={owner}
          repo={repo}
          branch={currentBranch}
          currentPath={currentPath}
          onClose={() => setShowUploader(false)}
          onUploadComplete={handleFilesUploaded}
        />
      )}

      {showCreateModal && (
        <CreateItemModal
          owner={owner}
          repo={repo}
          branch={currentBranch}
          currentPath={currentPath}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleFileCreated}
        />
      )}

      {filesToDelete.length > 0 && (
        <DeleteConfirmDialog
          files={filesToDelete}
          owner={owner}
          repo={repo}
          branch={currentBranch}
          onClose={() => setFilesToDelete([])}
          onDelete={handleFileDeleted}
        />
      )}

      {fileToRename && (
        <RenameItemDialog
          file={fileToRename}
          owner={owner}
          repo={repo}
          branch={currentBranch}
          currentPath={currentPath}
          onClose={() => setFileToRename(null)}
          onRename={handleFileRenamed}
        />
      )}

      {filesToMove.length > 0 && (
        <MoveItemsDialog
          files={filesToMove}
          owner={owner}
          repo={repo}
          branch={currentBranch}
          currentPath={currentPath}
          onClose={() => setFilesToMove([])}
          onMove={handleFilesMoved}
        />
      )}

      {showCreateBranch && (
        <CreateBranchDialog
          open={showCreateBranch}
          onClose={() => setShowCreateBranch(false)}
          owner={owner}
          repo={repo}
          currentBranch={currentBranch}
          onBranchCreated={(newBranch) => setCurrentBranch(newBranch)}
        />
      )}
      
      <BottomNav username={username} />
    </div>
  );
};

export default RepositoryManager;
