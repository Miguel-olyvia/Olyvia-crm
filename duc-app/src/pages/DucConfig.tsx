import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../components/flow/flow.css";

import { useAuth } from "../auth/AuthProvider";
import {
  fetchEffectiveStages,
  saveDucConfig,
  resetDucConfig,
} from "../lib/ducConfig";
import {
  VARIANT_LABELS,
  variantForOrgName,
  type DucField,
  type DucItemSection,
  type DucStage,
  type StageNotify,
} from "../lib/ducSchema";
import { fetchOrgMembers, type OrgMember } from "../lib/members";
import type { DucSection, DucVariant } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Select,
  Spinner,
  cx,
} from "../components/ui";
import {
  Plus,
  Save,
  AlertTriangle,
  Settings,
  Building,
  Check,
  ChevronRight,
  FileText,
  Sheet,
} from "../components/icons";
import {
  StageNodeComponent,
  type StageNode,
} from "../components/flow/StageNode";
import {
  StageInspector,
  type StageInspectorHandlers,
} from "../components/flow/StageInspector";

// ---------------------------------------------------------------------------

const SECTION_KEYS: DucSection[] = [
  "scope",
  "material",
  "consumable",
  "control_point",
  "change_log",
  "service_map",
];

/** Cópia profunda simples (as etapas são JSON puro). */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Reindexa `no` sequencialmente após adicionar/remover etapas. */
function reindex(stages: DucStage[]): void {
  stages.forEach((s, i) => {
    s.no = i + 1;
  });
}

const nodeTypes: NodeTypes = { ducStage: StageNodeComponent };

// Layout automático em pipeline vertical.
const NODE_X = 60;
const NODE_Y0 = 40;
const NODE_DY = 168;

// ---------------------------------------------------------------------------

export default function DucConfig() {
  const { orgs, activeOrgId, businessUserId } = useAuth();

  const [orgId, setOrgId] = useState<string | null>(activeOrgId);
  const [stages, setStages] = useState<DucStage[]>([]);
  const [custom, setCustom] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);

  const activeOrg = useMemo(
    () => orgs.find((o) => o.id === orgId) ?? null,
    [orgs, orgId]
  );
  const variant: DucVariant = useMemo(
    () => variantForOrgName(activeOrg?.name),
    [activeOrg]
  );

  useEffect(() => {
    if (orgId && orgs.some((o) => o.id === orgId)) return;
    setOrgId(activeOrgId ?? orgs[0]?.id ?? null);
  }, [orgs, orgId, activeOrgId]);

  const load = useCallback(async () => {
    if (!orgId) {
      setStages([]);
      setCustom(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEffectiveStages(orgId, variant);
      setStages(res.stages);
      setCustom(res.custom);
      setDirty(false);
      setSavedAt(null);
      setSelectedIdx(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar a configuração.");
    } finally {
      setLoading(false);
    }
  }, [orgId, variant]);

  useEffect(() => {
    void load();
  }, [load]);

  // Membros da organização (destinatários de notificações por etapa).
  useEffect(() => {
    if (!orgId) {
      setMembers([]);
      return;
    }
    let alive = true;
    void fetchOrgMembers(orgId).then((m) => {
      if (alive) setMembers(m);
    });
    return () => {
      alive = false;
    };
  }, [orgId]);

  // ---- mutações da árvore (todas marcam dirty) ---------------------------

  const mutate = useCallback((fn: (draft: DucStage[]) => void) => {
    setStages((prev) => {
      const draft = clone(prev);
      fn(draft);
      return draft;
    });
    setDirty(true);
  }, []);

  const patchStage = useCallback(
    (idx: number, patch: Partial<Pick<DucStage, "title" | "responsible" | "intro">>) => {
      mutate((draft) => {
        draft[idx] = { ...draft[idx], ...patch };
      });
    },
    [mutate]
  );

  // -- etapas ---------------------------------------------------------------

  const addStage = useCallback(() => {
    let newIdx = 0;
    mutate((draft) => {
      const n = draft.length + 1;
      draft.push({
        no: n,
        key: "etapa_" + Date.now().toString(36),
        title: "Nova etapa",
        responsible: "",
        fields: [],
      });
      reindex(draft);
      newIdx = draft.length - 1;
    });
    setSelectedIdx(newIdx);
  }, [mutate]);

  const removeStage = useCallback(
    (idx: number) => {
      mutate((draft) => {
        draft.splice(idx, 1);
        reindex(draft);
      });
      setSelectedIdx(null);
    },
    [mutate]
  );

  // -- campos ---------------------------------------------------------------

  const addField = useCallback(
    (stageIdx: number) => {
      mutate((draft) => {
        draft[stageIdx].fields.push({
          key: uniqueFieldKey(draft[stageIdx].fields, "campo"),
          label: "Novo campo",
          type: "text",
        });
      });
    },
    [mutate]
  );

  const removeField = useCallback(
    (stageIdx: number, fieldIdx: number) => {
      mutate((draft) => {
        draft[stageIdx].fields.splice(fieldIdx, 1);
      });
    },
    [mutate]
  );

  const patchField = useCallback(
    (stageIdx: number, fieldIdx: number, patch: Partial<DucField>) => {
      mutate((draft) => {
        draft[stageIdx].fields[fieldIdx] = {
          ...draft[stageIdx].fields[fieldIdx],
          ...patch,
        };
      });
    },
    [mutate]
  );

  const moveField = useCallback(
    (stageIdx: number, fieldIdx: number, dir: -1 | 1) => {
      mutate((draft) => {
        const arr = draft[stageIdx].fields;
        const target = fieldIdx + dir;
        if (target < 0 || target >= arr.length) return;
        const [f] = arr.splice(fieldIdx, 1);
        arr.splice(target, 0, f);
      });
    },
    [mutate]
  );

  // -- secções de itens -----------------------------------------------------

  const addSection = useCallback(
    (stageIdx: number) => {
      mutate((draft) => {
        const stage = draft[stageIdx];
        if (!stage.itemSections) stage.itemSections = [];
        const sections = stage.itemSections;
        const used = new Set(sections.map((s) => s.section));
        const free: DucSection = SECTION_KEYS.find((k) => !used.has(k)) ?? "scope";
        sections.push({
          section: free,
          title: "Nova secção",
          columns: [{ field: "label", label: "Descrição", type: "text", own: true }],
        });
      });
    },
    [mutate]
  );

  const removeSection = useCallback(
    (stageIdx: number, sectionIdx: number) => {
      mutate((draft) => {
        draft[stageIdx].itemSections?.splice(sectionIdx, 1);
      });
    },
    [mutate]
  );

  const patchSection = useCallback(
    (
      stageIdx: number,
      sectionIdx: number,
      patch: Partial<Pick<DucItemSection, "section" | "title" | "hint">>
    ) => {
      mutate((draft) => {
        const sections = draft[stageIdx].itemSections;
        if (!sections) return;
        sections[sectionIdx] = { ...sections[sectionIdx], ...patch };
      });
    },
    [mutate]
  );

  const addColumn = useCallback(
    (stageIdx: number, sectionIdx: number) => {
      mutate((draft) => {
        draft[stageIdx].itemSections?.[sectionIdx].columns.push({
          field: "meta_" + Date.now().toString(36),
          label: "Nova coluna",
          type: "text",
        });
      });
    },
    [mutate]
  );

  const removeColumn = useCallback(
    (stageIdx: number, sectionIdx: number, colIdx: number) => {
      mutate((draft) => {
        draft[stageIdx].itemSections?.[sectionIdx].columns.splice(colIdx, 1);
      });
    },
    [mutate]
  );

  const patchColumn = useCallback(
    (
      stageIdx: number,
      sectionIdx: number,
      colIdx: number,
      patch: Partial<DucItemSection["columns"][number]>
    ) => {
      mutate((draft) => {
        const col = draft[stageIdx].itemSections?.[sectionIdx].columns[colIdx];
        if (!col) return;
        draft[stageIdx].itemSections![sectionIdx].columns[colIdx] = { ...col, ...patch };
      });
    },
    [mutate]
  );

  const patchNotify = useCallback(
    (idx: number, notify: StageNotify) => {
      mutate((draft) => {
        draft[idx] = { ...draft[idx], notify };
      });
    },
    [mutate]
  );

  const handlers: StageInspectorHandlers = useMemo(
    () => ({
      onPatchStage: patchStage,
      onAddField: addField,
      onRemoveField: removeField,
      onPatchField: patchField,
      onMoveField: moveField,
      onAddSection: addSection,
      onRemoveSection: removeSection,
      onPatchSection: patchSection,
      onAddColumn: addColumn,
      onRemoveColumn: removeColumn,
      onPatchColumn: patchColumn,
      onPatchNotify: patchNotify,
    }),
    [
      patchStage,
      addField,
      removeField,
      patchField,
      moveField,
      addSection,
      removeSection,
      patchSection,
      addColumn,
      removeColumn,
      patchColumn,
      patchNotify,
    ]
  );

  // ---- validação ----------------------------------------------------------

  const fieldKeyErrors = useMemo(() => {
    const errors: Record<number, Set<string>> = {};
    stages.forEach((stage, i) => {
      const seen = new Map<string, number>();
      const bad = new Set<string>();
      stage.fields.forEach((f) => {
        const key = f.key.trim();
        if (!key) {
          bad.add(f.key);
          return;
        }
        seen.set(key, (seen.get(key) ?? 0) + 1);
      });
      seen.forEach((count, key) => {
        if (count > 1) bad.add(key);
      });
      if (bad.size > 0 || stage.fields.some((f) => !f.key.trim())) errors[i] = bad;
    });
    return errors;
  }, [stages]);

  const hasErrors = useMemo(() => fieldKeyHasDup(stages), [stages]);

  // ---- modelo do React Flow (derivado do estado das etapas) --------------

  const nodes = useMemo<StageNode[]>(
    () =>
      stages.map((stage, i) => ({
        id: String(i),
        type: "ducStage",
        position: { x: NODE_X, y: NODE_Y0 + i * NODE_DY },
        data: {
          no: stage.no,
          title: stage.title,
          responsible: stage.responsible,
          fieldCount: stage.fields.length,
          sectionCount: stage.itemSections?.length ?? 0,
          hasError: (fieldKeyErrors[i]?.size ?? 0) > 0 ||
            stage.fields.some((f) => !f.key.trim()),
          isFirst: i === 0,
          isLast: i === stages.length - 1,
        },
        selected: selectedIdx === i,
      })),
    [stages, fieldKeyErrors, selectedIdx]
  );

  const edges = useMemo<Edge[]>(
    () =>
      stages.slice(0, -1).map((_, i) => ({
        id: `e-${i}-${i + 1}`,
        source: String(i),
        target: String(i + 1),
        type: "smoothstep",
        animated: true,
      })),
    [stages]
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_evt, node) => {
    setSelectedIdx(Number(node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedIdx(null);
  }, []);

  // ---- ações --------------------------------------------------------------

  const save = useCallback(async () => {
    if (!orgId || saving || hasErrors) return;
    setSaving(true);
    setError(null);
    const err = await saveDucConfig(orgId, stages, businessUserId);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setCustom(true);
    setDirty(false);
    setSavedAt(new Date().toLocaleTimeString("pt-PT"));
  }, [orgId, saving, hasErrors, stages, businessUserId]);

  const doReset = useCallback(async () => {
    setConfirmReset(false);
    if (!orgId) return;
    setSaving(true);
    setError(null);
    const err = await resetDucConfig(orgId);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    await load();
  }, [orgId, load]);

  const selectedStage =
    selectedIdx !== null ? stages[selectedIdx] ?? null : null;

  // ---- render -------------------------------------------------------------

  return (
    <div className="flex min-h-[560px] flex-col md:h-[calc(100vh-9rem)]">
      {/* Toolbar — identidade à esquerda, org+estado ao centro, ações à direita.
          Em mobile empilha em linhas que quebram sem transbordar. */}
      <Card className="mb-4 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          {/* Identidade */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <Settings width={18} height={18} />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight text-slate-800">
                Configuração do DUC
              </h1>
              <p className="truncate text-xs text-slate-400">
                Fluxo de etapas · clique numa etapa para editar
              </p>
            </div>
          </div>

          <div className="hidden h-8 w-px bg-slate-200 lg:block" />

          {/* Organização + variante/estado */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <Building width={16} height={16} className="shrink-0 text-slate-400" />
              <Select
                value={orgId ?? ""}
                onChange={(e) => setOrgId(e.target.value || null)}
                className="min-w-0 flex-1 sm:min-w-[13rem]"
              >
                {orgs.length === 0 && <option value="">Sem organizações</option>}
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex items-center gap-2">
              <Badge className="bg-slate-50 text-slate-600 ring-slate-200">
                {VARIANT_LABELS[variant]}
              </Badge>
              {custom ? (
                <Badge className="bg-brand-50 text-brand-800 ring-brand-100">
                  <Check width={12} height={12} /> Personalizado
                </Badge>
              ) : (
                <Badge>Template base</Badge>
              )}
            </div>
          </div>

          {/* Estado de guardado + ações */}
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <span className="mr-auto text-xs lg:mr-1">
              {error ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 font-medium text-red-600 ring-1 ring-inset ring-red-100">
                  <AlertTriangle width={13} height={13} /> {error}
                </span>
              ) : saving ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1 text-slate-500 ring-1 ring-inset ring-slate-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                  A guardar…
                </span>
              ) : hasErrors ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700 ring-1 ring-inset ring-amber-100">
                  <AlertTriangle width={13} height={13} /> Chaves em falta/duplicadas
                </span>
              ) : dirty ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700 ring-1 ring-inset ring-amber-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Alterações por guardar
                </span>
              ) : savedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-1 font-medium text-teal-700 ring-1 ring-inset ring-teal-100">
                  <Check width={13} height={13} /> Guardado às {savedAt}
                </span>
              ) : (
                ""
              )}
            </span>

            <Button variant="secondary" size="sm" onClick={addStage} disabled={!orgId}>
              <Plus width={15} height={15} /> Etapa
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={saving || !custom}
            >
              <AlertTriangle width={15} height={15} />
              <span className="hidden sm:inline">Repor template</span>
              <span className="sm:hidden">Repor</span>
            </Button>
            <Button onClick={() => void save()} disabled={saving || !dirty || hasErrors}>
              <Save width={16} height={16} /> Guardar
            </Button>
          </div>
        </div>
      </Card>

      {/* Canvas + inspetor. Em mobile a altura acompanha o conteúdo (lista);
          em ≥md ocupa o resto do ecrã para o canvas ReactFlow. */}
      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-slate-200/80 shadow-card md:min-h-0">
        {loading ? (
          <div className="flex h-full min-h-[420px] items-center justify-center bg-white">
            <Spinner label="A carregar configuração…" />
          </div>
        ) : !orgId ? (
          <div className="flex h-full min-h-[420px] items-center justify-center bg-white">
            <EmptyState
              icon={<Building width={22} height={22} />}
              title="Selecione uma organização"
              description="Escolha uma organização na barra acima para ver e configurar o fluxo do DUC."
            />
          </div>
        ) : stages.length === 0 ? (
          <div className="flex h-full min-h-[420px] items-center justify-center bg-white">
            <EmptyState
              icon={<Settings width={22} height={22} />}
              title="Sem etapas nesta organização"
              description="Comece por adicionar a primeira etapa do fluxo."
              action={
                <Button variant="secondary" size="sm" onClick={addStage}>
                  <Plus width={15} height={15} /> Adicionar etapa
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Canvas ReactFlow — só em ≥md (arrastar não funciona bem em ecrã pequeno). */}
            <ReactFlow
              className="duc-flow hidden h-full md:block"
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              nodesConnectable={false}
              deleteKeyCode={null}
            >
              <Background gap={22} size={1.5} color="#cbd5e1" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) =>
                  (n.data as { hasError?: boolean })?.hasError ? "#fca5a5" : "#5eead4"
                }
                nodeStrokeColor="#0f766e"
                maskColor="rgba(241, 245, 249, 0.7)"
                className="!bottom-4 !right-4"
              />
            </ReactFlow>

            {/* Lista vertical de etapas — alternativa usável em mobile (< md).
                Usa o MESMO estado/handler de seleção que o clique no nó. */}
            <div className="h-full overflow-y-auto bg-slate-50/60 p-3 md:hidden">
              <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] text-slate-400 ring-1 ring-inset ring-slate-200">
                <AlertTriangle width={12} height={12} className="shrink-0" />
                Melhor visto em ecrã maior para arrastar as etapas.
              </div>
              <ul className="space-y-2">
                {stages.map((stage, i) => {
                  const stageHasError =
                    (fieldKeyErrors[i]?.size ?? 0) > 0 ||
                    stage.fields.some((f) => !f.key.trim());
                  const sectionCount = stage.itemSections?.length ?? 0;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setSelectedIdx(i)}
                        className={cx(
                          "flex w-full items-center gap-3 rounded-xl border bg-white px-3 py-3 text-left shadow-card transition-colors",
                          selectedIdx === i
                            ? "border-brand ring-2 ring-brand/30"
                            : stageHasError
                              ? "border-red-300"
                              : "border-slate-200/80 hover:border-slate-300"
                        )}
                      >
                        <span
                          className={cx(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ring-1",
                            stageHasError
                              ? "bg-red-50 text-red-600 ring-red-100"
                              : "bg-brand-50 text-brand-800 ring-brand-100"
                          )}
                        >
                          {stage.no}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold leading-tight text-slate-800">
                            {stage.title || "Sem título"}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {stage.responsible || "Sem responsável"}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                              <FileText width={11} height={11} /> {stage.fields.length}{" "}
                              {stage.fields.length === 1 ? "campo" : "campos"}
                            </span>
                            {sectionCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-inset ring-teal-100">
                                <Sheet width={11} height={11} /> {sectionCount}{" "}
                                {sectionCount === 1 ? "tabela" : "tabelas"}
                              </span>
                            )}
                            {stageHasError && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600 ring-1 ring-inset ring-red-100">
                                <AlertTriangle width={11} height={11} /> Chaves inválidas
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          width={16}
                          height={16}
                          className="shrink-0 text-slate-300"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Drawer do inspetor — ecrã inteiro em mobile, painel lateral em ≥sm. */}
            <div
              className={cx(
                "absolute inset-y-0 right-0 z-10 w-full border-l border-slate-200 bg-white shadow-elevated transition-transform duration-200 ease-out sm:max-w-[26rem]",
                selectedStage ? "translate-x-0" : "pointer-events-none translate-x-full"
              )}
            >
              {selectedStage && selectedIdx !== null && (
                <StageInspector
                  stage={selectedStage}
                  stageIdx={selectedIdx}
                  keyErrors={fieldKeyErrors[selectedIdx]}
                  members={members}
                  handlers={handlers}
                  onClose={() => setSelectedIdx(null)}
                  onDelete={() => setConfirmDelete(selectedIdx)}
                />
              )}
            </div>
          </>
        )}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Repor template base"
          confirmLabel="Repor"
          message={
            <>
              Isto apaga a configuração personalizada desta organização e volta ao
              template base da variante <strong>{VARIANT_LABELS[variant]}</strong>. Os
              DUCs já criados não são afetados.
            </>
          }
          onConfirm={() => void doReset()}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {confirmDelete !== null && (
        <ConfirmDialog
          title="Eliminar etapa"
          confirmLabel="Eliminar"
          message={
            <>
              Eliminar a etapa{" "}
              <strong>
                {stages[confirmDelete]?.no}. {stages[confirmDelete]?.title}
              </strong>
              ? As restantes etapas serão renumeradas. Esta ação só é permanente após
              Guardar.
            </>
          }
          onConfirm={() => {
            const idx = confirmDelete;
            setConfirmDelete(null);
            removeStage(idx);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers de validação/chaves.

function uniqueFieldKey(fields: DucField[], base: string): string {
  const used = new Set(fields.map((f) => f.key));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function fieldKeyHasDup(stages: DucStage[]): boolean {
  return stages.some((stage) => {
    const seen = new Set<string>();
    for (const f of stage.fields) {
      const key = f.key.trim();
      if (!key) return true;
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  });
}
