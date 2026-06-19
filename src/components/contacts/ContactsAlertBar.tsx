import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface AlertItem {
  key: string;
  label: string;
  count: number;
  color: string;
  action: () => void;
}

interface ContactsAlertBarProps {
  alerts: AlertItem[];
}

export function ContactsAlertBar({ alerts }: ContactsAlertBarProps) {
  const [dismissed, setDismissed] = useState(false);

  const activeAlerts = alerts.filter(a => a.count > 0);
  if (dismissed || activeAlerts.length === 0) return null;

  return (
    <div className="relative rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        <div className="flex items-center gap-4 flex-wrap flex-1">
          {activeAlerts.map(alert => (
            <button
              key={alert.key}
              onClick={alert.action}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors group"
            >
              <span className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-xs font-bold text-white ${alert.color}`}>
                {alert.count}
              </span>
              <span>{alert.label}</span>
              <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setDismissed(true)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
