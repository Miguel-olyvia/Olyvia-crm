import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { calculateHealthScore } from "@/hooks/useContactHealthScore";

interface MapContact {
  id: string;
  entity_id: string;
  organization_id: string | null;
  assigned_to: string | null;
  last_interaction_at: string | null;
}

interface ContactsRelationsMapProps {
  contacts: MapContact[];
  interactionCounts: Record<string, number>;
  lastInteractions: Record<string, string>;
  dealsData: Record<string, { count: number; value: number }>;
  getIdentity: (entityId: string) => { display_name?: string; email?: string; phone?: string; vat?: string } | undefined;
  onContactClick: (contact: MapContact) => void;
}

const HEALTH_NODE_COLORS: Record<string, string> = {
  excellent: "#22c55e",
  good: "#3b82f6",
  attention: "#eab308",
  at_risk: "#f97316",
  critical: "#ef4444",
};

export function ContactsRelationsMap({
  contacts, interactionCounts, lastInteractions, dealsData, getIdentity, onContactClick
}: ContactsRelationsMapProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const orgGroups: Record<string, string[]> = {};

    contacts.forEach((c, i) => {
      const identity = getIdentity(c.entity_id);
      const hs = calculateHealthScore({
        lastInteractionAt: lastInteractions[c.entity_id] || c.last_interaction_at,
        hasActiveDeal: !!dealsData[c.entity_id]?.count,
        hasEmail: !!identity?.email,
        hasPhone: !!identity?.phone,
        hasVat: !!identity?.vat,
        interactionCount30d: interactionCounts[c.entity_id] || 0,
      });

      const pipelineValue = dealsData[c.entity_id]?.value || 0;
      const size = Math.max(40, Math.min(80, 40 + pipelineValue / 500));
      const initials = (identity?.display_name || "?")
        .split(" ")
        .map(w => w[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      // Grid layout with some randomness
      const cols = Math.ceil(Math.sqrt(contacts.length));
      const row = Math.floor(i / cols);
      const col = i % cols;

      nodes.push({
        id: c.id,
        position: { x: col * 200 + (Math.random() * 40 - 20), y: row * 180 + (Math.random() * 40 - 20) },
        data: {
          label: (
            <div className="flex flex-col items-center gap-0.5">
              <div
                style={{
                  width: size,
                  height: size,
                  borderRadius: "50%",
                  backgroundColor: HEALTH_NODE_COLORS[hs.level],
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: "bold",
                  fontSize: size * 0.3,
                  border: "3px solid white",
                  boxShadow: `0 2px 8px ${HEALTH_NODE_COLORS[hs.level]}40`,
                }}
              >
                {initials}
              </div>
              <span style={{ fontSize: 10, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
                {identity?.display_name?.split(" ")[0] || "?"}
              </span>
              <span style={{ fontSize: 9, color: "#999" }}>{hs.score}</span>
            </div>
          ),
        },
        type: "default",
        style: { background: "transparent", border: "none", width: "auto" },
      });

      // Group by org for edges
      if (c.organization_id) {
        if (!orgGroups[c.organization_id]) orgGroups[c.organization_id] = [];
        orgGroups[c.organization_id].push(c.id);
      }
    });

    // Add org-based edges (same organization)
    Object.values(orgGroups).forEach(group => {
      for (let i = 0; i < group.length - 1; i++) {
        for (let j = i + 1; j < group.length && j < i + 3; j++) {
          edges.push({
            id: `org-${group[i]}-${group[j]}`,
            source: group[i],
            target: group[j],
            style: { stroke: "hsl(var(--border))", strokeWidth: 1.5 },
            type: "default",
          });
        }
      }
    });

    // Deal-based edges (same entity_id with deals)
    const dealEntities: Record<string, string[]> = {};
    contacts.forEach(c => {
      if (dealsData[c.entity_id]?.count) {
        if (!dealEntities[c.entity_id]) dealEntities[c.entity_id] = [];
        dealEntities[c.entity_id].push(c.id);
      }
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [contacts, interactionCounts, lastInteractions, dealsData, getIdentity]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_: any, node: Node) => {
    const contact = contacts.find(c => c.id === node.id);
    if (contact) onContactClick(contact);
  }, [contacts, onContactClick]);

  if (contacts.length === 0) {
    return (
      <div className="rounded-lg border bg-card flex items-center justify-center h-[500px]">
        <p className="text-muted-foreground">Sem contactos para visualizar</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card" style={{ height: 500 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
