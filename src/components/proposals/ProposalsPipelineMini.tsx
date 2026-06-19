import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PipelineStep {
  label: string;
  done: boolean;
  current: boolean;
  info?: string;
}

interface ProposalsPipelineMiniProps {
  dealExists: boolean;
  quoteExists: boolean;
  proposalStatus: string;
  contractCreated: boolean;
  pipelineLabel?: string;
}

export function ProposalsPipelineMini({
  dealExists,
  quoteExists,
  proposalStatus,
  contractCreated,
  pipelineLabel,
}: ProposalsPipelineMiniProps) {
  const isAccepted = proposalStatus === "accepted" || proposalStatus === "aceite";

  const steps: PipelineStep[] = [
    { label: "P", done: dealExists, current: false, info: dealExists ? "Pedido ✓" : "Sem pedido" },
    { label: "O", done: quoteExists, current: false, info: quoteExists ? "Orçamento ✓" : "Sem orçamento" },
    { label: "P", done: isAccepted, current: !isAccepted, info: `Proposta · ${proposalStatus}` },
    { label: "C", done: contractCreated, current: false, info: contractCreated ? "Contrato ✓" : "Contrato não criado" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-0.5">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-colors",
                      step.done && "bg-green-500 border-green-500 text-white",
                      step.current && !step.done && "bg-primary border-primary text-primary-foreground",
                      !step.done && !step.current && "bg-muted border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {step.done ? "✓" : step.label}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{step.info}</TooltipContent>
              </Tooltip>
              {idx < steps.length - 1 && (
                <div className={cn(
                  "w-3 h-0.5",
                  step.done ? "bg-green-500" : "bg-muted-foreground/20"
                )} />
              )}
            </div>
          ))}
        </div>
        {pipelineLabel && (
          <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">{pipelineLabel}</span>
        )}
      </div>
    </TooltipProvider>
  );
}
