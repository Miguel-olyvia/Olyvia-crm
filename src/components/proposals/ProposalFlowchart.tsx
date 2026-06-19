import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Edge, type Node,
  MarkerType, Handle, Position, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, Undo2, Redo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useUndoRedo } from "@/hooks/useUndoRedo";

interface WorkflowStage {
  id: string;
  organization_id: string | null;
  name: string;
  label: string;
  color: string;
  stage_order: number;
  is_final: boolean;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
}

interface Props {
  stages: WorkflowStage[];
  companyId: string | null;
}

function StageNode({ data }: NodeProps) {
  const d = data as { label: string; color: string; is_won: boolean; is_lost: boolean; is_final: boolean; proposalCount: number };
  return (
    <div className="rounded-lg border-2 bg-background shadow-md px-4 py-3 min-w-[140px] text-center" style={{ borderColor: d.color }}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      <div className="flex flex-col items-center gap-1">
        <div className="w-3 h-3 rounded-full mx-auto" style={{ backgroundColor: d.color }} />
        <span className="font-semibold text-sm">{d.label}</span>
        <div className="flex gap-1 justify-center">
          {d.is_won && <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5 py-0">Ganho</Badge>}
          {d.is_lost && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5 py-0">Perdido</Badge>}
          {d.is_final && !d.is_won && !d.is_lost && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Final</Badge>}
        </div>
        {d.proposalCount > 0 && <span className="text-[10px] text-muted-foreground">{d.proposalCount} propostas</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2.5 !h-2.5" />
    </div>
  );
}

const nodeTypes = { stage: StageNode };

export function ProposalFlowchart({ stages, companyId }: Props) {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proposalCounts, setProposalCounts] = useState<Record<string, number>>({});
  const { canUndo, canRedo, pushSnapshot, undo, redo, reset: resetHistory } = useUndoRedo();

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await supabase.from("proposals").select("stage_id").eq("organization_id", companyId);
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((p: any) => { if (p.stage_id) counts[p.stage_id] = (counts[p.stage_id] || 0) + 1; });
        setProposalCounts(counts);
      }
    })();
  }, [companyId]);

  useEffect(() => {
    const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
    const COLS = 3, X_GAP = 220, Y_GAP = 120;
    const newNodes: Node[] = sorted.map((s, i) => ({
      id: s.id, type: "stage",
      position: { x: (i % COLS) * X_GAP + 50, y: Math.floor(i / COLS) * Y_GAP + 50 },
      data: { label: s.label, color: s.color, is_won: s.is_won, is_lost: s.is_lost, is_final: s.is_final, proposalCount: proposalCounts[s.id] || 0 },
    }));
    setNodes(newNodes);
  }, [stages, proposalCounts]);

  const loadEdges = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("proposal_stage_transitions" as any)
      .select("id, from_stage_id, to_stage_id, label, is_active, organization_id")
      .eq("organization_id", companyId).eq("is_active", true);
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
      await (supabase.from("proposal_stage_transitions" as any) as any).delete().eq("organization_id", companyId);
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not found for current auth user");
      const inserts = edges.map((e) => ({
        organization_id: companyId, from_stage_id: e.source, to_stage_id: e.target,
        label: (e.label as string) || null, created_by: businessUserId,
      }));
      if (inserts.length > 0) {
        const { error } = await (supabase.from("proposal_stage_transitions" as any) as any).insert(inserts);
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
    return <div className="text-center text-muted-foreground py-8">Configure fases primeiro para definir transições.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Arraste conexões entre fases para definir transições válidas. Elimine arestas clicando e premindo Delete.</p>
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
