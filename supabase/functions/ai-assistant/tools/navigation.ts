// Navigation tool — extracted verbatim from index.ts.

import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

export const navigateDef: ToolDef = {
  type: "function",
  function: {
    name: "navigate",
    description: "Devolve um deep-link para o frontend abrir um ecrã específico.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho relativo, ex: /leads, /deals, /proposals, /quotes, /scheduling, /notifications" },
        label: { type: "string" },
      },
      required: ["path"],
    },
  },
};

const navigate: Handler = async (_ctx, args): Promise<ToolResult> => {
  return {
    success: true,
    message: args.label || "Abrir",
    data: { link: args.path, label: args.label || "Abrir" },
  };
};

export const handlers: Record<string, Handler> = {
  navigate,
};
