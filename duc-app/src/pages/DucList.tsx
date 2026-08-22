import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from "../components/ui";
import { Plus, Search, Trash, FileText, Building, ChevronRight } from "../components/icons";
import { STATUS_LABELS, VARIANT_LABELS, variantForOrgName } from "../lib/ducSchema";
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

type View = "ducs" | "pending";

export default function DucList() {
  const { businessUserId, activeOrgId, orgs } = useAuth();
  const navigate = useNavigate();
  const activeOrgName = orgs.find((o) => o.id === activeOrgId)?.name ?? null;
  const [view, setView] = useState<View>("ducs");

  const [loading, setLoading] = useState(true);
  const [ducs, setDucs] = useState<DucRecord[]>([]);
  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map());
  const [showCreate, setShowCreate] = useState(false);
  const [presetClient, setPresetClient] = useState<ClientOption | null>(null);
  const [deleting, setDeleting] = useState<DucRecord | null>(null);

  const [pending, setPending] = useState<ClientOption[]>([]);
  const [contractCount, setContractCount] = useState(0);
  const [loadingPending, setLoadingPending] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [variantFilter, setVariantFilter] = useState<string>("all");

  const load = useCallback(async () => {
    if (!activeOrgId) {
      setDucs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("anew_client_ducs")
      .select(
        "id, organization_id, root_organization_id, client_id, duc_number, title, variant, current_stage, status, assigned_to, blocks, tracking, created_by, created_at, updated_at, deleted_at"
      )
      .eq("organization_id", activeOrgId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[DUC] erro a carregar lista:", error);
      setDucs([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as DucRecord[];
    setDucs(rows);

    const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];
    if (clientIds.length > 0) {
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
      const map = new Map<string, string>();
      (clients ?? []).forEach((c) => {
        map.set(c.id as string, nameByEntity.get(c.entity_id as string) ?? "Cliente");
      });
      setClientNames(map);
    } else {
      setClientNames(new Map());
    }
    setLoading(false);
  }, [activeOrgId]);

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
    const withDuc = new Set(ducs.map((d) => d.client_id).filter(Boolean));
    setContractCount(valid.length);
    setPending(valid.filter((c) => !withDuc.has(c.id)));
    setLoadingPending(false);
  }, [activeOrgId, businessUserId, ducs]);

  useEffect(() => {
    if (view === "pending") void loadPending();
  }, [view, loadPending]);

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
          DUCs {ducs.length > 0 && `(${ducs.length})`}
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
          onOpen={(id) => navigate(`/duc/${id}`)}
          onNew={() => openCreate(null)}
          onDelete={setDeleting}
        />
      ) : (
        <PendingView
          loading={loadingPending}
          pending={pending}
          contractCount={contractCount}
          ducCount={ducs.length}
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
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (d: DucRecord) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
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
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos os estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={variantFilter} onChange={(e) => setVariantFilter(e.target.value)}>
          <option value="all">Todas as variantes</option>
          {Object.entries(VARIANT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
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
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Cliente / Título</th>
                <th className="px-4 py-3">Variante</th>
                <th className="px-4 py-3">Progresso</th>
                <th className="px-4 py-3">Estado</th>
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
                      {d.title && d.client_id && (
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
    { label: "Clientes com contrato", value: contractCount, color: "text-slate-800" },
    { label: "Com DUC", value: ducCount, color: "text-emerald-600" },
    { label: "Por documentar", value: pendingCount, color: "text-amber-600" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((s) => (
        <Card key={s.label} className="p-4">
          <div className={`text-2xl font-semibold tabular-nums ${s.color}`}>{s.value}</div>
          <div className="text-xs text-slate-500">{s.label}</div>
        </Card>
      ))}
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
        <Card className="overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {pending.map((c) => (
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
