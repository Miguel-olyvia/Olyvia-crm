import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  FileText,
  Shield,
  Users,
  ShoppingCart,
  Megaphone,
  Wrench,
  BarChart3,
  ArrowRight,
  Layers,
  GitBranch,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type PhaseStatus = "done" | "in_progress" | "pending" | "blocked";
type MilestoneStatus = "done" | "in_progress" | "pending";

interface Phase {
  id: string;
  name: string;
  status: PhaseStatus;
  notes?: string;
  files?: string[];
}

interface Milestone {
  id: string;
  code: string;
  name: string;
  description: string;
  status: MilestoneStatus;
  progress: number;
  icon: React.ReactNode;
  phases: Phase[];
}

// ─── Data ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<PhaseStatus | MilestoneStatus, { label: string; cls: string }> = {
  done:        { label: "Concluído",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  in_progress: { label: "Em curso",   cls: "bg-violet-100 text-violet-700 border-violet-200" },
  pending:     { label: "Pendente",   cls: "bg-slate-100 text-slate-500 border-slate-200" },
  blocked:     { label: "Bloqueado",  cls: "bg-red-100 text-red-700 border-red-200" },
};

const MILESTONES: Milestone[] = [
  {
    id: "base", code: "01", name: "Fundação", status: "in_progress", progress: 72,
    description: "Autenticação, utilizadores, roles, permissões, organizações e entidades.",
    icon: <Shield className="w-4 h-4" />,
    phases: [
      { id: "b1", name: "Auth & Sessão",              status: "done",        notes: "Login, refresh token, guard routes" },
      { id: "b2", name: "Users & Roles RBAC",         status: "done",        notes: "Roles, permissões, ProtectedRoute" },
      { id: "b3", name: "Organizações & Hierarquia",  status: "done",        notes: "Multi-tenant, company isolation" },
      { id: "b4", name: "Entidades & Anti-duplicação",status: "in_progress", notes: "Dedup email/NIF/telefone, bloqueio por-entidade", files: ["contrato-sdd-criacao-lead-contacto-cliente.md"] },
      { id: "b5", name: "Dashboard & Home",            status: "pending",     notes: "Widgets por role, KPI cards" },
      { id: "b6", name: "Settings & Admin",            status: "pending",     notes: "SMTP, API Keys, configurações globais" },
    ],
  },
  {
    id: "crm", code: "02", name: "CRM", status: "in_progress", progress: 61,
    description: "Leads, contactos, clientes, deals, agendamento e portal de comunicações.",
    icon: <Users className="w-4 h-4" />,
    phases: [
      { id: "c1", name: "Leads",            status: "in_progress", notes: "Criação manual, conversão, soft-delete, dedup" },
      { id: "c2", name: "Contactos",        status: "done",        notes: "CRUD, merge, vinculação org" },
      { id: "c3", name: "Clientes",         status: "done",        notes: "Conversão lead→cliente, histórico" },
      { id: "c4", name: "Deals & Pipeline", status: "in_progress", notes: "Kanban, etapas configuráveis" },
      { id: "c5", name: "Agendamento",      status: "pending",     notes: "Calendar, eventos, notificações" },
      { id: "c6", name: "Portal & Comun.",  status: "pending",     notes: "Portal cliente, proposta online" },
    ],
  },
  {
    id: "comercial", code: "03", name: "Comercial", status: "in_progress", progress: 55,
    description: "Propostas, orçamentos, contratos, catálogo, inventário e compras.",
    icon: <ShoppingCart className="w-4 h-4" />,
    phases: [
      { id: "co1", name: "Catálogo Produtos & Serv.",  status: "done",        notes: "Categorias, atributos, variantes, preços" },
      { id: "co2", name: "Configurador de Produtos",   status: "in_progress", notes: "Configurador flexível, opções dinâmicas", files: ["plan-configurador-produtos-dinamico.md"] },
      { id: "co3", name: "Orçamentos",                 status: "done",        notes: "Criação, modelos, PDF" },
      { id: "co4", name: "Propostas",                  status: "in_progress", notes: "Templates, envio, assinatura digital" },
      { id: "co5", name: "Contratos",                  status: "pending",     notes: "Geração, versionamento, e-sign" },
      { id: "co6", name: "Inventário & Compras",       status: "pending",     notes: "Stock, fornecedores, ordens de compra" },
      { id: "co7", name: "Comissões",                  status: "pending",     notes: "Cálculo automático, relatórios por vendedor" },
    ],
  },
  {
    id: "canais", code: "04", name: "Estrutura & Canais", status: "in_progress", progress: 40,
    description: "Formulários públicos, campanhas, portal cliente e documentação pública.",
    icon: <Megaphone className="w-4 h-4" />,
    phases: [
      { id: "ch1", name: "Formulários Públicos",   status: "in_progress", notes: "Multi-idioma, iframe embed, UTM", files: ["plano-form-layout-iframe-branding.md"] },
      { id: "ch2", name: "Campanhas & Atribuição", status: "in_progress", notes: "UTM, CPL, ROAS, canal dashboard", files: ["auditoria-marketing-utm-cpl-roas-2026-05-11.md"] },
      { id: "ch3", name: "Segmentação & Listas",   status: "pending",     notes: "Segmentos dinâmicos, exportação" },
      { id: "ch4", name: "Portal Cliente (pub.)",  status: "pending",     notes: "Login cliente, propostas, docs" },
      { id: "ch5", name: "Docs Públicas",          status: "pending",     notes: "Páginas públicas, organograma" },
    ],
  },
  {
    id: "infra", code: "05", name: "Infra & Segurança", status: "in_progress", progress: 35,
    description: "Performance, segurança, Edge Functions, RLS, alertas e notificações.",
    icon: <Wrench className="w-4 h-4" />,
    phases: [
      { id: "i1", name: "Performance & Queries",   status: "done",        notes: "N+1 fix, paginação, índices", files: ["lovable-query-optimization-prompt.md"] },
      { id: "i2", name: "Segurança & Edge Fn.",    status: "in_progress", notes: "Auditoria RLS, políticas, edge functions", files: ["AUDIT_SECURITY_EDGE_FUNCTIONS.md"] },
      { id: "i3", name: "Alertas & Notificações",  status: "in_progress", notes: "Sistema unificado, correção de alertas", files: ["plano-correcao-alertas-2026-05-20.md"] },
      { id: "i4", name: "Agente IA (Olyvia AI)",   status: "pending",     notes: "Prompt system, tool calling, contexto CRM" },
      { id: "i5", name: "Schema RLS Completo",     status: "pending",     notes: "89 tabelas sem políticas activas" },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progressBarColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-violet-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-slate-400";
}

function PhaseIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case "done":        return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
    case "in_progress": return <Clock        className="w-4 h-4 text-violet-500 shrink-0" />;
    case "blocked":     return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />;
    default:            return <Circle       className="w-4 h-4 text-slate-300 shrink-0" />;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhaseRow({ phase }: { phase: Phase }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(phase.notes || phase.files?.length);
  const cfg = STATUS_CFG[phase.status];

  return (
    <div>
      <button
        onClick={() => hasDetails && setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 ${
          hasDetails ? "cursor-pointer hover:bg-slate-50" : "cursor-default"
        }`}
      >
        <PhaseIcon status={phase.status} />
        <span className="flex-1 text-sm font-medium text-slate-800">{phase.name}</span>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${cfg.cls}`}>
          {cfg.label}
        </Badge>
        {hasDetails && (
          open
            ? <ChevronDown  className="w-3.5 h-3.5 text-slate-400" />
            : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>
      {open && hasDetails && (
        <div className="mx-3 mb-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
          {phase.notes && (
            <p className="text-xs text-slate-600 leading-relaxed">{phase.notes}</p>
          )}
          {phase.files && phase.files.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {phase.files.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 border border-violet-100 rounded px-1.5 py-0.5"
                >
                  <FileText className="w-3 h-3" />
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MilestoneCard({ milestone, expanded = false }: { milestone: Milestone; expanded?: boolean }) {
  const cfg = STATUS_CFG[milestone.status];
  const barColor = progressBarColor(milestone.progress);
  const doneCount = milestone.phases.filter((p) => p.status === "done").length;

  return (
    <Card className="border border-slate-100 shadow-none hover:shadow-sm transition-shadow duration-200">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-violet-100 text-violet-600">
              {milestone.icon}
            </span>
            <div>
              <p className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                Milestone {milestone.code}
              </p>
              <CardTitle className="text-base font-bold text-slate-900 leading-tight">
                {milestone.name}
              </CardTitle>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs shrink-0 ${cfg.cls}`}>
            {cfg.label}
          </Badge>
        </div>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{milestone.description}</p>
        <div className="mt-3 space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">{doneCount} de {milestone.phases.length} fases</span>
            <span className="font-semibold font-mono text-violet-700">{milestone.progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${milestone.progress}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <Separator className="bg-slate-100" />
      <CardContent className="px-3 py-3">
        <ScrollArea className={expanded ? "" : "max-h-52"}>
          <div className="space-y-0.5">
            {milestone.phases.map((p) => <PhaseRow key={p.id} phase={p} />)}
          </div>
        </ScrollArea>
        {!expanded && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <span className="flex items-center gap-1 text-xs text-violet-600 font-medium">
              Clica no tab para ver completo <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GlobalHeader() {
  const total = MILESTONES.reduce((s, m) => s + m.phases.length, 0);
  const done  = MILESTONES.reduce((s, m) => s + m.phases.filter((p) => p.status === "done").length, 0);
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="mb-5 p-5 rounded-2xl bg-gradient-to-br from-violet-600 via-violet-600 to-violet-700 text-white">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-mono font-semibold uppercase tracking-widest text-violet-200 mb-0.5">
            Olyvia CRM · Workspace
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Central de Planos</h1>
          <p className="text-sm text-violet-200 mt-1">
            {MILESTONES.length} milestones · {total} fases · Junho 2026
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-4xl font-bold font-mono">{pct}<span className="text-2xl">%</span></p>
          <p className="text-xs text-violet-200">{done}/{total} fases</p>
        </div>
      </div>
      <div className="w-full h-2.5 bg-violet-800/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/80 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-xs text-violet-200">
        <GitBranch className="w-3.5 h-3.5" />
        <span>Progresso global acumulado</span>
      </div>
    </div>
  );
}

function StatsRow() {
  const total      = MILESTONES.reduce((s, m) => s + m.phases.length, 0);
  const done       = MILESTONES.reduce((s, m) => s + m.phases.filter((p) => p.status === "done").length, 0);
  const inProgress = MILESTONES.reduce((s, m) => s + m.phases.filter((p) => p.status === "in_progress").length, 0);

  const stats = [
    { label: "Global",      value: `${Math.round((done / total) * 100)}%`, sub: `${done}/${total} fases`, icon: <BarChart3 className="w-4 h-4 text-violet-400" />,  bg: "bg-violet-50 border-violet-100", val: "text-violet-700" },
    { label: "Concluídas",  value: done,       sub: "fases prontas",  icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, bg: "bg-emerald-50 border-emerald-100", val: "text-emerald-700" },
    { label: "Em curso",    value: inProgress, sub: "fases activas",  icon: <Clock className="w-4 h-4 text-blue-400" />,          bg: "bg-blue-50 border-blue-100",       val: "text-blue-700" },
    { label: "Milestones",  value: MILESTONES.length, sub: `${MILESTONES.filter((m) => m.status === "in_progress").length} activos`, icon: <Layers className="w-4 h-4 text-slate-400" />, bg: "bg-slate-50 border-slate-100", val: "text-slate-700" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {stats.map((s) => (
        <Card key={s.label} className={`border ${s.bg}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-medium">{s.label}</span>
              {s.icon}
            </div>
            <p className={`text-2xl font-bold font-mono ${s.val}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PlansCentral() {
  return (
    <>
      <div
        className="max-w-5xl mx-auto px-4 py-6"
        style={{ fontFamily: "'Fira Sans', system-ui, sans-serif" }}
      >
        <GlobalHeader />
        <StatsRow />

        <Tabs defaultValue="all">
          <TabsList className="bg-slate-100 p-1 rounded-lg h-auto flex flex-wrap gap-1 mb-4">
            <TabsTrigger value="all" className="text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
              Todos
            </TabsTrigger>
            {MILESTONES.map((m) => (
              <TabsTrigger
                key={m.id}
                value={m.id}
                className="text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <span className="font-mono text-slate-400 mr-1">M{m.code}</span>
                {m.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {MILESTONES.map((m) => <MilestoneCard key={m.id} milestone={m} />)}
            </div>
          </TabsContent>

          {MILESTONES.map((m) => (
            <TabsContent key={m.id} value={m.id}>
              <MilestoneCard milestone={m} expanded />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}
