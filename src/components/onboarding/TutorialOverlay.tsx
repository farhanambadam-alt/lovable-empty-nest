import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface TutorialStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const tutorialSteps: TutorialStep[] = [
  {
    target: "[data-tutorial='repositories']",
    title: "Your Repositories",
    description: "All your GitHub repositories are listed here. Click any repo to view its contents.",
    position: "bottom"
  },
  {
    target: "[data-tutorial='search']",
    title: "Search Repositories",
    description: "Quickly find repositories using the search bar.",
    position: "bottom"
  },
  {
    target: "[data-tutorial='new-repo']",
    title: "Create Repository",
    description: "Click here to create a new repository with our easy setup wizard.",
    position: "left"
  },
  {
    target: "[data-tutorial='navigation']",
    title: "Navigation",
    description: "Use the navigation menu to access different features like Pull Requests and Settings.",
    position: "right"
  }
];

interface TutorialOverlayProps {
  isActive: boolean;
  onComplete: () => void;
}

export function TutorialOverlay({ isActive, onComplete }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isActive) return;

    const step = tutorialSteps[currentStep];
    const element = document.querySelector(step.target) as HTMLElement;
    
    if (element) {
      setTargetElement(element);
      
      // Scroll element into view
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      
      // Calculate tooltip position
      const rect = element.getBoundingClientRect();
      const tooltipWidth = 300;
      const tooltipHeight = 150;
      
      let top = 0;
      let left = 0;
      
      switch (step.position) {
        case "bottom":
          top = rect.bottom + 16;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case "top":
          top = rect.top - tooltipHeight - 16;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case "right":
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.right + 16;
          break;
        case "left":
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.left - tooltipWidth - 16;
          break;
      }
      
      setTooltipPosition({ top, left });
    }
  }, [currentStep, isActive]);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem("repopush_tutorial_completed", "true");
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem("repopush_tutorial_skipped", "true");
    onComplete();
  };

  if (!isActive) return null;

  const currentStepData = tutorialSteps[currentStep];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" />
      
      {/* Highlight */}
      {targetElement && (
        <div
          className="fixed border-2 border-primary rounded-lg pointer-events-none z-50 transition-all duration-300"
          style={{
            top: targetElement.getBoundingClientRect().top - 4,
            left: targetElement.getBoundingClientRect().left - 4,
            width: targetElement.getBoundingClientRect().width + 8,
            height: targetElement.getBoundingClientRect().height + 8,
          }}
        />
      )}
      
      {/* Tooltip */}
      <Card
        className="fixed z-50 w-[300px] p-4 shadow-lg"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Step {currentStep + 1} of {tutorialSteps.length}
              </div>
              <h3 className="font-semibold text-base">{currentStepData.title}</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleSkip}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground">
            {currentStepData.description}
          </p>
          
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            
            <Button size="sm" onClick={handleNext}>
              {currentStep === tutorialSteps.length - 1 ? "Finish" : "Next"}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
