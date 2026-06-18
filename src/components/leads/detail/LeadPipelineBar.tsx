import { Badge } from "@/components/ui/badge";

interface WorkflowStage {
  id: string;
  name: string;
  label?: string;
  color?: string;
  sort_order?: number;
}

interface LeadPipelineBarProps {
  currentStatus: string;
  workflowStages: WorkflowStage[];
}

export function LeadPipelineBar({ currentStatus, workflowStages }: LeadPipelineBarProps) {
  if (workflowStages.length === 0) return null;

  const sortedStages = [...workflowStages].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const currentIndex = sortedStages.findIndex(s => s.name === currentStatus);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        📊 Funil da Lead
      </p>
      <div className="flex items-center gap-1">
        {sortedStages.map((stage, i) => {
          const isCurrent = stage.name === currentStatus;
          const isPast = currentIndex >= 0 && i < currentIndex;
          const isFuture = currentIndex >= 0 && i > currentIndex;

          return (
            <div key={stage.id} className="flex items-center flex-1">
              <div className={`flex-1 text-center py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                isCurrent
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : isPast
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
              }`}>
                {stage.label || stage.name}
              </div>
              {i < sortedStages.length - 1 && (
                <div className={`w-4 h-0.5 shrink-0 ${
                  isPast || isCurrent ? "bg-primary" : "bg-muted-foreground/20"
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
