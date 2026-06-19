import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { DealWorkflowStage } from "./DealStagesManager";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface Props {
  stages: DealWorkflowStage[];
  companyId: string | null;
}

function StageNode({ data }: NodeProps) {
  const d = data as { label: string; color: string; is_won: boolean; is_lost: boolean; is_final: boolean; dealCount: number };
  return (
    <div className="rounded-lg border-2 bg-background shadow-md px-4 py-3 min-w-[140px] text-center" style={{ borderColor: d.color }}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      <div className="flex flex-col items-center gap-1">
        <div className="w-3 h-3 rounded-full mx-auto" style={{ backgroundColor: d.color }} />
        <span className="font-semibold text-sm">{d.label}</span>
        <div className="flex gap-1 justify-center">
          {d.is_won && <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5 py-0">Won</Badge>}
          {d.is_lost && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5 py-0">Lost</Badge>}
          {d.is_final && !d.is_won && !d.is_lost && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Final</Badge>}
        </div>
        {d.dealCount > 0 && <span className="text-[10px] text-muted-foreground">{d.dealCount} deals</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2.5 !h-2.5" />
    </div>
  );
}

const nodeTypes = { stage: StageNode };

export function DealFlowchart({ stages, companyId }: Props) {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dealCounts, setDealCounts] = useState<Record<string, number>>({});
  const { canUndo, canRedo, pushSnapshot, undo, redo, reset: resetHistory } = useUndoRedo();

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await supabase.from("deals").select("stage_id").eq("organization_id", companyId);
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((d: any) => { if (d.stage_id) counts[d.stage_id] = (counts[d.stage_id] || 0) + 1; });
        setDealCounts(counts);
      }
    })();
  }, [companyId]);

  const buildNodes = useCallback(() => {
    const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
    return sorted.map((s, i) => ({
      id: s.id,
      type: "stage" as const,
      position: { x: 50 + i * 220, y: 100 + (i % 2 === 0 ? 0 : 60) },
      data: { label: s.label, color: s.color, is_won: s.is_won, is_lost: s.is_lost, is_final: s.is_final, dealCount: dealCounts[s.id] || 0 },
    }));
  }, [stages, dealCounts]);

  const loadTransitions = useCallback(async () => {
    if (!companyId) return;
    const { data } = await (supabase.from("deal_stage_transitions") as any).select("*").eq("organization_id", companyId);
    const loadedEdges: Edge[] = (data || []).map((t: any) => ({
      id: `${t.from_stage_id}-${t.to_stage_id}`, source: t.from_stage_id, target: t.to_stage_id,
      markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
    }));
    setNodes(buildNodes());
    setEdges(loadedEdges);
    setHasChanges(false);
    resetHistory();
  }, [companyId, buildNodes, setNodes, setEdges, resetHistory]);

  useEffect(() => { loadTransitions(); }, [loadTransitions]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => {
      pushSnapshot(eds);
      return addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { stroke: "hsl(var(--primary))", strokeWidth: 2 } }, eds);
    });
    setHasChanges(true);
  }, [setEdges, pushSnapshot]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    await (supabase.from("deal_stage_transitions") as any).delete().eq("organization_id", companyId);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("User not authenticated");
    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) throw new Error("Business user not resolved");
    const inserts = edges.map(e => ({ organization_id: companyId, from_stage_id: e.source, to_stage_id: e.target, created_by: businessUserId }));
    if (inserts.length > 0) { await (supabase.from("deal_stage_transitions") as any).insert(inserts); }
    toast({ title: "Transições guardadas" });
    setHasChanges(false);
    resetHistory();
    setSaving(false);
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
    return (<div className="text-center py-8 text-muted-foreground"><p>Configure os estágios primeiro para definir o fluxo.</p></div>);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Arraste conexões entre estágios para definir transições válidas.</p>
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
          <Button variant="outline" size="sm" onClick={loadTransitions} disabled={saving}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset</Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}><Save className="w-3.5 h-3.5 mr-1" /> Guardar</Button>
        </div>
      </div>
      <div className="h-[350px] border rounded-lg bg-muted/20">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange}
          onEdgesChange={(changes) => {
            if (changes.some(c => c.type === "remove")) {
              pushSnapshot(edges);
              setHasChanges(true);
            }
            onEdgesChange(changes);
          }}
          onConnect={onConnect} nodeTypes={nodeTypes} fitView deleteKeyCode="Delete">
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
