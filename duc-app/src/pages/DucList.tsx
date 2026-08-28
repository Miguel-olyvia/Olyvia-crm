import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  Combobox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Spinner,
  cx,
} from "../components/ui";
import { Plus, Search, Trash, FileText, Building, ChevronRight, Sheet, Clock, AlertTriangle, ClientSketch, X, ExternalLink } from "../components/icons";
import { DucKanban } from "../components/DucKanban";
import { StatusSelect } from "../components/StatusSelect";
import { Celebration } from "../components/Celebration";
import { fetchDismissedClientIds, dismissClient, restoreClient } from "../lib/dismissed";
import {
  STATUS_LABELS,
  VARIANT_LABELS,
  variantForOrgName,
  missingRequiredFields,
  type DucStage,
} from "../lib/ducSchema";
import { entityDisplayName } from "../lib/names";
import { fetchClientOlyviaInfo, prefillBlocksFromInfo } from "../lib/clientInfo";
import { fetchEffectiveStages } from "../lib/ducConfig";
import { isStageResolved } from "../lib/types";
import type { ClientOption, DucRecord, DucStatus, TrackingEntry } from "../lib/types";

function entityName(row: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return entityDisplayName(row);
}

function doneCount(tracking: TrackingEntry[] | null | undefined): number {
  return (tracking ?? []).filter((t) => isStageResolved(t.state)).length;
}

// Base da plataforma Olyvia (o CRM) — para deep-links como "Ver proposta".
const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia-ai.com";

/**
 * Menu de ações por DUC (lista): abrir o DUC, ver a proposta ligada na Olyvia
 * (o id da proposta é obtido on-demand ao abrir), e ver os contratos do cliente.
 */
function DucActionsMenu({ duc, onOpen }: { duc: DucRecord; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const openProposal = async () => {
    if (loadingProposal) return;
    if (!duc.client_id) {
      window.open(`${OLYVIA_URL}/proposals`, "_blank", "noopener");
      setOpen(false);
      return;
    }
    setLoadingProposal(true);
    const info = await fetchClientOlyviaInfo(duc.client_id);
    setLoadingProposal(false);
    setOpen(false);
    const url = info?.proposalId
      ? `${OLYVIA_URL}/proposals?open=${info.proposalId}`
      : `${OLYVIA_URL}/proposals`;
    window.open(url, "_blank", "noopener");
  };

  const itemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50";

  return (
    <div ref={ref} className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Ações"
        aria-label="Ações do DUC"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-elevated animate-in-pop">
          <button type="button" className={itemCls} onClick={() => { setOpen(false); onOpen(duc.id); }}>
            <FileText width={16} height={16} className="text-slate-400" /> Abrir DUC
          </button>
          <button type="button" className={cx(itemCls, loadingProposal && "opacity-60")} onClick={() => void openProposal()}>
            <ExternalLink width={16} height={16} className="text-slate-400" />
            {loadingProposal ? "A abrir proposta…" : "Ver proposta na Olyvia"}
          </button>
          <a
            href={`${OLYVIA_URL}/client-contracts`}
            target="_blank"
            rel="noreferrer"
            className={itemCls}
            onClick={() => setOpen(false)}
          >
            <Building width={16} height={16} className="text-slate-400" /> Ver contratos
          </a>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-50 text-slate-600 ring-slate-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  delivered: "bg-blue-50 text-blue-700 ring-blue-200",
  closed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

/** Dias inteiros desde uma data ISO (nunca negativo). */
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** Badge "aberto há X dias" com cor por antiguidade (verde→âmbar→vermelho). */
function OpenBadge({ duc }: { duc: DucRecord }) {
  if (duc.status === "closed") {
    return <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Fechado</Badge>;
  }
  const d = daysSince(duc.created_at);
  const tone =
    d <= 7
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : d <= 30
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-red-50 text-red-700 ring-red-200";
  const label = d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`;
  return (
    <Badge className={tone}>
      <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </Badge>
  );
}

/**
 * Clientes da organização COM contrato válido (assinado/ativo). Visibilidade por
 * ÁREA: mostra todos os clientes com contrato da org a que o utilizador tem
 * acesso — não apenas os que lhe estão associados. Arranca dos próprios
 * `client_contracts` (a RLS por membership é a fronteira real de segurança).
 */
async function fetchValidContractClients(orgId: string): Promise<ClientOption[]> {
  const { data: contracts } = await supabase
    .from("client_contracts")
    .select("client_id, entity_id, assigned_to, signature_date, created_at")
    .eq("organization_id", orgId)
    .in("status", ["signed", "active"])
    .is("deleted_at", null)
    .not("client_id", "is", null)
    .limit(1000);

  // Um registo por cliente (dedupe), guardando entity_id/assigned_to/data do contrato.
  const byClient = new Map<
    string,
    { entity_id: string | null; assigned_to: string | null; since: string | null }
  >();
  (contracts ?? []).forEach((c) => {
    const cid = c.client_id as string;
    if (!cid) return;
    if (!byClient.has(cid)) {
      byClient.set(cid, {
        entity_id: (c.entity_id as string) ?? null,
        assigned_to: (c.assigned_to as string) ?? null,
        since: ((c.signature_date as string) ?? (c.created_at as string)) ?? null,
      });
    }
  });

  const clientIds = Array.from(byClient.keys());
  if (clientIds.length === 0) return [];

  // Preenche entity_id/assigned_to em falta a partir de anew_clients (best-effort).
  const missingEntity = clientIds.filter((id) => !byClient.get(id)!.entity_id);
  if (missingEntity.length > 0) {
    const { data: clients } = await supabase
      .from("anew_clients")
      .select("id, entity_id, assigned_to")
      .in("id", missingEntity);
    (clients ?? []).forEach((c) => {
      const rec = byClient.get(c.id as string);
      if (rec) {
        rec.entity_id = rec.entity_id ?? ((c.entity_id as string) ?? null);
        rec.assigned_to = rec.assigned_to ?? ((c.assigned_to as string) ?? null);
      }
    });
  }

  const entityIds = Array.from(
    new Set(
      Array.from(byClient.values())
        .map((v) => v.entity_id)
        .filter(Boolean) as string[]
    )
  );
  const nameByEntity = new Map<string, string>();
  if (entityIds.length > 0) {
    const { data: ents } = await supabase
      .from("anew_entities")
      .select("id, display_name, first_name, last_name")
      .in("id", entityIds);
    (ents ?? []).forEach((e) => nameByEntity.set(e.id as string, entityName(e)));
  }

  return clientIds.map((id) => {
    const rec = byClient.get(id)!;
    return {
      id,
      entity_id: rec.entity_id,
      assigned_to: rec.assigned_to,
      since: rec.since,
      name: (rec.entity_id ? nameByEntity.get(rec.entity_id) : undefined) ?? "Cliente sem nome",
    };
  });
}

/** Tamanho de página do carregamento server-side dos DUCs. */
const PAGE_SIZE = 20;

/**
 * Resolve o nome de cliente (via `anew_clients` → `anew_entities`) para as
 * linhas dadas. Devolve um Map client_id → nome. Reutilizável no load inicial
 * e no "Carregar mais".
 */
async function resolveClientNames(rows: DucRecord[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];
  if (clientIds.length === 0) return map;

  const { data: clients } = await supabase
    .from("anew_clients")
    .select("id, entity_id")
    .in("id", clientIds);
  const entityIds = Array.from(
    new Set((clients ?? []).map((c) => c.entity_id as string).filter(Boolean))
  );
  const nameByEntity = new Map<string, string>();
  if (entityIds.length > 0) {
    const { data: ents } = await supabase
      .from("anew_entities")
      .select("id, display_name, first_name, last_name")
      .in("id", entityIds);
    (ents ?? []).forEach((e) => nameByEntity.set(e.id as string, entityName(e)));
  }
  (clients ?? []).forEach((c) => {
    map.set(c.id as string, nameByEntity.get(c.entity_id as string) ?? "Cliente");
  });
  return map;
}

type View = "ducs" | "pending" | "kanban";

export default function DucList() {
  const { businessUserId, activeOrgId, orgs } = useAuth();
  const navigate = useNavigate();
  const activeOrgName = orgs.find((o) => o.id === activeOrgId)?.name ?? null;
  const [view, setView] = useState<View>("ducs");

  const [loading, setLoading] = useState(true);
  const [ducs, setDucs] = useState<DucRecord[]>([]);
  const [totalDucs, setTotalDucs] = useState(0);
  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [presetClient, setPresetClient] = useState<ClientOption | null>(null);
  const [deleting, setDeleting] = useState<DucRecord | null>(null);
  const [celebrateId, setCelebrateId] = useState<string | null>(null);

  const [pending, setPending] = useState<ClientOption[]>([]);
  const [dismissedClients, setDismissedClients] = useState<ClientOption[]>([]);
  const [contractCount, setContractCount] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [variantFilter, setVariantFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<string>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Kanban: etapas efetivas da variante da org (full, para validar obrigatórios)
  // + movimento pendente + movimento bloqueado por campos obrigatórios em falta.
  const [kanbanStages, setKanbanStages] = useState<DucStage[]>([]);
  const [pendingMove, setPendingMove] = useState<{ duc: DucRecord; targetStage: number } | null>(
    null
  );
  const [blockedMove, setBlockedMove] = useState<{ targetStage: number; missing: string[] } | null>(
    null
  );

  const load = useCallback(async () => {
    if (!activeOrgId) {
      setDucs([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Primeira página: 20 DUCs mais recentes (por updated_at desc) + total exato.
    const { data, error, count } = await supabase
      .from("anew_client_ducs")
      .select(
        "id, organization_id, root_organization_id, client_id, duc_number, title, variant, current_stage, status, assigned_to, blocks, tracking, created_by, created_at, updated_at, deleted_at",
        { count: "exact" }
      )
      .eq("organization_id", activeOrgId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[DUC] erro a carregar lista:", error);
      setDucs([]);
      setTotalDucs(0);
      setHasMore(false);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as DucRecord[];
    const total = count ?? rows.length;
    setDucs(rows);
    setTotalDucs(total);
    setClientNames(await resolveClientNames(rows));
    // Há mais se ainda não carregámos o total (evita o "carregar mais" fantasma
    // quando o total é múltiplo exato de PAGE_SIZE).
    setHasMore(rows.length < total);
    setLoading(false);
  }, [activeOrgId]);

  const loadMore = useCallback(async () => {
    if (!activeOrgId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    // Página seguinte a partir do nº de DUCs já carregados.
    const from = ducs.length;
    const { data, error } = await supabase
      .from("anew_client_ducs")
      .select(
        "id, organization_id, root_organization_id, client_id, duc_number, title, variant, current_stage, status, assigned_to, blocks, tracking, created_by, created_at, updated_at, deleted_at"
      )
      .eq("organization_id", activeOrgId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[DUC] erro a carregar mais:", error);
      setLoadingMore(false);
      return;
    }

    const rows = (data ?? []) as DucRecord[];
    setDucs((prev) => [...prev, ...rows]);
    // Funde os nomes novos com os já resolvidos (não substitui).
    const newNames = await resolveClientNames(rows);
    setClientNames((prev) => new Map([...prev, ...newNames]));
    setHasMore(from + rows.length < totalDucs);
    setLoadingMore(false);
  }, [activeOrgId, ducs.length, hasMore, loadingMore, totalDucs]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPending = useCallback(async () => {
    if (!activeOrgId || !businessUserId) {
      setPending([]);
      return;
    }
    setLoadingPending(true);
    const valid = await fetchValidContractClients(activeOrgId);
    // Client_ids que JÁ têm DUC — consulta server-side (não depende da paginação).
    const { data: withDucRows, error: withDucErr } = await supabase
      .from("anew_client_ducs")
      .select("client_id")
      .eq("organization_id", activeOrgId)
      .is("deleted_at", null)
      .not("client_id", "is", null)
      .limit(5000);
    if (withDucErr) {
      // Não mostrar todos como "por documentar" por causa de um erro de query.
      // eslint-disable-next-line no-console
      console.error("[DUC] erro a apurar DUCs existentes:", withDucErr);
      setContractCount(valid.length);
      setPending([]);
      setLoadingPending(false);
      return;
    }
    const withDuc = new Set((withDucRows ?? []).map((r) => r.client_id as string));
    setContractCount(valid.length);
    // Exclui os "dispensados" (não precisam de DUC) da lista de por documentar.
    const dismissed = await fetchDismissedClientIds(activeOrgId);
    const notDocumented = valid.filter((c) => !withDuc.has(c.id));
    setPending(notDocumented.filter((c) => !dismissed.has(c.id)));
    setDismissedClients(notDocumented.filter((c) => dismissed.has(c.id)));
    setLoadingPending(false);
  }, [activeOrgId, businessUserId]);

  const handleDismiss = useCallback(
    async (c: ClientOption) => {
      if (!activeOrgId) return;
      await dismissClient(c.id, activeOrgId, businessUserId);
      void loadPending();
    },
    [activeOrgId, businessUserId, loadPending]
  );
  const handleRestore = useCallback(
    async (c: ClientOption) => {
      if (!activeOrgId) return;
      await restoreClient(c.id, activeOrgId);
      void loadPending();
    },
    [activeOrgId, loadPending]
  );

  useEffect(() => {
    if (view === "pending") void loadPending();
  }, [view, loadPending]);

  // Carrega as etapas (colunas do Kanban) para a variante da organização ativa.
  useEffect(() => {
    if (view !== "kanban" || !activeOrgId) return;
    let alive = true;
    void fetchEffectiveStages(activeOrgId, variantForOrgName(activeOrgName)).then((eff) => {
      if (alive) setKanbanStages(eff.stages);
    });
    return () => {
      alive = false;
    };
  }, [view, activeOrgId, activeOrgName]);

  // Pedido de mover um DUC para uma etapa (arrastar no Kanban) → confirma antes.
  const requestMove = useCallback(
    (ducId: string, targetStageNo: number) => {
      const duc = ducs.find((d) => d.id === ducId);
      if (!duc || duc.current_stage === targetStageNo) return;

      // Mover para a frente fecha em cascata as etapas anteriores → valida que os
      // campos OBRIGATÓRIOS dessas etapas estão preenchidos antes de deixar fechar.
      const missing: string[] = [];
      for (const s of kanbanStages) {
        if (s.no >= targetStageNo) continue;
        const gaps = missingRequiredFields(s, duc.variant, duc.blocks?.[s.key]);
        for (const f of gaps) missing.push(`${s.no}. ${s.title.split(" — ")[0]}: ${f.label}`);
      }
      if (missing.length > 0) {
        setBlockedMove({ targetStage: targetStageNo, missing });
        return;
      }
      setPendingMove({ duc, targetStage: targetStageNo });
    },
    [ducs, kanbanStages]
  );

  // Aplica o movimento: fecha em cascata as etapas anteriores à alvo e move para ela.
  const applyMove = useCallback(async () => {
    if (!pendingMove) return;
    const { duc, targetStage } = pendingMove;
    const today = new Date().toISOString().slice(0, 10);
    const byStage = new Map((duc.tracking ?? []).map((t) => [t.stage, t]));
    // Reconcilia TODAS as etapas (trata avanço E recuo sem deixar fechos a mais):
    // anteriores à alvo = fechadas; a alvo e seguintes = pendentes (assinatura limpa).
    const stageNos = kanbanStages.length
      ? kanbanStages.map((s) => s.no)
      : (duc.tracking ?? []).map((t) => t.stage);
    const tracking = stageNos.map((no) => {
      const ex = byStage.get(no);
      if (no < targetStage) {
        return { ...(ex ?? { stage: no }), stage: no, state: "done" as const, date: ex?.date ?? today };
      }
      return { ...(ex ?? { stage: no }), stage: no, state: "pending" as const, date: null, signed_by: null };
    });

    const { error } = await supabase
      .from("anew_client_ducs")
      .update({ current_stage: targetStage, tracking })
      .eq("id", duc.id);
    setPendingMove(null);
    if (!error) void load();
  }, [pendingMove, load, kanbanStages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ducs.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (variantFilter !== "all" && d.variant !== variantFilter) return false;
      if (!q) return true;
      const name = (d.client_id ? clientNames.get(d.client_id) : "") ?? "";
      return (
        name.toLowerCase().includes(q) ||
        (d.title ?? "").toLowerCase().includes(q) ||
        (d.duc_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [ducs, search, statusFilter, variantFilter, clientNames]);

  // Ordenação client-side (sobre o conjunto já carregado/filtrado) — clicar num
  // cabeçalho alterna asc/desc.
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (d: DucRecord): string | number => {
      switch (sortKey) {
        case "number":
          return d.duc_number ?? "";
        case "client":
          return ((d.client_id ? clientNames.get(d.client_id) : d.title) ?? "").toLowerCase();
        case "variant":
          return d.variant;
        case "progress":
          return doneCount(d.tracking) / (d.tracking?.length || 1);
        case "status":
          return d.status;
        case "open":
          return new Date(d.created_at).getTime();
        default:
          return new Date(d.updated_at).getTime();
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [filtered, sortKey, sortDir, clientNames]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "updated" || key === "open" || key === "progress" ? "desc" : "asc");
    }
  };

  // Mudar o estado de um DUC diretamente na lista (persiste + atualiza local).
  const changeDucStatus = async (id: string, status: DucStatus) => {
    const { error } = await supabase.from("anew_client_ducs").update({ status }).eq("id", id);
    if (!error) setDucs((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase
      .from("anew_client_ducs")
      .update({ deleted_at: new Date().toISOString(), deleted_by: businessUserId })
      .eq("id", deleting.id);
    setDeleting(null);
    if (!error) void load();
  };

  const openCreate = (client: ClientOption | null) => {
    setPresetClient(client);
    setShowCreate(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Documento Único de Cliente
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Vês os clientes da tua área com contrato assinado.
          </p>
        </div>
        <Button
          onClick={() => openCreate(null)}
          disabled={!activeOrgId}
          className="w-full justify-center sm:w-auto"
        >
          <Plus width={16} height={16} /> Novo DUC
        </Button>
      </div>

      {/* Abas — largura total e distribuídas em mobile; inline em desktop */}
      <div className="flex w-full rounded-lg border border-slate-200 bg-white p-1 shadow-sm sm:inline-flex sm:w-auto">
        <button
          onClick={() => setView("ducs")}
          className={
            "inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-3.5 " +
            (view === "ducs" ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")
          }
        >
          <FileText width={15} height={15} className="shrink-0" /> DUCs {totalDucs > 0 && `(${totalDucs})`}
        </button>
        <button
          onClick={() => setView("kanban")}
          className={
            "inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-3.5 " +
            (view === "kanban" ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")
          }
        >
          <Sheet width={15} height={15} className="shrink-0" /> Kanban
        </button>
        <button
          onClick={() => setView("pending")}
          className={
            "inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-3.5 " +
            (view === "pending" ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")
          }
        >
          <Building width={15} height={15} className="shrink-0" />{" "}
          <span className="sm:hidden">Pendentes</span>
          <span className="hidden sm:inline">Por documentar</span>
        </button>
      </div>

      {view === "ducs" ? (
        <DucsView
          loading={loading}
          ducs={ducs}
          filtered={sorted}
          clientNames={clientNames}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          variantFilter={variantFilter}
          setVariantFilter={setVariantFilter}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          activeOrgId={activeOrgId}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onOpen={(id) => navigate(`/duc/${id}`)}
          onNew={() => openCreate(null)}
          onDelete={setDeleting}
          onStatusChange={changeDucStatus}
        />
      ) : view === "kanban" ? (
        <div className="space-y-3">
          <div className="relative w-full sm:max-w-xs">
            <Search
              width={16}
              height={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              className="pl-9"
              placeholder="Pesquisar no quadro…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {loading ? (
            <Card>
              <Spinner label="A carregar Kanban…" />
            </Card>
          ) : kanbanStages.length === 0 ? (
            <Card>
              <Spinner label="A carregar etapas…" />
            </Card>
          ) : (
            <>
              {/* Indício de que o quadro faz scroll lateral (só em ecrãs estreitos) */}
              {kanbanStages.length > 1 && (
                <p className="flex items-center gap-1 text-xs text-slate-400 sm:hidden">
                  <ChevronRight width={13} height={13} className="animate-pulse" />
                  Desliza para o lado para ver as {kanbanStages.length} etapas
                </p>
              )}
              <DucKanban
                ducs={filtered}
                clientNames={clientNames}
                stages={kanbanStages}
                onDropCard={requestMove}
                onOpen={(id) => navigate(`/duc/${id}`)}
              />
            </>
          )}
        </div>
      ) : (
        <PendingView
          loading={loadingPending}
          pending={pending}
          dismissedClients={dismissedClients}
          contractCount={contractCount}
          ducCount={Math.max(0, contractCount - pending.length - dismissedClients.length)}
          onCreate={(c) => openCreate(c)}
          onDismiss={handleDismiss}
          onRestore={handleRestore}
        />
      )}

      {showCreate && (
        <CreateDucModal
          orgId={activeOrgId!}
          orgName={activeOrgName}
          businessUserId={businessUserId!}
          initialClient={presetClient}
          onClose={() => {
            setShowCreate(false);
            setPresetClient(null);
          }}
          onCreated={(id) => {
            // Fecha o modal e festeja antes de abrir o novo DUC.
            setShowCreate(false);
            setPresetClient(null);
            setCelebrateId(id);
          }}
        />
      )}

      {celebrateId && (
        <Celebration
          onDone={() => {
            const id = celebrateId;
            setCelebrateId(null);
            navigate(`/duc/${id}`);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Eliminar DUC"
          message={
            <>
              Eliminar o DUC <span className="font-medium text-slate-800">{deleting.duc_number}</span>?
              Fica arquivado (soft-delete) e pode ser recuperado na base de dados.
            </>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      {pendingMove && (
        <ConfirmDialog
          title="Mover DUC no fluxo"
          tone="brand"
          confirmLabel={`Mover para etapa ${pendingMove.targetStage}`}
          message={
            <>
              Mover{" "}
              <span className="font-medium text-slate-800">
                {pendingMove.duc.client_id
                  ? clientNames.get(pendingMove.duc.client_id) ?? "este DUC"
                  : pendingMove.duc.title ?? "este DUC"}
              </span>{" "}
              para a etapa{" "}
              <span className="font-medium text-slate-800">
                {pendingMove.targetStage}
                {kanbanStages.find((s) => s.no === pendingMove.targetStage)
                  ? `. ${kanbanStages
                      .find((s) => s.no === pendingMove.targetStage)!
                      .title.split(" — ")[0]}`
                  : ""}
              </span>
              {pendingMove.targetStage > 1 && (
                <>
                  {" "}
                  — isto <span className="font-medium text-slate-800">fecha em cascata</span> as
                  etapas 1 a {pendingMove.targetStage - 1}.
                </>
              )}{" "}
              Continuar?
            </>
          }
          onCancel={() => setPendingMove(null)}
          onConfirm={() => void applyMove()}
        />
      )}

      {blockedMove && (
        <Modal
          title="Faltam campos obrigatórios"
          size="sm"
          onClose={() => setBlockedMove(null)}
          footer={<Button onClick={() => setBlockedMove(null)}>Entendi</Button>}
        >
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Não é possível mover para a etapa {blockedMove.targetStage}: as etapas anteriores têm
              campos obrigatórios por preencher.
            </p>
            <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-100">
              {blockedMove.missing.map((m, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-amber-500">•</span> {m}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400">
              Abre o DUC, preenche os campos e tenta de novo.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- DUCs view --

function DucsView({
  loading,
  ducs,
  filtered,
  clientNames,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  variantFilter,
  setVariantFilter,
  sortKey,
  sortDir,
  onSort,
  activeOrgId,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  onNew,
  onDelete,
  onStatusChange,
}: {
  loading: boolean;
  ducs: DucRecord[];
  filtered: DucRecord[];
  clientNames: Map<string, string>;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  variantFilter: string;
  setVariantFilter: (v: string) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  activeOrgId: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (d: DucRecord) => void;
  onStatusChange: (id: string, status: DucStatus) => void;
}) {
  // Só faz sentido "Carregar mais" quando não há pesquisa/filtro ativo a
  // esconder resultados (a filtragem é client-side sobre o já carregado).
  const noActiveFilter =
    search.trim() === "" && statusFilter === "all" && variantFilter === "all";
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:min-w-[220px] sm:flex-1">
          <Search
            width={16}
            height={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            className="pl-9"
            placeholder="Pesquisar por cliente, título ou nº…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Combobox
            className="flex-1 sm:w-48 sm:flex-none"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Todos os estados" },
              ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
            ]}
          />
          <Combobox
            className="flex-1 sm:w-48 sm:flex-none"
            value={variantFilter}
            onChange={setVariantFilter}
            options={[
              { value: "all", label: "Todas as variantes" },
              ...Object.entries(VARIANT_LABELS).map(([k, v]) => ({ value: k, label: v })),
            ]}
          />
        </div>
      </div>

      {loading ? (
        <Card>
          <Spinner label="A carregar DUCs…" />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText width={22} height={22} />}
            title={ducs.length === 0 ? "Ainda não há DUCs" : "Sem resultados"}
            description={
              ducs.length === 0
                ? "Cria o primeiro DUC para um cliente da área com contrato."
                : "Nenhum DUC corresponde aos filtros aplicados."
            }
            action={
              ducs.length === 0 ? (
                <Button onClick={onNew} disabled={!activeOrgId}>
                  <Plus width={16} height={16} /> Novo DUC
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {/* Mobile: cartões tocáveis (a tabela de 7 colunas não cabe no telemóvel) */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map((d) => {
              const done = doneCount(d.tracking);
              const total = d.tracking?.length || 9;
              return (
                <Card
                  key={d.id}
                  className="cursor-pointer p-4 transition-colors active:bg-slate-50"
                  onClick={() => onOpen(d.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-800">
                        {d.client_id ? clientNames.get(d.client_id) ?? "Cliente" : d.title ?? "—"}
                      </div>
                      {d.title && d.client_id && d.title !== (clientNames.get(d.client_id) ?? "") && (
                        <div className="truncate text-xs text-slate-400">{d.title}</div>
                      )}
                      <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                        {d.duc_number ?? "—"}
                      </div>
                    </div>
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <StatusSelect
                        value={d.status}
                        onChange={(s) => onStatusChange(d.id, s)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Badge className="min-w-0 max-w-[45%] bg-brand-50 text-brand-800 ring-brand-100">
                      <span className="truncate">{VARIANT_LABELS[d.variant]}</span>
                    </Badge>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:w-20">
                        <div
                          className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${(done / total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{done}/{total}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <OpenBadge duc={d} />
                      <span className="text-xs text-slate-400">
                        {new Date(d.updated_at).toLocaleDateString("pt-PT")}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <DucActionsMenu duc={d} onOpen={onOpen} />
                      <button
                        type="button"
                        title="Eliminar"
                        aria-label="Eliminar DUC"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 active:bg-red-50 active:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(d);
                        }}
                      >
                        <Trash width={16} height={16} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop: tabela completa */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  {(
                    [
                      ["number", "Nº"],
                      ["client", "Cliente / Título"],
                      ["variant", "Variante"],
                      ["progress", "Progresso"],
                      ["status", "Estado"],
                      ["open", "Aberto"],
                      ["updated", "Atualizado"],
                    ] as Array<[string, string]>
                  ).map(([key, label]) => (
                    <th key={key} className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSort(key)}
                        className={cx(
                          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-slate-700",
                          sortKey === key && "text-brand"
                        )}
                      >
                        {label}
                        <span className="text-[9px] leading-none">
                          {sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => {
                  const done = doneCount(d.tracking);
                  const total = d.tracking?.length || 9;
                  return (
                    <tr
                      key={d.id}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/70"
                      onClick={() => onOpen(d.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {d.duc_number ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {d.client_id ? clientNames.get(d.client_id) ?? "Cliente" : d.title ?? "—"}
                        </div>
                        {d.title && d.client_id && d.title !== (clientNames.get(d.client_id) ?? "") && (
                          <div className="text-xs text-slate-400">{d.title}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-brand-50 text-brand-800 ring-brand-100">
                          {VARIANT_LABELS[d.variant]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-brand transition-all"
                              style={{ width: `${(done / total) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-slate-500">{done}/{total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <StatusSelect value={d.status} onChange={(s) => onStatusChange(d.id, s)} />
                      </td>
                      <td className="px-4 py-3">
                        <OpenBadge duc={d} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {new Date(d.updated_at).toLocaleDateString("pt-PT")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DucActionsMenu duc={d} onOpen={onOpen} />
                          <button
                            type="button"
                            title="Eliminar"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(d);
                            }}
                          >
                            <Trash width={15} height={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Carregar mais: só quando há outra página e sem filtro a esconder resultados */}
          {hasMore && noActiveFilter && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? "A carregar…" : "Carregar mais"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Pending view --

function StatRow({
  contractCount,
  ducCount,
  pendingCount,
}: {
  contractCount: number;
  ducCount: number;
  pendingCount: number;
}) {
  // Destaca "Por documentar" quando há pendentes: acento âmbar (>0) ou vermelho
  // se o volume for elevado. Cada cartão tem ícone próprio.
  const alert = pendingCount > 0;
  const items: Array<{
    label: string;
    value: number;
    icon: JSX.Element;
    accent: string; // cor do valor + ícone
    ring: string; // moldura do cartão (destaque)
    iconBg: string; // fundo do ícone
  }> = [
    {
      label: "Clientes com contrato",
      value: contractCount,
      icon: <Building width={16} height={16} />,
      accent: "text-slate-800",
      ring: "ring-slate-200",
      iconBg: "bg-slate-100 text-slate-500",
    },
    {
      label: "Com DUC",
      value: ducCount,
      icon: <FileText width={16} height={16} />,
      accent: "text-emerald-600",
      ring: "ring-emerald-100",
      iconBg: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Por documentar",
      value: pendingCount,
      icon: alert ? <AlertTriangle width={16} height={16} /> : <FileText width={16} height={16} />,
      accent: alert ? "text-amber-600" : "text-slate-800",
      ring: alert ? "ring-2 ring-amber-200" : "ring-slate-200",
      iconBg: alert ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500",
    },
  ];
  const pct = contractCount > 0 ? Math.round((ducCount / contractCount) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {items.map((s) => (
          <Card
            key={s.label}
            className={cx(
              "p-3.5 transition-shadow duration-150 hover:shadow-elevated sm:p-4",
              s.ring
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={cx("text-2xl font-semibold tabular-nums sm:text-3xl", s.accent)}>
                {s.value}
              </div>
              <span
                className={cx(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  s.iconBg
                )}
              >
                {s.icon}
              </span>
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px]">
              <span className="truncate">{s.label}</span>
            </div>
          </Card>
        ))}
      </div>
      {/* Barra de cobertura — quantos clientes já têm DUC */}
      <div className="space-y-1 px-0.5">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-medium tabular-nums text-slate-600">{pct}%</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{ducCount} documentados</span>
          <span>{pendingCount > 0 ? `${pendingCount} por documentar` : "tudo documentado"}</span>
        </div>
      </div>
    </div>
  );
}

/** Tom (classes) do badge de urgência a partir dos dias sem DUC. */
function urgencyTone(days: number): { badge: string; avatar: string } {
  if (days <= 7) {
    return {
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      avatar: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    };
  }
  if (days <= 30) {
    return {
      badge: "bg-amber-50 text-amber-700 ring-amber-200",
      avatar: "bg-amber-50 text-amber-600 ring-amber-100",
    };
  }
  return {
    badge: "bg-red-50 text-red-700 ring-red-200",
    avatar: "bg-red-50 text-red-600 ring-red-100",
  };
}

/** Iniciais do cliente para o avatar (fallback a "?"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

function PendingView({
  loading,
  pending,
  dismissedClients,
  contractCount,
  ducCount,
  onCreate,
  onDismiss,
  onRestore,
}: {
  loading: boolean;
  pending: ClientOption[];
  dismissedClients: ClientOption[];
  contractCount: number;
  ducCount: number;
  onCreate: (c: ClientOption) => void;
  onDismiss: (c: ClientOption) => void;
  onRestore: (c: ClientOption) => void;
}) {
  const [q, setQ] = useState("");
  // Hero do resumo pode ser fechado (só nesta sessão) — não é um alerta permanente.
  const [heroClosed, setHeroClosed] = useState(false);

  // Ordena por urgência: mais dias sem DUC primeiro. Sem `since` vai para o fim.
  const sorted = useMemo(() => {
    return [...pending].sort((a, b) => {
      const da = a.since ? daysSince(a.since) : -1;
      const db = b.since ? daysSince(b.since) : -1;
      return db - da; // descendente por dias → mais antigo primeiro
    });
  }, [pending]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? sorted.filter((c) => c.name.toLowerCase().includes(s)) : sorted;
  }, [sorted, q]);

  // Cliente mais antigo à espera de DUC (para o hero).
  const oldest = useMemo(() => {
    let best: { c: ClientOption; days: number } | null = null;
    for (const c of pending) {
      if (!c.since) continue;
      const d = daysSince(c.since);
      if (!best || d > best.days) best = { c, days: d };
    }
    return best;
  }, [pending]);

  if (loading) {
    return (
      <Card>
        <Spinner label="A procurar clientes por documentar…" />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <StatRow contractCount={contractCount} ducCount={ducCount} pendingCount={pending.length} />
      {pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClientSketch width={24} height={24} />}
            title="Nada por documentar"
            description="Todos os clientes da área com contrato válido já têm DUC."
          />
        </Card>
      ) : (
        <>
          {/* Hero — resumo da área com o caso mais urgente em destaque (fechável) */}
          {!heroClosed && (
            <Card className="relative border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 ring-amber-100 sm:p-5">
              <button
                type="button"
                onClick={() => setHeroClosed(true)}
                aria-label="Fechar resumo"
                title="Fechar resumo"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-amber-500/70 transition-colors hover:bg-amber-100/70 hover:text-amber-700"
              >
                <X width={16} height={16} />
              </button>
              <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 sm:items-center">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 ring-1 ring-inset ring-amber-200">
                    <ClientSketch width={24} height={24} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 sm:text-lg">
                      {pending.length} cliente{pending.length === 1 ? "" : "s"} à espera de DUC
                    </p>
                    {oldest ? (
                      <p className="text-sm text-slate-500">
                        O mais antigo é{" "}
                        <span className="font-medium text-slate-700">{oldest.c.name}</span>, há{" "}
                        <span className="font-medium text-amber-700">{oldest.days} dias</span> sem
                        documentar.
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500">Contratos válidos ainda sem DUC.</p>
                    )}
                  </div>
                </div>
                {oldest && (
                  <Button
                    size="sm"
                    onClick={() => onCreate(oldest.c)}
                    className="w-full justify-center sm:w-auto"
                  >
                    <Plus width={14} height={14} /> Documentar o mais antigo
                  </Button>
                )}
              </div>
            </Card>
          )}

          <div className="relative">
            <Search
              width={16}
              height={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              className="pl-9"
              placeholder="Pesquisar cliente por documentar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search width={22} height={22} />}
                title="Sem resultados"
                description="Nenhum cliente por documentar corresponde à pesquisa."
              />
            </Card>
          ) : (
            <ul className="space-y-2.5">
              {filtered.map((c) => {
                const days = c.since ? daysSince(c.since) : null;
                const tone = urgencyTone(days ?? 0);
                const daysLabel =
                  days === null
                    ? "sem data de contrato"
                    : days === 0
                      ? "hoje"
                      : days === 1
                        ? "há 1 dia"
                        : `há ${days} dias`;
                return (
                  <li key={c.id}>
                    <Card className="flex flex-col gap-3 p-4 transition-shadow duration-150 hover:shadow-elevated sm:flex-row sm:items-center">
                      {/* Avatar com iniciais, cor por urgência */}
                      <span
                        className={cx(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ring-1 ring-inset",
                          days === null ? "bg-slate-100 text-slate-500 ring-slate-200" : tone.avatar
                        )}
                      >
                        {initials(c.name)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">{c.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {days === null ? (
                            <Badge className="bg-slate-50 text-slate-500 ring-slate-200">
                              <Clock width={12} height={12} className="mr-1" />
                              sem data · sem DUC
                            </Badge>
                          ) : (
                            <Badge className={tone.badge}>
                              <Clock width={12} height={12} className="mr-1" />
                              {daysLabel} sem DUC
                            </Badge>
                          )}
                          {days !== null && days > 30 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <AlertTriangle width={12} height={12} /> urgente
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex w-full gap-2 sm:w-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDismiss(c)}
                          title="Este cliente não precisa de DUC"
                          className="min-h-[40px] flex-1 justify-center whitespace-nowrap border border-slate-200 sm:min-h-0 sm:flex-none sm:border-0"
                        >
                          Não precisa
                        </Button>
                        <Button
                          size="sm"
                          className="min-h-[40px] flex-1 justify-center sm:min-h-0 sm:flex-none"
                          onClick={() => onCreate(c)}
                        >
                          <Plus width={14} height={14} /> Criar DUC{" "}
                          <ChevronRight width={14} height={14} />
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* Dispensados — clientes marcados como "não precisa de DUC" (reversível). */}
      {dismissedClients.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">
            Dispensados ({dismissedClients.length}){" "}
            <span className="font-normal text-slate-400">— não precisam de DUC</span>
          </p>
          <ul className="divide-y divide-slate-100">
            {dismissedClients.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                  {initials(c.name)}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-slate-500">{c.name}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onRestore(c)}
                >
                  Repor
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Create modal --

function CreateDucModal({
  orgId,
  orgName,
  businessUserId,
  initialClient,
  onClose,
  onCreated,
}: {
  orgId: string;
  orgName: string | null;
  businessUserId: string;
  initialClient?: ClientOption | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClientOption | null>(initialClient ?? null);
  // Variante derivada da empresa ativa (não é escolha manual).
  const variant = variantForOrgName(orgName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingClients(true);
      const list = await fetchValidContractClients(orgId);
      setClients(list);
      setLoadingClients(false);
    })();
  }, [orgId, businessUserId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [clients, search]);

  const create = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);

    const { count } = await supabase
      .from("anew_client_ducs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    const ducNumber = `DUC-${String((count ?? 0) + 1).padStart(4, "0")}`;

    // Rastreio semeado pela configuração efetiva da org (nº de etapas dinâmico),
    // não fixo em 9 — coerente com o editor de configuração.
    const eff = await fetchEffectiveStages(orgId, variant);
    const tracking = eff.stages.map((s) => ({ stage: s.no, state: "pending" as const }));

    // Pré-preenche os blocos com os dados que já existem na Olyvia.
    const info = await fetchClientOlyviaInfo(selected.id);
    const blocks = info ? prefillBlocksFromInfo(info) : {};

    const { data, error: insertError } = await supabase
      .from("anew_client_ducs")
      .insert({
        organization_id: orgId,
        client_id: selected.id,
        duc_number: ducNumber,
        title: selected.name,
        variant,
        status: "draft",
        current_stage: 1,
        created_by: businessUserId,
        assigned_to: selected.assigned_to ?? businessUserId,
        blocks,
        tracking,
      })
      .select("id")
      .single();

    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Não foi possível criar o DUC.");
      return;
    }
    onCreated(data.id as string);
  };

  return (
    <Modal
      title="Novo DUC"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={create} disabled={!selected || saving}>
            {saving ? "A criar…" : "Criar DUC"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Cliente" hint="Clientes da área com contrato válido (assinado ou ativo).">
          <Input
            placeholder="Pesquisar cliente…"
            value={selected ? selected.name : search}
            onChange={(e) => {
              setSelected(null);
              setSearch(e.target.value);
            }}
          />
        </Field>

        {!selected && (
          <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
            {loadingClients ? (
              <Spinner label="A carregar clientes…" />
            ) : filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400">
                Sem clientes com contrato válido nesta área.
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    setSelected(c);
                    setSearch("");
                  }}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        )}

        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-inset ring-slate-100">
          <span className="text-slate-500">Variante: </span>
          <span className="font-medium text-slate-800">{VARIANT_LABELS[variant]}</span>
          <span className="text-slate-400">
            {" "}
            — definida pela empresa{orgName ? ` (${orgName})` : ""}
          </span>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
