import { ChevronRight, Home, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BreadcrumbsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ currentPath, onNavigate }: BreadcrumbsProps) {
  const pathSegments = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <nav aria-label="File path navigation" className="bg-secondary/20 rounded-lg px-2 py-1.5 sm:px-4 sm:py-2.5 relative">
      {/* Fade indicators for scroll */}
      <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-r from-secondary/20 to-transparent pointer-events-none z-10 rounded-l-lg" />
      <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-l from-secondary/20 to-transparent pointer-events-none z-10 rounded-r-lg" />
      
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-thin scroll-smooth">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate("")}
          className="h-7 sm:h-8 px-1.5 sm:px-2 hover:bg-secondary/70 text-foreground hover:text-foreground touch-manipulation active:scale-95 transition-transform flex-shrink-0 text-xs sm:text-sm font-medium"
        >
          <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Root</span>
        </Button>

        {pathSegments.map((segment, index) => {
          const path = pathSegments.slice(0, index + 1).join('/');
          const isLast = index === pathSegments.length - 1;

          return (
            <div key={path} className="flex items-center gap-0.5 sm:gap-1.5 flex-shrink-0">
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground/50 flex-shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate(path)}
                className={`h-7 sm:h-8 px-1.5 sm:px-2 hover:bg-secondary/70 touch-manipulation active:scale-95 transition-transform text-xs sm:text-sm font-medium ${
                  isLast 
                    ? 'text-foreground bg-secondary/50' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Folder className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1 flex-shrink-0" />
                <span className="truncate max-w-[100px] sm:max-w-[120px]">{segment}</span>
              </Button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
