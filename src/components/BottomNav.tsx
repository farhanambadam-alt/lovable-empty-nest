import { useNavigate, useLocation } from "react-router-dom";
import { Home, FolderGit2, Clock, Share2, Rocket, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BottomNavProps {
  username?: string | null;
}

export const BottomNav = ({ username }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Error signing out",
        description: error.message,
      });
    } else {
      navigate("/auth");
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { label: "Home", path: "/dashboard", icon: Home },
    { label: "Repositories", path: "/repositories", icon: FolderGit2 },
    { label: "Recent", path: "/pull-requests", icon: Clock },
    { label: "Deploy", path: "/deploy", icon: Rocket },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-background/95 via-background/90 to-background/80 backdrop-blur-xl border-t border-border/50 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] safe-area-bottom">
      <div className="grid grid-cols-5 h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`group relative flex flex-col items-center justify-center gap-1.5 transition-all duration-500 touch-manipulation active:scale-90 ${
                active
                  ? "text-primary"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              {/* Glow background for active item */}
              {active && (
                <div className="absolute inset-0 bg-primary/5 rounded-2xl blur-sm" />
              )}
              
              {/* Icon container */}
              <div className={`relative transition-all duration-500 ${active ? "scale-110 -translate-y-0.5" : "group-hover:scale-105 group-active:scale-90"}`}>
                <Icon className={`h-6 w-6 transition-all duration-500 ${
                  active 
                    ? "stroke-[2.5] drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)]" 
                    : "stroke-[2] group-hover:stroke-[2.3]"
                }`} />
                {active && (
                  <>
                    <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full animate-pulse" />
                    <div className="absolute -inset-1 bg-gradient-to-b from-primary/20 to-transparent rounded-full blur-md" />
                  </>
                )}
              </div>
              
              {/* Label - only visible when active */}
              <span className={`text-[10px] font-semibold tracking-wide transition-all duration-500 ${
                active 
                  ? "opacity-100 translate-y-0 scale-100" 
                  : "opacity-0 translate-y-1 scale-90 absolute"
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
        
        <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <SheetTrigger asChild>
            <button className="group relative flex flex-col items-center justify-center gap-1.5 text-muted-foreground/60 hover:text-muted-foreground transition-all duration-500 touch-manipulation active:scale-90">
              {moreMenuOpen && (
                <div className="absolute inset-0 bg-primary/5 rounded-2xl blur-sm" />
              )}
              <div className={`relative transition-all duration-500 ${moreMenuOpen ? "scale-110 -translate-y-0.5" : "group-hover:scale-105 group-active:scale-90"}`}>
                <MoreHorizontal className={`h-6 w-6 transition-all duration-500 ${
                  moreMenuOpen 
                    ? "stroke-[2.5] stroke-primary drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)]" 
                    : "stroke-[2] group-hover:stroke-[2.3]"
                }`} />
                {moreMenuOpen && (
                  <>
                    <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full animate-pulse" />
                    <div className="absolute -inset-1 bg-gradient-to-b from-primary/20 to-transparent rounded-full blur-md" />
                  </>
                )}
              </div>
              <span className={`text-[10px] font-semibold tracking-wide transition-all duration-500 ${
                moreMenuOpen 
                  ? "opacity-100 translate-y-0 scale-100 text-primary" 
                  : "opacity-0 translate-y-1 scale-90 absolute"
              }`}>
                More
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl bg-background/95 backdrop-blur-xl border-border/50">
            <SheetHeader className="mb-6">
              <SheetTitle className="text-lg font-semibold">More Options</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3">
              {username && (
                <div className="px-5 py-4 mb-2 bg-gradient-to-br from-muted/80 to-muted/40 backdrop-blur-sm rounded-2xl border border-border/30">
                  <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mb-1">Signed in as</p>
                  <p className="font-semibold text-foreground text-base">{username}</p>
                </div>
              )}
              <Button
                variant="destructive"
                onClick={() => {
                  handleLogout();
                  setMoreMenuOpen(false);
                }}
                className="w-full h-14 text-base touch-target-lg rounded-xl font-semibold shadow-lg"
              >
                Logout
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};
