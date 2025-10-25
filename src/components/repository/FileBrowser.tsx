import { 
  Folder, 
  ChevronRight,
  FileCode, 
  FileImage, 
  FileText, 
  File, 
  Pencil, 
  Trash2,
  FileCog,
  FileJson,
  FileSpreadsheet,
  MoreVertical,
  Download,
  FolderOpen,
  FolderInput,
  CheckSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useRef } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface FileItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  download_url?: string;
}

interface FileBrowserProps {
  files: FileItem[];
  isLoading: boolean;
  selectedFiles: string[];
  onFileClick: (file: FileItem) => void;
  onEdit: (file: FileItem) => void;
  onDelete: (files: FileItem | FileItem[]) => void;
  onDownload: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onMove: (files: FileItem[]) => void;
  onToggleSelect: (path: string) => void;
  onToggleSelectAll: () => void;
}

const getFileIcon = (file: FileItem) => {
  if (file.type === 'dir') return Folder;
  
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext || '')) {
    return FileCode;
  }
  if (['py', 'java', 'cpp', 'c', 'go', 'rs', 'php', 'rb'].includes(ext || '')) {
    return FileCode;
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext || '')) {
    return FileImage;
  }
  if (['json', 'xml', 'yaml', 'yml'].includes(ext || '')) {
    return FileJson;
  }
  if (['md', 'txt', 'log'].includes(ext || '')) {
    return FileText;
  }
  if (['csv', 'xlsx', 'xls'].includes(ext || '')) {
    return FileSpreadsheet;
  }
  if (['env', 'config', 'conf'].includes(ext || '')) {
    return FileCog;
  }
  
  return File;
};

const getFileColor = (file: FileItem): string => {
  if (file.type === 'dir') return 'text-accent';
  
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  // JavaScript/TypeScript - yellow
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext || '')) return 'text-[hsl(45,90%,60%)]';
  // Python - blue
  if (['py'].includes(ext || '')) return 'text-[hsl(210,80%,60%)]';
  // Images - purple
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return 'text-[hsl(280,70%,65%)]';
  // JSON/Config - green
  if (['json', 'yaml', 'yml', 'env', 'config'].includes(ext || '')) return 'text-[hsl(140,60%,55%)]';
  // Markdown/Text - slate
  if (['md', 'txt'].includes(ext || '')) return 'text-[hsl(215,20%,60%)]';
  // Other code - orange
  if (['java', 'cpp', 'c', 'go', 'rs', 'php', 'rb'].includes(ext || '')) return 'text-[hsl(25,90%,60%)]';
  
  return 'text-muted-foreground';
};

const isImageFile = (file: FileItem): boolean => {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext || '');
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export function FileBrowser({ 
  files, 
  isLoading,
  selectedFiles,
  onFileClick, 
  onEdit, 
  onDelete, 
  onDownload,
  onRename,
  onMove,
  onToggleSelect,
  onToggleSelectAll
}: FileBrowserProps) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [longPressTriggered, setLongPressTriggered] = useState(false);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  const hasSelection = selectedFiles.length > 0;
  const selectedFileObjects = files.filter(f => selectedFiles.includes(f.path));

  const handleImageError = (fileSha: string) => {
    setImageErrors(prev => new Set([...prev, fileSha]));
  };

  const handleLongPressStart = (file: FileItem) => {
    setLongPressTriggered(false);
    longPressTimer.current = setTimeout(() => {
      setLongPressTriggered(true);
      setSelectedFile(file);
      setDrawerOpen(true);
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleItemClick = (file: FileItem, e?: React.MouseEvent) => {
    if (e?.target instanceof HTMLInputElement) return;
    if (longPressTriggered) {
      setLongPressTriggered(false);
      return;
    }
    onFileClick(file);
  };

  const handleActionClick = (file: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(file);
    setDrawerOpen(true);
  };

  const handleDrawerAction = (action: 'edit' | 'delete' | 'download' | 'rename' | 'move') => {
    if (!selectedFile) return;
    
    setDrawerOpen(false);
    
    setTimeout(() => {
      switch (action) {
        case 'edit':
          onEdit(selectedFile);
          break;
        case 'delete':
          onDelete(selectedFile);
          break;
        case 'download':
          onDownload(selectedFile);
          break;
        case 'rename':
          onRename(selectedFile);
          break;
        case 'move':
          onMove([selectedFile]);
          break;
      }
    }, 300);
  };

  if (isLoading) {
    return (
      <div className="rounded-md border border-border/50 bg-[hsl(var(--github-gray-0))] overflow-hidden shadow-sm">
        <div className="divide-y divide-border/30">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="h-4 w-4 flex-shrink-0 bg-muted/50" />
              <Skeleton className="h-4 w-4 flex-shrink-0 bg-muted/50" />
              <Skeleton className="h-4 flex-1 max-w-[200px] bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="rounded-md border border-border/50 bg-[hsl(var(--github-gray-0))] p-16 text-center shadow-sm">
        <FolderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
        <p className="text-base font-semibold mb-2 text-foreground/80">This folder is empty</p>
        <p className="text-sm text-muted-foreground/60">
          Upload files or create a new item to get started
        </p>
      </div>
    );
  }

  return (
    <>
      {/* VSCode-inspired File Browser */}
      <div className="rounded-md border border-border/50 bg-[hsl(var(--github-gray-0))] overflow-hidden shadow-sm">
        {hasSelection && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-[hsl(var(--github-gray-1))]">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {selectedFiles.length} item{selectedFiles.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2 ml-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onMove(selectedFileObjects)}
                className="h-8 text-xs border-border/50 hover:bg-[hsl(var(--github-gray-2))] hover:border-accent/50 touch-manipulation"
              >
                <FolderInput className="h-5 w-5 sm:h-4 sm:w-4 mr-1.5" />
                Move
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete(selectedFileObjects)}
                className="h-8 text-xs touch-manipulation"
              >
                <Trash2 className="h-5 w-5 sm:h-4 sm:w-4 mr-1.5" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Column Header */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border/50 bg-[hsl(var(--github-gray-1))]">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedFiles.length === files.length}
              onCheckedChange={onToggleSelectAll}
              className="h-4 w-4"
            />
            <span className="text-xs font-medium text-foreground/70 cursor-pointer select-none" onClick={onToggleSelectAll}>
              Select All
            </span>
          </div>
          <div className="flex-1 flex items-center gap-3 pl-8">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</span>
          </div>
        </div>

        {/* File List */}
        <div className="divide-y divide-border/30">
          {files.map((file) => {
            const Icon = getFileIcon(file);
            const isFolder = file.type === 'dir';
            const fileColor = getFileColor(file);
            const isImage = isImageFile(file);
            const showImagePreview = isImage && file.download_url && !imageErrors.has(file.sha);
            const isSelected = selectedFiles.includes(file.path);
            const isHovered = hoveredFile === file.path;

            return (
              <div
                key={file.sha}
                className={`
                  file-browser-item group flex items-center gap-3 px-3 py-2.5 sm:py-2
                  transition-all duration-150 select-none cursor-pointer
                  ${isSelected 
                    ? 'bg-accent/20 border-l-2 border-l-accent' 
                    : 'border-l-2 border-l-transparent hover:bg-[hsl(var(--github-gray-1))] hover:border-l-accent/30'
                  }
                  ${isHovered ? 'bg-[hsl(var(--github-gray-1))]' : ''}
                  active:bg-accent/10
                `}
                onMouseEnter={() => setHoveredFile(file.path)}
                onMouseLeave={() => setHoveredFile(null)}
                onTouchStart={() => handleLongPressStart(file)}
                onTouchEnd={handleLongPressEnd}
                onTouchMove={handleLongPressEnd}
                onMouseDown={() => handleLongPressStart(file)}
                onMouseUp={handleLongPressEnd}
              >
                {/* Checkbox */}
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(file.path)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 flex-shrink-0"
                />

                {/* Folder Chevron or Spacer */}
                {isFolder ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/70 flex-shrink-0" />
                ) : (
                  <div className="w-4 flex-shrink-0" />
                )}

                {/* File/Folder Content */}
                <div 
                  className="flex-1 min-w-0 flex items-center gap-3"
                  onClick={(e) => handleItemClick(file, e)}
                >
                  {/* Icon or Image Preview */}
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {showImagePreview ? (
                      <img
                        src={file.download_url}
                        alt={file.name}
                        className="w-5 h-5 object-cover rounded"
                        onError={() => handleImageError(file.sha)}
                      />
                    ) : (
                      <Icon className={`h-5 w-5 ${fileColor}`} />
                    )}
                  </div>

                  {/* File Name */}
                  <span 
                    className="text-sm font-medium truncate text-foreground/90 flex-1" 
                    title={file.name}
                  >
                    {file.name}
                  </span>

                  {/* File Size - Show on hover for desktop */}
                  {!isFolder && (
                    <span className="hidden sm:block text-xs text-muted-foreground/60 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity min-w-[60px] text-right">
                      {formatFileSize(file.size)}
                    </span>
                  )}
                </div>

                {/* More Actions Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-[hsl(var(--github-gray-2))] touch-manipulation"
                  onClick={(e) => handleActionClick(file, e)}
                  title="More actions"
                >
                  <MoreVertical className="h-5 w-5 sm:h-4 sm:w-4 text-muted-foreground/70" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Actions Drawer - Fixed to bottom */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="bg-[hsl(var(--github-gray-0))] border-t border-border/50 fixed bottom-0 left-0 right-0 z-50">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="text-lg font-semibold text-foreground/90 flex items-center gap-2">
              {selectedFile?.type === 'dir' ? (
                <Folder className="h-5 w-5 text-accent" />
              ) : (
                (() => {
                  const Icon = selectedFile ? getFileIcon(selectedFile) : File;
                  const color = selectedFile ? getFileColor(selectedFile) : 'text-muted-foreground';
                  return <Icon className={`h-5 w-5 ${color}`} />;
                })()
              )}
              {selectedFile?.name}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground/70">
              {selectedFile?.type === 'dir' 
                ? 'Folder actions' 
                : `${formatFileSize(selectedFile?.size || 0)} • File actions`
              }
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="px-4 pb-4 space-y-2">
            {selectedFile?.type === 'file' && (
              <>
                <Button
                  variant="outline"
                  className="w-full justify-start h-14 text-base bg-[hsl(var(--github-gray-1))] border-border/50 hover:bg-[hsl(var(--github-gray-2))] hover:border-accent/50"
                  onClick={() => handleDrawerAction('edit')}
                >
                  <Pencil className="h-5 w-5 mr-3 text-accent" />
                  <span className="font-medium">Edit File</span>
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full justify-start h-14 text-base bg-[hsl(var(--github-gray-1))] border-border/50 hover:bg-[hsl(var(--github-gray-2))] hover:border-accent/50"
                  onClick={() => handleDrawerAction('download')}
                >
                  <Download className="h-5 w-5 mr-3 text-accent" />
                  <span className="font-medium">Download</span>
                </Button>
              </>
            )}

            <Button
              variant="outline"
              className="w-full justify-start h-14 text-base bg-[hsl(var(--github-gray-1))] border-border/50 hover:bg-[hsl(var(--github-gray-2))] hover:border-accent/50"
              onClick={() => handleDrawerAction('rename')}
            >
              <Pencil className="h-5 w-5 mr-3 text-accent" />
              <span className="font-medium">Rename</span>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start h-14 text-base bg-[hsl(var(--github-gray-1))] border-border/50 hover:bg-[hsl(var(--github-gray-2))] hover:border-accent/50"
              onClick={() => handleDrawerAction('move')}
            >
              <FolderInput className="h-5 w-5 mr-3 text-accent" />
              <span className="font-medium">Move</span>
            </Button>
            
            <div className="h-px bg-border/50 my-2" />
            
            <Button
              variant="outline"
              className="w-full justify-start h-14 text-base bg-[hsl(var(--github-gray-1))] border-border/50 hover:bg-destructive/10 hover:border-destructive/50 text-destructive hover:text-destructive"
              onClick={() => handleDrawerAction('delete')}
            >
              <Trash2 className="h-5 w-5 mr-3" />
              <span className="font-medium">Delete {selectedFile?.type === 'dir' ? 'Folder' : 'File'}</span>
            </Button>
          </div>

          <DrawerFooter className="pt-2 pb-6">
            <DrawerClose asChild>
              <Button 
                variant="outline" 
                className="w-full h-12 text-base font-medium bg-[hsl(var(--github-gray-1))] border-border/50 hover:bg-[hsl(var(--github-gray-2))]"
              >
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
