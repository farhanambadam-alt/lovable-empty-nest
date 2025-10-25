import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";

// RepoPush - GitHub Repository Management Platform
const Index = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      } else {
        setIsLoading(false);
      }
    });
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-6 bg-gradient-to-br from-background via-background to-primary/5">
      {/* Content positioned for natural scrolling */}
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-2xl mx-auto text-center space-y-8 sm:space-y-10 px-4">
          <div className="flex justify-center">
            <div className="p-4 bg-primary/10 rounded-full shadow-glow">
              <Github className="h-16 w-16 sm:h-20 sm:w-20 text-primary" />
            </div>
          </div>
          
          <div className="space-y-4 sm:space-y-5">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight">
              Welcome to RepoPush
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Seamlessly manage your GitHub repositories with an intuitive interface.
              Create, upload, and organize your projects effortlessly.
            </p>
          </div>
        </div>
      </div>

      {/* CTA in thumb-friendly zone (bottom third) */}
      <div className="space-y-4 pb-8 sm:pb-6">
        <Button
          onClick={() => navigate("/auth")}
          size="lg"
          className="w-full h-14 px-8 text-lg font-medium transition-smooth hover:shadow-glow touch-target-lg"
        >
          <Github className="mr-2 h-5 w-5" />
          Get Started
        </Button>
        
        <p className="text-sm sm:text-base text-muted-foreground text-center">
          Connect your GitHub account to start managing repositories
        </p>
      </div>
    </div>
  );
};

export default Index;
