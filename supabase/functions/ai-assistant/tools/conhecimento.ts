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

// 26/11 (teste ao vivo): sem tirar os acentos (o texto da base tem-nos: «decisoes» não encontrava «decisões»); só palavras que distinguem
const VAZIAS = new Set(["que", "das", "dos", "como", "para", "com", "uma", "est", "esta", "estao", "estão", "tem", "têm", "qual", "quais", "obra", "obras"]);
export const palavras = (s: string) => [...new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u)
  .filter((w) => w.length >= 3 && !VAZIAS.has(w)))].slice(0, 6);

const consultar_base_conhecimento: Handler = async (ctx, args): Promise<ToolResult> => {
  const sb = ctx.userSupabase ?? ctx.supabase;
  if (!ctx.organizationId) return { success: false, message: "Sem organização ativa." };
  const tipo = TIPOS.includes(args?.tipo) ? (args.tipo as string) : null;
  const P = palavras(String(args?.procura ?? ""));
  type Linha = { tipo: string; numero: number | null; titulo: string; texto: string; atualizado_em: string };
  const colunas = "tipo, numero, titulo, texto, atualizado_em";
  // 26/11 (teste ao vivo): o resumo do dia e as obras vêm sempre (são poucos); antes, os 25 itens enchiam-se de guia e de negócios
  // (ordenados por tipo) e o resumo ficava de fora
  const sempre = !tipo || tipo === "resumo" || tipo === "obra"
    ? await sb.from("olyvia_conhecimento").select(colunas).eq("organization_id", ctx.organizationId).in("tipo", tipo ? [tipo] : ["resumo", "obra"]).limit(40)
    : { data: [], error: null };
  let q = sb.from("olyvia_conhecimento").select(colunas).eq("organization_id", ctx.organizationId);
  q = tipo ? q.eq("tipo", tipo) : q.in("tipo", ["guia", "negocio"]);
  if (P.length) q = q.or(P.flatMap((w) => [`titulo.ilike.%${w}%`, `texto.ilike.%${w}%`]).join(","));
  const procura = tipo === "resumo" || tipo === "obra" ? { data: [], error: null } : await q.limit(P.length ? 20 : 12);
  const error = sempre.error ?? procura.error;
  if (error) return { success: false, message: `A base de conhecimento não respondeu: ${error.message}` };
  const vistos = new Set<string>();
  const L = ([...(sempre.data ?? []), ...(procura.data ?? [])] as Linha[]).filter((x) => { const k = `${x.tipo}:${x.titulo}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  if (!L.length) return { success: true, data: [], message: "Nada na base de conhecimento sobre isso (ou ainda não foi atualizada nesta organização)." };
  const recente = L.map((x) => x.atualizado_em).sort().pop();
  return { success: true, atualizada_em: recente, data: L.map((x) => ({ tipo: x.tipo, numero: x.numero, titulo: x.titulo, texto: x.texto })) };
};

export const handlers: Record<string, Handler> = { consultar_base_conhecimento };
