import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Edge, type Node,
  MarkerType, Handle, Position, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, Undo2, Redo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import type { WorkflowStage } from "./LeadWorkflowConfig";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface Props {
  stages: WorkflowStage[];
  companyId: string | null;
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
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});
  const { canUndo, canRedo, pushSnapshot, undo, redo, reset: resetHistory } = useUndoRedo();

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

  useEffect(() => {
    const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
    const COLS = 3, X_GAP = 220, Y_GAP = 120;
    const newNodes: Node[] = sorted.map((s, i) => ({
      id: s.id, type: "stage",
      position: { x: (i % COLS) * X_GAP + 50, y: Math.floor(i / COLS) * Y_GAP + 50 },
      data: { label: s.label, color: s.color, is_conversion: s.is_conversion, is_rejection: s.is_rejection, is_final: s.is_final, leadCount: leadCounts[s.id] || 0 },
    }));
    setNodes(newNodes);
  }, [stages, leadCounts]);

  const loadEdges = useCallback(async () => {
    if (!companyId) return;
    const { data } = await (supabase.from("lead_stage_transitions" as any) as any)
      .select("*").eq("organization_id", companyId).eq("is_active", true);
    if (data) {
      setEdges((data as any[]).map((t: any) => ({
        id: t.id, source: t.from_stage_id, target: t.to_stage_id,
        label: t.label || "", markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 },
      })));
    }
    setHasChanges(false);
    resetHistory();
  }, [companyId, setEdges, resetHistory]);

  useEffect(() => { loadEdges(); }, [companyId, stages]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => {
      pushSnapshot(eds);
      return addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }, eds);
    });
    setHasChanges(true);
  }, [setEdges, pushSnapshot]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await (supabase.from("lead_stage_transitions" as any) as any).delete().eq("organization_id", companyId);
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
      toast({ title: "Transições guardadas" });
      setHasChanges(false);
      resetHistory();
    } catch (e: any) {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Arraste conexões entre estágios para definir transições válidas. Elimine arestas clicando e premindo Delete.</p>
          <div className="flex items-center gap-0.5 ml-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleUndo} disabled={!canUndo || saving} title="Desfazer">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRedo} disabled={!canRedo || saving} title="Refazer">
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button size="sm" variant="outline" onClick={loadEdges}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reverter
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "A guardar..." : "Guardar"}
          </Button>
        </div>
      </div>
      <div className="h-[400px] border rounded-lg overflow-hidden bg-muted/20">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange}
          onEdgesChange={(changes) => {
            if (changes.some((c) => c.type === "remove")) {
              pushSnapshot(edges);
              setHasChanges(true);
            }
            onEdgesChange(changes);
          }}
          onConnect={onConnect} nodeTypes={nodeTypes} fitView deleteKeyCode="Delete" proOptions={{ hideAttribution: true }}>
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap nodeStrokeWidth={3} pannable zoomable className="!bg-background" />
        </ReactFlow>
      </div>
    </div>
  );
}
