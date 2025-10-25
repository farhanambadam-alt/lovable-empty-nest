import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export const StepIndicator = ({ steps, currentStep }: StepIndicatorProps) => {
  return (
    <div className="mb-6 sm:mb-8">
      {/* Mobile: Simple step counter */}
      <div className="block sm:hidden mb-4">
        <div className="flex items-center justify-center gap-2">
          <div className="bg-primary/10 text-primary px-4 py-2 rounded-full border border-primary/20">
            <span className="text-sm font-medium">
              Step {currentStep + 1} of {steps.length}
            </span>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-3 font-medium">
          {steps[currentStep]}
        </p>
      </div>

      {/* Desktop: Full stepper */}
      <div className="hidden sm:flex items-center justify-between px-2 overflow-x-auto scrollbar-hide">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center font-medium transition-smooth shrink-0",
                  index < currentStep
                    ? "bg-primary text-primary-foreground"
                    : index === currentStep
                    ? "bg-primary/20 text-primary border-2 border-primary"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                {index < currentStep ? (
                  <Check className="w-6 h-6" />
                ) : (
                  <span className="text-base">{index + 1}</span>
                )}
              </div>
              <p className="text-sm mt-2 text-center text-muted-foreground leading-tight max-w-[80px] truncate px-0.5">
                {step}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-1 flex-1 mx-2 transition-smooth rounded-full min-w-[12px]",
                  index < currentStep ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};