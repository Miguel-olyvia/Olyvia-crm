import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { 
  Users, Target, FileText, Calculator, FileSignature, UserCheck,
  ChevronRight, ExternalLink, Briefcase, Receipt
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LucideIcon } from "lucide-react";

interface PipelineStep {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
  id: string | null;
}

interface PipelineBreadcrumbProps {
  entityType: "lead" | "deal" | "proposal" | "quote" | "contract" | "client";
  entityId: string;
}

const MODULE_ID_TO_KEY: Record<string, string> = {
  pedido: "deal",
  proposta: "proposal",
  orcamento: "quote",
  contrato: "contract",
  cliente: "client",
};

const KEY_TO_ICON: Record<string, LucideIcon> = {
  lead: Users,
  deal: Target,
  proposal: FileText,
  quote: Calculator,
  contract: FileSignature,
  client: UserCheck,
};

const KEY_TO_ROUTE: Record<string, string> = {
  lead: "/leads",
  deal: "/deals",
  proposal: "/proposals",
  quote: "/quotes",
  contract: "/client-contracts",
  client: "/clients",
};

const DEFAULT_LABELS: Record<string, string> = {
  lead: "Lead",
  deal: "Pedido",
  proposal: "Proposta",
  quote: "Orçamento",
  contract: "Contrato",
  client: "Cliente",
};

export function PipelineBreadcrumb({ entityType, entityId }: PipelineBreadcrumbProps) {
  const navigate = useNavigate();
  const [pipelineData, setPipelineData] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [dynamicSteps, setDynamicSteps] = useState<PipelineStep[] | null>(null);

  useEffect(() => {
    const fetchPipelineData = async () => {
      if (!entityId) return;
      setLoading(true);
      try {
        const col = `${entityType}_id`;
        const { data } = await (supabase.from("pipeline_links") as any)
          .select("*")
          .eq(col, entityId)
          .eq("status", "active")
          .maybeSingle();

        let resolved: Record<string, string | null> = {
          lead: null, deal: null, proposal: null, quote: null, contract: null, client: null,
        };

        if (data) {
          resolved = {
            lead: data.lead_id,
            deal: data.deal_id,
            proposal: data.proposal_id,
            quote: data.quote_id,
            contract: data.contract_id,
            client: data.client_id,
          };

          // Fetch org pipeline config using organization_id from the link
          if (data.organization_id || data.root_organization_id) {
            const orgId = data.root_organization_id || data.organization_id;
            await loadPipelineConfig(orgId, resolved);
          } else {
            buildDefaultSteps(resolved);
          }
        } else {
          await resolveFromFKChain(resolved);
        }

        setPipelineData(resolved);
      } catch (err) {
        console.error("Pipeline breadcrumb error:", err);
      } finally {
        setLoading(false);
      }
    };

    const loadPipelineConfig = async (orgId: string, resolved: Record<string, string | null>) => {
      const { data: configData } = await (supabase.from("organization_pipeline_config") as any)
        .select("modules")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (configData?.modules && Array.isArray(configData.modules)) {
        const activeModules = configData.modules.filter((m: any) => m.enabled);
        const steps: PipelineStep[] = [
          { key: "lead", label: "Lead", icon: Users, route: "/leads", id: resolved.lead || null },
        ];
        for (const mod of activeModules) {
          const key = MODULE_ID_TO_KEY[mod.id];
          if (!key) continue;
          steps.push({
            key,
            label: mod.label || DEFAULT_LABELS[key] || key,
            icon: KEY_TO_ICON[key] || Briefcase,
            route: KEY_TO_ROUTE[key] || "/",
            id: resolved[key] || null,
          });
        }
        setDynamicSteps(steps);
      } else {
        buildDefaultSteps(resolved);
      }
    };

    const buildDefaultSteps = (resolved: Record<string, string | null>) => {
      setDynamicSteps([
        { key: "lead", label: "Lead", icon: Users, route: "/leads", id: resolved.lead || null },
        { key: "deal", label: "Pedido", icon: Target, route: "/deals", id: resolved.deal || null },
        { key: "quote", label: "Orçamento", icon: Calculator, route: "/quotes", id: resolved.quote || null },
        { key: "proposal", label: "Proposta", icon: FileText, route: "/proposals", id: resolved.proposal || null },
        { key: "contract", label: "Contrato", icon: FileSignature, route: "/client-contracts", id: resolved.contract || null },
        { key: "client", label: "Cliente", icon: UserCheck, route: "/clients", id: resolved.client || null },
      ]);
    };

    const resolveFromFKChain = async (resolved: Record<string, string | null>) => {
      resolved[entityType] = entityId;

      try {
        if (entityType === "deal") {
          const { data: deal } = await supabase.from("deals").select("lead_id").eq("id", entityId).maybeSingle();
          if (deal?.lead_id) resolved.lead = deal.lead_id;
        }
        if (entityType === "proposal") {
          const { data: prop } = await supabase.from("proposals").select("deal_id").eq("id", entityId).maybeSingle();
          if (prop?.deal_id) {
            resolved.deal = prop.deal_id;
            const { data: deal } = await supabase.from("deals").select("lead_id").eq("id", prop.deal_id).maybeSingle();
            if (deal?.lead_id) resolved.lead = deal.lead_id;
          }
        }
        if (entityType === "quote") {
          const { data: quote } = await supabase.from("quotes").select("proposal_id, deal_id").eq("id", entityId).maybeSingle();
          if (quote?.proposal_id) resolved.proposal = quote.proposal_id;
          if (quote?.deal_id) {
            resolved.deal = quote.deal_id;
            const { data: deal } = await supabase.from("deals").select("lead_id").eq("id", quote.deal_id).maybeSingle();
            if (deal?.lead_id) resolved.lead = deal.lead_id;
          }
        }
      } catch (e) {
        // graceful degradation
      }

      buildDefaultSteps(resolved);
    };

    fetchPipelineData();
  }, [entityType, entityId]);

  if (loading || !dynamicSteps) return null;

  const currentIndex = dynamicSteps.findIndex(s => s.key === entityType);
  const hasAnyData = dynamicSteps.some(s => s.id);
  
  if (!hasAnyData) return null;

  return (
    <div className="flex items-center gap-1 p-2 px-3 rounded-lg bg-muted/50 border border-border/50 mb-4 overflow-x-auto">
      {dynamicSteps.map((step, index) => {
        const Icon = step.icon;
        const isCurrent = step.key === entityType;
        const isPast = index < currentIndex && step.id;
        const isFuture = index > currentIndex;
        const hasId = !!step.id;

        return (
          <div key={step.key} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 mx-1 text-muted-foreground/50 shrink-0" />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => hasId && !isCurrent ? navigate(step.route) : undefined}
                  disabled={!hasId || isCurrent}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                    isCurrent && "bg-primary text-primary-foreground shadow-sm",
                    isPast && "bg-accent text-accent-foreground hover:bg-accent/80 cursor-pointer",
                    isFuture && !hasId && "text-muted-foreground/40",
                    isFuture && hasId && "bg-secondary text-secondary-foreground",
                    !hasId && !isCurrent && "opacity-40 cursor-default"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{step.label}</span>
                  {hasId && !isCurrent && (
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {hasId
                  ? isCurrent
                    ? `Passo actual: ${step.label}`
                    : `Ir para ${step.label}`
                  : `${step.label} (ainda não criado)`
                }
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
