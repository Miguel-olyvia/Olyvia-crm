// 26/11 (Rúben: «temos de criar uma base de conhecimento para que o chat com a AI consiga servir informação a partir de qualquer página»).
// consultar_base_conhecimento: lê a base de conhecimento da Olyvia (tabela olyvia_conhecimento, migração 20270128000000) da organização
// ativa: o guia de como a plataforma funciona, o resumo do dia das obras, os negócios e as obras (fase, valor, o que os agentes propõem,
// as próximas tarefas). Lê com o cliente do utilizador: a RLS só deixa ver os negócios e obras que ele já vê.
import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";
import { callAiGateway } from "../../_shared/aiGateway.ts";

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
      "Relatórios da Olyvia em PDF, Excel ou no ecrã. Escolhe o tipo pelo que se pede: 'negocios' (lista e funil dos negócios; com 'filtro' para só uma parte: obra_por_iniciar, obra_em_curso, em_proposta, ganhos, perdidos ou fase:0 a fase:5), 'obras' (todas as obras: estado, progresso, fim, decisões dos agentes), 'obra' (o PLANO de UMA obra, tarefa a tarefa: fase, datas, técnico, estado; é o que se pede com «o plano», «as tarefas», «exporta este plano») ou 'orcamento' (só quando se pede o ORÇAMENTO, a proposta ou os preços de UM negócio: linhas, IVA, adendas, prestações), ou 'servicos' (os SERVIÇOS vendidos somados por todos os negócios: o que mais vendemos, por serviço e por tipo/ofício, com as margens de lucro para quem vê custos; 'so' = ganhos (por omissão) ou todos). Devolve o resumo e uma ligação (link) que abre o relatório e, com formato pdf ou excel, descarrega o ficheiro. Para 'obra' e 'orcamento', dá 'numero' (do negócio) ou 'cliente' (o nome).",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["negocios", "obras", "obra", "orcamento", "servicos"], description: "O relatório." },
        so: { type: "string", enum: ["ganhos", "todos"], description: "Só nos serviços: contar só os negócios ganhos (por omissão) ou todos os ativos." },
        filtro: { type: "string", description: "Só nos negócios: obra_por_iniciar, obra_em_curso, em_proposta, ganhos, perdidos, ou fase:N (0 Por contactar, 1 Contacto, 2 Visita, 3 Negócio, 4 Financeiro, 5 Obra)." },
        numero: { type: "integer", description: "O número do negócio (na obra e no orçamento)." },
        cliente: { type: "string", description: "O nome do cliente, se não se souber o número (na obra e no orçamento)." },
        formato: { type: "string", enum: ["ver", "pdf", "excel"], description: "ver (abrir na app), pdf ou excel. Por omissão: ver." },
        analise: { type: "string", description: "Quando o pedido pede também análise, insights, conclusões, melhorias, áreas novas a explorar ou riscos: o que se quer analisar, nas palavras do utilizador (ex.: «insights de melhoria e áreas novas a explorar»). A análise é escrita a partir dos números do relatório e vai DENTRO do PDF/Excel; vem de volta em analise_no_relatorio." },
        insights: { type: "array", items: { type: "string" }, description: "Opcional: ideias tuas para a análise (só servem de pista; o texto final é escrito a partir dos números)." },
        titulo_analise: { type: "string", description: "O título da secção da análise (por omissão «A análise da Olyvia»)." },
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

const relatorioBase: Handler = async (ctx, args): Promise<ToolResult> => {
  const sb = ctx.userSupabase ?? ctx.supabase;
  if (!ctx.organizationId) return { success: false, message: "Sem organização ativa." };
  const tipo = ["negocios", "obras", "obra", "orcamento", "servicos"].includes(args?.tipo) ? String(args.tipo) : "negocios";
  const so = args?.so === "todos" ? "todos" : "ganhos";
  // 27/11 (Rúben: «pedi relatórios e ele só faz orçamentos»): o filtro dos negócios (o mesmo da página /relatorios/olyvia)
  const FILTROS: Record<string, string> = { obra_por_iniciar: "com obra por iniciar", obra_em_curso: "com obra em curso", em_proposta: "em proposta", ganhos: "ganhos", perdidos: "perdidos" };
  const filtro = typeof args?.filtro === "string" && (FILTROS[args.filtro] || /^fase:[0-5]$/.test(args.filtro)) ? String(args.filtro) : null;
  const formato = args?.formato === "pdf" || args?.formato === "excel" ? String(args.formato) : null;
  const ler = (tipos: string[]) => sb.from("olyvia_conhecimento").select("tipo, numero, titulo, dados, atualizado_em").eq("organization_id", ctx.organizationId).in("tipo", tipos).limit(4000);
  const ligacao = (numero?: number | null) => {
    const q = new URLSearchParams({ tipo });
    if (numero) q.set("numero", String(numero));
    if (filtro && tipo === "negocios") q.set("filtro", filtro);
    if (tipo === "servicos" && so === "todos") q.set("so", "todos");
    if (formato) q.set("formato", formato);
    return `/relatorios/olyvia?${q.toString()}`;
  };
  const rotulo = formato === "pdf" ? "Descarregar o PDF" : formato === "excel" ? "Descarregar o Excel" : "Abrir o relatório";

  if (tipo === "negocios") {
    const { data, error } = await ler(["negocio"]);
    if (error) return { success: false, message: error.message };
    const todos = (data ?? []) as LinhaK[];
    const ff = filtro?.startsWith("fase:") ? Number(filtro.slice(5)) : null;
    const passa = (x: LinhaK) => { const d = x.dados ?? {}; return !filtro ? true
      : filtro === "obra_por_iniciar" ? !d.perdido && !!d.aceite && (!d.obra || d.obra === "por aprovar" || d.obra === "aprovado")
      : filtro === "obra_em_curso" ? d.obra === "em curso"
      : filtro === "em_proposta" ? !d.perdido && !!d.enviada && !d.aceite
      : filtro === "ganhos" ? !d.perdido && !!d.aceite
      : filtro === "perdidos" ? !!d.perdido
      : ff != null ? !d.perdido && Number(d.faseN) === ff : true; };
    const N = todos.filter(passa);
    const ativos = N.filter((x) => !x.dados?.perdido), soma = (A: LinhaK[]) => A.reduce((a, x) => a + (Number(x.dados?.valor) || 0), 0);
    const propostas = ativos.filter((x) => x.dados?.enviada && !x.dados?.aceite), ganhos = ativos.filter((x) => x.dados?.aceite);
    return { success: true, link: ligacao(), rotulo_link: rotulo, atualizada_em: N.map((x) => x.atualizado_em).sort().pop(),
      resumo: { ...(filtro ? { filtro: FILTROS[filtro] ?? `na fase ${FASES_NEG[ff ?? 0]}`, total: N.length,
          lista: N.slice(0, 40).map((x) => ({ numero: x.numero, negocio: x.titulo, fase: x.dados?.fase, valor: x.dados?.valor != null ? eurTxt(Number(x.dados.valor)) : null, obra: x.dados?.obra ?? "sem obra" })) } : {}),
        negocios_ativos: ativos.length, perdidos: N.length - ativos.length, em_proposta: eurTxt(soma(propostas)), propostas_por_aceitar: propostas.length, ganhos: eurTxt(soma(ganhos)), aceites: ganhos.length,
        por_fase: FASES_NEG.map((f, i) => { const A = ativos.filter((x) => Number(x.dados?.faseN) === i); return { fase: f, negocios: A.length, valor: eurTxt(soma(A)) }; }) } };
  }
  // 27/11 (Rúben: «o tipo de serviço que mais vendemos e as suas margens de lucro»): os serviços somados pelos orçamentos
  if (tipo === "servicos") {
    const { data, error } = await ler(["negocio", "orcamento", "custos"]);
    if (error) return { success: false, message: error.message };
    const L = (data ?? []) as LinhaK[];
    const neg = new Map(L.filter((x) => x.tipo === "negocio").map((x) => [x.numero, x.dados ?? {}]));
    const conta = (n: number | null) => { const d = neg.get(n); return !!d && !d.perdido && (so === "todos" || !!d.aceite); };
    const custos = new Map(L.filter((x) => x.tipo === "custos" && conta(x.numero)).map((x) => [x.numero, Array.isArray(x.dados?.linhas) ? x.dados!.linhas : []]));
    // deno-lint-ignore no-explicit-any
    const acc = new Map<string, { servico: string; oficio: string; negocios: Set<number>; vendido: number; preco: number; custo: number }>();
    const orcs = L.filter((x) => x.tipo === "orcamento" && conta(x.numero));
    for (const o of orcs) {
      // deno-lint-ignore no-explicit-any
      const CL: any[] = custos.get(o.numero) ?? [];
      // deno-lint-ignore no-explicit-any
      for (const l of (Array.isArray(o.dados?.linhas) ? o.dados!.linhas : []).filter((x: any) => x.tipo === "servico")) {
        const a = acc.get(l.nome) ?? { servico: l.nome, oficio: l.oficio || "Outros", negocios: new Set<number>(), vendido: 0, preco: 0, custo: 0 };
        a.negocios.add(o.numero as number); a.vendido += Number(l.total) || 0;
        const cl = CL.find((x) => x.nome === l.nome && x.tipo === "servico");
        if (cl) { a.preco += Number(cl.preco) || 0; a.custo += Number(cl.custo) || 0; }
        acc.set(l.nome, a);
      }
    }
    const S = [...acc.values()].sort((a, b) => b.vendido - a.vendido);
    const m = (a: { preco: number; custo: number }) => (a.preco > 0 && a.custo > 0 ? `${Math.round(((a.preco - a.custo) / a.preco) * 1000) / 10}%` : null);
    const of = new Map<string, { oficio: string; vendido: number; preco: number; custo: number }>();
    for (const a of S) { const o = of.get(a.oficio) ?? { oficio: a.oficio, vendido: 0, preco: 0, custo: 0 }; o.vendido += a.vendido; o.preco += a.preco; o.custo += a.custo; of.set(a.oficio, o); }
    const temCustos = custos.size > 0;
    return { success: true, link: ligacao(), rotulo_link: rotulo, atualizada_em: L.map((x) => x.atualizado_em).sort().pop(),
      resumo: { contados: so === "ganhos" ? `${orcs.length} negócios ganhos` : `${orcs.length} negócios ativos`, margens: temCustos ? "com custos" : "sem acesso aos custos: sem margens",
        por_tipo: [...of.values()].sort((a, b) => b.vendido - a.vendido).map((o) => ({ tipo: o.oficio, vendido: eurTxt(o.vendido), ...(temCustos ? { margem: m(o) } : {}) })),
        mais_vendidos: S.slice(0, 10).map((a) => ({ servico: a.servico, tipo: a.oficio, negocios: a.negocios.size, vendido: eurTxt(a.vendido), ...(temCustos ? { margem: m(a) } : {}) })),
        ...(temCustos ? { margens_mais_baixas: S.filter((a) => a.vendido >= 1000 && a.preco > 0 && a.custo > 0).sort((a, b) => (a.preco - a.custo) / a.preco - (b.preco - b.custo) / b.preco).slice(0, 6)
          .map((a) => ({ servico: a.servico, tipo: a.oficio, vendido: eurTxt(a.vendido), margem: m(a) })) } : {}),
        menos_vendidos_por_tipo: [...of.values()].sort((a, b) => a.vendido - b.vendido).slice(0, 6).map((o) => ({ tipo: o.oficio, vendido: eurTxt(o.vendido), ...(temCustos ? { margem: m(o) } : {}) })),
        total_vendido: eurTxt(S.reduce((t, a) => t + a.vendido, 0)) } };
  }
  if (tipo === "obras") {
    const { data, error } = await ler(["obra", "resumo"]);
    if (error) return { success: false, message: error.message };
    const L = (data ?? []) as LinhaK[], O = L.filter((x) => x.tipo === "obra");
    return { success: true, link: ligacao(), rotulo_link: rotulo, atualizada_em: L.map((x) => x.atualizado_em).sort().pop(),
      resumo: { obras: O.length, decisoes_a_espera: O.reduce((a, x) => a + (Number(x.dados?.decisoes) || 0), 0),
        obras_lista: O.map((x) => ({ numero: x.numero, obra: x.titulo, estado: x.dados?.estado, acaba: x.dados?.fim, decisoes: x.dados?.decisoes })) } };
  }
  // o orçamento (ou o plano da obra) de um negócio: pelo número, ou pelo nome do cliente
  const tipoK = tipo === "obra" ? "obra" : "orcamento";
  let numero = Number(args?.numero) || null;
  if (!numero) {
    const P = palavras(String(args?.cliente ?? ""));
    if (!P.length) return { success: false, message: "Diz-me o número do negócio ou o nome do cliente." };
    const { data, error } = await sb.from("olyvia_conhecimento").select("numero, titulo").eq("organization_id", ctx.organizationId).eq("tipo", tipoK)
      .or(P.map((w) => `titulo.ilike.%${w}%`).join(",")).limit(10);
    if (error) return { success: false, message: error.message };
    const L = (data ?? []) as { numero: number; titulo: string }[];
    const todas = L.filter((x) => P.every((w) => x.titulo.toLowerCase().includes(w)));
    const escolha = todas.length === 1 ? todas : L.length === 1 ? L : [];
    if (!escolha.length) return { success: false, ambiguo: L.length > 1, candidatos: L.map((x) => x.titulo), message: L.length ? `Há mais do que ${tipoK === "obra" ? "uma obra" : "um orçamento"} com esse nome: pergunta qual.` : `Não encontrei ${tipoK === "obra" ? "a obra" : "o orçamento"} desse cliente (ou não o podes ver).` };
    numero = escolha[0].numero;
  }
  if (tipo === "obra") {
    const { data, error } = await sb.from("olyvia_conhecimento").select("tipo, numero, titulo, dados, atualizado_em").eq("organization_id", ctx.organizationId).eq("numero", numero).eq("tipo", "obra").maybeSingle();
    if (error) return { success: false, message: error.message };
    const o = data as LinhaK | null;
    if (!o) return { success: false, message: `Não encontrei a obra do negócio ${numero} (ou ainda não tem plano, ou não a podes ver).` };
    const d = o.dados ?? {};
    // deno-lint-ignore no-explicit-any
    const T: any[] = Array.isArray(d.tarefas) ? d.tarefas : [];
    return { success: true, link: ligacao(numero), rotulo_link: rotulo, atualizada_em: o.atualizado_em,
      resumo: { obra: o.titulo, estado: d.estado, dia: d.dia, acaba: d.fim, tarefas: T.length, feitas: T.filter((t) => t.estado === "feita" || t.estado === "validada").length,
        sem_tecnico: T.filter((t) => t.tec === "—").length, decisoes_a_espera: d.decisoes,
        proximas: T.filter((t) => t.estado !== "feita" && t.estado !== "validada").slice(0, 6).map((t) => `${t.nome} (${t.ini} a ${t.fim}, ${t.tec})`) } };
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

// 27/11 (teste ao vivo: o chat pôs «insights» no relatório numa só chamada, antes de ver os números, e saíram genéricos e até
// inventados, como «domótica com margens superiores»). Agora a análise escreve-se AQUI, depois de ter os números do relatório: o
// modelo recebe o pedido e o resumo e devolve 3 a 7 pontos, cada um com um valor tirado dos dados. Se falhar, ficam as ideias do chat.
const MODELO_ANALISE = "gemini-3.5-flash-lite";
const limparPontos = (x: unknown): string[] => (Array.isArray(x) ? x : []).filter((p): p is string => typeof p === "string" && !!p.trim())
  .map((p) => p.trim().replace(/^(?:[-•*]\s*|\d+[.)]\s+)/, "").slice(0, 500)).filter(Boolean).slice(0, 8);
export function codificarNotas(n: { titulo?: string; pontos: string[] }): string {
  let bin = ""; for (const b of new TextEncoder().encode(JSON.stringify(n))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function escreverAnalise(pedido: string, tipo: string, resumo: unknown, ideias: string[]): Promise<string[] | null> {
  try {
    const r = await callAiGateway({
      model: MODELO_ANALISE, temperature: 0.4, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "És a analista da Olyvia, numa empresa de remodelações (casas de banho, cozinhas, obras). Recebes o pedido do utilizador e os números de um relatório. Escreve 4 a 7 pontos curtos em português de Portugal, que respondam ao pedido. Regras: cada ponto cita pelo menos um valor tirado dos números (euros, margem, número de negócios), escrito como vem nos dados (ex.: 34,2% ou 9 565,61 €, nunca «porcento» nem «euros»); só afirmas o que os números mostram; ideias novas (áreas a explorar, serviços a juntar) dizem-se como sugestão e dizem em que número se apoiam; nada de áreas ou margens que não estejam nos dados; sem travessões; uma ideia por ponto, no máximo duas frases. Responde só em JSON: {\"pontos\": [\"...\"]}." },
        { role: "user", content: JSON.stringify({ pedido, relatorio: tipo, numeros: resumo, ...(ideias.length ? { pistas_do_chat: ideias } : {}) }) },
      ],
    });
    if (!r.ok) return null;
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    const txt = String(j?.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?|```$/g, "").trim();
    const pontos = limparPontos(JSON.parse(txt)?.pontos);
    return pontos.length ? pontos : null;
  } catch { return null; }
}

const relatorio_olyvia: Handler = async (ctx, args): Promise<ToolResult> => {
  const r = await relatorioBase(ctx, args);
  const pedido = typeof args?.analise === "string" ? args.analise.trim().slice(0, 300) : "";
  const ideias = limparPontos(args?.insights);
  if (!r.success || !r.link || (!pedido && !ideias.length)) return r;
  const tipo = String(args?.tipo ?? "negocios");
  const pontos = (await escreverAnalise(pedido || "insights e melhorias", tipo, r.resumo, ideias)) ?? ideias;
  if (!pontos.length) return r;
  const titulo = typeof args?.titulo_analise === "string" && args.titulo_analise.trim() ? args.titulo_analise.trim().slice(0, 80) : undefined;
  return { ...r, link: `${r.link}&notas=${codificarNotas({ ...(titulo ? { titulo } : {}), pontos })}`,
    analise_no_relatorio: pontos,
    nota_analise: "Estes são os pontos que ficaram DENTRO do relatório (PDF/Excel). Mostra-os ao utilizador tal como estão; não escrevas outros. A ligação aparece num botão: basta escrever [rótulo](/relatorios/olyvia)." };
};

export const handlers: Record<string, Handler> = { consultar_base_conhecimento, relatorio_olyvia };
