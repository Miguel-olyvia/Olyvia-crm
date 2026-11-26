// 26/11 (Rúben: «temos de criar uma base de conhecimento para que o chat com a AI consiga servir informação a partir de qualquer página»).
// consultar_base_conhecimento: lê a base de conhecimento da Olyvia (tabela olyvia_conhecimento, migração 20270128000000) da organização
// ativa: o guia de como a plataforma funciona, o resumo do dia das obras, os negócios e as obras (fase, valor, o que os agentes propõem,
// as próximas tarefas). Lê com o cliente do utilizador: a RLS só deixa ver os negócios e obras que ele já vê.
import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

export const TIPOS = ["guia", "resumo", "negocio", "obra", "orcamento", "custos"] as const;

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
        tipo: { type: "string", enum: [...TIPOS], description: "guia, resumo, negocio, obra, orcamento (as linhas e os totais de um orçamento) ou custos (custo e margem, só para quem os vê) (opcional)." },
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
  // 26/11: também o orçamento ao detalhe e os custos (a RLS só dá os custos a quem os vê)
  q = tipo ? q.eq("tipo", tipo) : q.in("tipo", ["guia", "negocio", "orcamento", "custos"]);
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

// ------------------------------------------------------------------ 26/11: os relatórios (negócios, obras, orçamento; ver, PDF, Excel)
// «faz isso ao máximo detalhe, super bonito e detalhado»: o chat dá o resumo dos números e a ligação para /relatorios/olyvia, a página que
// desenha o relatório e o descarrega em PDF ou Excel (com ?formato=, logo ao abrir). Os números vêm da base de conhecimento, com a RLS de
// quem pergunta: o mesmo que a página vai mostrar.
export const relatorioOlyviaDef: ToolDef = {
  type: "function",
  function: {
    name: "relatorio_olyvia",
    description:
      "Relatórios da Olyvia em PDF, Excel ou no ecrã: 'negocios' (funil por fase, valores em proposta e ganhos, lista dos negócios), 'obras' (estado, fim, decisões dos agentes) ou 'orcamento' (o orçamento de UM negócio ao detalhe: linhas, totais por fase e por IVA, adendas, prestações e, para quem vê custos, custo e margem). Devolve o resumo dos números e uma ligação (link) que abre o relatório na app e, com formato pdf ou excel, descarrega o ficheiro. Para 'orcamento', dá 'numero' (do negócio) ou 'cliente' (o nome).",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["negocios", "obras", "orcamento"], description: "O relatório." },
        numero: { type: "integer", description: "O número do negócio (só no orçamento)." },
        cliente: { type: "string", description: "O nome do cliente, se não se souber o número (só no orçamento)." },
        formato: { type: "string", enum: ["ver", "pdf", "excel"], description: "ver (abrir na app), pdf ou excel. Por omissão: ver." },
      },
      required: ["tipo"],
    },
  },
};

const FMT_EUR = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
const eurTxt = (n: number) => `${FMT_EUR.format(n)} €`;
const FASES_NEG = ["Por contactar", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"];
// deno-lint-ignore no-explicit-any
type LinhaK = { tipo: string; numero: number | null; titulo: string; dados: Record<string, any> | null; atualizado_em: string };

const relatorio_olyvia: Handler = async (ctx, args): Promise<ToolResult> => {
  const sb = ctx.userSupabase ?? ctx.supabase;
  if (!ctx.organizationId) return { success: false, message: "Sem organização ativa." };
  const tipo = ["negocios", "obras", "orcamento"].includes(args?.tipo) ? String(args.tipo) : "negocios";
  const formato = args?.formato === "pdf" || args?.formato === "excel" ? String(args.formato) : null;
  const ler = (tipos: string[]) => sb.from("olyvia_conhecimento").select("tipo, numero, titulo, dados, atualizado_em").eq("organization_id", ctx.organizationId).in("tipo", tipos).limit(4000);
  const ligacao = (numero?: number | null) => {
    const q = new URLSearchParams({ tipo });
    if (numero) q.set("numero", String(numero));
    if (formato) q.set("formato", formato);
    return `/relatorios/olyvia?${q.toString()}`;
  };
  const rotulo = formato === "pdf" ? "Descarregar o PDF" : formato === "excel" ? "Descarregar o Excel" : "Abrir o relatório";

  if (tipo === "negocios") {
    const { data, error } = await ler(["negocio"]);
    if (error) return { success: false, message: error.message };
    const N = (data ?? []) as LinhaK[];
    const ativos = N.filter((x) => !x.dados?.perdido), soma = (A: LinhaK[]) => A.reduce((a, x) => a + (Number(x.dados?.valor) || 0), 0);
    const propostas = ativos.filter((x) => x.dados?.enviada && !x.dados?.aceite), ganhos = ativos.filter((x) => x.dados?.aceite);
    return { success: true, link: ligacao(), rotulo_link: rotulo, atualizada_em: N.map((x) => x.atualizado_em).sort().pop(),
      resumo: { negocios_ativos: ativos.length, perdidos: N.length - ativos.length, em_proposta: eurTxt(soma(propostas)), propostas_por_aceitar: propostas.length, ganhos: eurTxt(soma(ganhos)), aceites: ganhos.length,
        por_fase: FASES_NEG.map((f, i) => { const A = ativos.filter((x) => Number(x.dados?.faseN) === i); return { fase: f, negocios: A.length, valor: eurTxt(soma(A)) }; }) } };
  }
  if (tipo === "obras") {
    const { data, error } = await ler(["obra", "resumo"]);
    if (error) return { success: false, message: error.message };
    const L = (data ?? []) as LinhaK[], O = L.filter((x) => x.tipo === "obra");
    return { success: true, link: ligacao(), rotulo_link: rotulo, atualizada_em: L.map((x) => x.atualizado_em).sort().pop(),
      resumo: { obras: O.length, decisoes_a_espera: O.reduce((a, x) => a + (Number(x.dados?.decisoes) || 0), 0),
        obras_lista: O.map((x) => ({ numero: x.numero, obra: x.titulo, estado: x.dados?.estado, acaba: x.dados?.fim, decisoes: x.dados?.decisoes })) } };
  }
  // o orçamento de um negócio: pelo número, ou pelo nome do cliente
  let numero = Number(args?.numero) || null;
  if (!numero) {
    const P = palavras(String(args?.cliente ?? ""));
    if (!P.length) return { success: false, message: "Diz-me o número do negócio ou o nome do cliente." };
    const { data, error } = await sb.from("olyvia_conhecimento").select("numero, titulo").eq("organization_id", ctx.organizationId).eq("tipo", "orcamento")
      .or(P.map((w) => `titulo.ilike.%${w}%`).join(",")).limit(10);
    if (error) return { success: false, message: error.message };
    const L = (data ?? []) as { numero: number; titulo: string }[];
    const todas = L.filter((x) => P.every((w) => x.titulo.toLowerCase().includes(w)));
    const escolha = todas.length === 1 ? todas : L.length === 1 ? L : [];
    if (!escolha.length) return { success: false, ambiguo: L.length > 1, candidatos: L.map((x) => x.titulo), message: L.length ? "Há mais do que um orçamento com esse nome: pergunta qual." : "Não encontrei o orçamento desse cliente (ou não o podes ver)." };
    numero = escolha[0].numero;
  }
  const { data, error } = await sb.from("olyvia_conhecimento").select("tipo, numero, titulo, dados, atualizado_em").eq("organization_id", ctx.organizationId).eq("numero", numero).in("tipo", ["orcamento", "custos"]);
  if (error) return { success: false, message: error.message };
  const L = (data ?? []) as LinhaK[], o = L.find((x) => x.tipo === "orcamento"), c = L.find((x) => x.tipo === "custos");
  if (!o) return { success: false, message: `Não encontrei o orçamento do negócio ${numero} (ou não o podes ver).` };
  const d = o.dados ?? {};
  return { success: true, link: ligacao(numero), rotulo_link: rotulo, atualizada_em: o.atualizado_em,
    resumo: { orcamento: o.titulo, linhas: Array.isArray(d.linhas) ? d.linhas.length : 0, total_com_iva: eurTxt(Number(d.totais?.total) || 0), sem_iva: eurTxt(Number(d.totais?.base) || 0),
      por_fase: d.porFase, adendas: d.adendas, prestacoes: d.parcelas,
      // deno-lint-ignore no-explicit-any
      maiores_linhas: Array.isArray(d.linhas) ? d.linhas.slice(0, 5).map((l: any) => `${l.nome}: ${eurTxt(Number(l.total) || 0)}`) : [],
      ...(c ? { margem_prevista: `${Math.round((Number(c.dados?.margem) || 0) * 1000) / 10}%`, custo_previsto: eurTxt(Number(c.dados?.custo) || 0) } : {}) } };
};

export const handlers: Record<string, Handler> = { consultar_base_conhecimento, relatorio_olyvia };
