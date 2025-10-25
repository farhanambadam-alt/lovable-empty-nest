import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Settings, RefreshCw, Rocket, Calendar, GitBranch } from 'lucide-react';
import { useLivePages, LivePagesSite } from '@/hooks/useLivePages';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';

interface LivePagesDashboardProps {
  onDeployNew: () => void;
  onConfigure: (repoName: string) => void;
}

export function LivePagesDashboard({ onDeployNew, onConfigure }: LivePagesDashboardProps) {
  const { sites, isLoading, fetchLivePages } = useLivePages();

  useEffect(() => {
    fetchLivePages();
  }, [fetchLivePages]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'built':
      case 'live':
        return 'default';
      case 'building':
        return 'secondary';
      case 'errored':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status.toLowerCase()) {
      case 'built':
        return 'Live';
      case 'building':
        return 'Building';
      case 'errored':
        return 'Error';
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mb-6">
          <Rocket className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
        </div>
        <h3 className="text-xl font-semibold mb-2">No Live GitHub Pages Found</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          You haven't deployed any sites with GitHub Pages yet. Start by deploying your first repository!
        </p>
        <Button onClick={onDeployNew} size="lg">
          <Rocket className="mr-2 h-5 w-5" />
          Deploy Your First Site
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Live GitHub Pages</h2>
          <p className="text-muted-foreground">
            {sites.length} {sites.length === 1 ? 'site' : 'sites'} currently deployed
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchLivePages}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={onDeployNew}>
            <Rocket className="mr-2 h-4 w-4" />
            Deploy New
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => (
          <LivePageCard
            key={site.repository}
            site={site}
            onConfigure={onConfigure}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
          />
        ))}
      </div>
    </div>
  );
}

interface LivePageCardProps {
  site: LivePagesSite;
  onConfigure: (repoName: string) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
}

function LivePageCard({ site, onConfigure, getStatusColor, getStatusLabel }: LivePageCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{site.repository}</CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <GitBranch className="h-3 w-3" />
              <span className="truncate">{site.source.branch}</span>
            </CardDescription>
          </div>
          <Badge variant={getStatusColor(site.status) as any}>
            {getStatusLabel(site.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline group"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">{site.url.replace('https://', '')}</span>
          </a>
          
          {site.source.path !== '/' && (
            <p className="text-sm text-muted-foreground">
              Folder: <span className="font-medium">{site.source.path}</span>
            </p>
          )}

          {site.updated_at && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Updated {formatDistanceToNow(new Date(site.updated_at), { addSuffix: true })}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.open(site.url, '_blank')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Visit Site
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onConfigure(site.repository)}
          >
            <Settings className="mr-2 h-4 w-4" />
            Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
