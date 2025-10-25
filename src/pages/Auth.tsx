import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Github } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const username = session.user.user_metadata.user_name || session.user.user_metadata.preferred_username;
        const avatarUrl = session.user.user_metadata.avatar_url;

        // SECURITY: GitHub tokens are now stored in the session (encrypted by Supabase)
        // We only save non-sensitive profile data to the database
        if (username) {
          (async () => {
            try {
              // Save only non-sensitive profile data
              const { error } = await supabase
                .from('profiles')
                .upsert({
                  id: session.user.id,
                  github_username: username,
                  github_avatar_url: avatarUrl,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'id'
                });

              if (error) {
                console.error('Failed to update profile:', error);
                toast({
                  variant: "destructive",
                  title: "Profile Update Failed",
                  description: "Your login was successful, but we couldn't update your profile.",
                });
              }
              
              navigate("/dashboard");
              
              // Clean up OAuth hash from URL
              window.history.replaceState(null, '', window.location.pathname);
              
            } catch (err) {
              console.error('Error updating profile:', err);
              toast({
                variant: "destructive",
                title: "Profile Error",
                description: "Your login was successful, but we couldn't update your profile.",
              });
              navigate("/dashboard"); // Still navigate even if profile update fails
            }
          })();
        } else {
          toast({
            variant: "destructive",
            title: "Authentication Error",
            description: "No GitHub username received. Please try logging in again.",
          });
          (async () => {
            await supabase.auth.signOut();
          })();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  const handleGithubLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        scopes: "repo delete_repo",
      },
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: error.message,
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md shadow-elevated gradient-card">
        <CardHeader className="text-center space-y-6 p-6 sm:p-8">
          <div className="flex justify-center">
            <div className="p-4 bg-primary/10 rounded-full shadow-glow">
              <Github className="h-16 w-16 text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl sm:text-4xl font-bold">Welcome to RepoPush</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Seamlessly manage your GitHub repositories with an intuitive interface.
            Create, upload, and organize your projects effortlessly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6 sm:p-8 pt-0">
          <Button
            onClick={handleGithubLogin}
            className="w-full h-14 text-base font-medium transition-smooth hover:shadow-glow touch-target-lg"
            size="lg"
          >
            <Github className="mr-2 h-5 w-5" />
            Login with GitHub
          </Button>
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            By continuing, you agree to grant RepoPush access to your GitHub repositories.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
