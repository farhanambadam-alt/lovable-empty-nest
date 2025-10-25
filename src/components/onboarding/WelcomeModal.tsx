import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  FolderTree, 
  GitBranch, 
  GitPullRequest, 
  Upload, 
  Settings,
  Check
} from "lucide-react";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTutorial: () => void;
}

const features = [
  {
    icon: FolderTree,
    title: "VS Code-Style Browser",
    description: "Navigate your files with a familiar, intuitive interface"
  },
  {
    icon: FileText,
    title: "File Editor",
    description: "Edit files directly in your browser with syntax highlighting"
  },
  {
    icon: Upload,
    title: "Drag & Drop Upload",
    description: "Upload multiple files at once with ease"
  },
  {
    icon: GitBranch,
    title: "Branch Management",
    description: "Switch between branches and create new ones"
  },
  {
    icon: GitPullRequest,
    title: "Pull Requests",
    description: "Create and manage PRs without leaving the app"
  },
  {
    icon: Settings,
    title: "Repository Settings",
    description: "Control visibility, topics, and more"
  }
];

export function WelcomeModal({ open, onOpenChange, onStartTutorial }: WelcomeModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 2;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onStartTutorial();
      onOpenChange(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("repopush_onboarding_completed", "true");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {currentStep === 0 && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Welcome to RepoPush! 🚀</DialogTitle>
              <DialogDescription className="text-base">
                Your modern GitHub repository manager that makes managing repos a breeze
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-6">
              {features.map((feature, index) => (
                <div key={index} className="flex gap-3 p-3 rounded-lg border bg-card">
                  <div className="flex-shrink-0">
                    <div className="p-2 rounded-md bg-primary/10">
                      <feature.icon className="h-6 w-6 sm:h-5 sm:w-5 text-primary" />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{feature.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleSkip}>
                Skip Tour
              </Button>
              <Button onClick={handleNext}>
                Get Started
              </Button>
            </DialogFooter>
          </>
        )}

        {currentStep === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Quick Start Guide</DialogTitle>
              <DialogDescription className="text-base">
                Here's what you can do to get started
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-6">
              <div className="flex items-start gap-3">
                <Badge className="mt-1 h-6 w-6 rounded-full flex items-center justify-center">1</Badge>
                <div>
                  <h4 className="font-medium">View Your Repositories</h4>
                  <p className="text-sm text-muted-foreground">
                    Browse all your GitHub repositories from the Dashboard. Use search to find specific repos.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Badge className="mt-1 h-6 w-6 rounded-full flex items-center justify-center">2</Badge>
                <div>
                  <h4 className="font-medium">Create a New Repository</h4>
                  <p className="text-sm text-muted-foreground">
                    Click the "+" button or "New Repository" to create a repo. Follow the wizard to set it up.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Badge className="mt-1 h-6 w-6 rounded-full flex items-center justify-center">3</Badge>
                <div>
                  <h4 className="font-medium">Edit Files in Browser</h4>
                  <p className="text-sm text-muted-foreground">
                    Click any file to view it, then click "Edit" to make changes. Save with a commit message.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Badge className="mt-1 h-6 w-6 rounded-full flex items-center justify-center">4</Badge>
                <div>
                  <h4 className="font-medium">Upload Files</h4>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop files or click "Upload" to add multiple files at once.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-6 w-6 sm:h-5 sm:w-5 text-primary" />
                  <h4 className="font-medium">Pro Tip</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Press <kbd className="px-2 py-1 text-xs rounded border bg-background">?</kbd> anytime 
                  to see keyboard shortcuts and get quick help!
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleSkip}>
                Skip Tutorial
              </Button>
              <Button onClick={handleNext}>
                Start Interactive Tutorial
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
