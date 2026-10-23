import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Edge, type Node, type NodeChange,
  MarkerType, Handle, Position, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, Undo2, Redo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import type { WorkflowStage } from "./LeadWorkflowConfig";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { leadPipelineRulesQueryKey } from "@/hooks/useLeadPipelineRules";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  stages: WorkflowStage[];
  companyId: string | null;
}

type StagePositions = Record<string, { x: number; y: number }>;

const COLS = 3, X_GAP = 220, Y_GAP = 120;

/** Posição de fallback na grelha, só usada por estágios sem posição conhecida. */
function gridPosition(index: number) {
  return { x: (index % COLS) * X_GAP + 50, y: Math.floor(index / COLS) * Y_GAP + 50 };
}

/** Aceita apenas entradas {x,y} numéricas — jsonb corrompido não parte o canvas. */
function normalizeStagePositions(raw: unknown): StagePositions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StagePositions = {};
  for (const [stageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[stageId] = { x, y };
  }
  return out;
}

function StageNode({ data }: NodeProps) {
  const d = data as { label: string; color: string; is_conversion: boolean; is_rejection: boolean; is_final: boolean; leadCount: number };
  return (
    <div className="rounded-lg border-2 bg-background shadow-md px-4 py-3 min-w-[140px] text-center" style={{ borderColor: d.color }}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      <div className="flex flex-col items-center gap-1">
        <div className="w-3 h-3 rounded-full mx-auto" style={{ backgroundColor: d.color }} />
        <span className="font-semibold text-sm">{d.label}</span>
        <div className="flex gap-1 justify-center">
          {d.is_conversion && <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5 py-0">Win</Badge>}
          {d.is_rejection && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5 py-0">Lost</Badge>}
          {d.is_final && !d.is_conversion && !d.is_rejection && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Final</Badge>}
        </div>
        {d.leadCount > 0 && <span className="text-[10px] text-muted-foreground">{d.leadCount} leads</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2.5 !h-2.5" />
    </div>
  );
}

const nodeTypes = { stage: StageNode };

export function WorkflowFlowchart({ stages, companyId }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});
  const [enforceTransitions, setEnforceTransitions] = useState(false);
  // `lead_pipeline_settings.sequential_flow` — default false, igual ao da coluna:
  // sem linha na BD a organização corre o motor histórico (salta para a etapa
  // mais avançada que bate).
  const [sequentialFlow, setSequentialFlow] = useState(false);
  // `null` = definições ainda não lidas da BD. Enquanto for null NÃO construímos
  // nós, senão a grelha ganhava sempre à posição guardada (ver buildNodes).
  const [savedPositions, setSavedPositions] = useState<StagePositions | null>(null);
  const settingsReady = savedPositions !== null;
  const { canUndo, canRedo, pushSnapshot, undo, redo, reset: resetHistory } = useUndoRedo();

  // Lidos dentro de efeitos sem entrarem nas dependências: mudar contagens ou
  // posições guardadas não pode disparar a reconstrução dos nós.
  const savedPositionsRef = useRef<StagePositions>({});
  const leadCountsRef = useRef<Record<string, number>>({});
  leadCountsRef.current = leadCounts;

  // O pai (LeadWorkflowConfig) recria o array `stages` a cada render, por isso
  // a identidade referencial não serve como dependência — usamos uma assinatura
  // do conteúdo que realmente afeta os nós.
  const stagesSignature = useMemo(
    () => [...stages]
      .sort((a, b) => a.stage_order - b.stage_order)
      .map(s => `${s.id}|${s.label}|${s.color}|${s.is_conversion ? 1 : 0}|${s.is_rejection ? 1 : 0}|${s.is_final ? 1 : 0}`)
      .join("~"),
    [stages]
  );

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("anew_leads").select("workflow_stage_id")
        .eq("organization_id", companyId).neq("status", "converted");
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((l: any) => { if (l.workflow_stage_id) counts[l.workflow_stage_id] = (counts[l.workflow_stage_id] || 0) + 1; });
        setLeadCounts(counts);
      }
    })();
  }, [companyId]);

  /**
   * Lê `lead_pipeline_settings` (layout guardado + interruptor de restrição).
   * `applyToNodes` é usado pelo botão Reverter, para repor no canvas as
   * posições que estão realmente gravadas.
   */
  const loadSettings = useCallback(async (applyToNodes = false) => {
    if (!companyId) return;
    const { data, error } = await (supabase.from("lead_pipeline_settings") as any)
      .select("stage_positions, enforce_stage_transitions, sequential_flow")
      .eq("organization_id", companyId)
      .maybeSingle();

    if (error) {
      console.error("Error loading lead pipeline settings:", error);
      captureFlowError(error, "db-error-leaked-to-ui");
    }

    const positions = normalizeStagePositions(data?.stage_positions);
    savedPositionsRef.current = positions;
    setSavedPositions(positions);
    setEnforceTransitions(data?.enforce_stage_transitions === true);
    setSequentialFlow(data?.sequential_flow === true);

    if (applyToNodes) {
      setNodes(nds => nds.map(n => (positions[n.id] ? { ...n, position: { ...positions[n.id] } } : n)));
    }
  }, [companyId, setNodes]);

  // Recomeça do zero quando a organização muda: descarta o layout da org
  // anterior antes de voltar a construir nós.
  useEffect(() => {
    savedPositionsRef.current = {};
    setSavedPositions(null);
    setNodes([]);
    loadSettings();
  }, [companyId, loadSettings, setNodes]);

  /**
   * Constrói/reconcilia os nós. Ordem de preferência para a posição de cada
   * estágio: (a) posição atual no canvas — nunca sobrescrever o que o
   * utilizador arrastou; (b) posição guardada em `stage_positions`; (c) grelha
   * de 3 colunas, só para estágios novos que nunca tiveram posição.
   *
   * Não depende de `leadCounts`: as contagens são aplicadas num efeito à parte
   * (abaixo), que só mexe em `data`. Assim, a chegada da query assíncrona de
   * contagens deixou de reposicionar tudo.
   */
  useEffect(() => {
    if (!settingsReady) return;
    const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
    setNodes(prev => {
      const prevById = new Map(prev.map(n => [n.id, n]));
      return sorted.map((s, i) => {
        const existing = prevById.get(s.id);
        const saved = savedPositionsRef.current[s.id];
        const position = existing?.position ?? (saved ? { ...saved } : gridPosition(i));
        return {
          ...(existing ?? {}),
          id: s.id,
          type: "stage",
          position,
          data: {
            label: s.label,
            color: s.color,
            is_conversion: s.is_conversion,
            is_rejection: s.is_rejection,
            is_final: s.is_final,
            leadCount: leadCountsRef.current[s.id] || 0,
          },
        } as Node;
      });
    });
    // `stagesSignature` cobre todos os campos de `stages` usados aqui; usar o
    // array em si faria isto correr a cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagesSignature, settingsReady, setNodes]);

  // Só `data.leadCount` — as posições ficam intocadas.
  useEffect(() => {
    setNodes(nds => nds.map(n => {
      const count = leadCounts[n.id] || 0;
      if ((n.data as { leadCount?: number }).leadCount === count) return n;
      return { ...n, data: { ...n.data, leadCount: count } };
    }));
  }, [leadCounts, setNodes]);

  const loadEdges = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await (supabase.from("lead_stage_transitions" as any) as any)
      .select("*").eq("organization_id", companyId).eq("is_active", true);
    if (error) {
      console.error("Error loading lead stage transitions:", error);
      captureFlowError(error, "db-error-leaked-to-ui");
    }
    if (data) {
      setEdges((data as any[]).map((t: any) => ({
        id: t.id, source: t.from_stage_id, target: t.to_stage_id,
        label: t.label || "", markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 },
      })));
    }
    setHasChanges(false);
    resetHistory();
  }, [companyId, setEdges, resetHistory]);

  // Depende da assinatura dos estágios, não do array: o pai recria-o a cada
  // render e isto limpava o `hasChanges` de trabalho ainda por guardar.
  useEffect(() => {
    loadEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, stagesSignature]);

  const handleRevert = useCallback(async () => {
    await Promise.all([loadEdges(), loadSettings(true)]);
    setHasChanges(false);
  }, [loadEdges, loadSettings]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => {
      pushSnapshot(eds);
      return addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }, eds);
    });
    setHasChanges(true);
  }, [setEdges, pushSnapshot]);

  /**
   * Um arrasto emite dezenas de NodePositionChange com `dragging: true` e um
   * último com `dragging: false` — marcamos alterações só no fim, para não
   * acender o botão Guardar a cada pixel (nem em mudanças de seleção).
   */
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    if (changes.some(c => c.type === "position" && c.dragging === false)) {
      setHasChanges(true);
    }
  }, [onNodesChange]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { error: deleteError } = await (supabase.from("lead_stage_transitions" as any) as any).delete().eq("organization_id", companyId);
      if (deleteError) throw deleteError;
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const inserts = edges.map((e) => ({
        organization_id: companyId, from_stage_id: e.source, to_stage_id: e.target,
        label: (e.label as string) || null, created_by: businessUserId,
      }));
      if (inserts.length > 0) {
        const { error } = await (supabase.from("lead_stage_transitions" as any) as any).insert(inserts);
        if (error) throw error;
      }

      // Layout + interruptor de restrição vivem numa linha por organização.
      const stagePositions: StagePositions = {};
      for (const node of nodes) {
        if (!Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) continue;
        stagePositions[node.id] = { x: node.position.x, y: node.position.y };
      }
      // `created_by` fica de fora de propósito: num upsert seria reescrito a
      // cada gravação e perdia-se quem criou a configuração. `updated_at` é do
      // trigger update_lead_pipeline_settings_updated_at / do default.
      const { error: settingsError } = await (supabase.from("lead_pipeline_settings") as any).upsert({
        organization_id: companyId,
        stage_positions: stagePositions,
        enforce_stage_transitions: enforceTransitions,
        sequential_flow: sequentialFlow,
        updated_by: businessUserId,
      }, { onConflict: "organization_id" });
      if (settingsError) throw settingsError;

      savedPositionsRef.current = stagePositions;
      setSavedPositions(stagePositions);

      toast({ title: "Transições guardadas" });
      setHasChanges(false);
      resetHistory();
      // Quem lê a restrição (Kanban, ação em massa, diálogos) usa esta query.
      queryClient.invalidateQueries({ queryKey: leadPipelineRulesQueryKey(companyId) });
    } catch (e: any) {
      captureFlowError(e, "lead-lifecycle");
      toast({ title: "Erro ao guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = useCallback(() => {
    undo(edges, (newEdges) => setEdges(newEdges));
    setHasChanges(true);
  }, [edges, undo, setEdges]);

  const handleRedo = useCallback(() => {
    redo(edges, (newEdges) => setEdges(newEdges));
    setHasChanges(true);
  }, [edges, redo, setEdges]);

  if (stages.length === 0) {
    return <div className="text-center text-muted-foreground py-8">Configure estágios primeiro para definir transições.</div>;
  }

  // Só reenquadra na primeira montagem e apenas quando não há layout guardado —
  // com layout gravado, respeita-se exatamente o que o utilizador deixou.
  const shouldFitView = settingsReady && Object.keys(savedPositions ?? {}).length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Arraste conexões entre estágios para definir transições válidas. Elimine arestas clicando e premindo Delete. As posições das caixas são guardadas.</p>
          <div className="flex items-center gap-0.5 ml-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleUndo} disabled={!canUndo || saving} title="Desfazer">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRedo} disabled={!canRedo || saving} title="Refazer">
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <Switch
                id="enforce-stage-transitions"
                checked={enforceTransitions}
                disabled={saving || !settingsReady}
                onCheckedChange={(checked) => { setEnforceTransitions(checked); setHasChanges(true); }}
              />
              <div className="max-w-[260px]">
                <Label htmlFor="enforce-stage-transitions" className="text-xs font-medium cursor-pointer">
                  Restringir transições ao fluxo desenhado
                </Label>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  Aplica-se apenas a mudanças de estágio feitas por utilizadores. O motor automático (avanço automático e recomputação por sinais) nunca é bloqueado.
                </p>
              </div>
            </div>
            {/* `sequential_flow`: escolhe o motor de cálculo da etapa. */}
            <div className="flex items-start gap-2">
              <Switch
                id="sequential-flow"
                checked={sequentialFlow}
                disabled={saving || !settingsReady}
                onCheckedChange={(checked) => { setSequentialFlow(checked); setHasChanges(true); }}
              />
              <div className="max-w-[260px]">
                <Label htmlFor="sequential-flow" className="text-xs font-medium cursor-pointer">
                  {t("leads.workflow.sequentialFlowLabel")}
                </Label>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {t("leads.workflow.sequentialFlowHint")}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {hasChanges && (
              <Button size="sm" variant="outline" onClick={handleRevert} disabled={saving}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reverter
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "A guardar..." : "Guardar"}
            </Button>
          </div>
        </div>
      </div>
      <div className="h-[400px] border rounded-lg overflow-hidden bg-muted/20">
        {settingsReady ? (
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={handleNodesChange}
            onEdgesChange={(changes) => {
              if (changes.some((c) => c.type === "remove")) {
                pushSnapshot(edges);
                setHasChanges(true);
              }
              onEdgesChange(changes);
            }}
            onConnect={onConnect} nodeTypes={nodeTypes} fitView={shouldFitView} deleteKeyCode="Delete" proOptions={{ hideAttribution: true }}>
            <Background gap={16} size={1} />
            <Controls showInteractive={false} />
            <MiniMap nodeStrokeWidth={3} pannable zoomable className="!bg-background" />
          </ReactFlow>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">A carregar diagrama...</div>
        )}
      </div>
    </div>
  );
}
