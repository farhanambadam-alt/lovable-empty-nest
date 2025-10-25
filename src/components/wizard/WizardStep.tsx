import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WizardStepProps {
  children: ReactNode;
  isActive: boolean;
  isCompleted: boolean;
}

export const WizardStep = ({ children, isActive, isCompleted }: WizardStepProps) => {
  return (
    <div 
      className={cn(
        "transition-all duration-300",
        isActive ? "opacity-100" : "opacity-0 hidden",
        isCompleted && "opacity-50"
      )}
    >
      {children}
    </div>
  );
};
