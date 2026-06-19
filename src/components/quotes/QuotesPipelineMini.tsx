import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PipelineStep {
  label: string;
  done: boolean;
  current: boolean;
  info?: string;
}

interface QuotesPipelineMiniProps {
  dealExists: boolean;
  quoteStatus: string;
  proposalCreated: boolean;
  proposalInfo?: string;
  contractCreated?: boolean;
}

export function QuotesPipelineMini({
  dealExists,
  quoteStatus,
  proposalCreated,
  proposalInfo,
  contractCreated,
}: QuotesPipelineMiniProps) {
  const isAccepted = quoteStatus === "aceite";
  const hasProposal = proposalCreated;
  
  const steps: PipelineStep[] = [
    { label: "P", done: dealExists, current: false, info: dealExists ? "Pedido de proposta" : "Sem pedido" },
    { label: "O", done: true, current: !isAccepted && !hasProposal, info: `Orçamento · ${quoteStatus}` },
    { label: "P", done: hasProposal, current: hasProposal && !isAccepted, info: proposalInfo || (hasProposal ? "Proposta criada" : "Proposta não criada") },
    { label: "C", done: !!contractCreated, current: false, info: contractCreated ? "Contrato" : "Contrato não criado" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
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
    </TooltipProvider>
  );
}
