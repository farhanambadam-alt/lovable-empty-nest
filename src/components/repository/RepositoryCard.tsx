import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  GitBranch, 
  ExternalLink, 
  Star, 
  Copy, 
  Settings, 
  Trash2,
  Lock,
  Globe,
  GitFork,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Repository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  description: string | null;
  updated_at: string;
  private: boolean;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  size: number;
  language: string | null;
  default_branch: string;
}

interface RepositoryCardProps {
  repo: Repository;
  onUpdate: () => void;
  onSettings: (repo: Repository) => void;
}

export const RepositoryCard = ({ repo, onUpdate, onSettings }: RepositoryCardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isStarred, setIsStarred] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCopyCloneUrl = async () => {
    await navigator.clipboard.writeText(repo.clone_url);
    toast({
      title: "Copied!",
      description: "Clone URL copied to clipboard",
    });
  };

  const handleStar = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('star-repo', {
        body: {
          owner: repo.full_name.split('/')[0],
          repo: repo.name,
          starred: !isStarred,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      setIsStarred(!isStarred);
      toast({
        title: isStarred ? "Unstarred" : "Starred!",
        description: `Repository ${isStarred ? 'removed from' : 'added to'} your stars`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update star status",
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('delete-repo', {
        body: { 
          owner, 
          repo: repoName,
          provider_token: session?.provider_token,
        }
      });

      if (error) throw error;

      toast({
        title: "Repository deleted",
        description: `${repo.name} has been deleted successfully`,
      });
      
      onUpdate();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete repository",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const formatSize = (size: number) => {
    if (size < 1024) return `${size} KB`;
    return `${(size / 1024).toFixed(1)} MB`;
  };

  return (
    <>
      <Card className="shadow-elevated gradient-card hover:shadow-glow transition-smooth group">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              {repo.private ? (
                <Lock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
              ) : (
                <Globe className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStar}
                className="h-9 w-9 sm:h-10 sm:w-10 p-0 touch-manipulation"
              >
                <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 sm:h-10 sm:w-10 p-0 touch-manipulation">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => onSettings(repo)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyCloneUrl}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy clone URL
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on GitHub
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <CardTitle className="text-base sm:text-lg mt-3 truncate">{repo.name}</CardTitle>
          <CardDescription className="line-clamp-2 text-xs sm:text-sm">
            {repo.description || "No description"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3 p-4 sm:p-6 pt-0">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {repo.language && (
              <Badge variant="secondary" className="text-xs">
                {repo.language}
              </Badge>
            )}
            <Badge variant="outline" className="gap-1 text-xs">
              <Star className="h-3 w-3" />
              {repo.stargazers_count}
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs">
              <GitFork className="h-3 w-3" />
              {repo.forks_count}
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs">
              <Eye className="h-3 w-3" />
              {repo.watchers_count}
            </Badge>
          </div>
          <div className="text-[10px] xs:text-xs text-muted-foreground">
            {formatSize(repo.size)} • Updated {new Date(repo.updated_at).toLocaleDateString()}
          </div>
        </CardContent>
        <CardFooter className="p-4 sm:p-6 pt-0">
          <Button
            variant="outline"
            className="w-full h-11 sm:h-10 text-base sm:text-sm touch-manipulation"
            onClick={() => navigate(`/repository/${repo.full_name.replace('/', '--')}`)}
          >
            Manage Files
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Repository</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{repo.name}</strong>? This action cannot be undone.
              All files, commits, and issues will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
