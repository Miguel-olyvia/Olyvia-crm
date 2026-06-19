import type { Edge, Node } from "@xyflow/react";

interface FlowExportPayload {
  type: "flow-builder-flow";
  version: 1;
  name: string;
  nodes: Node[];
  edges: Edge[];
  exportedAt: string;
}

export interface ParsedFlowImport {
  name?: string;
  nodes: Node[];
  edges: Edge[];
}

const FLOW_CONTAINER_KEYS = new Set([
  "flow",
  "payload",
  "data",
  "canvas",
  "diagram",
  "content",
  "currentFlow",
  "flowData",
]);

const FLOW_COLLECTION_KEYS = new Set([
  "flows",
  "templates",
  "flowTemplates",
]);

const SKIP_DESCENT_KEYS = new Set([
  "nodeTypes",
  "customNodeTypes",
  "categories",
  "nodeCategories",
]);

const isObject = (value: unknown): value is Record<string, any> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const normalizeNode = (node: unknown, index: number): Node | null => {
  if (!isObject(node)) return null;

  const position = isObject(node.position)
    ? {
        x: typeof node.position.x === "number" ? node.position.x : index * 80,
        y: typeof node.position.y === "number" ? node.position.y : index * 80,
      }
    : { x: index * 80, y: index * 80 };

  return {
    ...node,
    id: typeof node.id === "string" && node.id.trim() ? node.id : `node_import_${Date.now()}_${index}`,
    position,
    data: isObject(node.data) ? node.data : {},
  } as Node;
};

const normalizeEdge = (edge: unknown, index: number): Edge | null => {
  if (!isObject(edge) || typeof edge.source !== "string" || typeof edge.target !== "string") return null;

  return {
    ...edge,
    id: typeof edge.id === "string" && edge.id.trim() ? edge.id : `edge_import_${Date.now()}_${index}`,
    data: isObject(edge.data) ? edge.data : {},
  } as Edge;
};

export function createFlowExportJson({ name, nodes, edges }: { name: string; nodes: Node[]; edges: Edge[] }) {
  const payload: FlowExportPayload = {
    type: "flow-builder-flow",
    version: 1,
    name,
    nodes,
    edges,
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(payload, null, 2);
}

export function parseImportedFlowJson(json: string): ParsedFlowImport | null {
  try {
    const parsed = JSON.parse(json);
    const candidates: Record<string, any>[] = [];

    const addCandidate = (candidate: unknown) => {
      if (isObject(candidate) && !candidates.includes(candidate)) candidates.push(candidate);
    };

    const visit = (value: unknown, depth = 0, parentKey?: string) => {
      if (depth > 6) return;

      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1, parentKey));
        return;
      }

      if (!isObject(value)) return;

      if (Array.isArray(value.nodes) && Array.isArray(value.edges)) {
        addCandidate(value);
      }

      for (const [key, child] of Object.entries(value)) {
        if (SKIP_DESCENT_KEYS.has(key)) continue;

        if (FLOW_CONTAINER_KEYS.has(key)) {
          addCandidate(child);
          visit(child, depth + 1, key);
          continue;
        }

        if (FLOW_COLLECTION_KEYS.has(key) && Array.isArray(child)) {
          child.forEach((item) => {
            addCandidate(item);
            visit(item, depth + 1, key);
          });
          continue;
        }

        if (Array.isArray(child) || isObject(child)) {
          visit(child, depth + 1, key);
        }
      }
    };

    addCandidate(parsed);
    visit(parsed);

    for (const candidate of candidates) {
      if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) continue;

      const nodes = candidate.nodes
        .map((node, index) => normalizeNode(node, index))
        .filter((node): node is Node => node !== null);
      const edges = candidate.edges
        .map((edge, index) => normalizeEdge(edge, index))
        .filter((edge): edge is Edge => edge !== null);

      if (nodes.length !== candidate.nodes.length || edges.length !== candidate.edges.length) continue;
      if (nodes.length === 0) continue;

      return {
        name: typeof candidate.name === "string"
          ? candidate.name
          : typeof candidate.flowName === "string"
            ? candidate.flowName
            : typeof candidate.title === "string"
              ? candidate.title
              : undefined,
        nodes,
        edges,
      };
    }

    return null;
  } catch {
    return null;
  }
}