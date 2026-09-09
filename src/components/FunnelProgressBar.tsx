"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FunnelProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

const FunnelProgressBar = ({ currentStep, totalSteps }: FunnelProgressBarProps) => {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="w-full px-6 py-4">
      <div className="flex items-center justify-between mb-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={cn(
              "w-3 h-3 rounded-full transition-all duration-500",
              i < currentStep
                ? "bg-primary scale-110"
                : "bg-border"
            )}
          />
        ))}
      </div>
      <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2 font-body">
        {currentStep}/{totalSteps}
      </p>
    </div>
  );
};

export default FunnelProgressBar;
