import { Sparkles, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface InsightContact {
  name: string;
  score: number;
  entityId: string;
}

interface ContactsInsightBannerProps {
  contacts: InsightContact[];
  onCreateDeals: () => void;
  onViewList: () => void;
}

export function ContactsInsightBanner({ contacts, onCreateDeals, onViewList }: ContactsInsightBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || contacts.length === 0) return null;

  const topNames = contacts.slice(0, 3).map(c => c.name).join(", ");
  const remaining = contacts.length > 3 ? ` e mais ${contacts.length - 3}` : "";

  return (
    <div className="relative rounded-lg border border-success/30 bg-success/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="h-4 w-4 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {contacts.length} contacto{contacts.length !== 1 ? "s" : ""} qualificado{contacts.length !== 1 ? "s" : ""} sem pedido de proposta
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {topNames}{remaining} — com score de saúde ≥60 e sem pedido de proposta associado há mais de 14 dias.
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={onCreateDeals}>
              Criar pedidos <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onViewList}>
              Ver lista
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setDismissed(true)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
