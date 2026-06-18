import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ContractsPipelineMiniProps {
  contract: {
    status: string;
    proposal_id?: string;
    [key: string]: any;
  };
}

export function ContractsPipelineMini({ contract }: ContractsPipelineMiniProps) {
  const isSigned = contract.status === "signed" || contract.status === "active";
  const isExpired = contract.status === "expired";
  const isDraft = contract.status === "draft";

  const steps = [
    { label: "Pedido", done: true },
    { label: "Orçamento", done: true },
    { label: "Proposta", done: true },
    { label: "Contrato", done: true, current: !isSigned && !isExpired },
    { label: "Cliente", done: isSigned, current: false },
  ];

  const getLabel = () => {
    if (isSigned) return "Pipeline completo ✅";
    if (isExpired) return "Não renovado ❌";
    if (isDraft) return "Falta assinar";
    if (contract.status === "pending_signature") return "Aguarda assinatura";
    return "";
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-0.5">
          {steps.map((step, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold ${
                    step.current
                      ? "border-primary bg-primary text-primary-foreground"
                      : step.done
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-muted-foreground/30 bg-muted/50 text-muted-foreground/50"
                  }`}
                >
                  {step.done && !step.current ? "✓" : step.current ? "★" : ""}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{step.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground leading-none">{getLabel()}</span>
      </div>
    </TooltipProvider>
  );
}
