import { Zap } from "lucide-react";

export function QuotesWorkflowBar() {
  const steps = [
    { label: "Pedido Qualificado", active: false, highlight: false },
    { label: "Orçamento", active: true, highlight: true },
    { label: "Proposta", active: false, highlight: false },
    { label: "Contrato", active: false, highlight: false },
  ];

  return (
    <div className="flex-shrink-0 px-4 md:px-6 pt-3">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-1.5 text-primary">
          <Zap className="h-4 w-4" />
          <span className="text-xs font-semibold whitespace-nowrap">Fluxo automático:</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {steps.map((step, idx) => (
            <div key={step.label} className="flex items-center gap-1">
              <span
                className={
                  step.highlight
                    ? "text-xs font-bold text-primary-foreground bg-primary px-2.5 py-1 rounded-md"
                    : "text-xs text-muted-foreground"
                }
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <span className="text-xs text-muted-foreground">
                  {idx === 0 ? "→ cria →" : "→ aceite cria →"}
                </span>
              )}
            </div>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground ml-auto hidden lg:block">
          Quando um orçamento é aceite, a proposta é criada automaticamente
        </span>
      </div>
    </div>
  );
}
