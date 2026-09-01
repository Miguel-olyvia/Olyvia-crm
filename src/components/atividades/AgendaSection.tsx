import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AgendaSectionProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  count: number;
  emptyMessage: string;
  /** Destaque visual do bloco de atrasados, que vai primeiro. */
  tone?: "default" | "danger";
  children: ReactNode;
}

export function AgendaSection({
  icon: Icon,
  title,
  description,
  count,
  emptyMessage,
  tone = "default",
  children,
}: AgendaSectionProps) {
  const isDanger = tone === "danger";

  return (
    <Card className={isDanger ? "border-destructive/40" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className={`flex items-center gap-2 text-lg ${isDanger ? "text-destructive" : ""}`}>
              <Icon className="h-5 w-5" />
              {title}
            </CardTitle>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          <Badge variant={isDanger ? "destructive" : "secondary"} className="shrink-0">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
