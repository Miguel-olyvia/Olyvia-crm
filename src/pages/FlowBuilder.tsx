import { useCallback, useRef, useState, useMemo, useEffect, DragEvent } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ReactFlow, Background, Controls,
  addEdge, useNodesState, useEdgesState, reconnectEdge,
  type Connection, type Edge, type Node,
  MarkerType, Handle, Position, type NodeProps,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

/* Enhanced BPMN UX styles */
const flowStyles = document.createElement("style");
flowStyles.textContent = `
  .react-flow__edge-interaction { stroke-width: 20px !important; }
  .react-flow__handle:hover {
    transform: scale(1.5) !important;
    box-shadow: 0 0 8px 2px rgba(124,58,237,0.6) !important;
    transition: all 0.15s ease !important;
  }
  .react-flow__handle { transition: all 0.15s ease !important; }
  .react-flow__node:hover .react-flow__handle { opacity: 1 !important; }
  .react-flow__connection-path { stroke: #7c3aed !important; stroke-width: 2px !important; }
  .react-flow__edge.selected .react-flow__edge-path {
    stroke-width: 3px !important;
    filter: drop-shadow(0 0 4px rgba(124,58,237,0.5));
  }
  .react-flow__node.dragging { opacity: 0.85; }
  .react-flow__node.swimlane-highlight > div > div {
    border-color: #7c3aed !important;
    background: rgba(124,58,237,0.12) !important;
    box-shadow: inset 0 0 20px rgba(124,58,237,0.15) !important;
  }
`;
document.head.appendChild(flowStyles);

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Zap, Save, LayoutGrid, Maximize2, Trash2, X,
  Copy, Settings, Plus, Image, ArrowUp, ArrowDown, Undo2, Redo2,
} from "lucide-react";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { bpmnNodeTypes } from "@/components/flow-builder/bpmn-nodes";
import { BpmnPalette } from "@/components/flow-builder/BpmnPalette";
import { BpmnPropertiesPanel, EdgePropertiesPanel, isBpmnNode } from "@/components/flow-builder/BpmnPropertiesPanel";
import { DynamicNodeProvider, useDynamicNodes } from "@/components/flow-builder/DynamicNodeContext";
import { DynamicPalette } from "@/components/flow-builder/DynamicPalette";
import { DynamicFlowNode } from "@/components/flow-builder/DynamicFlowNode";
import { DynamicPropertiesPanel } from "@/components/flow-builder/DynamicPropertiesPanel";
import { TemplatesModal } from "@/components/flow-builder/TemplatesModal";
import { createFlowExportJson, parseImportedFlowJson } from "@/components/flow-builder/flowImportExport";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { toPng } from "html-to-image";
import { toast } from "sonner";

/* ─────────────── Node types for ReactFlow ─────────────── */

const nodeTypes = { dynamicNode: DynamicFlowNode, ...bpmnNodeTypes };

let idCounter = Date.now();
const newId = () => `node_${idCounter++}_${Math.random().toString(36).slice(2, 6)}`;

/* ─────────────── Flow storage (in-memory) ─────────────── */

interface FlowData {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  updatedAt: string;
}



/* ─────────────── Flow List Screen ─────────────── */

function FlowListScreen({ flows, onSelect, onNew, onDelete, onRename, canCreate, canEdit, canDelete }: {
  flows: FlowData[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div className="min-h-screen" style={{ background: "#1a1a2e" }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/organizations")} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="flex items-center gap-2">
              <Zap className="w-6 h-6 text-violet-400" />
              <h1 className="text-2xl font-bold text-slate-200">Flow Builder</h1>
            </div>
          </div>
          {canCreate && (
            <Button onClick={onNew} className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Novo Flow
            </Button>
          )}
        </div>

        <p className="text-sm text-slate-500 mb-6">Crie e edite fluxos de automação visuais. Arraste nós, conecte-os e configure cada passo.</p>

        {flows.length === 0 ? (
          <div className="text-center py-20">
            <Zap className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400 mb-2">Nenhum flow criado</h3>
            <p className="text-sm text-slate-500 mb-6">Comece criando o seu primeiro fluxo de automação.</p>
            {canCreate && (
              <Button onClick={onNew} className="bg-violet-600 hover:bg-violet-700 text-white">
                <Plus className="w-4 h-4 mr-1.5" /> Criar Primeiro Flow
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flows.map(flow => (
              <div
                key={flow.id}
                className="rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02] group relative"
                style={{ background: "#1e2a4a", border: "1px solid #2d3a5a" }}
                onClick={() => { if (renaming !== flow.id) onSelect(flow.id); }}
              >
                {canDelete && (
                  <AlertDialog>
                    <button
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400"
                      onClick={e => { e.stopPropagation(); onDelete(flow.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </AlertDialog>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#7c3aed33" }}>
                    <Zap className="w-4 h-4 text-violet-400" />
                  </div>
                  {renaming === flow.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => { onRename(flow.id, renameValue); setRenaming(null); }}
                      onKeyDown={e => { if (e.key === "Enter") { onRename(flow.id, renameValue); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }}
                      className="bg-[#141428] border-[#2d3a5a] text-slate-200 text-sm h-7"
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="text-sm font-semibold text-slate-200 truncate cursor-text"
                      onDoubleClick={canEdit ? (e => { e.stopPropagation(); setRenaming(flow.id); setRenameValue(flow.name); }) : undefined}
                      title={canEdit ? "Duplo clique para renomear" : undefined}
                    >
                      {flow.name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{flow.nodes.length} nós</span>
                  <span>{flow.edges.length} conexões</span>
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  Editado {new Date(flow.updatedAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Main Canvas ─────────────── */

function FlowBuilderCanvas({ flow, onBack, onSave, onRename, canCreate, canEdit, canDelete }: { flow: FlowData; onBack: () => void; onSave: (nodes: Node[], edges: Edge[]) => void; onRename: (id: string, name: string) => void; canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const importFlowInputRef = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { getNodeType } = useDynamicNodes();
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);
  const [editNode, setEditNode] = useState<Node | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [flowName, setFlowName] = useState(flow.name);
  const [editingName, setEditingName] = useState(false);
  const [editEdge, setEditEdge] = useState<Edge | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [deleteContainerDialog, setDeleteContainerDialog] = useState<{ nodeId: string; childCount: number } | null>(null);
  const highlightedLaneRef = useRef<string | null>(null);
  const { canUndo, canRedo, pushSnapshot, undo: undoAction, redo: redoAction, reset: resetHistory } = useUndoRedo();

  // Refs to always have current nodes/edges (avoids stale closures in undo/redo/snapshot)
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const redistributeRef = useRef<(parentId: string, dir?: "horizontal" | "vertical") => void>(() => {});
  const swimLaneDragStateRef = useRef<Record<string, { x: number; y: number }>>({});

  const takeSnapshot = useCallback(() => {
    pushSnapshot(edgesRef.current, nodesRef.current);
  }, [pushSnapshot]);

  const deleteNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node?.type === "swimLane") {
      const children = nodesRef.current.filter(n => (n as any).parentId === nodeId);
      if (children.length > 0) {
        setDeleteContainerDialog({ nodeId, childCount: children.length });
        return;
      }
    }
    takeSnapshot();
    const parentId = (node as any)?.parentId;
    setNodes(ns => ns.filter(n => n.id !== nodeId));
    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (editNode?.id === nodeId) setEditNode(null);
    // If deleted a structured child, redistribute siblings
    if (parentId && node?.type === "swimLane" && (node.data as any)?.isStructuredChild) {
      setTimeout(() => redistributeRef.current(parentId), 50);
    }
  }, [takeSnapshot, setNodes, setEdges, editNode]);

  const deleteContainerOnly = useCallback(() => {
    if (!deleteContainerDialog) return;
    const { nodeId } = deleteContainerDialog;
    takeSnapshot();
    const parent = nodesRef.current.find(n => n.id === nodeId);
    if (!parent) return;
    let pAbsX = parent.position.x, pAbsY = parent.position.y;
    let p: Node | undefined = parent;
    while ((p as any)?.parentId) {
      const pp = nodesRef.current.find(n => n.id === (p as any).parentId);
      if (!pp) break;
      pAbsX += pp.position.x; pAbsY += pp.position.y;
      p = pp;
    }
    const grandParentId = (parent as any).parentId;
    setNodes(ns => ns.map(n => {
      if ((n as any).parentId !== nodeId) return n;
      const absX = pAbsX + n.position.x;
      const absY = pAbsY + n.position.y;
      const updated: any = { ...n };
      if (grandParentId) {
        let gpAbsX = 0, gpAbsY = 0;
        const gp = nodesRef.current.find(nn => nn.id === grandParentId);
        if (gp) {
          gpAbsX = gp.position.x; gpAbsY = gp.position.y;
          let pp2: Node | undefined = gp;
          while ((pp2 as any)?.parentId) {
            const ppp = nodesRef.current.find(nn => nn.id === (pp2 as any).parentId);
            if (!ppp) break;
            gpAbsX += ppp.position.x; gpAbsY += ppp.position.y;
            pp2 = ppp;
          }
        }
        updated.position = { x: absX - gpAbsX, y: absY - gpAbsY };
        updated.parentId = grandParentId;
        updated.extent = "parent";
      } else {
        updated.position = { x: absX, y: absY };
        delete updated.parentId;
        delete updated.extent;
      }
      if (n.type === "swimLane") {
        updated.zIndex = grandParentId ? -9 : -10;
      }
      return updated;
    }).filter(n => n.id !== nodeId));
    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (editNode?.id === nodeId) setEditNode(null);
    setDeleteContainerDialog(null);
  }, [deleteContainerDialog, takeSnapshot, setNodes, setEdges, editNode]);

  const deleteContainerAndContents = useCallback(() => {
    if (!deleteContainerDialog) return;
    const { nodeId } = deleteContainerDialog;
    const node = nodesRef.current.find(n => n.id === nodeId);
    const grandParentId = (node as any)?.parentId;
    takeSnapshot();
    const toDelete = new Set<string>([nodeId]);
    const collectDescendants = (pid: string) => {
      for (const n of nodesRef.current) {
        if ((n as any).parentId === pid && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          collectDescendants(n.id);
        }
      }
    };
    collectDescendants(nodeId);
    setNodes(ns => ns.filter(n => !toDelete.has(n.id)));
    setEdges(es => es.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)));
    if (editNode?.id === nodeId) setEditNode(null);
    setDeleteContainerDialog(null);
    // If this was a structured child, redistribute siblings in grandparent
    if (grandParentId && (node?.data as any)?.isStructuredChild) {
      setTimeout(() => redistributeRef.current(grandParentId), 50);
    }
  }, [deleteContainerDialog, takeSnapshot, setNodes, setEdges, editNode]);

  const SWIM_HEADER_H = 32;

  const autoResizeParent = useCallback((parentId: string) => {
    setNodes(ns => {
      const parent = ns.find(n => n.id === parentId);
      if (!parent || parent.type !== "swimLane") return ns;
      const children = ns.filter(n => (n as any).parentId === parentId);
      if (children.length === 0) return ns;

      // If parent has structured children (swim lane children), use redistribute instead
      const hasStructuredChildren = children.some(c => c.type === "swimLane" && (c.data as any).isStructuredChild);
      if (hasStructuredChildren) return ns; // handled by redistributeChildren

      const PADDING = 30;
      const HEADER = 40;
      let maxRight = 0;
      let maxBottom = 0;
      for (const child of children) {
        const cw = (child.style?.width as number) || (child.measured?.width) || 200;
        const ch = (child.style?.height as number) || (child.measured?.height) || 100;
        maxRight = Math.max(maxRight, child.position.x + cw + PADDING);
        maxBottom = Math.max(maxBottom, child.position.y + ch + PADDING);
      }
      const parentW = (parent.style?.width as number) || 400;
      const parentH = (parent.style?.height as number) || 300;
      const newW = Math.max(parentW, maxRight);
      const newH = Math.max(parentH, maxBottom + HEADER);
      if (newW === parentW && newH === parentH) return ns;
      return ns.map(n => n.id === parentId ? { ...n, style: { ...n.style, width: newW, height: newH } } : n);
    });
  }, [setNodes]);

  // Redistribute structured children evenly within a parent swim lane
  const redistributeChildren = useCallback((parentId: string, newDirection?: "horizontal" | "vertical") => {
    setNodes(ns => {
      const parent = ns.find(n => n.id === parentId);
      if (!parent || parent.type !== "swimLane") return ns;
      const children = ns.filter(n => (n as any).parentId === parentId && n.type === "swimLane");
      if (children.length === 0) return ns;

      const dir = newDirection || (parent.data as any).layoutDirection || "horizontal";
      const parentW = (parent.style?.width as number) || (parent.measured?.width) || 400;
      const parentH = (parent.style?.height as number) || (parent.measured?.height) || 300;
      const availH = parentH - SWIM_HEADER_H;

      // Update parent's layoutDirection if changed
      const updatedNs = newDirection
        ? ns.map(n => n.id === parentId ? { ...n, data: { ...(n.data as any), layoutDirection: newDirection } } : n)
        : ns;

      if (dir === "horizontal") {
        const childW = parentW / children.length;
        const sorted = [...children].sort((a, b) => a.position.x - b.position.x);
        return updatedNs.map(n => {
          if ((n as any).parentId !== parentId || n.type !== "swimLane") return n;
          const idx = sorted.findIndex(c => c.id === n.id);
          if (idx < 0) return n;
          return {
            ...n,
            position: { x: idx * childW, y: SWIM_HEADER_H },
            style: { ...n.style, width: childW, height: availH },
            draggable: false,
            extent: "parent" as const,
            data: { ...(n.data as any), isStructuredChild: true },
          };
        });
      } else {
        const childH = availH / children.length;
        const sorted = [...children].sort((a, b) => a.position.y - b.position.y);
        return updatedNs.map(n => {
          if ((n as any).parentId !== parentId || n.type !== "swimLane") return n;
          const idx = sorted.findIndex(c => c.id === n.id);
          if (idx < 0) return n;
          return {
            ...n,
            position: { x: 0, y: SWIM_HEADER_H + idx * childH },
            style: { ...n.style, width: parentW, height: childH },
            draggable: false,
            extent: "parent" as const,
            data: { ...(n.data as any), isStructuredChild: true },
          };
        });
      }
    });
  }, [setNodes]);

  // Keep ref in sync
  redistributeRef.current = redistributeChildren;

  const duplicateNode = useCallback((nodeId: string) => {
    const orig = nodes.find(n => n.id === nodeId);
    if (!orig) return;
    const id = newId();
    // Deep clone data to avoid shared references; callbacks are re-injected by nodesWithCallbacks
    const clonedData = JSON.parse(JSON.stringify(orig.data || {}));
    const newNode: any = {
      ...orig,
      id,
      position: { x: orig.position.x + 40, y: orig.position.y + 40 },
      selected: false,
      data: clonedData,
    };
    takeSnapshot();
    setNodes(ns => [...ns, newNode]);
  }, [nodes, setNodes, takeSnapshot]);

  const bringToFront = useCallback((nodeId: string) => {
    setNodes(ns => {
      const maxZ = Math.max(...ns.map(n => (n as any).zIndex || 0));
      return ns.map(n => n.id === nodeId ? { ...n, zIndex: maxZ + 1 } as any : n);
    });
  }, [setNodes]);

  const sendToBack = useCallback((nodeId: string) => {
    setNodes(ns => {
      const minZ = Math.min(...ns.map(n => (n as any).zIndex || 0));
      return ns.map(n => n.id === nodeId ? { ...n, zIndex: minZ - 1 } as any : n);
    });
  }, [setNodes]);

  const updateNodeData = useCallback((id: string, data: any) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data } : n));
    setEditNode(prev => prev?.id === id ? { ...prev, data } : prev);
  }, [setNodes]);

  // Helper: sort nodes so parents always come before children (ReactFlow requirement)
  const sortNodesParentFirst = useCallback((ns: Node[]): Node[] => {
    const sorted: Node[] = [];
    const added = new Set<string>();
     const addWithParents = (node: Node, visiting = new Set<string>()) => {
      if (added.has(node.id)) return;
      if (visiting.has(node.id)) return; // break circular refs
      visiting.add(node.id);
      const pid = (node as any).parentId;
      if (pid) {
        const parent = ns.find(n => n.id === pid);
        if (parent && !added.has(parent.id)) addWithParents(parent, visiting);
      }
      sorted.push(node);
      added.add(node.id);
    };
    ns.forEach(n => addWithParents(n));
    return sorted;
  }, []);

  // On mount: adopt orphan nodes that are visually inside swim lanes but lack parentId
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (adoptedRef.current) return;
    adoptedRef.current = true;
    
    const currentNodes = nodesRef.current;
    const swimLanes = currentNodes.filter(n => n.type === "swimLane");
    if (swimLanes.length === 0) return;

    const getAbsPos = (node: Node): { x: number; y: number } => {
      let pos = { ...node.position };
      let cur = node;
      while ((cur as any).parentId) {
        const parent = currentNodes.find(n => n.id === (cur as any).parentId);
        if (!parent) break;
        pos.x += parent.position.x;
        pos.y += parent.position.y;
        cur = parent;
      }
      return pos;
    };

    const updates: { id: string; parentId: string; relX: number; relY: number }[] = [];

    for (const node of currentNodes) {
      if (node.type === "swimLane") continue;
      if ((node as any).parentId) continue;

      const nAbs = getAbsPos(node);
      const nW = (node.style?.width as number) || (node.measured?.width) || 160;
      const nH = (node.style?.height as number) || (node.measured?.height) || 60;
      const cx = nAbs.x + nW / 2;
      const cy = nAbs.y + nH / 2;

      let bestLane: Node | null = null;
      let bestArea = Infinity;
      for (const lane of swimLanes) {
        const lAbs = getAbsPos(lane);
        const lW = (lane.style?.width as number) || (lane.measured?.width) || 400;
        const lH = (lane.style?.height as number) || (lane.measured?.height) || 300;
        if (cx >= lAbs.x && cx <= lAbs.x + lW && cy >= lAbs.y && cy <= lAbs.y + lH) {
          const area = lW * lH;
          if (area < bestArea) { bestArea = area; bestLane = lane; }
        }
      }

      if (bestLane) {
        const lAbs = getAbsPos(bestLane);
        updates.push({ id: node.id, parentId: bestLane.id, relX: nAbs.x - lAbs.x, relY: nAbs.y - lAbs.y });
      }
    }

    if (updates.length > 0) {
      setNodes(ns => sortNodesParentFirst(ns.map(n => {
        const u = updates.find(up => up.id === n.id);
        if (!u) return n;
        return { ...n, position: { x: u.relX, y: u.relY }, parentId: u.parentId, extent: "parent" } as any;
      })));
    }
  }, [setNodes, sortNodesParentFirst]);


  const nodesWithCallbacks = useMemo(() =>
    nodes.map(n => ({
      ...n,
      data: {
        ...(n.data as any),
        onDelete: deleteNode,
        onLabelChange: (label: string) => updateNodeData(n.id, { ...(n.data as any), label }),
        // For parent swim lanes: redistribute children on resize
        ...(n.type === "swimLane" && !(n.data as any).isStructuredChild ? {
          onResizeEnd: () => {
            const children = nodesRef.current.filter(c => (c as any).parentId === n.id && c.type === "swimLane" && (c.data as any).isStructuredChild);
            if (children.length > 0) redistributeChildren(n.id);
          },
        } : {}),
      },
    })),
    [nodes, deleteNode, updateNodeData, redistributeChildren]
  );

  const onConnect = useCallback((connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source);
    const d = sourceNode?.data as any;
    const isBpmn = sourceNode && isBpmnNode(sourceNode);

    // Check if dynamic condition node
    const nt = d?.nodeTypeId ? getNodeType(d.nodeTypeId) : null;
    const isCondition = nt?.behaviorType === "condition";
    const isBpmnDecision = sourceNode?.type === "bpmnDecision";
    const isYes = connection.sourceHandle === "yes";
    const isNo = connection.sourceHandle === "no";

    let stroke = isBpmn ? "#94a3b8" : "#7c3aed";
    let label: string | undefined;
    let labelStyle: any;
    if ((isCondition || isBpmnDecision) && isYes) { stroke = "#22c55e"; label = "SIM"; labelStyle = { fill: "#22c55e", fontSize: 10, fontWeight: 700 }; }
    if ((isCondition || isBpmnDecision) && isNo) { stroke = "#ef4444"; label = "NÃO"; labelStyle = { fill: "#ef4444", fontSize: 10, fontWeight: 700 }; }

    takeSnapshot();
    setEdges(eds => addEdge({
      ...connection,
      animated: !isBpmn,
      type: isBpmn ? "smoothstep" : "default",
      style: { stroke, strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      data: { edgeColor: stroke, edgeWidth: 2, edgeType: isBpmn ? "step" : "bezier", arrowDir: "end" },
      ...(label ? { label, labelStyle, labelBgStyle: { fill: "#1a1a2e", fillOpacity: 0.9 } } : {}),
    }, eds));
  }, [setEdges, nodes, getNodeType]);

  // Helper: find the smallest swimLane containing a flow-coordinate point
  const findParentSwimLane = useCallback((flowPos: { x: number; y: number }, excludeId?: string, excludeIds?: Set<string>) => {
    const currentNodes = nodesRef.current;
    const getAbsolutePosition = (node: Node): { x: number; y: number } => {
      let pos = { ...node.position };
      let current = node;
      while ((current as any).parentId) {
        const parent = currentNodes.find(n => n.id === (current as any).parentId);
        if (!parent) break;
        pos.x += parent.position.x;
        pos.y += parent.position.y;
        current = parent;
      }
      return pos;
    };
    let bestMatch: Node | null = null;
    let bestArea = Infinity;
    for (const lane of currentNodes.filter(n => n.type === "swimLane" && n.id !== excludeId && (!excludeIds || !excludeIds.has(n.id)))) {
      const absPos = getAbsolutePosition(lane);
      const w = (lane.style?.width as number) || (lane.measured?.width) || 400;
      const h = (lane.style?.height as number) || (lane.measured?.height) || 300;
      if (flowPos.x >= absPos.x && flowPos.x <= absPos.x + w && flowPos.y >= absPos.y && flowPos.y <= absPos.y + h) {
        const area = w * h;
        if (area < bestArea) { bestArea = area; bestMatch = lane; }
      }
    }
    return bestMatch;
  }, []);

  const findParentSwimLaneForRect = useCallback((
    rect: { x: number; y: number; width: number; height: number },
    excludeId?: string,
    excludeIds?: Set<string>,
    options?: { includeHeader?: boolean }
  ) => {
    const currentNodes = nodesRef.current;
    const getAbsolutePosition = (node: Node): { x: number; y: number } => {
      let pos = { ...node.position };
      let current = node;
      while ((current as any).parentId) {
        const parent = currentNodes.find(n => n.id === (current as any).parentId);
        if (!parent) break;
        pos.x += parent.position.x;
        pos.y += parent.position.y;
        current = parent;
      }
      return pos;
    };

    const includeHeader = options?.includeHeader ?? false;

    let bestLane: Node | null = null;
    let bestArea = Infinity;
    let bestPointLane: Node | null = null;
    let bestPointScore = -1;
    let bestPointArea = Infinity;
    let bestOverlapLane: Node | null = null;
    let bestOverlapRatio = 0;
    let bestOverlapArea = Infinity;
    const rectArea = Math.max(1, rect.width * rect.height);
    const samplePoints = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width / 2, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height / 2 },
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width / 2, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ];

    for (const lane of currentNodes.filter(n => n.type === "swimLane" && n.id !== excludeId && (!excludeIds || !excludeIds.has(n.id)))) {
      const absPos = getAbsolutePosition(lane);
      const w = (lane.style?.width as number) || (lane.measured?.width) || 400;
      const h = (lane.style?.height as number) || (lane.measured?.height) || 300;
      const laneArea = w * h;

      const topBoundary = includeHeader ? absPos.y : absPos.y + SWIM_HEADER_H;
      const laneRect = {
        left: absPos.x,
        right: absPos.x + w,
        top: topBoundary,
        bottom: absPos.y + h,
      };

      const pointScore = samplePoints.reduce((score, point) => {
        const isInside =
          point.x >= laneRect.left &&
          point.x <= laneRect.right &&
          point.y >= laneRect.top &&
          point.y <= laneRect.bottom;
        return score + (isInside ? 1 : 0);
      }, 0);

      if (pointScore > 0 && (pointScore > bestPointScore || (pointScore === bestPointScore && laneArea < bestPointArea))) {
        bestPointLane = lane;
        bestPointScore = pointScore;
        bestPointArea = laneArea;
      }

      const isContained =
        rect.x >= laneRect.left &&
        rect.y >= laneRect.top &&
        rect.x + rect.width <= laneRect.right &&
        rect.y + rect.height <= laneRect.bottom;

      if (isContained) {
        if (laneArea < bestArea) {
          bestLane = lane;
          bestArea = laneArea;
        }
        continue;
      }

      const overlapWidth = Math.max(0, Math.min(rect.x + rect.width, laneRect.right) - Math.max(rect.x, laneRect.left));
      const overlapHeight = Math.max(0, Math.min(rect.y + rect.height, laneRect.bottom) - Math.max(rect.y, laneRect.top));
      const overlapArea = overlapWidth * overlapHeight;
      if (overlapArea <= 0) continue;

      const overlapRatio = overlapArea / rectArea;
      if (overlapRatio > bestOverlapRatio || (overlapRatio === bestOverlapRatio && w * h < bestOverlapArea)) {
        bestOverlapLane = lane;
        bestOverlapRatio = overlapRatio;
        bestOverlapArea = w * h;
      }
    }

    return bestLane || bestPointLane || bestOverlapLane;
  }, [SWIM_HEADER_H]);

  // Get nesting depth of a swim lane (how deep it would be as child of parentLane)
  const getSwimLaneDepth = useCallback((parentLane: Node | null) => {
    const currentNodes = nodesRef.current;
    let depth = 0;
    let p = parentLane;
    while (p && (p as any).parentId) {
      depth++;
      p = currentNodes.find(n => n.id === (p as any).parentId) || null;
    }
    return depth + (parentLane ? 1 : 0);
  }, []);

  // Helper: get absolute position of a node
  const getAbsolutePosition = useCallback((node: Node) => {
    const currentNodes = nodesRef.current;
    let x = node.position.x, y = node.position.y;
    let cur: Node | undefined = node;
    while ((cur as any)?.parentId) {
      const parent = currentNodes.find(n => n.id === (cur as any).parentId);
      if (!parent) break;
      x += parent.position.x; y += parent.position.y;
      cur = parent;
    }
    return { x, y };
  }, []);

  const reconcileProcessParents = useCallback((targetNodeIds?: Set<string>) => {
    const currentNodes = nodesRef.current;
    const updates: { id: string; parentId?: string; relX: number; relY: number }[] = [];

    for (const node of currentNodes) {
      if (node.type === "swimLane") continue;
      if (targetNodeIds && !targetNodeIds.has(node.id)) continue;

      const abs = getAbsolutePosition(node);
      const width = (node.style?.width as number) || (node.measured?.width) || (node.type === "dynamicNode" ? 180 : 160);
      const height = (node.style?.height as number) || (node.measured?.height) || (node.type === "dynamicNode" ? 72 : 60);
      const parentLane = findParentSwimLaneForRect(
        { x: abs.x, y: abs.y, width, height },
        node.id,
        undefined,
        { includeHeader: true }
      );

      const nextParentId = parentLane?.id;
      const currentParentId = (node as any).parentId || undefined;
      if (currentParentId === nextParentId) continue;

      if (parentLane) {
        const parentAbs = getAbsolutePosition(parentLane);
        updates.push({
          id: node.id,
          parentId: parentLane.id,
          relX: abs.x - parentAbs.x,
          relY: abs.y - parentAbs.y,
        });
      } else {
        updates.push({ id: node.id, parentId: undefined, relX: abs.x, relY: abs.y });
      }
    }

    if (updates.length === 0) return false;

    setNodes(ns => sortNodesParentFirst(ns.map(n => {
      const update = updates.find(u => u.id === n.id);
      if (!update) return n;

      const next: any = { ...n, position: { x: update.relX, y: update.relY } };
      if (update.parentId) {
        next.parentId = update.parentId;
        next.extent = "parent";
      } else {
        delete next.parentId;
        delete next.extent;
      }
      return next;
    })));

    return true;
  }, [findParentSwimLaneForRect, getAbsolutePosition, setNodes, sortNodesParentFirst]);

  // Live highlight during drag — use ref + direct DOM to avoid re-rendering all nodes
  const onNodeDrag = useCallback((_: any, draggedNode: Node) => {
    if (!draggedNode) return;

    if (draggedNode.type === "swimLane") {
      const prev = swimLaneDragStateRef.current[draggedNode.id];
      if (prev) {
        const dx = draggedNode.position.x - prev.x;
        const dy = draggedNode.position.y - prev.y;
        if (dx !== 0 || dy !== 0) {
          const descendants = new Set<string>([draggedNode.id]);
          const collectDesc = (pid: string) => {
            for (const n of nodesRef.current) {
              if ((n as any).parentId === pid && !descendants.has(n.id)) {
                descendants.add(n.id);
                if (n.type === "swimLane") collectDesc(n.id);
              }
            }
          };
          collectDesc(draggedNode.id);

          setNodes(ns => ns.map(n => {
            if (n.id === draggedNode.id) return n;
            if ((n as any).parentId === draggedNode.id) return n;
            if (n.type === "swimLane") return n;
            const abs = getAbsolutePosition(n);
            const nW = (n.style?.width as number) || (n.measured?.width) || 160;
            const nH = (n.style?.height as number) || (n.measured?.height) || 60;
            const containingLane = findParentSwimLaneForRect(
              { x: abs.x, y: abs.y, width: nW, height: nH },
              n.id,
              undefined,
              { includeHeader: true }
            );
            if (containingLane && descendants.has(containingLane.id)) {
              return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
            }
            return n;
          }));
        }
      }
      swimLaneDragStateRef.current[draggedNode.id] = { x: draggedNode.position.x, y: draggedNode.position.y };
    }

    const abs = getAbsolutePosition(draggedNode);
    const dragW = (draggedNode.style?.width as number) || (draggedNode.measured?.width) || 160;
    const dragH = (draggedNode.style?.height as number) || (draggedNode.measured?.height) || 60;
    const excludeIds = new Set<string>([draggedNode.id]);
    if (draggedNode.type === "swimLane") {
      const collectDesc = (pid: string) => {
        for (const n of nodesRef.current) {
          if ((n as any).parentId === pid && !excludeIds.has(n.id)) {
            excludeIds.add(n.id);
            if (n.type === "swimLane") collectDesc(n.id);
          }
        }
      };
      collectDesc(draggedNode.id);
    }

    const parentLane = findParentSwimLaneForRect(
      { x: abs.x, y: abs.y, width: dragW, height: dragH },
      draggedNode.id,
      excludeIds,
      { includeHeader: draggedNode.type !== "swimLane" }
    );

    let validParent = parentLane;
    if (validParent && draggedNode.type === "swimLane" && getSwimLaneDepth(validParent) > 1) {
      validParent = null;
    }

    const newHighlight = validParent?.id || null;
    const currentParentId = (draggedNode as any).parentId || null;
    const effectiveHighlight = newHighlight !== currentParentId ? newHighlight : null;

    if (effectiveHighlight !== highlightedLaneRef.current) {
      if (highlightedLaneRef.current) {
        const oldEl = document.querySelector(`[data-id="${highlightedLaneRef.current}"]`);
        oldEl?.classList.remove("swimlane-highlight");
      }
      if (effectiveHighlight) {
        const newEl = document.querySelector(`[data-id="${effectiveHighlight}"]`);
        newEl?.classList.add("swimlane-highlight");
      }
      highlightedLaneRef.current = effectiveHighlight;
    }
  }, [getAbsolutePosition, findParentSwimLaneForRect, getSwimLaneDepth, setNodes]);

  // Reparent nodes when dragged into/out of swim lanes
  const onNodeDragStop = useCallback((_: any, draggedNode: Node, draggedNodes: Node[]) => {
    delete swimLaneDragStateRef.current[draggedNode?.id];
    if (highlightedLaneRef.current) {
      const el = document.querySelector(`[data-id="${highlightedLaneRef.current}"]`);
      el?.classList.remove("swimlane-highlight");
      highlightedLaneRef.current = null;
    }
    if (!draggedNode) return;

    // If a swim lane was dragged, adopt any unparented nodes that are visually inside it
    if (draggedNode.type === "swimLane") {
      requestAnimationFrame(() => reconcileProcessParents());
      return;
    }

    // Handle multi-node drag: process each dragged node for reparenting
    const nodesToProcess = draggedNodes && draggedNodes.length > 1 ? draggedNodes : [draggedNode];

    for (const node of nodesToProcess) {
      const currentNodes = nodesRef.current;
      const abs = getAbsolutePosition(node);
      const dragW = (node.style?.width as number) || (node.measured?.width) || 160;
      const dragH = (node.style?.height as number) || (node.measured?.height) || 60;

      // Collect all descendants of this node to exclude them from parent search
      const excludeIds = new Set<string>([node.id]);
      if (node.type === "swimLane") {
        const collectDescendants = (parentId: string) => {
          for (const n of currentNodes) {
            if ((n as any).parentId === parentId && !excludeIds.has(n.id)) {
              excludeIds.add(n.id);
              if (n.type === "swimLane") collectDescendants(n.id);
            }
          }
        };
        collectDescendants(node.id);
      }

      const parentLane = findParentSwimLaneForRect(
        { x: abs.x, y: abs.y, width: dragW, height: dragH },
        node.id,
        excludeIds,
        { includeHeader: node.type !== "swimLane" }
      );
      const currentParentId = (node as any).parentId || undefined;
      const newParentId = parentLane?.id || undefined;
      if (currentParentId === newParentId) continue;

      // Prevent swim lanes from being nested inside other swim lanes when dragged
      if (newParentId && node.type === "swimLane") {
        continue;
      }

      // Prevent circular nesting
      if (newParentId && node.type === "swimLane") {
        let check: Node | undefined = parentLane ?? undefined;
        let circular = false;
        while (check) {
          if (check.id === node.id) { circular = true; break; }
          if (!(check as any).parentId) break;
          check = currentNodes.find(n => n.id === (check as any).parentId);
        }
        if (circular) continue;
      }

      let relX = abs.x, relY = abs.y;
      if (parentLane) {
        const pAbs = getAbsolutePosition(parentLane);
        relX = abs.x - pAbs.x; relY = abs.y - pAbs.y;
      }

      takeSnapshot();
      setNodes(ns => {
        const updated = ns.map(n => {
          if (n.id !== node.id) return n;
          const u: any = { ...n, position: { x: relX, y: relY } };
          if (newParentId) {
            u.parentId = newParentId;
            u.extent = "parent";
            if (n.type === "swimLane" && parentLane) {
              const parentW = (parentLane.style?.width as number) || (parentLane.measured?.width) || 400;
              const parentH = (parentLane.style?.height as number) || (parentLane.measured?.height) || 300;
              const childW = (n.style?.width as number) || 400;
              const childH = (n.style?.height as number) || 300;
              const maxW = Math.max(200, parentW - relX - 20);
              const maxH = Math.max(150, parentH - relY - 20);
              if (childW > maxW || childH > maxH) {
                u.style = { ...n.style, width: Math.min(childW, maxW), height: Math.min(childH, maxH) };
              }
            }
          } else {
            delete u.parentId;
            delete u.extent;
          }
          if (n.type === "swimLane") {
            u.zIndex = -10 + getSwimLaneDepth(newParentId ? parentLane : null);
          }
          return u;
        });
        return sortNodesParentFirst(updated);
      });

      if (newParentId && node.type === "swimLane") {
        setTimeout(() => redistributeChildren(newParentId), 50);
      } else if (newParentId) {
        setTimeout(() => autoResizeParent(newParentId), 50);
      }
      if (currentParentId && currentParentId !== newParentId && node.type === "swimLane") {
        setTimeout(() => {
          const remaining = nodesRef.current.filter(n => (n as any).parentId === currentParentId && n.type === "swimLane");
          if (remaining.length > 0) redistributeChildren(currentParentId);
        }, 60);
      }
    }

    const processedNodeIds = new Set(nodesToProcess.filter(n => n.type !== "swimLane").map(n => n.id));
    if (processedNodeIds.size > 0) {
      requestAnimationFrame(() => reconcileProcessParents(processedNodeIds));
    }
  }, [getAbsolutePosition, getSwimLaneDepth, takeSnapshot, setNodes, autoResizeParent, sortNodesParentFirst, redistributeChildren, reconcileProcessParents]);

  const onDrop = useCallback((e: DragEvent) => {
    if (!canCreate) return;
    e.preventDefault();
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = newId();

    // Check BPMN node type
    const bpmnType = e.dataTransfer.getData("application/bpmnNodeType");
    if (bpmnType) {
      const w = parseInt(e.dataTransfer.getData("application/bpmnWidth") || "160");
      const h = parseInt(e.dataTransfer.getData("application/bpmnHeight") || "60");
      let type = bpmnType;
      let data: any = { label: "" };

      if (bpmnType.startsWith("bpmnStartEnd:")) {
        type = "bpmnStartEnd";
        const sub = bpmnType.split(":")[1];
        data = { label: sub === "start" ? "Início" : "Fim", subType: sub, bgColor: sub === "start" ? "#3b82f6" : "#22c55e" };
      } else if (bpmnType === "bpmnProcess") {
        data = { label: "Processo", bgColor: "#f97316" };
      } else if (bpmnType === "bpmnDecision") {
        data = { label: "Decisão?", bgColor: "#1e293b" };
      } else if (bpmnType === "bpmnSubProcess") {
        data = { label: "Sub-Processo", bgColor: "#fb923c" };
      } else if (bpmnType === "bpmnEvent") {
        data = { label: "Evento", bgColor: "#8b5cf6" };
      } else if (bpmnType === "bpmnText") {
        data = { label: "Texto", textColor: "#e2e8f0" };
      } else if (bpmnType === "swimLane") {
        data = { label: "Secção" };
      }

      // Detect parent swim lane for ALL node types
      const parentLane = findParentSwimLaneForRect(
        { x: position.x, y: position.y, width: w, height: h },
        id,
        undefined,
        { includeHeader: bpmnType !== "swimLane" }
      );
      let finalPosition = position;
      const nodeExtra: any = {};

      if (parentLane) {
        // For swim lanes: enforce max 2 nesting levels
        if (bpmnType === "swimLane" && getSwimLaneDepth(parentLane) > 1) {
          // Drop as root-level lane instead — don't nest
        } else {
          const currentNodes = nodesRef.current;
          let pAbsX = parentLane.position.x, pAbsY = parentLane.position.y;
          let p: Node | undefined = parentLane;
          while ((p as any)?.parentId) {
            const pp = currentNodes.find(n => n.id === (p as any).parentId);
            if (!pp) break;
            pAbsX += pp.position.x; pAbsY += pp.position.y;
            p = pp;
          }
          finalPosition = { x: position.x - pAbsX, y: position.y - pAbsY };
          nodeExtra.parentId = parentLane.id;
          nodeExtra.extent = "parent";
        }
      }

      if (bpmnType === "swimLane") {
        const effectiveParent = (nodeExtra.parentId && getSwimLaneDepth(parentLane) <= 1) ? parentLane : null;
        nodeExtra.zIndex = -10 + getSwimLaneDepth(effectiveParent);
      }

      takeSnapshot();
      setNodes(ns => sortNodesParentFirst([...ns, {
        id, type, position: finalPosition, data,
        style: { width: w, height: h },
        ...nodeExtra,
      } as any]));

      // For swim lanes dropped into parent: redistribute; otherwise auto-resize
      if (nodeExtra.parentId && bpmnType === "swimLane") {
        setTimeout(() => redistributeChildren(nodeExtra.parentId), 50);
      } else if (nodeExtra.parentId) {
        setTimeout(() => autoResizeParent(nodeExtra.parentId), 50);
      }
      return;
    }

    // Check dynamic node type
    const dynamicTypeId = e.dataTransfer.getData("application/dynamicNodeType");
    if (dynamicTypeId) {
      const nt = getNodeType(dynamicTypeId);
      if (!nt) return;
      const fieldValues: Record<string, string> = {};
      nt.fields.forEach(f => { if (f.defaultValue) fieldValues[f.id] = f.defaultValue; });

      // Detect parent swim lane
      const dynamicWidth = 180;
      const dynamicHeight = 72;
      const parentLane = findParentSwimLaneForRect(
        { x: position.x, y: position.y, width: dynamicWidth, height: dynamicHeight },
        id,
        undefined,
        { includeHeader: true }
      );
      let finalPosition = position;
      const nodeExtra: any = {};
      if (parentLane) {
        const currentNodes = nodesRef.current;
        let pAbsX = parentLane.position.x, pAbsY = parentLane.position.y;
        let p: Node | undefined = parentLane;
        while ((p as any)?.parentId) {
          const pp = currentNodes.find(n => n.id === (p as any).parentId);
          if (!pp) break;
          pAbsX += pp.position.x; pAbsY += pp.position.y;
          p = pp;
        }
        finalPosition = { x: position.x - pAbsX, y: position.y - pAbsY };
        nodeExtra.parentId = parentLane.id;
        nodeExtra.extent = "parent";
      }

      takeSnapshot();
      setNodes(ns => sortNodesParentFirst([...ns, {
        id,
        type: "dynamicNode",
        position: finalPosition,
        data: { nodeTypeId: dynamicTypeId, title: nt.name, fieldValues },
        ...nodeExtra,
      }]));

      if (nodeExtra.parentId) {
        setTimeout(() => autoResizeParent(nodeExtra.parentId), 50);
      }
      return;
    }
  }, [canCreate, screenToFlowPosition, setNodes, getNodeType, findParentSwimLane, getSwimLaneDepth, autoResizeParent, takeSnapshot, sortNodesParentFirst, redistributeChildren]);

  const onDragOver = useCallback((e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);

  const onNodeDoubleClick = useCallback((_: any, node: Node) => { setEditEdge(null); setEditNode(node); }, []);
  const onEdgeClick = useCallback((_: any, edge: Edge) => { setEditNode(null); setEditEdge(edge); }, []);

  const updateEdgeData = useCallback((id: string, data: Record<string, any>) => {
    setEdges(es => es.map(e => {
      if (e.id !== id) return e;
      const color = data.edgeColor || (e.data as any)?.edgeColor || "#94a3b8";
      const width = data.edgeWidth || (e.data as any)?.edgeWidth || 2;
      const edgeType = data.edgeType || (e.data as any)?.edgeType || "bezier";
      const arrowDir = data.arrowDir || (e.data as any)?.arrowDir || "end";
      const edgeLabel = data.edgeLabel ?? (e.data as any)?.edgeLabel ?? "";
      const typeMap: Record<string, string> = { bezier: "default", straight: "straight", step: "smoothstep" };

      return {
        ...e,
        type: typeMap[edgeType] || "default",
        data: { ...((e.data || {}) as any), ...data },
        style: { stroke: color, strokeWidth: width },
        label: edgeLabel || undefined,
        labelStyle: edgeLabel ? { fill: color, fontSize: 10, fontWeight: 600 } : undefined,
        labelBgStyle: edgeLabel ? { fill: "#1a1a2e", fillOpacity: 0.9 } : undefined,
        markerEnd: (arrowDir === "end" || arrowDir === "both") ? { type: MarkerType.ArrowClosed, color } : undefined,
        markerStart: (arrowDir === "start" || arrowDir === "both") ? { type: MarkerType.ArrowClosed, color } : undefined,
      };
    }));
    setEditEdge(prev => prev?.id === id ? { ...prev, data: { ...((prev.data || {}) as any), ...data } } : prev);
  }, [setEdges]);

  const handleAutoLayout = useCallback(() => {
    setNodes(ns => ns.map((n, i) => ({ ...n, position: { x: 350, y: 40 + i * 160 } })));
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  }, [setNodes, fitView]);

  const handleFitView = useCallback(() => fitView({ padding: 0.2, duration: 400 }), [fitView]);

  const handleClear = useCallback(() => setShowClearDialog(true), []);

  const confirmClear = useCallback(() => {
    setNodes([]); setEdges([]); setEditNode(null); setShowClearDialog(false);
  }, [setNodes, setEdges]);

  const handleSave = useCallback(() => {
    onSave(nodes, edges);
    toast.success("Flow guardado!");
  }, [nodes, edges, onSave]);

  const handleExportPng = useCallback(() => {
    const el = reactFlowWrapper.current;
    if (!el) return;
    const viewport = el.querySelector(".react-flow__viewport") as HTMLElement;
    if (!viewport) return;
    toPng(viewport, { backgroundColor: "#1a1a2e", pixelRatio: 2 }).then(dataUrl => {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${flowName || "flow"}.png`;
      a.click();
    }).catch(() => {});
  }, [flowName]);

  const handleExportFlow = useCallback(() => {
    const json = createFlowExportJson({ name: flowName, nodes, edges });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(flowName || "flow").trim().replace(/\s+/g, "-").toLowerCase() || "flow"}.flow.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Flow exportado!");
  }, [edges, flowName, nodes]);

  const handleLoadTemplate = useCallback((tNodes: any[], tEdges: any[]) => {
    // Generate new IDs to avoid conflicts
    const idMap: Record<string, string> = {};
    const newNodes = tNodes.map(n => {
      const nid = newId();
      idMap[n.id] = nid;
      return { ...n, id: nid, data: { ...n.data } };
    });
    // Remap parentId references for nested swim lanes
    newNodes.forEach(n => {
      if ((n as any).parentId && idMap[(n as any).parentId]) {
        (n as any).parentId = idMap[(n as any).parentId];
      }
    });
    const newEdges = tEdges.map(e => ({
      ...e,
      id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: idMap[e.source] || e.source,
      target: idMap[e.target] || e.target,
    }));
    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);
    toast.success("Template carregado!");
  }, [setNodes, setEdges]);

  const handleImportFlow = useCallback((importedNodes: Node[], importedEdges: Edge[], importedName?: string) => {
    resetHistory();
    setNodes(importedNodes);
    setEdges(importedEdges);
    setEditNode(null);
    setEditEdge(null);
    if (importedName?.trim()) {
      setFlowName(importedName.trim());
      onRename(flow.id, importedName.trim());
    }
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
  }, [fitView, flow.id, onRename, resetHistory, setEdges, setNodes]);

  const handleImportFlowFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result;
      const parsed = typeof content === "string" ? parseImportedFlowJson(content) : null;

      if (!parsed) {
        toast.error("Este ficheiro não contém um flow válido.");
        return;
      }

      handleImportFlow(parsed.nodes, parsed.edges, parsed.name);
      toast.success(`Flow importado${parsed.name ? `: ${parsed.name}` : ""}!`);
    };

    reader.readAsText(file);
    event.target.value = "";
  }, [handleImportFlow]);

  const handleUndo = useCallback(() => {
    undoAction(edgesRef.current, (e) => setEdges(e), nodesRef.current, (n) => setNodes(n));
  }, [undoAction, setEdges, setNodes]);

  const handleRedo = useCallback(() => {
    redoAction(edgesRef.current, (e) => setEdges(e), nodesRef.current, (n) => setNodes(n));
  }, [redoAction, setEdges, setNodes]);

  // Determine which panel to show
  const isDynamicNode = editNode?.type === "dynamicNode";
  const isBpmn = editNode ? isBpmnNode(editNode) : false;

  return (
    <div className="h-screen w-screen flex flex-col" style={{ background: "#1a1a2e" }}>
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2" style={{ background: "#141428", borderBottom: "1px solid #2d3a5a" }}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { onSave(nodes, edges); onBack(); }} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex items-center gap-2 text-slate-200">
            <Zap className="w-5 h-5 text-violet-400" />
            {editingName ? (
              <Input
                autoFocus
                value={flowName}
                onChange={e => setFlowName(e.target.value)}
                onBlur={() => { onRename(flow.id, flowName); setEditingName(false); }}
                onKeyDown={e => { if (e.key === "Enter") { onRename(flow.id, flowName); setEditingName(false); } if (e.key === "Escape") { setFlowName(flow.name); setEditingName(false); } }}
                className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200 text-lg font-bold h-8 w-64"
              />
            ) : (
              <span
                className={`font-bold text-lg transition-colors ${canEdit ? "cursor-text hover:text-violet-300" : ""}`}
                onDoubleClick={canEdit ? () => setEditingName(true) : undefined}
                title={canEdit ? "Duplo clique para renomear" : undefined}
              >
                {flowName}
              </span>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-0.5 ml-3">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-white/5" onClick={handleUndo} disabled={!canUndo} title="Desfazer (Undo)">
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-white/5" onClick={handleRedo} disabled={!canRedo} title="Refazer (Redo)">
                <Redo2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setTemplatesOpen(true)} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
              📋 Templates
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="ghost" size="sm" onClick={() => importFlowInputRef.current?.click()} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
                Importar Flow
              </Button>
              <input ref={importFlowInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFlowFile} />
            </>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleExportFlow} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
              Exportar Flow
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleExportPng} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
            <Image className="w-3.5 h-3.5 mr-1" /> PNG
          </Button>
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleAutoLayout} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
              <LayoutGrid className="w-3.5 h-3.5 mr-1" /> Layout
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleFitView} className="text-slate-400 hover:text-slate-200 hover:bg-white/5">
            <Maximize2 className="w-3.5 h-3.5 mr-1" /> Vista
          </Button>
          {canEdit && (
            <Button size="sm" onClick={handleSave} className="bg-violet-600 hover:bg-violet-700 text-white">
              <Save className="w-3.5 h-3.5 mr-1" /> Guardar
            </Button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
          {(canEdit || canCreate) && (
            <DynamicPalette
              onLoadTemplate={handleLoadTemplate}
              onImportFlow={handleImportFlow}
              currentNodes={nodes}
              currentEdges={edges}
              flowName={flowName}
            />
          )}

        <div ref={reactFlowWrapper} className="flex-1">
          <ContextMenu>
            <ContextMenuTrigger className="w-full h-full">
              <ReactFlow
                nodes={nodesWithCallbacks}
                edges={edges}
                onNodesChange={canEdit ? (changes: any[]) => {
                  const removals = changes.filter((c: any) => c.type === 'remove');
                  if (removals.length > 0) {
                    for (const r of removals) {
                      const node = nodesRef.current.find(n => n.id === r.id);
                      if (node?.type === "swimLane") {
                        const children = nodesRef.current.filter(n => (n as any).parentId === r.id);
                        if (children.length > 0) {
                          setDeleteContainerDialog({ nodeId: r.id, childCount: children.length });
                          const nonRemove = changes.filter((c: any) => !(c.type === 'remove' && c.id === r.id));
                          if (nonRemove.length > 0) onNodesChange(nonRemove);
                          return;
                        }
                      }
                    }
                  }
                  onNodesChange(changes);
                } : undefined}
                onEdgesChange={canEdit ? onEdgesChange : undefined}
                onConnect={canEdit ? onConnect : undefined}
                onDrop={canCreate ? onDrop : undefined}
                onDragOver={canCreate ? onDragOver : undefined}
                onNodeDrag={canEdit ? onNodeDrag : undefined}
                onNodeDragStop={canEdit ? onNodeDragStop : undefined}
                onNodeDoubleClick={canEdit ? onNodeDoubleClick : undefined}
                onEdgeClick={canEdit ? onEdgeClick : undefined}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.3}
                maxZoom={2}
                deleteKeyCode={canDelete ? "Delete" : null}
                snapToGrid
                snapGrid={[20, 20]}
                connectionMode={"loose" as any}
                style={{ background: "#1a1a2e" }}
                defaultEdgeOptions={{ animated: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2d3a5a" />
                <Controls className="!bg-[#141428] !border-[#2d3a5a] !shadow-lg [&>button]:!bg-[#1a1a3a] [&>button]:!border-[#2d3a5a] [&>button]:!text-slate-400 [&>button:hover]:!bg-[#2d3a5a]" />
              </ReactFlow>
            </ContextMenuTrigger>
            <ContextMenuContent className="bg-[#1a1a3a] border-[#2d3a5a] text-slate-200">
              {canEdit && (
                <ContextMenuItem onClick={() => { const sel = nodes.find(n => n.selected); if (sel) setEditNode(sel); }} className="hover:!bg-white/10">
                  <Settings className="w-3.5 h-3.5 mr-2" /> Editar
                </ContextMenuItem>
              )}
              {canEdit && (
                <ContextMenuItem onClick={() => { const sel = nodes.find(n => n.selected); if (sel) duplicateNode(sel.id); }} className="hover:!bg-white/10">
                  <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar
                </ContextMenuItem>
              )}
              {canEdit && <ContextMenuSeparator className="bg-[#2d3a5a]" />}
              {canEdit && (
                <ContextMenuItem onClick={() => { const sel = nodes.find(n => n.selected); if (sel) bringToFront(sel.id); }} className="hover:!bg-white/10">
                  <ArrowUp className="w-3.5 h-3.5 mr-2" /> Trazer para Frente
                </ContextMenuItem>
              )}
              {canEdit && (
                <ContextMenuItem onClick={() => { const sel = nodes.find(n => n.selected); if (sel) sendToBack(sel.id); }} className="hover:!bg-white/10">
                  <ArrowDown className="w-3.5 h-3.5 mr-2" /> Enviar para Trás
                </ContextMenuItem>
              )}
              {canCreate && (() => {
                const sel = nodes.find(n => n.selected);
                if (sel?.type !== "swimLane" || (sel as any).parentId) return null;
                const parentId = sel.id;
                const dir = (sel.data as any).layoutDirection || "horizontal";
                const hasChildren = nodes.some(n => (n as any).parentId === parentId && n.type === "swimLane");
                return (
                  <>
                    <ContextMenuSeparator className="bg-[#2d3a5a]" />
                    {/* Add sub-section */}
                    <ContextMenuItem onClick={() => {
                      const parent = nodesRef.current.find(n => n.id === parentId);
                      if (!parent) return;
                      const id = newId();
                      takeSnapshot();
                      setNodes(ns => sortNodesParentFirst([...ns, {
                        id, type: "swimLane",
                        position: { x: 0, y: SWIM_HEADER_H },
                        data: { label: "Sub-secção", isStructuredChild: true },
                        style: { width: 200, height: 200 },
                        parentId,
                        extent: "parent",
                        draggable: false,
                        zIndex: -9,
                      } as any]));
                      setTimeout(() => redistributeChildren(parentId), 50);
                    }} className="hover:!bg-white/10">
                      <Plus className="w-3.5 h-3.5 mr-2" /> Adicionar sub-secção
                    </ContextMenuItem>
                    {/* Layout orientation */}
                    {hasChildren && (
                      <>
                        <ContextMenuItem
                          onClick={() => { takeSnapshot(); redistributeChildren(parentId, "horizontal"); }}
                          className={`hover:!bg-white/10 ${dir === "horizontal" ? "!text-violet-400" : ""}`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5 mr-2" /> Dividir horizontalmente
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => { takeSnapshot(); redistributeChildren(parentId, "vertical"); }}
                          className={`hover:!bg-white/10 ${dir === "vertical" ? "!text-violet-400" : ""}`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5 mr-2" /> Dividir verticalmente
                        </ContextMenuItem>
                      </>
                    )}
                  </>
                );
              })()}
              {canDelete && <ContextMenuSeparator className="bg-[#2d3a5a]" />}
              {canDelete && (
                <ContextMenuItem onClick={() => { const sel = nodes.find(n => n.selected); if (sel) deleteNode(sel.id); }} className="hover:!bg-white/10 text-red-400">
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        </div>

        {/* Right Panel */}
        {editNode && isBpmn && (
          <BpmnPropertiesPanel node={editNode} onUpdate={updateNodeData} onClose={() => setEditNode(null)} />
        )}
        {editNode && isDynamicNode && (
          <DynamicPropertiesPanel node={editNode} onUpdate={updateNodeData} onClose={() => setEditNode(null)} />
        )}
        {editEdge && (
          <EdgePropertiesPanel edge={editEdge} onUpdate={updateEdgeData} onClose={() => setEditEdge(null)} />
        )}
      </div>

      {/* Templates modal in canvas context */}
      <TemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onLoadTemplate={handleLoadTemplate}
        currentNodes={nodes}
        currentEdges={edges}
      />

      {/* Clear flow dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent className="bg-[#1e2a4a] border-[#2d3a5a] text-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-200">Limpar flow</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja remover todos os nós e conexões?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#141428] border-[#2d3a5a] text-slate-300 hover:bg-[#2d3a5a]">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmClear}>Limpar Tudo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete container dialog */}
      <AlertDialog open={!!deleteContainerDialog} onOpenChange={(open) => { if (!open) setDeleteContainerDialog(null); }}>
        <AlertDialogContent className="bg-[#1e2a4a] border-[#2d3a5a] text-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-200">Eliminar secção</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Esta secção contém {deleteContainerDialog?.childCount} elemento(s) dentro. O que deseja fazer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:flex-row">
            <AlertDialogCancel className="bg-[#141428] border-[#2d3a5a] text-slate-300 hover:bg-[#2d3a5a]">Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={deleteContainerOnly} className="border-[#2d3a5a] text-slate-300 hover:bg-[#2d3a5a]">
              Remover só o contentor
            </Button>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={deleteContainerAndContents}>
              Eliminar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─────────────── Root component ─────────────── */

export default function FlowBuilder() {
  const [flows, setFlows] = useState<FlowData[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { hasPermission, isSystemAdmin } = usePermissions();
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id || null;

  const canCreate = isSystemAdmin || hasPermission("flow_builder.create");
  const canEdit = isSystemAdmin || hasPermission("flow_builder.edit");
  const canDelete = isSystemAdmin || hasPermission("flow_builder.delete");

  // Load flows from database
  useEffect(() => {
    if (!companyId) { setFlows([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("flow_builder_flows")
        .select("*")
        .eq("organization_id", companyId)
        .order("updated_at", { ascending: false });
      if (data) {
        setFlows(data.map((r: any) => ({
          id: r.id,
          name: r.name,
          nodes: (r.nodes || []) as Node[],
          edges: (r.edges || []) as Edge[],
          updatedAt: r.updated_at,
        })));
      }
      if (error) console.error("Error loading flows:", error);
      setLoading(false);
    })();
  }, [companyId]);

  const activeFlow = flows.find(f => f.id === activeFlowId);

  const handleNewFlow = useCallback(async () => {
    if (!canCreate || !companyId) return;
    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) {
      toast.error("Sessão inválida. Volta a iniciar sessão.");
      return;
    }

    const name = `Novo Flow ${flows.length + 1}`;
    const { data, error } = await supabase
      .from("flow_builder_flows")
      .insert({ organization_id: companyId, name, nodes: [], edges: [], created_by: businessUserId, updated_by: businessUserId } as any)
      .select()
      .single();

    if (error) {
      console.error("Error creating flow:", error);
      console.error("Flow create context:", { companyId, businessUserId, errorCode: error.code, errorMessage: error.message, errorDetails: error.details, errorHint: error.hint });
      toast.error("Não foi possível criar o flow.");
      return;
    }

    const r = data as any;
    const newFlow: FlowData = { id: r.id, name: r.name, nodes: [], edges: [], updatedAt: r.updated_at };
    setFlows(prev => [newFlow, ...prev]);
    setActiveFlowId(r.id);
  }, [canCreate, companyId, flows.length]);

  const handleDeleteFlow = useCallback(async (id: string) => {
    const { error } = await supabase.from("flow_builder_flows").delete().eq("id", id);
    if (error) {
      console.error("Error deleting flow:", error);
      toast.error("Não foi possível apagar o flow.");
      return;
    }
    setFlows(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleRenameFlow = useCallback(async (id: string, name: string) => {
    if (!name.trim()) return;
    const { error } = await supabase.from("flow_builder_flows").update({ name: name.trim(), updated_at: new Date().toISOString() } as any).eq("id", id);
    if (error) {
      console.error("Error renaming flow:", error);
      toast.error("Não foi possível renomear o flow.");
      return;
    }
    setFlows(prev => prev.map(f => f.id === id ? { ...f, name: name.trim() } : f));
  }, []);

  const handleSaveFlow = useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!activeFlowId) return;
    const { data: userData } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await supabase.from("flow_builder_flows").update({
      nodes: nodes as any,
      edges: edges as any,
      updated_at: now,
      updated_by: userData?.user?.id,
    } as any).eq("id", activeFlowId);

    if (error) {
      console.error("Error saving flow:", error);
      toast.error("Não foi possível guardar o flow.");
      return;
    }

    setFlows(prev => prev.map(f => f.id === activeFlowId ? { ...f, nodes, edges, updatedAt: now } : f));
  }, [activeFlowId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1a1a2e" }}>
        <div className="text-slate-400">A carregar flows...</div>
      </div>
    );
  }

  return (
    <DynamicNodeProvider>
      {activeFlow ? (
        <ReactFlowProvider key={activeFlow.id}>
          <FlowBuilderCanvas
            flow={activeFlow}
            onBack={() => setActiveFlowId(null)}
            onSave={handleSaveFlow}
            onRename={handleRenameFlow}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </ReactFlowProvider>
      ) : (
        <FlowListScreen
          flows={flows}
          onSelect={setActiveFlowId}
          onNew={handleNewFlow}
          onDelete={handleDeleteFlow}
          onRename={handleRenameFlow}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </DynamicNodeProvider>
  );
}
