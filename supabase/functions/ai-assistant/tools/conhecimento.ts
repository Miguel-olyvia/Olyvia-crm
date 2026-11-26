// 26/11 (Rúben: «temos de criar uma base de conhecimento para que o chat com a AI consiga servir informação a partir de qualquer página»).
// consultar_base_conhecimento: lê a base de conhecimento da Olyvia (tabela olyvia_conhecimento, migração 20270128000000) da organização
// ativa: o guia de como a plataforma funciona, o resumo do dia das obras, os negócios e as obras (fase, valor, o que os agentes propõem,
// as próximas tarefas). Lê com o cliente do utilizador: a RLS só deixa ver os negócios e obras que ele já vê.
import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

export const TIPOS = ["guia", "resumo", "negocio", "obra"] as const;

export const consultarConhecimentoDef: ToolDef = {
  type: "function",
  function: {
    name: "consultar_base_conhecimento",
    description:
      "Lê a base de conhecimento da Olyvia (de qualquer página): o guia de como a plataforma funciona (fases do negócio, agentes, degraus de autonomia, Estúdios, aprendizagem, voz, portal), o resumo do dia das obras, os negócios (fase, valor, estado) e as obras (o que os agentes propõem, próximas tarefas, fim previsto). Usa-a para perguntas sobre negócios, obras, decisões à espera, o dia das obras e «como se faz». 'procura' = palavras do nome do cliente, do número ou do tema; 'tipo' filtra.",
    parameters: {
      type: "object",
      properties: {
        procura: { type: "string", description: "Palavras a procurar no título e no texto (nome do cliente, número do negócio, tema). Vazio = tudo do tipo." },
        tipo: { type: "string", enum: [...TIPOS], description: "guia, resumo, negocio ou obra (opcional)." },
      },
    },
  },
};

const palavras = (s: string) => [...new Set(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)
  .filter((w) => w.length >= 3))].slice(0, 6);

const consultar_base_conhecimento: Handler = async (ctx, args): Promise<ToolResult> => {
  const sb = ctx.userSupabase ?? ctx.supabase;
  if (!ctx.organizationId) return { success: false, message: "Sem organização ativa." };
  const tipo = TIPOS.includes(args?.tipo) ? (args.tipo as string) : null;
  const P = palavras(String(args?.procura ?? ""));
  let q = sb.from("olyvia_conhecimento").select("tipo, numero, titulo, texto, atualizado_em").eq("organization_id", ctx.organizationId);
  if (tipo) q = q.eq("tipo", tipo);
  if (P.length) q = q.or(P.flatMap((w) => [`titulo.ilike.%${w}%`, `texto.ilike.%${w}%`]).join(","));
  const { data, error } = await q.order("tipo").limit(P.length || tipo ? 25 : 40);
  if (error) return { success: false, message: `A base de conhecimento não respondeu: ${error.message}` };
  const L = (data ?? []) as { tipo: string; numero: number | null; titulo: string; texto: string; atualizado_em: string }[];
  if (!L.length) return { success: true, data: [], message: "Nada na base de conhecimento sobre isso (ou ainda não foi atualizada nesta organização)." };
  const recente = L.map((x) => x.atualizado_em).sort().pop();
  return { success: true, atualizada_em: recente, data: L.map((x) => ({ tipo: x.tipo, numero: x.numero, titulo: x.titulo, texto: x.texto })) };
};

export const handlers: Record<string, Handler> = { consultar_base_conhecimento };
