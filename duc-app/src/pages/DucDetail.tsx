import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { Badge, Button, Card, Combobox, ConfirmDialog, Modal, Spinner, Textarea, Toggle, cx } from "../components/ui";
import { Printer, Save, Check, Trash, Plus, Paperclip, FileText, AlertTriangle, Clock } from "../components/icons";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { StatusSelect } from "../components/StatusSelect";
import { StageFlowView } from "../components/flow/StageFlowView";
import { DucChat } from "../components/DucChat";
import {
  fetchClientOlyviaInfo,
  prefillBlocksFromInfo,
  prefillScopeItemsFromInfo,
  prefillMaterialItemsFromInfo,
  prefillServiceItemsFromInfo,
  mergePrefill,
  type ScopeLine,
} from "../lib/clientInfo";
import { fetchEffectiveStages } from "../lib/ducConfig";
import { notifyStage } from "../lib/notify";
import { logDucEvent, fetchDucEvents, type DucEvent } from "../lib/events";
import {
  fetchCollaborators,
  addCollaborator,
  removeCollaborator,
  sendMagicLink,
  type DucCollaborator,
} from "../lib/collaborators";
import {
  fetchShares,
  createShare,
  revokeShare,
  type PublicShare,
} from "../lib/publicShare";
import {
  CHANGE_LOG_COLUMNS,
  STATUS_LABELS,
  VARIANT_LABELS,
  fieldsForVariant,
  sectionsForVariant,
  stageAppliesToVariant,
  missingRequiredFields,
  type DucField,
  type DucItemSection,
  type DucStage,
  type PaymentPhase,
  type AddressValue,
} from "../lib/ducSchema";
import type { DucRecord, DucSection, DucStatus, DucVariant, TrackingEntry } from "../lib/types";

interface LocalItem {
  key: string;
  section: DucSection;
  position: number;
  label: string;
  description: string;
  qty: string;
  unit: string;
  included: boolean;
  meta: Record<string, unknown>;
}

let keyCounter = 0;
const nextKey = () => `tmp-${keyCounter++}`;

const AUTOSAVE_MS = 2500;

export default function DucDetail() {
  const { id } = useParams<{ id: string }>();
  const { businessUserId, userName } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [duc, setDuc] = useState<DucRecord | null>(null);

  const [blocks, setBlocks] = useState<Record<string, Record<string, unknown>>>({});
  const [tracking, setTracking] = useState<TrackingEntry[]>([]);
  const [variant, setVariant] = useState<DucVariant>("universal");
  const [status, setStatus] = useState<DucStatus>("draft");
  const [currentStage, setCurrentStage] = useState(1);
  const [items, setItems] = useState<LocalItem[]>([]);
  const [clientName, setClientName] = useState<string | null>(null);
  // Estrutura efetiva das etapas para esta organização (config dinâmica por
  // entidade; cai no template base quando a org não tem override guardado).
  const [configStages, setConfigStages] = useState<DucStage[]>([]);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string>("rastreio");

  // Etapa a aguardar confirmação de fecho (null = sem diálogo aberto).
  const [confirmingClose, setConfirmingClose] = useState<number | null>(null);
  // Fecho bloqueado (ordem das etapas OU campos obrigatórios em falta).
  const [blockedClose, setBlockedClose] = useState<{ title: string; items: string[] } | null>(null);

  // Âmbito da impressão: documento completo ou só a etapa em foco. O menu de PDF
  // (cabeçalho + barra mobile) escreve aqui antes de chamar window.print().
  const [printScope, setPrintScope] = useState<"all" | "current">("all");
  // Controla a abertura do menu de PDF (desktop e mobile partilham o estado).
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);

  const savingRef = useRef(false);
  // Conta cada edição; usada para NÃO limpar `dirty` quando o utilizador altera
  // algo enquanto uma gravação está em curso (senão perdiam-se as últimas teclas).
  const editSeqRef = useRef(0);

  // Marca alterações por guardar (e regista a edição para o autosave em curso).
  const markDirty = useCallback(() => {
    editSeqRef.current += 1;
    setDirty(true);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("anew_client_ducs")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadError || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const row = data as DucRecord;
    setDuc(row);
    setBlocks(row.blocks ?? {});
    setVariant(row.variant);
    setStatus(row.status);
    setCurrentStage(row.current_stage);

    // Carrega a estrutura efetiva das etapas para a organização do DUC — override
    // guardado na área de Configurações, ou o template base da variante.
    const eff = await fetchEffectiveStages(row.organization_id, row.variant);
    setConfigStages(eff.stages);
    // Rastreio: uma entrada por etapa da configuração efetiva (nº de etapas é
    // dinâmico por organização, não fixo em 9). DUCs já criados usam o que têm.
    setTracking(
      row.tracking?.length
        ? row.tracking
        : eff.stages.map((s) => ({ stage: s.no, state: "pending" as const }))
    );

    const { data: itemRows } = await supabase
      .from("anew_client_duc_items")
      .select("*")
      .eq("duc_id", id)
      .order("position", { ascending: true });

    setItems(
      (itemRows ?? []).map((r) => ({
        key: r.id as string,
        section: r.section as DucSection,
        position: (r.position as number) ?? 0,
        label: (r.label as string) ?? "",
        description: (r.description as string) ?? "",
        qty: r.qty != null ? String(r.qty) : "",
        unit: (r.unit as string) ?? "",
        included: Boolean(r.included),
        meta: (r.meta as Record<string, unknown>) ?? {},
      }))
    );

    // Puxa os dados que já existem na Olyvia e pré-preenche campos vazios.
    if (row.client_id) {
      const info = await fetchClientOlyviaInfo(row.client_id);
      if (info) {
        setClientName(info.name);
        setBlocks(mergePrefill(row.blocks ?? {}, prefillBlocksFromInfo(info)));
        // Semeia itens a partir das linhas do orçamento assinado nas secções que
        // a configuração desta organização tem — âmbito ("o que foi VENDIDO"),
        // lista de materiais e mapa de serviços (BMG). Só quando a secção ainda
        // não tem itens guardados, para não sobrepor edições do utilizador.
        const presentSections = new Set(
          eff.stages.flatMap((s) => (s.itemSections ?? []).map((x) => x.section))
        );
        const seedFor = (section: DucSection, lines: ScopeLine[]): LocalItem[] => {
          if (!presentSections.has(section)) return [];
          if ((itemRows ?? []).some((r) => r.section === section)) return [];
          return lines.map((l, idx) => ({
            key: nextKey(),
            section,
            position: idx,
            label: l.label,
            description: l.description,
            qty: l.qty,
            unit: l.unit,
            included: true,
            meta: {} as Record<string, unknown>,
          }));
        };
        const seeded = [
          ...seedFor("scope", prefillScopeItemsFromInfo(info)),
          ...seedFor("material", prefillMaterialItemsFromInfo(info)),
          ...seedFor("service_map", prefillServiceItemsFromInfo(info)),
        ];
        if (seeded.length > 0) setItems((prev) => [...prev, ...seeded]);
      }
    }

    setDirty(false);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- editores locais (marcam dirty) ------------------------------------

  const setField = (stageKey: string, fieldKey: string, value: unknown) => {
    setBlocks((prev) => ({ ...prev, [stageKey]: { ...(prev[stageKey] ?? {}), [fieldKey]: value } }));
    markDirty();
  };
  const setTrackingEntry = (stage: number, patch: Partial<TrackingEntry>) => {
    setTracking((prev) =>
      prev.some((t) => t.stage === stage)
        ? prev.map((t) => (t.stage === stage ? { ...t, ...patch } : t))
        : [...prev, { stage, state: "pending", ...patch }]
    );
    markDirty();
  };
  // Fecha/reabre uma etapa registando QUEM fechou e QUANDO (assinatura). Ao
  // reabrir, limpa a assinatura e a data para não ficar registo enganador.
  // Fecha/reabre e PERSISTE já (não depende do autosave debounced — a assinatura
  // não se pode perder). Devolve true se gravou. Calcula o tracking novo à mão
  // para poder enviá-lo ao servidor sem esperar pelo setState.
  const closeStage = async (stage: number, close: boolean): Promise<boolean> => {
    const patch = {
      state: (close ? "done" : "pending") as TrackingEntry["state"],
      date: close ? new Date().toISOString().slice(0, 10) : null,
      signed_by: close ? userName ?? businessUserId ?? "—" : null,
    };
    const newTracking: TrackingEntry[] = tracking.some((t) => t.stage === stage)
      ? tracking.map((t) => (t.stage === stage ? { ...t, ...patch } : t))
      : [...tracking, { stage, ...patch }];
    setTracking(newTracking);
    if (!id) return false;
    const { error: upErr } = await supabase
      .from("anew_client_ducs")
      .update({ tracking: newTracking })
      .eq("id", id);
    if (upErr) {
      setError(upErr.message);
      return false;
    }
    setSavedAt(new Date().toLocaleTimeString("pt-PT"));
    if (duc) {
      void logDucEvent({
        duc_id: id,
        organization_id: duc.organization_id,
        event_type: close ? "stage_closed" : "stage_reopened",
        stage_no: stage,
        detail: close ? `Etapa ${stage} fechada` : `Etapa ${stage} reaberta`,
        actor_id: businessUserId,
        actor_name: userName ?? null,
      });
    }
    return true;
  };
  // Fechar pede confirmação (ação com peso: assina a etapa); reabrir é direto.
  // Antes de confirmar, valida os campos OBRIGATÓRIOS da etapa.
  const requestToggleClose = (stage: number, close: boolean) => {
    if (!close) {
      void closeStage(stage, false);
      return;
    }
    // Regra: só se pode fechar se as etapas ANTERIORES (aplicáveis) já estiverem
    // fechadas — não se salta etapas.
    const openPrev = configStages.filter(
      (s) =>
        stageAppliesToVariant(s, variant) &&
        s.no < stage &&
        tracking.find((t) => t.stage === s.no)?.state !== "done"
    );
    if (openPrev.length > 0) {
      setBlockedClose({
        title: "Fecha primeiro as etapas anteriores",
        items: openPrev.map((s) => `${s.no}. ${s.title.split(" — ")[0]}`),
      });
      return;
    }
    const st = configStages.find((s) => s.no === stage);
    if (st) {
      const gaps = missingRequiredFields(st, variant, blocks[st.key]);
      if (gaps.length > 0) {
        setBlockedClose({
          title: "Faltam campos obrigatórios",
          items: gaps.map((f) => f.label),
        });
        return;
      }
    }
    setConfirmingClose(stage);
  };
  const addItem = (section: DucSection) => {
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        section,
        position: prev.filter((i) => i.section === section).length,
        label: "",
        description: "",
        qty: "",
        unit: "",
        included: false,
        meta: {},
      },
    ]);
    markDirty();
  };
  const updateItem = (key: string, patch: Partial<LocalItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    markDirty();
  };
  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
    markDirty();
  };

  const changeVariant = (v: DucVariant) => {
    setVariant(v);
    markDirty();
  };
  const changeStatus = (s: DucStatus) => {
    if (id && duc && s !== status) {
      void logDucEvent({
        duc_id: id,
        organization_id: duc.organization_id,
        event_type: "status_changed",
        detail: `Estado: ${STATUS_LABELS[status]} → ${STATUS_LABELS[s]}`,
        actor_id: businessUserId,
        actor_name: userName ?? null,
      });
    }
    setStatus(s);
    markDirty();
  };
  const changeStage = (n: number) => {
    const advancing = n > currentStage;
    setCurrentStage(n);
    markDirty();
    if (!id) return;
    // Persiste já a etapa atual e notifica "entrada" SÓ ao avançar (não ao
    // recuar nem ao consultar uma etapa anterior) e só após gravar com sucesso.
    void supabase
      .from("anew_client_ducs")
      .update({ current_stage: n })
      .eq("id", id)
      .then(({ error: upErr }) => {
        if (upErr || !advancing || !duc) return;
        const st = configStages.find((s) => s.no === n);
        if (st) {
          void notifyStage(st, {
            organizationId: duc.organization_id,
            ducNumber: duc.duc_number,
            clientName: clientName ?? duc.title,
            stageNo: st.no,
            stageTitle: st.title.split(" — ")[0],
            event: "enter",
            ducUrl: window.location.href,
          });
        }
      });
  };

  // Dispara a impressão no âmbito escolhido. Fixa o `printScope` (React ainda
  // não re-renderizou ao clicar) e espera um tick para o atributo `data-print-*`
  // já estar no DOM antes de abrir o diálogo de impressão do browser.
  const runPrint = (scope: "all" | "current") => {
    setPrintScope(scope);
    setPdfMenuOpen(false);
    requestAnimationFrame(() => window.print());
  };

  // ---- gravar -------------------------------------------------------------

  const save = useCallback(async () => {
    if (!id || !duc || savingRef.current) return;
    savingRef.current = true;
    // Regista o "número de edições" no início; se mudar durante a gravação, não
    // limpamos `dirty` (para o autosave voltar a gravar as alterações novas).
    const seqAtStart = editSeqRef.current;
    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("anew_client_ducs")
        .update({ blocks, tracking, variant, status, current_stage: currentStage })
        .eq("id", id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Linhas com conteúdo real (as vazias são descartadas).
      const nonEmpty = items.filter(
        (i) =>
          i.label.trim() ||
          i.description.trim() ||
          i.qty.trim() ||
          i.unit.trim() ||
          i.included ||
          Object.values(i.meta).some((v) => v !== "" && v != null)
      );

      // Persistência NÃO-DESTRUTIVA: preserva os ids das linhas já guardadas
      // (mantém created_by/created_at e evita apagar tudo antes de um insert que
      // pode falhar). Novas linhas recebem um id gerado no cliente; as removidas
      // são apagadas SÓ no fim, depois de upsert/insert terem tido sucesso.
      const posBySection: Record<string, number> = {};
      const existingRows: Array<Record<string, unknown>> = [];
      const freshRows: Array<Record<string, unknown>> = [];
      const remap = new Map<string, string>(); // key temporária → id novo
      for (const i of nonEmpty) {
        const position = (posBySection[i.section] = (posBySection[i.section] ?? 0));
        posBySection[i.section] = position + 1;
        const base = {
          duc_id: id,
          organization_id: duc.organization_id,
          section: i.section,
          position,
          label: i.label || null,
          description: i.description || null,
          qty: i.qty.trim() ? Number(i.qty) : null,
          unit: i.unit || null,
          included: i.included,
          meta: i.meta,
        };
        if (i.key.startsWith("tmp-")) {
          const newId = crypto.randomUUID();
          remap.set(i.key, newId);
          freshRows.push({ ...base, id: newId, created_by: businessUserId });
        } else {
          existingRows.push({ ...base, id: i.key });
        }
      }

      const keepIds = new Set<string>([
        ...existingRows.map((r) => r.id as string),
        ...freshRows.map((r) => r.id as string),
      ]);

      if (existingRows.length > 0) {
        const { error: upErr } = await supabase.from("anew_client_duc_items").upsert(existingRows);
        if (upErr) {
          setError(upErr.message);
          return;
        }
      }
      if (freshRows.length > 0) {
        const { error: insErr } = await supabase.from("anew_client_duc_items").insert(freshRows);
        if (insErr) {
          setError(insErr.message);
          return;
        }
      }
      // Apaga as linhas que já não existem (removidas/esvaziadas). Só agora — se
      // falhar, sobram linhas a mais, nunca perda de dados guardados.
      let del = supabase.from("anew_client_duc_items").delete().eq("duc_id", id);
      if (keepIds.size > 0) del = del.not("id", "in", `(${Array.from(keepIds).join(",")})`);
      const { error: delErr } = await del;
      if (delErr) {
        setError(delErr.message);
        return;
      }

      // Reindexa as chaves locais das linhas novas para o id de BD, para a
      // próxima gravação as tratar como existentes (upsert) e não duplicar.
      if (remap.size > 0) {
        setItems((prev) => prev.map((i) => (remap.has(i.key) ? { ...i, key: remap.get(i.key)! } : i)));
      }

      // Só limpa `dirty` se nada mudou durante a gravação.
      if (editSeqRef.current === seqAtStart) setDirty(false);
      setSavedAt(new Date().toLocaleTimeString("pt-PT"));
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }, [id, duc, blocks, tracking, variant, status, currentStage, items, businessUserId]);

  // Autosave (debounced) + aviso ao sair com alterações por guardar. Não agenda
  // enquanto uma gravação decorre (`saving`); quando esta termina e ainda há
  // `dirty`, o efeito volta a correr e agenda a gravação das edições novas.
  useEffect(() => {
    if (!dirty || loading || saving) return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [dirty, loading, saving, save]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const visibleStages = useMemo(
    () => configStages.filter((s) => stageAppliesToVariant(s, variant)),
    [configStages, variant]
  );

  const stageDone = (no: number) => tracking.find((t) => t.stage === no)?.state === "done";

  // Progresso relativo às etapas VISÍVEIS desta variante/config (nº dinâmico),
  // não a um total fixo de 9.
  const totalStages = visibleStages.length || tracking.length || 1;
  const doneStages = visibleStages.filter((s) => stageDone(s.no)).length;

  // Secção (keyName) a manter na impressão "só a etapa atual": a etapa em foco no
  // rail, ou a etapa em curso se estivermos noutra vista (rastreio, anexos…).
  const currentSectionKey =
    visibleStages.find((s) => s.key === activeKey)?.key ??
    visibleStages.find((s) => s.no === currentStage)?.key ??
    activeKey;

  if (loading) return <Spinner label="A carregar DUC…" />;
  if (notFound || !duc) {
    return (
      <Card className="p-10 text-center text-slate-500">
        <p className="text-sm">DUC não encontrado ou sem acesso.</p>
      </Card>
    );
  }

  const navItems: Array<{ key: string; label: string; done?: boolean; no?: number }> = [
    { key: "rastreio", label: "Rastreio do testemunho" },
    { key: "fluxo", label: "Fluxo" },
    { key: "chat", label: "Conversa" },
    ...visibleStages.map((s) => ({
      key: s.key,
      label: `${s.no}. ${s.title.split(" — ")[1] ?? s.title}`,
      done: stageDone(s.no),
      no: s.no,
    })),
    { key: "registo", label: "Registo de alterações" },
    { key: "historico", label: "Histórico" },
    { key: "anexos", label: "Anexos" },
    ...(businessUserId ? [{ key: "colaboradores", label: "Colaboradores" }] : []),
  ];

  return (
    <div className="pb-24 md:pb-4" data-print-scope={printScope}>
      {/* CSS de impressão — gera um DOCUMENTO (não um screenshot da viewport):
          cada etapa em página nova, campos legíveis, controlos escondidos. No
          âmbito "current" só a secção marcada com data-print-current aparece. */}
      <style>{PRINT_CSS}</style>

      {/* Cabeçalho + progresso + ações */}
      <Card className="mb-6 p-5 print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{duc.duc_number}</span>
              <Badge className="bg-brand-50 text-brand-800 ring-brand-100">{VARIANT_LABELS[variant]}</Badge>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-800">
              {clientName ?? duc.title ?? "DUC"}
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${(doneStages / totalStages) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">{doneStages}/{totalStages} etapas fechadas</span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 print:hidden sm:w-auto sm:items-end">
            <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end sm:gap-1">
              <span className="text-xs font-medium text-slate-500">Estado</span>
              <StatusSelect value={status} onChange={changeStatus} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-slate-400 sm:mr-0">
                {error ? (
                  <span className="text-red-600">{error}</span>
                ) : saving ? (
                  "A guardar…"
                ) : dirty ? (
                  "Alterações por guardar…"
                ) : savedAt ? (
                  `Guardado às ${savedAt}`
                ) : (
                  "Tudo guardado"
                )}
              </span>
              <PdfMenu
                open={pdfMenuOpen}
                onOpenChange={setPdfMenuOpen}
                onPrint={runPrint}
              />
              <Button onClick={() => void save()} disabled={saving || !dirty}>
                <Save /> Guardar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Rail de navegação */}
        <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 print:hidden lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 lg:sticky lg:top-20 lg:self-start">
          {navItems.map((n) => {
            const active = activeKey === n.key;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => setActiveKey(n.key)}
                className={cx(
                  "group flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-all lg:w-full",
                  active
                    ? "bg-brand text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {n.no != null ? (
                  <span
                    className={cx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset",
                      n.done
                        ? "bg-emerald-500 text-white ring-emerald-500"
                        : active
                          ? "bg-white/20 text-white ring-white/30"
                          : "bg-white text-slate-500 ring-slate-200"
                    )}
                  >
                    {n.done ? <Check width={13} height={13} /> : n.no}
                  </span>
                ) : (
                  <span
                    className={cx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {n.key === "anexos" ? (
                      <Paperclip width={13} height={13} />
                    ) : (
                      <FileText width={13} height={13} />
                    )}
                  </span>
                )}
                <span className="truncate">{n.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Conteúdo — todas as secções no DOM (para impressão); ecrã mostra a ativa. */}
        <div className="min-w-0 space-y-6">
          {/* Cabeçalho só de impressão */}
          <div className="hidden print:block">
            <h1 className="text-xl font-bold">DUC {duc.duc_number} — {clientName ?? duc.title}</h1>
            <p className="text-sm text-slate-500">
              {VARIANT_LABELS[variant]} · {STATUS_LABELS[status]}
            </p>
          </div>

          <Section
            active={activeKey === "rastreio"}
            keyName="rastreio"
            printCurrent={currentSectionKey === "rastreio"}
          >
            <TrackingBoard stages={visibleStages} tracking={tracking} onChange={setTrackingEntry} onToggleClose={requestToggleClose} currentStage={currentStage} onStageChange={changeStage} />
          </Section>

          <Section
            active={activeKey === "fluxo"}
            keyName="fluxo"
            printCurrent={currentSectionKey === "fluxo"}
          >
            <Card className="p-3 print:hidden">
              <div className="mb-3 flex items-center justify-between px-2 pt-1">
                <h2 className="text-base font-semibold text-slate-800">Fluxo do DUC</h2>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Fechada</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand" /> Atual</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Pendente</span>
                </div>
              </div>
              <StageFlowView
                stages={visibleStages}
                tracking={tracking}
                currentStage={currentStage}
                onSelectStage={(no) => {
                  const st = visibleStages.find((s) => s.no === no);
                  if (st) setActiveKey(st.key);
                }}
              />
            </Card>
          </Section>

          <Section active={activeKey === "chat"} keyName="chat">
            <DucChat
              ducId={duc.id}
              orgId={duc.organization_id}
              businessUserId={businessUserId}
              userName={userName}
              ducNumber={duc.duc_number}
            />
          </Section>

          {visibleStages.map((stage) => (
            <Section
              key={stage.key}
              active={activeKey === stage.key}
              keyName={stage.key}
              printCurrent={currentSectionKey === stage.key}
            >
              <StageCard
                stage={stage}
                variant={variant}
                blocks={blocks}
                items={items}
                entry={tracking.find((t) => t.stage === stage.no) ?? null}
                isCurrent={stage.no === currentStage}
                enteredAt={
                  (stage.no > 1
                    ? tracking.find((t) => t.stage === stage.no - 1)?.date ?? null
                    : null) ?? duc.created_at
                }
                onField={setField}
                onAddItem={addItem}
                onUpdateItem={updateItem}
                onRemoveItem={removeItem}
                onToggleClose={requestToggleClose}
              />
            </Section>
          ))}

          <Section
            active={activeKey === "registo"}
            keyName="registo"
            printCurrent={currentSectionKey === "registo"}
          >
            <Card className="p-5 print:border-0 print:shadow-none">
              <ItemsTable
                section={CHANGE_LOG_COLUMNS}
                items={items.filter((i) => i.section === "change_log")}
                onAdd={() => addItem("change_log")}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            </Card>
          </Section>

          <Section
            active={activeKey === "historico"}
            keyName="historico"
            printCurrent={currentSectionKey === "historico"}
          >
            <HistoryTimeline duc={duc} tracking={tracking} stages={visibleStages} />
          </Section>

          <Section
            active={activeKey === "anexos"}
            keyName="anexos"
            printCurrent={currentSectionKey === "anexos"}
          >
            {businessUserId ? (
              <AttachmentsPanel ducId={duc.id} orgId={duc.organization_id} businessUserId={businessUserId} />
            ) : null}
          </Section>

          <Section active={activeKey === "colaboradores"} keyName="colaboradores">
            {businessUserId ? (
              <CollaboratorsPanel
                ducId={duc.id}
                orgId={duc.organization_id}
                businessUserId={businessUserId}
              />
            ) : null}
          </Section>
        </div>
      </div>

      {/* Barra de ações fixa — só mobile (no desktop as ações estão no cabeçalho) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur md:hidden print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {error ? (
              <span className="text-red-600">{error}</span>
            ) : saving ? (
              "A guardar…"
            ) : dirty ? (
              "Alterações por guardar…"
            ) : savedAt ? (
              `Guardado às ${savedAt}`
            ) : (
              "Tudo guardado"
            )}
          </span>
          <PdfMenu
            open={pdfMenuOpen}
            onOpenChange={setPdfMenuOpen}
            onPrint={runPrint}
            dropUp
            iconOnly
          />
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            <Save /> Guardar
          </Button>
        </div>
      </div>

      {confirmingClose !== null && (
        <ConfirmDialog
          title="Fechar etapa"
          tone="brand"
          confirmLabel="Fechar etapa"
          icon={<Check width={18} height={18} />}
          message={
            <>
              Tens a certeza que queres fechar a etapa{" "}
              <span className="font-medium text-slate-800">
                {confirmingClose}.{" "}
                {visibleStages.find((s) => s.no === confirmingClose)?.title.split(" — ")[0]}
              </span>
              ? Fica assinada por{" "}
              <span className="font-medium text-slate-800">{userName ?? "ti"}</span> com a data de
              hoje. Podes reabrir depois.
            </>
          }
          onCancel={() => setConfirmingClose(null)}
          onConfirm={async () => {
            const st = visibleStages.find((s) => s.no === confirmingClose);
            // Notifica SÓ depois de a gravação ter tido sucesso.
            const ok = await closeStage(confirmingClose, true);
            if (ok && st && duc) {
              void notifyStage(st, {
                organizationId: duc.organization_id,
                ducNumber: duc.duc_number,
                clientName: clientName ?? duc.title,
                stageNo: st.no,
                stageTitle: st.title.split(" — ")[0],
                event: "close",
                signedBy: userName ?? businessUserId,
                ducUrl: window.location.href,
              });
            }
            setConfirmingClose(null);
          }}
        />
      )}

      {blockedClose && (
        <Modal
          title={blockedClose.title}
          size="sm"
          onClose={() => setBlockedClose(null)}
          footer={<Button onClick={() => setBlockedClose(null)}>Entendi</Button>}
        >
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Não é possível fechar esta etapa ainda:</p>
            <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-100">
              {blockedClose.items.map((m, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-amber-500">•</span> {m}
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Menu de PDF: botão que abre um dropdown com "Documento completo" e "Só a
 *  etapa atual". Fecha ao clicar fora ou ao escolher. Escondido na impressão. */
function PdfMenu({
  open,
  onOpenChange,
  onPrint,
  dropUp,
  iconOnly,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPrint: (scope: "all" | "current") => void;
  /** Abre para cima (barra fixa mobile). */
  dropUp?: boolean;
  /** Só ícone, sem rótulo "PDF" (barra mobile). */
  iconOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora do menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative print:hidden">
      <Button
        variant="secondary"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Exportar PDF"
      >
        <Printer />
        {!iconOnly && "PDF"}
      </Button>
      {open && (
        <div
          role="menu"
          className={cx(
            "absolute right-0 z-40 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg",
            dropUp ? "bottom-full mb-2" : "top-full mt-2"
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onPrint("all")}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            <FileText width={15} height={15} className="text-slate-400" />
            Documento completo
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onPrint("current")}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            <Printer width={15} height={15} className="text-slate-400" />
            Só a etapa atual
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** CSS aplicado só na impressão. Trata o detalhe como documento paginado. */
const PRINT_CSS = `
@media print {
  /* Página A4 com margens confortáveis. */
  @page { size: A4; margin: 16mm 14mm; }

  /* Cada secção/etapa começa em página nova e não se corta a meio. */
  [data-print-scope] [data-section] { break-before: page; break-inside: auto; }
  [data-print-scope] [data-section]:first-of-type { break-before: auto; }
  [data-print-scope] .print\\:mb-6 { margin-bottom: 0; }

  /* Cartões e linhas de tabela: não partir a meio de uma página. */
  [data-print-scope] [data-section] > * { break-inside: avoid; }
  [data-print-scope] tr, [data-print-scope] .grid > * { break-inside: avoid; }

  /* Âmbito "só a etapa atual": esconde tudo menos a secção marcada. */
  [data-print-scope="current"] [data-section]:not([data-print-current]) { display: none !important; }
  [data-print-scope="current"] [data-print-current] { break-before: auto; }

  /* Campos: imprimir o VALOR de forma legível — sem sombras, fundo branco,
     bordas leves, e sem cortar o texto. */
  [data-print-scope] input,
  [data-print-scope] textarea,
  [data-print-scope] select {
    border: 1px solid #cbd5e1 !important;
    background: #fff !important;
    box-shadow: none !important;
    color: #0f172a !important;
    -webkit-text-fill-color: #0f172a !important;
    overflow: visible !important;
    opacity: 1 !important;
  }
  /* Textarea cresce com o conteúdo em vez de cortar/scroll. */
  [data-print-scope] textarea { height: auto !important; min-height: 3.5rem; white-space: pre-wrap; }
  /* Tabelas de itens: sem scroll horizontal, colunas visíveis. */
  [data-print-scope] .overflow-x-auto { overflow: visible !important; }
}
`;

/** Secção: visível no ecrã só se ativa; na impressão sai sempre (âmbito "all")
 *  ou só a que estiver marcada como atual (âmbito "current", via CSS). */
function Section({
  active,
  keyName,
  printCurrent,
  children,
}: {
  active: boolean;
  keyName: string;
  /** Marca esta secção como a "etapa atual" para a impressão de âmbito único. */
  printCurrent?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      data-section={keyName}
      data-print-current={printCurrent ? "" : undefined}
      className={cx(!active && "hidden print:block", "print:mb-6")}
    >
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------

function StageCard({
  stage,
  variant,
  blocks,
  items,
  entry,
  isCurrent,
  enteredAt,
  onField,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onToggleClose,
}: {
  stage: DucStage;
  variant: DucVariant;
  blocks: Record<string, Record<string, unknown>>;
  items: LocalItem[];
  entry: TrackingEntry | null;
  isCurrent: boolean;
  enteredAt: string | null;
  onField: (stageKey: string, fieldKey: string, value: unknown) => void;
  onAddItem: (section: DucSection) => void;
  onUpdateItem: (key: string, patch: Partial<LocalItem>) => void;
  onRemoveItem: (key: string) => void;
  onToggleClose: (stageNo: number, close: boolean) => void;
}) {
  const fields = fieldsForVariant(stage.fields, variant);
  const sections = sectionsForVariant(stage, variant);
  const done = entry?.state === "done";
  // Alerta de etapa parada: só na etapa atual, por fechar, com limite configurado.
  const alertDays = stage.notify?.alertAfterDays ?? 0;
  const openDays =
    isCurrent && !done && enteredAt
      ? Math.max(0, Math.floor((Date.now() - new Date(enteredAt).getTime()) / 86_400_000))
      : 0;
  const isStale = alertDays > 0 && isCurrent && !done && openDays > alertDays;
  return (
    <Card
      className={cx(
        "p-5 print:border-0 print:shadow-none",
        done && "ring-1 ring-emerald-100"
      )}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-800">
          <span className="mr-2 text-brand">{stage.no}</span>
          {stage.title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {done && (
            <Badge className="bg-emerald-100 text-emerald-700 ring-emerald-200">
              <Check width={12} height={12} /> Fechada
            </Badge>
          )}
          <span className="text-xs text-slate-400">{stage.responsible}</span>
        </div>
      </div>
      {isStale && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-100">
          <AlertTriangle width={14} height={14} className="shrink-0" />
          Etapa parada há {openDays} dias (limite {alertDays}). Os destinatários configurados
          devem ser alertados.
        </div>
      )}
      {stage.intro && <p className="mb-4 text-xs text-slate-500">{stage.intro}</p>}

      {fields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={blocks[stage.key]?.[field.key]}
              onChange={(v) => onField(stage.key, field.key, v)}
            />
          ))}
        </div>
      )}

      {sections.map((section) => (
        <ItemsTable
          key={section.section}
          section={section}
          items={items.filter((i) => i.section === section.section)}
          onAdd={() => onAddItem(section.section)}
          onUpdate={onUpdateItem}
          onRemove={onRemoveItem}
        />
      ))}

      {/* Fecho da etapa — assinatura (quem/quando) + botão fechar/reabrir */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 print:hidden">
        {done ? (
          <p className="text-xs text-slate-500">
            Fechada{entry?.signed_by ? ` por ${entry.signed_by}` : ""}
            {entry?.date ? ` · ${new Date(entry.date).toLocaleDateString("pt-PT")}` : ""}
          </p>
        ) : (
          <p className="text-xs text-slate-400">Etapa por fechar.</p>
        )}
        <Button
          variant={done ? "secondary" : "primary"}
          onClick={() => onToggleClose(stage.no, !done)}
        >
          {done ? (
            "Reabrir etapa"
          ) : (
            <>
              <Check /> Fechar etapa
            </>
          )}
        </Button>
      </div>

      {/* Registo de assinatura visível também na impressão */}
      {done && (
        <p className="mt-4 hidden text-xs text-slate-500 print:block">
          Etapa fechada{entry?.signed_by ? ` por ${entry.signed_by}` : ""}
          {entry?.date ? ` em ${new Date(entry.date).toLocaleDateString("pt-PT")}` : ""}.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function HistoryTimeline({
  duc,
  tracking,
  stages,
}: {
  duc: DucRecord;
  tracking: TrackingEntry[];
  stages: DucStage[];
}) {
  const stageTitle = (no: number) =>
    stages.find((s) => s.no === no)?.title.split(" — ")[0] ?? `Etapa ${no}`;

  type Ev = { when: string; title: string; who?: string | null; kind: "create" | "close" | "update" };

  // Eventos reais da tabela de auditoria (quando aplicada).
  const [dbEvents, setDbEvents] = useState<DucEvent[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchDucEvents(duc.id).then((rows) => {
      if (alive) setDbEvents(rows);
    });
    return () => {
      alive = false;
    };
  }, [duc.id]);

  // Fallback reconstruído dos dados da ficha (enquanto a tabela não tiver registos).
  const reconstructed: Ev[] = [{ when: duc.created_at, title: "DUC criado", kind: "create" }];
  tracking
    .filter((t) => t.state === "done" && t.date)
    .forEach((t) =>
      reconstructed.push({
        when: t.date as string,
        title: `Etapa ${t.stage} fechada — ${stageTitle(t.stage)}`,
        who: t.signed_by,
        kind: "close",
      })
    );
  if (duc.updated_at)
    reconstructed.push({ when: duc.updated_at, title: "Última alteração", kind: "update" });

  const fromDb: Ev[] = (dbEvents ?? []).map((e) => ({
    when: e.created_at ?? "",
    title: e.detail ?? e.event_type,
    who: e.actor_name,
    kind:
      e.event_type === "created" ? "create" : e.event_type === "stage_closed" ? "close" : "update",
  }));

  // Prefere o histórico real da BD; se ainda não houver, mostra o reconstruído.
  const sorted = (fromDb.length > 0 ? fromDb : reconstructed).sort(
    (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()
  );
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? "—"
      : d.toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <Card className="p-5 print:border-0 print:shadow-none">
      <div className="mb-4 flex items-center gap-2">
        <Clock width={16} height={16} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-800">Histórico da ficha</h2>
      </div>
      <ol className="relative space-y-4 border-l border-slate-200 pl-5">
        {sorted.map((e, i) => (
          <li key={i} className="relative">
            <span
              className={cx(
                "absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white",
                e.kind === "close"
                  ? "bg-emerald-500 text-white"
                  : e.kind === "create"
                    ? "bg-brand text-white"
                    : "bg-slate-300 text-white"
              )}
            >
              {e.kind === "close" ? (
                <Check width={11} height={11} />
              ) : e.kind === "create" ? (
                <FileText width={11} height={11} />
              ) : (
                <Clock width={11} height={11} />
              )}
            </span>
            <p className="text-sm font-medium text-slate-800">{e.title}</p>
            <p className="text-xs text-slate-400">
              {fmt(e.when)}
              {e.who ? ` · ${e.who}` : ""}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] text-slate-400">
        {fromDb.length > 0
          ? "Histórico de auditoria (append-only) — cada ação fica registada por quem e quando."
          : "Reconstruído dos dados da ficha. Aplica a tabela de auditoria (duc-app/db/schema.sql §8) para registo completo de cada ação."}
      </p>
    </Card>
  );
}

function CollaboratorsPanel({
  ducId,
  orgId,
  businessUserId,
}: {
  ducId: string;
  orgId: string;
  businessUserId: string;
}) {
  const [rows, setRows] = useState<DucCollaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Links públicos (só leitura, por token).
  const [shares, setShares] = useState<PublicShare[]>([]);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const shareUrl = (token: string) =>
    `${window.location.origin}${import.meta.env.BASE_URL}share/${token}`;

  const load = useCallback(() => {
    void fetchCollaborators(ducId).then(setRows);
    void fetchShares(ducId).then(setShares);
  }, [ducId]);
  useEffect(() => {
    load();
  }, [load]);

  const generateLink = async () => {
    setSharing(true);
    const res = await createShare(ducId, orgId, businessUserId);
    setSharing(false);
    if ("error" in res) {
      setMsg(
        /exist|relation|schema cache|permission|denied|not find/i.test(res.error)
          ? "Falta aplicar a tabela de partilhas no Supabase (duc-app/db/schema.sql §11)."
          : res.error
      );
      return;
    }
    void navigator.clipboard?.writeText(shareUrl(res.token)).catch(() => {});
    setCopied(res.token);
    load();
  };

  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      setMsg("Email inválido.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const err = await addCollaborator(ducId, orgId, e, role, businessUserId);
    if (err) {
      setMsg(
        /exist|relation|schema cache|permission|denied|not find/i.test(err)
          ? "Não foi possível convidar. Falta aplicar a tabela de colaboradores no Supabase (duc-app/db/schema.sql §9)."
          : err
      );
      setBusy(false);
      return;
    }
    // Envia o magic link para o externo entrar.
    await sendMagicLink(e, window.location.origin + import.meta.env.BASE_URL);
    setEmail("");
    setMsg(`Convite enviado para ${e}.`);
    setBusy(false);
    load();
  };

  const remove = async (id: string) => {
    await removeCollaborator(id);
    load();
  };

  return (
    <Card className="p-5 print:hidden">
      <h2 className="mb-1 text-base font-semibold text-slate-800">Colaboradores externos</h2>
      <p className="mb-4 text-xs text-slate-400">
        Convida pessoas de fora da organização para ver ou editar este DUC. Recebem um link de
        acesso (magic link) por email.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void invite();
          }}
          placeholder="email@externo.pt"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <Combobox
          className="sm:w-36"
          value={role}
          onChange={(v) => setRole(v as "viewer" | "editor")}
          options={[
            { value: "viewer", label: "Ver" },
            { value: "editor", label: "Editar" },
          ]}
        />
        <Button onClick={() => void invite()} disabled={busy}>
          <Plus width={14} height={14} /> Convidar
        </Button>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-500">{msg}</p>}

      <div className="mt-4 divide-y divide-slate-100">
        {rows.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">Sem colaboradores externos.</p>
        ) : (
          rows.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800">{c.email}</p>
                <p className="text-xs text-slate-400">
                  {c.role === "editor" ? "Pode editar" : "Só leitura"}
                  {c.accepted_at ? " · aceitou" : " · convite pendente"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(c.id)}
                className="text-slate-300 transition-colors hover:text-red-500"
                title="Remover colaborador"
              >
                <Trash width={15} height={15} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Link público (só leitura, por token) */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Link público (só leitura)</h3>
            <p className="text-xs text-slate-400">
              Qualquer pessoa com o link vê o documento completo — sem conta. Não é indexado no
              Google.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void generateLink()} disabled={sharing}>
            <Plus width={14} height={14} /> {sharing ? "A gerar…" : "Gerar link"}
          </Button>
        </div>

        {shares.length > 0 && (
          <div className="mt-3 space-y-2">
            {shares.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-2"
              >
                <input
                  readOnly
                  value={shareUrl(s.token)}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs text-slate-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(shareUrl(s.token)).catch(() => {});
                    setCopied(s.token);
                  }}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-50"
                >
                  {copied === s.token ? "Copiado!" : "Copiar"}
                </button>
                <button
                  type="button"
                  onClick={() => void revokeShare(s.id).then(load)}
                  title="Revogar link"
                  className="shrink-0 text-slate-300 transition-colors hover:text-red-500"
                >
                  <Trash width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        Requer as tabelas aplicadas no Supabase (duc-app/db/schema.sql §9 colaboradores, §11 links
        públicos) e o magic link ativo no Auth.
      </p>
    </Card>
  );
}

function TrackingBoard({
  stages,
  tracking,
  onChange,
  onToggleClose,
  currentStage,
  onStageChange,
}: {
  stages: DucStage[];
  tracking: TrackingEntry[];
  onChange: (stage: number, patch: Partial<TrackingEntry>) => void;
  onToggleClose: (stageNo: number, close: boolean) => void;
  currentStage: number;
  onStageChange: (n: number) => void;
}) {
  return (
    <Card className="p-5 print:border-0 print:shadow-none">
      <h2 className="mb-3 text-base font-semibold text-slate-800">Rastreio do testemunho</h2>
      <p className="mb-3 text-xs text-slate-500">
        Onde está o DUC agora · marca cada etapa como fechada quando o departamento a valida.
      </p>
      {/* Mobile: cartões (a tabela de 5 colunas não cabe no telemóvel) */}
      <div className="space-y-2.5 md:hidden">
        {stages.map((stage) => {
          const entry =
            tracking.find((t) => t.stage === stage.no) ?? { stage: stage.no, state: "pending" as const };
          const done = entry.state === "done";
          const isCurrent = stage.no === currentStage;
          return (
            <div
              key={stage.no}
              onClick={() => onStageChange(stage.no)}
              className={cx(
                "rounded-xl border p-3.5 transition-colors",
                isCurrent ? "border-teal-200 bg-teal-50/40" : "border-slate-200"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">
                    {stage.no} · {stage.title.split(" — ")[0]}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">{stage.responsible}</p>
                  {done && entry.signed_by && (
                    <p className="mt-0.5 text-[11px] text-emerald-700">
                      Fechada por {entry.signed_by}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleClose(stage.no, !done);
                  }}
                  className={cx(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                    done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  )}
                >
                  {done && <Check width={12} height={12} />}
                  {done ? "Fechado" : "Pendente"}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="date"
                  value={entry.date ?? ""}
                  onChange={(e) => onChange(stage.no, { date: e.target.value || null })}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <input
                  type="text"
                  value={entry.note ?? ""}
                  onChange={(e) => onChange(stage.no, { note: e.target.value })}
                  placeholder="visto / nota"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="py-2 pr-3">Etapa</th>
              <th className="py-2 pr-3">Responsável</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3">Data</th>
              <th className="py-2">Visto / nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stages.map((stage) => {
              const entry =
                tracking.find((t) => t.stage === stage.no) ?? { stage: stage.no, state: "pending" as const };
              const done = entry.state === "done";
              return (
                <tr
                  key={stage.no}
                  className={cx("cursor-pointer", stage.no === currentStage && "bg-teal-50/50")}
                  onClick={() => onStageChange(stage.no)}
                >
                  <td className="py-2 pr-3 font-medium text-slate-700">
                    {stage.no} · {stage.title.split(" — ")[0]}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{stage.responsible}</td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleClose(stage.no, !done);
                      }}
                      className={cx(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {done && <Check width={12} height={12} />}
                      {done ? "Fechado" : "Pendente"}
                    </button>
                    {done && entry.signed_by && (
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {entry.signed_by}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="date"
                      value={entry.date ?? ""}
                      onChange={(e) => onChange(stage.no, { date: e.target.value || null })}
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={entry.note ?? ""}
                      onChange={(e) => onChange(stage.no, { note: e.target.value })}
                      placeholder="visto / nota"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: DucField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "checkbox") {
    const on = Boolean(value);
    return (
      <div
        className={cx(
          "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors sm:col-span-2",
          on ? "border-brand-100 bg-brand-50/40" : "border-slate-200"
        )}
      >
        <span className="text-sm text-slate-700">{field.label}</span>
        <Toggle checked={on} onChange={onChange} />
      </div>
    );
  }

  if (field.type === "phases") {
    return (
      <div className="sm:col-span-2">
        <span className="text-sm font-medium text-slate-700">{field.label}</span>
        <PhasesField value={value} onChange={onChange} />
        {field.hint && <span className="mt-1 block text-xs text-slate-400">{field.hint}</span>}
      </div>
    );
  }

  if (field.type === "address") {
    return (
      <div className="sm:col-span-2">
        <span className="text-sm font-medium text-slate-700">{field.label}</span>
        <AddressField value={value} onChange={onChange} />
        {field.hint && <span className="mt-1 block text-xs text-slate-400">{field.hint}</span>}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">{field.label}</span>
        <Combobox
          value={(value as string) ?? ""}
          onChange={onChange}
          className="w-full"
          options={[
            { value: "", label: "—" },
            ...(field.options ?? []).map((o) => ({ value: o, label: o })),
          ]}
        />
        {field.hint && <span className="block text-xs text-slate-400">{field.hint}</span>}
      </label>
    );
  }

  const isWide = field.type === "textarea";
  return (
    <label className={cx("block space-y-1", isWide && "sm:col-span-2")}>
      <span className="text-sm font-medium text-slate-700">{field.label}</span>
      {field.type === "textarea" ? (
        <Textarea
          rows={3}
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      )}
      {field.hint && <span className="block text-xs text-slate-400">{field.hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------

const EMPTY_PHASE: PaymentPhase = { label: "", percent: "", amount: "", due: "", note: "" };

function toPhases(value: unknown): PaymentPhase[] {
  if (!Array.isArray(value)) return [];
  return value.map((p) => ({ ...EMPTY_PHASE, ...(p as Partial<PaymentPhase>) }));
}

/** Editor de fases de pagamento — lista repetível com "+", guardada como array
 *  no bloco. Cada fase: rótulo, %, valor, vencimento e nota/condição. */
function PhasesField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const phases = toPhases(value);
  const update = (idx: number, patch: Partial<PaymentPhase>) =>
    onChange(phases.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const add = () =>
    onChange([...phases, { ...EMPTY_PHASE, label: `Fase ${phases.length + 1}` }]);
  const remove = (idx: number) => onChange(phases.filter((_, i) => i !== idx));

  const totalPct = phases.reduce((s, p) => s + (parseFloat(p.percent) || 0), 0);

  return (
    <div className="mt-1.5 space-y-2">
      {phases.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">
          Sem fases de pagamento. Adiciona a primeira.
        </p>
      ) : (
        phases.map((p, idx) => (
          <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/40 p-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">
                {idx + 1}
              </span>
              <input
                type="text"
                value={p.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                placeholder="Ex.: Sinal, Entrega, Final…"
                className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                title="Remover fase"
                className="shrink-0 text-slate-300 transition-colors hover:text-red-500"
              >
                <Trash width={15} height={15} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-400">%</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={p.percent}
                  onChange={(e) => update(idx, { percent: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-400">Valor (€)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={p.amount}
                  onChange={(e) => update(idx, { amount: e.target.value })}
                  placeholder="0,00"
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-400">Vencimento</span>
                <input
                  type="date"
                  value={p.due}
                  onChange={(e) => update(idx, { due: e.target.value })}
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-slate-400">Condição / nota</span>
                <input
                  type="text"
                  value={p.note}
                  onChange={(e) => update(idx, { note: e.target.value })}
                  placeholder="ex.: à adjudicação"
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand"
                />
              </label>
            </div>
          </div>
        ))
      )}
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={add} className="px-2.5 py-1.5 text-xs">
          <Plus width={14} height={14} /> Adicionar fase
        </Button>
        {phases.length > 0 && (
          <span
            className={cx(
              "text-xs tabular-nums",
              Math.abs(totalPct - 100) < 0.01 ? "text-emerald-600" : "text-slate-400"
            )}
          >
            Total: {totalPct % 1 === 0 ? totalPct : totalPct.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const EMPTY_ADDRESS: AddressValue = { street: "", number: "", postal: "", city: "" };

function toAddress(v: unknown): AddressValue {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return { ...EMPTY_ADDRESS, ...(v as Partial<AddressValue>) };
  }
  // Retrocompat: morada antiga guardada como texto → vai para a rua.
  if (typeof v === "string") return { ...EMPTY_ADDRESS, street: v };
  return EMPTY_ADDRESS;
}

/** Editor de morada estruturada (rua/número/código postal/localidade). */
function AddressField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const a = toAddress(value);
  const set = (patch: Partial<AddressValue>) => onChange({ ...a, ...patch });
  const inputCls =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand";
  return (
    <div className="mt-1.5 grid grid-cols-6 gap-2">
      <input
        className={cx(inputCls, "col-span-6 sm:col-span-4")}
        value={a.street}
        onChange={(e) => set({ street: e.target.value })}
        placeholder="Rua / morada"
      />
      <input
        className={cx(inputCls, "col-span-2")}
        value={a.number}
        onChange={(e) => set({ number: e.target.value })}
        placeholder="Nº"
      />
      <input
        className={cx(inputCls, "col-span-3 sm:col-span-2")}
        value={a.postal}
        onChange={(e) => set({ postal: e.target.value })}
        placeholder="Cód. postal"
      />
      <input
        className={cx(inputCls, "col-span-3 sm:col-span-4")}
        value={a.city}
        onChange={(e) => set({ city: e.target.value })}
        placeholder="Localidade"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

const OWN_FIELDS = new Set(["label", "description", "qty", "unit", "included"]);

function getCol(item: LocalItem, field: string): unknown {
  if (OWN_FIELDS.has(field)) return (item as unknown as Record<string, unknown>)[field];
  return item.meta[field];
}

function ItemsTable({
  section,
  items,
  onAdd,
  onUpdate,
  onRemove,
}: {
  section: DucItemSection;
  items: LocalItem[];
  onAdd: () => void;
  onUpdate: (key: string, patch: Partial<LocalItem>) => void;
  onRemove: (key: string) => void;
}) {
  const setCol = (item: LocalItem, field: string, raw: unknown) => {
    if (OWN_FIELDS.has(field)) {
      onUpdate(item.key, { [field]: raw } as Partial<LocalItem>);
    } else {
      onUpdate(item.key, { meta: { ...item.meta, [field]: raw } });
    }
  };

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{section.title}</h3>
          {section.hint && <p className="text-xs text-slate-400">{section.hint}</p>}
        </div>
        <Button variant="secondary" onClick={onAdd} className="px-2 py-1 text-xs print:hidden">
          <Plus width={14} height={14} /> Linha
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              {section.columns.map((c) => (
                <th key={c.field} className="px-2 py-2">
                  {c.label}
                </th>
              ))}
              <th className="w-8 px-2 py-2 print:hidden" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={section.columns.length + 1}
                  className="px-3 py-3 text-center text-xs text-slate-400"
                >
                  Sem linhas.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.key}>
                  {section.columns.map((col) => {
                    const val = getCol(item, col.field);
                    return (
                      <td key={col.field} className="px-2 py-1.5">
                        {col.type === "checkbox" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(val)}
                            onChange={(e) => setCol(item, col.field, e.target.checked)}
                            className="h-4 w-4 accent-teal-600"
                          />
                        ) : (
                          <input
                            type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
                            value={(val as string) ?? ""}
                            onChange={(e) => setCol(item, col.field, e.target.value)}
                            className="w-full min-w-[6rem] rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand"
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center print:hidden">
                    <button
                      type="button"
                      onClick={() => onRemove(item.key)}
                      className="text-slate-300 hover:text-red-500"
                      title="Remover linha"
                    >
                      <Trash width={14} height={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
