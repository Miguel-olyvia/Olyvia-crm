import { CheckCircle, FileText, Send, FileSignature, Users } from "lucide-react";

interface QuotePipelineBarProps {
  hasDeal: boolean;
}

const steps = [
  { key: "deal", label: "Pedido de Proposta", icon: CheckCircle, emoji: "✅" },
  { key: "quote", label: "Orçamento (a criar)", icon: FileText, emoji: "📝" },
  { key: "proposal", label: "Proposta", icon: Send, emoji: "📄" },
  { key: "contract", label: "Contrato", icon: FileSignature, emoji: "📑" },
  { key: "client", label: "Cliente", icon: Users, emoji: "👤" },
];

export function QuotePipelineBar({ hasDeal }: QuotePipelineBarProps) {
  const activeStep = 1; // Quote step is always active in this context

  return (
    <div className="flex items-center gap-1 py-3 px-4 bg-muted/30 rounded-lg border overflow-x-auto">
      {steps.map((step, index) => {
        const isCompleted = index < activeStep && (index === 0 ? hasDeal : false);
        const isActive = index === activeStep;
        const isFuture = index > activeStep || (index === 0 && !hasDeal);

        return (
          <div key={step.key} className="flex items-center shrink-0">
            {index > 0 && (
              <span className="mx-2 text-muted-foreground/40">→</span>
            )}
            <span
              className={`text-sm font-medium whitespace-nowrap ${
                isCompleted
                  ? "text-green-600"
                  : isActive
                  ? "text-primary font-bold"
                  : "text-muted-foreground/50"
              }`}
            >
              {isCompleted ? "✅" : step.emoji}{" "}
              {isActive ? <span className="underline underline-offset-4">{step.label}</span> : step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
