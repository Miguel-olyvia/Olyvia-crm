import { useState } from "react";
import {
  UserPlus, Users, Briefcase, FileText, Calendar, Workflow,
  BarChart3, Navigation, Search, Settings, Wrench, Mail, Phone,
  CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown,
  FileType, LayoutTemplate, type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type ToolCallStatus = "running" | "done" | "needs_confirmation" | "error";

export interface ToolCallView {
  id: string;
  name: string;
  argsSummary: string;
  status: ToolCallStatus;
  errorMessage?: string;
  durationMs?: number;
}

const TOOL_LABELS: Record<string, { label: string; icon: LucideIcon }> = {
  // Leads
  create_lead: { label: "Criar lead", icon: UserPlus },
  update_lead: { label: "Atualizar lead", icon: UserPlus },
  search_leads: { label: "Procurar leads", icon: Search },
  // Entities / contacts
  search_entities: { label: "Procurar contactos", icon: Users },
  create_entity: { label: "Criar contacto", icon: Users },
  update_entity: { label: "Atualizar contacto", icon: Users },
  // Deals / pipeline
  create_deal: { label: "Criar negócio", icon: Briefcase },
  update_deal: { label: "Atualizar negócio", icon: Briefcase },
  move_deal: { label: "Mover negócio", icon: Briefcase },
  // Quotes / contracts
  create_quote: { label: "Criar orçamento", icon: FileText },
  update_quote: { label: "Atualizar orçamento", icon: FileText },
  add_quote_items: { label: "Adicionar itens ao orçamento", icon: FileText },
  duplicate_quote: { label: "Duplicar orçamento", icon: FileText },
  send_quote: { label: "Enviar orçamento", icon: FileText },
  list_quotes: { label: "Listar orçamentos", icon: FileText },
  list_quote_templates: { label: "Layouts de PDF", icon: FileType },
  set_quote_template: { label: "Aplicar layout de PDF", icon: FileType },
  list_quote_models: { label: "Modelos rápidos", icon: LayoutTemplate },
  set_quote_model: { label: "Aplicar modelo rápido", icon: LayoutTemplate },
  search_products: { label: "Procurar catálogo", icon: Search },
  search_services: { label: "Procurar serviços", icon: Wrench },

  // Schedule
  create_schedule_item: { label: "Criar agendamento", icon: Calendar },
  update_schedule_item: { label: "Atualizar agendamento", icon: Calendar },
  get_schedule: { label: "Ver agenda", icon: Calendar },
  complete_task: { label: "Concluir tarefa", icon: CheckCircle2 },
  // Workflow / automation
  create_workflow_rule: { label: "Criar regra", icon: Workflow },
  update_workflow_rule: { label: "Atualizar regra", icon: Workflow },
  list_workflow_stages: { label: "Listar stages", icon: Workflow },
  create_workflow_stage: { label: "Criar stage", icon: Workflow },
  update_workflow_stage: { label: "Atualizar stage", icon: Workflow },
  deactivate_workflow_stage: { label: "Desativar stage", icon: Workflow },
  list_stage_actions: { label: "Listar acções de stage", icon: Workflow },
  create_stage_action: { label: "Criar acção de stage", icon: Workflow },
  toggle_stage_action: { label: "Alternar acção de stage", icon: Workflow },
  delete_stage_action: { label: "Apagar acção de stage", icon: Workflow },
  // Reports
  get_pipeline_report: { label: "Relatório de pipeline", icon: BarChart3 },
  get_sales_report: { label: "Relatório de vendas", icon: BarChart3 },
  // Communications
  send_email: { label: "Enviar email", icon: Mail },
  send_whatsapp: { label: "Enviar WhatsApp", icon: Phone },
  // Navigation
  navigate: { label: "Abrir ecrã", icon: Navigation },
};

function resolveLabel(name: string): { label: string; Icon: LucideIcon } {
  const entry = TOOL_LABELS[name];
  if (entry) return { label: entry.label, Icon: entry.icon };
  return { label: name, Icon: Settings };
}

function StatusBadge({ status, errorMessage }: { status: ToolCallStatus; errorMessage?: string }) {
  if (status === "running") {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] py-0 h-4">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> A executar…
      </Badge>
    );
  }
  if (status === "done") {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] py-0 h-4 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-2.5 w-2.5" /> OK
      </Badge>
    );
  }
  if (status === "needs_confirmation") {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] py-0 h-4 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="h-2.5 w-2.5" /> Precisa confirmação
      </Badge>
    );
  }
  const badge = (
    <Badge variant="secondary" className="gap-1 text-[10px] py-0 h-4 bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300">
      <XCircle className="h-2.5 w-2.5" /> Falhou
    </Badge>
  );
  if (!errorMessage) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{errorMessage}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ToolCallChip({ item }: { item: ToolCallView }) {
  const [open, setOpen] = useState(false);
  const { label, Icon } = resolveLabel(item.name);
  const hasDetail = !!item.argsSummary;
  return (
    <div className="rounded-md border bg-background/60 text-xs">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-muted/50 rounded-md"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium truncate">{label}</span>
        <span className="ml-auto flex items-center gap-1">
          <StatusBadge status={item.status} errorMessage={item.errorMessage} />
          {hasDetail && (
            <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          )}
        </span>
      </button>
      {open && hasDetail && (
        <div className="px-2 pb-2 pt-1 border-t">
          <pre className="text-[11px] whitespace-pre-wrap break-words text-muted-foreground font-mono">
            {item.argsSummary}
          </pre>
          {typeof item.durationMs === "number" && (
            <p className="text-[10px] text-muted-foreground mt-1">{item.durationMs} ms</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCallList({ items }: { items: ToolCallView[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1">
      {items.map((it) => <ToolCallChip key={it.id} item={it} />)}
    </div>
  );
}
