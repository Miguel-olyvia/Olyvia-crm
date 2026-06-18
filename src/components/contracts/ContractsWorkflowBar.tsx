import { Zap } from "lucide-react";

export function ContractsWorkflowBar() {
  const steps = [
    { label: "Pedido", highlight: false },
    { label: "Orçamento", highlight: false },
    { label: "Proposta Aceite", highlight: false },
    { label: "Contrato", highlight: true },
    { label: "Cliente", highlight: false },
  ];

  return (
    <div className="flex-shrink-0">
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
                  {idx === 2 ? "→ cria →" : idx === 3 ? "→ assinado cria →" : "→"}
                </span>
              )}
            </div>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground ml-auto hidden lg:block">
          Assinar contrato converte contacto em cliente automaticamente
        </span>
      </div>
    </div>
  );
}
