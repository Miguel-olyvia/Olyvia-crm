import { useState } from "react";
import { AlertTriangle, X, Phone, Send, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ModuleAlert } from "@/hooks/useModuleAlerts";

interface ModuleAlertsBannerProps {
  alerts: ModuleAlert[];
  onDismiss: (id: string) => void;
  onAction?: (alert: ModuleAlert) => void;
  onAlertClick?: (alert: ModuleAlert) => void;
  maxVisible?: number;
}

const priorityStyles: Record<string, string> = {
  low: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200",
  medium: "bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-200",
  high: "bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/20 dark:text-destructive",
  urgent: "bg-destructive/15 border-destructive/40 text-destructive dark:bg-destructive/25 dark:text-destructive",
};

const priorityIcons: Record<string, string> = {
  low: "text-amber-500",
  medium: "text-orange-500",
  high: "text-destructive",
  urgent: "text-destructive",
};

const actionLabels: Record<string, { label: string; icon: typeof Send }> = {
  send_followup: { label: "Enviar follow-up", icon: Send },
  renew_validity: { label: "Renovar validade", icon: RefreshCw },
  send_renewal: { label: "Enviar renovação", icon: Send },
  call_now: { label: "Ligar agora", icon: Phone },
};

export function ModuleAlertsBanner({ alerts, onDismiss, onAction, onAlertClick, maxVisible = 3 }: ModuleAlertsBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const hasMore = alerts.length > maxVisible;
  const visible = expanded ? alerts : alerts.slice(0, maxVisible);

  return (
    <div className="space-y-2 mb-4">
      {visible.map((alert) => {
        const action = alert.action_type ? actionLabels[alert.action_type] : null;
        const ActionIcon = action?.icon;

        return (
          <div
            key={alert.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border",
              (onAlertClick || onAction) && "cursor-pointer hover:shadow-sm transition-shadow",
              priorityStyles[alert.priority] || priorityStyles.low
            )}
            onClick={() => onAlertClick?.(alert)}
          >
            <AlertTriangle className={cn("w-4 h-4 shrink-0", priorityIcons[alert.priority])} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{alert.title}</p>
              <p className="text-xs opacity-80 truncate">{alert.message}</p>
            </div>
            {action && onAction && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-7 text-xs"
                onClick={(e) => { e.stopPropagation(); onAction(alert); }}
              >
                {ActionIcon && <ActionIcon className="w-3 h-3 mr-1" />}
                {action.label}
              </Button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }}
              className="shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-center gap-1 w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              +{alerts.length - maxVisible} alertas adicionais
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** Small inline icon for table rows */
export function AlertIcon({ priority }: { priority: string }) {
  return (
    <AlertTriangle className={cn("w-4 h-4", priorityIcons[priority] || "text-amber-500")} />
  );
}
