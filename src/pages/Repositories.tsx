import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GitBranch, Loader2 } from "lucide-react";
import { RepositoryCard } from "@/components/repository/RepositoryCard";
import { RepositorySearch } from "@/components/repository/RepositorySearch";
import { RepositorySettingsDialog } from "@/components/repository/RepositorySettingsDialog";
import { RenameRepoDialog } from "@/components/repository/RenameRepoDialog";
import { DeleteConfirmDialog } from "@/components/repository/DeleteConfirmDialog";
import { TutorialOverlay } from "@/components/onboarding/TutorialOverlay";
import { BottomNav } from "@/components/BottomNav";

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
  homepage: string | null;
}

const Repositories = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updated");
  const [filterBy, setFilterBy] = useState("all");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [repoToRename, setRepoToRename] = useState<{ owner: string; repo: string } | null>(null);
  const [repoToDelete, setRepoToDelete] = useState<{ owner: string; repo: string; name: string } | null>(null);

  useEffect(() => {
    // Check if we should start the tutorial (coming from dashboard)
    const shouldShowTutorial = sessionStorage.getItem("start_tutorial");
    if (shouldShowTutorial === "true") {
      sessionStorage.removeItem("start_tutorial");
      setTimeout(() => setShowTutorial(true), 500);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
        fetchRepositories();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        navigate("/auth");
      } else if (session) {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("github_username")
      .eq("id", userId)
      .single();

    if (!error && data) {
      setUsername(data.github_username);
    }
  };

  const fetchRepositories = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('list-repos', {
        body: { 
          provider_token: session?.provider_token 
        }
      });

      if (error) {
        console.error('Error fetching repositories:', error);
        if (error.message?.includes('token is invalid') || error.message?.includes('expired')) {
          navigate("/auth");
        }
        return;
      }

      if (data?.error) {
        console.error('API Error:', data.error);
        if (data.error.includes('token is invalid') || data.error.includes('expired')) {
          navigate("/auth");
        }
        return;
      }

      if (data?.repositories) {
        setRepositories(data.repositories);
      }
    } catch (err) {
      console.error('Exception fetching repositories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAndSortedRepos = useMemo(() => {
    if (!repositories || repositories.length === 0) {
      return [];
    }

    let filtered = [...repositories];

    // Filter by search query
    if (searchQuery && searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(repo => 
        repo.name.toLowerCase().includes(query) ||
        (repo.description && repo.description.toLowerCase().includes(query))
      );
    }

    // Filter by visibility
    if (filterBy === "public") {
      filtered = filtered.filter(repo => repo.private === false);
    } else if (filterBy === "private") {
      filtered = filtered.filter(repo => repo.private === true);
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        case "stars":
          return (b.stargazers_count || 0) - (a.stargazers_count || 0);
        case "size":
          return (b.size || 0) - (a.size || 0);
        case "updated":
        default:
          const dateA = new Date(a.updated_at || 0).getTime();
          const dateB = new Date(b.updated_at || 0).getTime();
          return dateB - dateA;
      }
    });

    return sorted;
  }, [repositories, searchQuery, sortBy, filterBy]);

  const handleRepoClick = (repo: Repository) => {
    const owner = repo.full_name.split('/')[0];
    const formattedName = `${owner}--${repo.name}`;
    navigate(`/repository/${formattedName}`);
  };

  const handleRepoRenamed = (newName: string) => {
    setRepoToRename(null);
    fetchRepositories();
    toast({
      title: "Repository renamed",
      description: `Successfully renamed to ${newName}`,
    });
  };

  const handleRepoDeleted = () => {
    setRepoToDelete(null);
    fetchRepositories();
    toast({
      title: "Repository deleted",
      description: "The repository has been removed from GitHub.",
    });
  };

  const handleSettings = (repo: Repository) => {
    setSelectedRepo(repo);
    setShowSettings(true);
  };

  return (
    <div className="min-h-screen">
      <Header username={username} showNav={true} />
      
      <TutorialOverlay 
        isActive={showTutorial}
        onComplete={() => setShowTutorial(false)}
      />
      
      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-full sm:max-w-6xl mx-auto space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold">My Repositories</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {repositories.length} {repositories.length === 1 ? 'repository' : 'repositories'}
              </p>
            </div>
          </div>

          {!isLoading && repositories.length > 0 && (
            <RepositorySearch
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterBy={filterBy}
              onFilterChange={setFilterBy}
              data-tutorial="search"
            />
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAndSortedRepos.length > 0 ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3" data-tutorial="repositories">
              {filteredAndSortedRepos.map((repo) => (
                <RepositoryCard
                  key={repo.id}
                  repo={repo}
                  onUpdate={fetchRepositories}
                  onSettings={handleSettings}
                />
              ))}
            </div>
          ) : repositories.length === 0 ? (
            <Card className="shadow-elevated gradient-card">
              <CardContent className="py-12 text-center">
                <GitBranch className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">No repositories yet</p>
                <p className="text-muted-foreground mb-6">
                  Create your first repository to get started
                </p>
                <Button onClick={() => navigate("/dashboard")}>
                  Create Repository
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-elevated gradient-card">
              <CardContent className="py-12 text-center">
                <GitBranch className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">No repositories found</p>
                <p className="text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <RepositorySettingsDialog
        repo={selectedRepo}
        open={showSettings}
        onOpenChange={setShowSettings}
        onUpdate={fetchRepositories}
      />
      
      <BottomNav username={username} />
    </div>
  );
};

export default Repositories;
