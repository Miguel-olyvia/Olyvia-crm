import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Plus, Search, Trash, FileText, Building, ChevronRight } from "../components/icons";
import { DucKanban } from "../components/DucKanban";
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
import type { ClientOption, DucRecord, TrackingEntry } from "../lib/types";

function entityName(row: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return entityDisplayName(row);
}

function doneCount(tracking: TrackingEntry[] | null | undefined): number {
  return (tracking ?? []).filter((t) => t.state === "done").length;
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
    .select("client_id, entity_id, assigned_to")
    .eq("organization_id", orgId)
    .in("status", ["signed", "active"])
    .is("deleted_at", null)
    .not("client_id", "is", null)
    .limit(1000);

  // Um registo por cliente (dedupe), guardando entity_id/assigned_to do contrato.
  const byClient = new Map<string, { entity_id: string | null; assigned_to: string | null }>();
  (contracts ?? []).forEach((c) => {
    const cid = c.client_id as string;
    if (!cid) return;
    if (!byClient.has(cid)) {
      byClient.set(cid, {
        entity_id: (c.entity_id as string) ?? null,
        assigned_to: (c.assigned_to as string) ?? null,
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

  const [pending, setPending] = useState<ClientOption[]>([]);
  const [contractCount, setContractCount] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [variantFilter, setVariantFilter] = useState<string>("all");

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
    setDucs(rows);
    setTotalDucs(count ?? rows.length);
    setClientNames(await resolveClientNames(rows));
    // Há mais se a página veio cheia (pode haver outra página a seguir).
    setHasMore(rows.length === PAGE_SIZE);
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
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [activeOrgId, ducs.length, hasMore, loadingMore]);

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
    const { data: withDucRows } = await supabase
      .from("anew_client_ducs")
      .select("client_id")
      .eq("organization_id", activeOrgId)
      .is("deleted_at", null)
      .not("client_id", "is", null)
      .limit(5000);
    const withDuc = new Set((withDucRows ?? []).map((r) => r.client_id as string));
    setContractCount(valid.length);
    setPending(valid.filter((c) => !withDuc.has(c.id)));
    setLoadingPending(false);
  }, [activeOrgId, businessUserId]);

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
    const tracking = [...(duc.tracking ?? [])];
    const markDone = (no: number) => {
      const i = tracking.findIndex((t) => t.stage === no);
      if (i >= 0) tracking[i] = { ...tracking[i], state: "done", date: tracking[i].date ?? today };
      else tracking.push({ stage: no, state: "done", date: today });
    };
    // Fecha todas as etapas ANTES da alvo (cascata para a frente).
    for (let n = 1; n < targetStage; n++) markDone(n);

    const { error } = await supabase
      .from("anew_client_ducs")
      .update({ current_stage: targetStage, tracking })
      .eq("id", duc.id);
    setPendingMove(null);
    if (!error) void load();
  }, [pendingMove, load]);

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Documento Único de Cliente
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Vês os clientes da tua área com contrato assinado.
          </p>
        </div>
        <Button onClick={() => openCreate(null)} disabled={!activeOrgId}>
          <Plus width={16} height={16} /> Novo DUC
        </Button>
      </div>

      {/* Abas */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setView("ducs")}
          className={
            "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors " +
            (view === "ducs" ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")
          }
        >
          DUCs {totalDucs > 0 && `(${totalDucs})`}
        </button>
        <button
          onClick={() => setView("kanban")}
          className={
            "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors " +
            (view === "kanban" ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")
          }
        >
          Kanban
        </button>
        <button
          onClick={() => setView("pending")}
          className={
            "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors " +
            (view === "pending" ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")
          }
        >
          Por documentar
        </button>
      </div>

      {view === "ducs" ? (
        <DucsView
          loading={loading}
          ducs={ducs}
          filtered={filtered}
          clientNames={clientNames}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          variantFilter={variantFilter}
          setVariantFilter={setVariantFilter}
          activeOrgId={activeOrgId}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onOpen={(id) => navigate(`/duc/${id}`)}
          onNew={() => openCreate(null)}
          onDelete={setDeleting}
        />
      ) : view === "kanban" ? (
        loading ? (
          <Card>
            <Spinner label="A carregar Kanban…" />
          </Card>
        ) : kanbanStages.length === 0 ? (
          <Card>
            <Spinner label="A carregar etapas…" />
          </Card>
        ) : (
          <DucKanban
            ducs={filtered}
            clientNames={clientNames}
            stages={kanbanStages}
            onDropCard={requestMove}
            onOpen={(id) => navigate(`/duc/${id}`)}
          />
        )
      ) : (
        <PendingView
          loading={loadingPending}
          pending={pending}
          contractCount={contractCount}
          ducCount={Math.max(0, contractCount - pending.length)}
          onCreate={(c) => openCreate(c)}
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
          onCreated={(id) => navigate(`/duc/${id}`)}
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
  activeOrgId,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  onNew,
  onDelete,
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
  activeOrgId: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (d: DucRecord) => void;
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
                    <Badge className={STATUS_STYLES[d.status]}>
                      {STATUS_LABELS[d.status] ?? d.status}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Badge className="bg-brand-50 text-brand-800 ring-brand-100">
                      {VARIANT_LABELS[d.variant]}
                    </Badge>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${(done / total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{done}/{total}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <div className="flex items-center gap-2">
                      <OpenBadge duc={d} />
                      <span className="text-xs text-slate-400">
                        {new Date(d.updated_at).toLocaleDateString("pt-PT")}
                      </span>
                    </div>
                    <button
                      type="button"
                      title="Eliminar"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(d);
                      }}
                    >
                      <Trash width={15} height={15} />
                    </button>
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
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Cliente / Título</th>
                  <th className="px-4 py-3">Variante</th>
                  <th className="px-4 py-3">Progresso</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Aberto</th>
                  <th className="px-4 py-3">Atualizado</th>
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
                      <td className="px-4 py-3">
                        <Badge className={STATUS_STYLES[d.status]}>
                          {STATUS_LABELS[d.status] ?? d.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <OpenBadge duc={d} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {new Date(d.updated_at).toLocaleDateString("pt-PT")}
                      </td>
                      <td className="px-4 py-3 text-right">
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
  const items = [
    { label: "Clientes com contrato", value: contractCount, color: "text-slate-800", dot: "bg-slate-300" },
    { label: "Com DUC", value: ducCount, color: "text-emerald-600", dot: "bg-emerald-500" },
    { label: "Por documentar", value: pendingCount, color: "text-amber-600", dot: "bg-amber-500" },
  ];
  const pct = contractCount > 0 ? Math.round((ducCount / contractCount) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {items.map((s) => (
          <Card
            key={s.label}
            className="p-3.5 transition-shadow duration-150 hover:shadow-elevated sm:p-4"
          >
            <div className={cx("text-2xl font-semibold tabular-nums sm:text-3xl", s.color)}>
              {s.value}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px]">
              <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} />
              <span className="truncate">{s.label}</span>
            </div>
          </Card>
        ))}
      </div>
      {/* Barra de cobertura — quantos clientes já têm DUC */}
      <div className="flex items-center gap-3 px-0.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-slate-500">{pct}% documentado</span>
      </div>
    </div>
  );
}

function PendingView({
  loading,
  pending,
  contractCount,
  ducCount,
  onCreate,
}: {
  loading: boolean;
  pending: ClientOption[];
  contractCount: number;
  ducCount: number;
  onCreate: (c: ClientOption) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? pending.filter((c) => c.name.toLowerCase().includes(s)) : pending;
  }, [pending, q]);

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
            icon={<Building width={22} height={22} />}
            title="Nada por documentar"
            description="Todos os clientes da área com contrato válido já têm DUC. 🎉"
          />
        </Card>
      ) : (
        <>
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
            <Card className="overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {filtered.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100">
              <Building width={16} height={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{c.name}</p>
              <p className="text-xs text-slate-400">Contrato válido · sem DUC</p>
            </div>
            <Button size="sm" onClick={() => onCreate(c)}>
              <Plus width={14} height={14} /> Criar DUC <ChevronRight width={14} height={14} />
            </Button>
          </li>
        ))}
      </ul>
            </Card>
          )}
        </>
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
