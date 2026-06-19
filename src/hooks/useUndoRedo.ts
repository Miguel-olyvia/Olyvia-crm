import { useCallback, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";

interface Snapshot {
  nodes?: Node[];
  edges: Edge[];
}

export function useUndoRedo(maxHistory = 50) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);

  const pushSnapshot = useCallback((edges: Edge[], nodes?: Node[]) => {
    pastRef.current = [...pastRef.current.slice(-(maxHistory - 1)), {
      edges: edges.map(e => ({ ...e })),
      ...(nodes ? { nodes: nodes.map(n => ({ ...n, data: { ...(n.data as any) } })) } : {}),
    }];
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [maxHistory]);

  const undo = useCallback((
    currentEdges: Edge[],
    setEdges: (edges: Edge[]) => void,
    currentNodes?: Node[],
    setNodes?: (nodes: Node[]) => void,
  ) => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push({
      edges: currentEdges.map(e => ({ ...e })),
      ...(currentNodes ? { nodes: currentNodes.map(n => ({ ...n, data: { ...(n.data as any) } })) } : {}),
    });
    setEdges(prev.edges);
    if (prev.nodes && setNodes) setNodes(prev.nodes);
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback((
    currentEdges: Edge[],
    setEdges: (edges: Edge[]) => void,
    currentNodes?: Node[],
    setNodes?: (nodes: Node[]) => void,
  ) => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push({
      edges: currentEdges.map(e => ({ ...e })),
      ...(currentNodes ? { nodes: currentNodes.map(n => ({ ...n, data: { ...(n.data as any) } })) } : {}),
    });
    setEdges(next.edges);
    if (next.nodes && setNodes) setNodes(next.nodes);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const reset = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  return { canUndo, canRedo, pushSnapshot, undo, redo, reset };
}
