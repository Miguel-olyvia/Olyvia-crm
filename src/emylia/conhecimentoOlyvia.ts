// 26/11 (Rúben: «temos de criar uma base de conhecimento para que o chat com a AI consiga servir informação a partir de qualquer página»).
// A base de conhecimento da Olyvia (tabela olyvia_conhecimento, migração 20270128000000): o guia de como a plataforma funciona, o resumo do
// dia das obras, cada negócio e cada obra. Monta-se aqui a partir dos negócios carregados (no servidor, pelos agentes de 15 em 15 minutos;
// no browser, pela página dos Negócios de 10 em 10) e grava-se de uma vez. O chat (ai-assistant) e a voz (olyvia-comando) leem-na de
// qualquer página; a RLS só deixa ver os negócios que a pessoa já vê.
import type { SupabaseClient } from "@supabase/supabase-js";
import { FASES, TECS, linhaCalc, tot, totaisIva, type Estado, type Negocio } from "./motor";
import { totaisAdenda, valorContrato } from "./adendas";
import { nomeDaParcela, parcelasDoContrato } from "./parcelas";
import { planoObra, realPorFase } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { rotuloDia } from "./preparacaoObra";
import { estadoVivo, nomeNoPlano } from "./estudioObra/planoVivo";
import { obrasParaVoz, type ObraVoz } from "./estudioObra/agentesPorVoz";
import { AGENTES, degrauDe } from "./estudioObra/agentes";

// 26/11 (Rúben: «faz isso ao máximo detalhe, super bonito e detalhado»): mais dois tipos. «orcamento» é o orçamento ao detalhe (as linhas,
// os totais por fase e por taxa de IVA, as adendas e as prestações), com a mesma visibilidade do negócio; «custos» é o custo e a margem
// (previstos e reais, por fase), só para quem vê custos (quotes.view_costs). Migração 20270128200000.
export type TipoConhecimento = "guia" | "resumo" | "negocio" | "obra" | "orcamento" | "custos";
export interface ItemConhecimento { chave: string; tipo: TipoConhecimento; numero?: number; titulo: string; texto: string; dados?: Record<string, unknown> }

/** O guia: como a Olyvia funciona. Muda com a app (vai com cada publicação). */
export const GUIA: ItemConhecimento[] = [
  { chave: "guia:fases", tipo: "guia", titulo: "As fases de um negócio",
    texto: "Um negócio passa por Por contactar, Contacto, Visita, Negócio, Financeiro e Obra. Na Visita faz-se o levantamento no Estúdio do projeto (planta, peças, estilo, por voz ou à mão). No Negócio faz-se o orçamento e a proposta, que vai ao portal do cliente. Com a proposta aceite, o Financeiro emite a fatura e valida o pagamento; depois vêm as medidas e o plano da obra, o contrato, a encomenda dos materiais e a obra. Mudar o valor depois de aceite é uma adenda, que o cliente aceita no portal." },
  { chave: "guia:agentes", tipo: "guia", titulo: "Os agentes da Olyvia (Obra Viva)",
    texto: "Seis agentes vigiam cada obra: Plano (atrasos, dias sem ninguém, folga, fim da obra), Equipa (agendas, férias, técnicos livres, avisos aos técnicos), Materiais (entregas contra o início das fases), Cliente (rascunhos de avisos para o portal, mensagens por ler), Margem (horas a mais e quem paga) e Aprendizagem (o que se corrige sempre). As propostas aparecem na fita dos agentes, no Estúdio da obra, e nas Operações («os agentes pedem N decisões»)." },
  { chave: "guia:degraus", tipo: "guia", titulo: "A autonomia dos agentes (degraus)",
    texto: "Cada agente tem um degrau por obra: 0 observa, 1 sugere (só aplica se o gestor aceitar), 2 aplica sozinho ao fim do dia útil (18h) se ninguém recusar, 3 aplica logo. Por omissão, Plano e Equipa no degrau 2, Materiais, Cliente e Margem no 1, Aprendizagem no 0. Sozinho, um agente só mexe até 2 dias úteis e nunca empurra o fim da obra: o que empurra o fim pede sempre. Desfazer uma mudança conta como recusar e põe esse agente em pausa nessa obra até às 18h. Muda-se o degrau no botão Autonomia da fita." },
  { chave: "guia:ajuste", tipo: "guia", titulo: "O ajuste contínuo do plano",
    texto: "Um atraso pequeno põe-se em dia sozinho quando não mexe no fim da obra. A folga aproveita-se sozinha quando cada tarefa só anda até 2 dias úteis. Os dias sem ninguém na obra fecham-se antecipando o que vem a seguir, sem pôr um técnico em duas obras nem nas férias. Tudo fica no histórico de alterações e pode desfazer-se." },
  { chave: "guia:servidor", tipo: "guia", titulo: "Os agentes no servidor",
    texto: "Os agentes também correm no servidor, de 15 em 15 minutos, com a Olyvia fechada: marcam as propostas novas como vistas, aplicam as que chegaram ao prazo e gravam só as obras que mudaram. É também aí que esta base de conhecimento se atualiza." },
  { chave: "guia:estudio-obra", tipo: "guia", titulo: "O Estúdio da obra",
    texto: "Abre-se nas Operações. Tem o plano (Gantt e Por técnico, com dependências, microtarefas, antecipar e exportar para PDF ou Excel), a execução das tarefas, o diário, os materiais, a equipa, a conversa com o cliente, o contrato, os documentos, o 3D e o fecho. Registar um imprevisto pede quem paga: o cliente (adenda), um imprevisto ou a empresa. Replanear mostra o impacto antes de aplicar." },
  { chave: "guia:estudio-plano", tipo: "guia", titulo: "O Estúdio do plano e a validação",
    texto: "O plano da obra nasce do orçamento, já com técnicos livres e sem conflitos de agenda. O gestor de obra valida-o no Estúdio do plano. O plano gerado e o validado ficam guardados, com todas as diferenças, para a Olyvia aprender." },
  { chave: "guia:aprendizagem", tipo: "guia", titulo: "A aprendizagem do motor",
    texto: "A Olyvia aprende com as obras da empresa: os dias que cada tarefa levou mesmo e as correções do gestor ao validar. Com 3 obras a dizer o mesmo e um desvio de 15% ou mais, o plano de uma obra nova já nasce com a duração corrigida (só os dias do calendário; as horas e o preço ficam os do orçamento). As horas a mais viram propostas para o Catálogo. O painel «O que a Olyvia aprendeu» mostra as lições e o erro do motor obra a obra." },
  { chave: "guia:voz", tipo: "guia", titulo: "Falar com a Olyvia",
    texto: "O botão da ovelha, em baixo à direita, ouve ou recebe texto em linguagem natural: abrir negócios e passos, preencher formulários, carregar em botões, perguntar o que está no ecrã. Nas Operações também: «o que se passa na obra do Tiago?», «resumo do dia», «aceita a do Luís», «recusa essa», «desfaz o que o agente fez». O que não se desfaz (enviar, apagar, assinar, arrancar a obra) pede confirmação." },
  { chave: "guia:portal", tipo: "guia", titulo: "O portal do cliente",
    texto: "O cliente vê no portal a proposta, as faturas, o contrato, as adendas, o andamento da obra e os avisos, sem custos internos. Os avisos ao cliente saem quando alguém carrega em enviar; com o agente do Cliente no degrau 2 ou 3, «a equipa chega no próximo dia útil» e «a obra adiantou» podem sair sozinhos." },
];

// sempre com o separador dos milhares (o pt-PT só agrupa a partir de 5 algarismos)
const FMT_EUR = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
const eur = (n: number) => `${FMT_EUR.format(n)} €`;
const tecNome = (id: string | null | undefined) => TECS.find((x) => x.id === id)?.n ?? "por atribuir";

function itemObra(d: Negocio, o: ObraVoz, agora: Date, S?: Estado): ItemConhecimento {
  const p = d.obra.plano!;
  const feitas = p.tasks.filter((t) => { const v = estadoVivo(t, p); return v === "feita" || v === "validada"; }).length;
  const proximas = p.tasks.map((t, i) => ({ t, i, v: estadoVivo(t, p) })).filter((x) => x.v !== "feita" && x.v !== "validada")
    .sort((a, b) => a.t.dia - b.t.dia).slice(0, 4);
  const linhas = [
    `Obra ${d.id} de ${d.nome}: ${p.estado}${p.estado === "em curso" ? `, dia ${p.dia + 1}` : ""}, ${feitas} de ${p.tasks.length} tarefas feitas${o.fim ? `, acaba a ${o.fim}` : ""}.`,
    proximas.length ? `A seguir: ${proximas.map((x) => { let q = ""; try { q = rotuloDia(p, x.t.dia); } catch { q = `dia ${x.t.dia + 1}`; } return `${nomeNoPlano(p, x.t)} (${x.v}, ${q}, ${tecNome(x.t.tec)})`; }).join("; ")}.` : "",
    o.propostas.length ? `Os agentes propõem: ${o.propostas.map((x) => `${x.agente} (${x.modo === "pede" ? "pede decisão" : x.modo === "prazo" ? "aplica-se sozinha ao fim do dia" : x.modo === "ja" ? "a aplicar" : "a observar"}): ${x.titulo}`).join("; ")}.` : "Os agentes não têm nada a propor.",
    o.feitos.length ? `Hoje os agentes fizeram: ${o.feitos.map((f) => `${f.quando} ${f.texto} (${f.quem})`).join("; ")}.` : "",
  ].filter(Boolean);
  return { chave: `obra:${d.id}`, tipo: "obra", numero: d.id, titulo: `Obra ${d.id} · ${d.nome}`, texto: linhas.join(" "),
    // 27/11 (Rúben: «os relatórios gerados têm de estar muito melhor estruturados»): os dados à parte, para tabelas (não só o texto)
    dados: { estado: p.estado, fim: o.fim, dia: p.estado === "em curso" ? p.dia + 1 : null, feitas, total: p.tasks.length,
      decisoes: o.propostas.filter((x) => x.modo === "pede").length, propostas: o.propostas.map((x) => ({ ref: x.ref, agente: x.agente, modo: x.modo, titulo: x.titulo })),
      proximas: proximas.map((x) => { let q = ""; try { q = rotuloDia(p, x.t.dia); } catch { q = `dia ${x.t.dia + 1}`; } return { nome: nomeNoPlano(p, x.t), estado: x.v, quando: q, tec: tecNome(x.t.tec) }; }),
      // 27/11 (Rúben: «uma nova área no menu para o cérebro, mostrar os agentes a trabalhar»): o Cérebro lê daqui a autonomia de cada agente
      // nesta obra e o que fizeram hoje (com o agente), sem ter de carregar os Negócios
      degraus: Object.fromEntries(AGENTES.map((a) => [a.id, degrauDe(d.obra.agentes, a.id)])),
      // 27/11 (Rúben: «pedi relatórios e ele só faz orçamentos»; «exporta este plano para excel»): o plano inteiro, para o relatório da obra
      tarefas: tarefasDoPlano(d, S),
      feitos: (d.obra.agentes?.feitos ?? []).filter((f) => !f.desfeito && mesmoDia(f.q, agora)).slice(-8)
        .map((f) => ({ agente: f.agente, texto: f.texto.slice(0, 160), quando: f.q, auto: f.auto, quem: f.quem })) } };
}
const mesmoDia = (iso: string, agora: Date) => { try { return new Date(iso).toDateString() === agora.toDateString(); } catch { return false; } };

/** As tarefas do plano pela ordem dos dias: a fase, o nome, as datas, os dias, quem e o estado. */
function tarefasDoPlano(d: Negocio, S?: Estado): { fase: string; nome: string; ini: string; fim: string; dias: number; tec: string; estado: string }[] {
  const p = d.obra.plano!;
  void S;
  const nomesFase = new Map<number, string>(FASES_OBRA.map((f) => [f.n as number, f.curto || f.nome]));
  const quando = (k: number) => { try { return rotuloDia(p, k); } catch { return `dia ${k + 1}`; } };
  return p.tasks.map((t) => ({ t, v: estadoVivo(t, p) })).sort((a, b) => a.t.dia - b.t.dia)
    .map(({ t, v }) => ({ fase: t.fase ? nomesFase.get(t.fase) ?? `Fase ${t.fase}` : "—", nome: nomeNoPlano(p, t), ini: quando(t.dia), fim: quando(t.dia + t.dur - 1), dias: t.dur, tec: t.tec ? tecNome(t.tec) : "—", estado: v }));
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${(Math.round(n * 1000) / 10).toLocaleString("pt-PT")}%`;
type LinhaDoOrc = NonNullable<Negocio["orc"]>["linhas"][number];
const nomeLinha = (S: Estado, l: LinhaDoOrc): { nome: string; q: number; un: string; tipo: "servico" | "produto" } =>
  l.t === "svc" ? { nome: S.svc[l.sid]?.n ?? String(l.sid), q: l.q, un: S.svc[l.sid]?.un ?? "un", tipo: "servico" }
    : { nome: l.d.replace(/^(Produto|Cliente)\s*·\s*/, ""), q: l.prod?.q ?? 1, un: "un", tipo: "produto" };

/** O orçamento ao detalhe (o que o cliente vê: sem custos). Null sem orçamento. */
export function itemOrcamento(d: Negocio, S: Estado): ItemConhecimento | null {
  const o = d.orc;
  if (!o?.linhas?.length) return null;
  const k = 1 - (o.desconto || 0) / 100;
  const linhas = o.linhas.map((l) => {
    const x = linhaCalc(l, S), n = nomeLinha(S, l);
    return { ...n, pu: n.q > 0 ? r2((x.preco * k) / n.q) : r2(x.preco * k), total: r2(x.preco * k), iva: l.iva ?? (l.t === "svc" ? 6 : 23) };
  }).filter((l) => l.total !== 0 || l.q > 0).sort((a, b) => b.total - a.total);
  const T = totaisIva(d, S);
  let porFase: { nome: string; valor: number }[] = [];
  try { porFase = planoObra(d, S).fases.map((f) => ({ nome: f.curto ?? f.nome, valor: r2(f.preco) })).filter((f) => f.valor > 0); } catch { porFase = []; }
  const adendas = (d.adendas ?? []).map((a) => ({ n: a.n, estado: a.estado, motivo: a.motivo, total: r2(totaisAdenda(a).total), linhas: a.linhas.length }));
  let contrato: { contrato: number; adendas: number; total: number } | null = null;
  try { contrato = valorContrato(d, S); } catch { contrato = null; }
  let parcelas: { nome: string; valor: number; paga: boolean; devida: boolean }[] = [];
  try { parcelas = parcelasDoContrato(S, d).map((x) => ({ nome: nomeDaParcela(x), valor: r2(x.v), paga: x.paga, devida: x.devida })); } catch { parcelas = []; }
  const sv = linhas.filter((l) => l.tipo === "servico"), pr = linhas.filter((l) => l.tipo === "produto");
  const lista = (L: typeof linhas, n: number) => L.slice(0, n).map((l) => `${l.nome} (${l.q.toLocaleString("pt-PT")} ${l.un}): ${eur(l.total)}`).join("; ");
  const texto = [
    `Orçamento do negócio ${d.id} de ${d.nome}${o.aceite ? `, aceite a ${o.aceite.slice(0, 10)}` : o.enviada ? `, enviado a ${o.enviada.slice(0, 10)}` : ", por enviar"}: ${linhas.length} linhas (${sv.length} serviços, ${pr.length} produtos e materiais)${o.desconto ? `, desconto de ${o.desconto}%` : ""}.`,
    `Total: ${eur(r2(T.base))} sem IVA, ${eur(r2(T.iva))} de IVA, ${eur(r2(T.total))} com IVA.`,
    porFase.length ? `Por fase da obra (sem IVA): ${porFase.map((f) => `${f.nome} ${eur(f.valor)}`).join("; ")}.` : "",
    sv.length ? `Serviços principais: ${lista(sv, 10)}.` : "",
    pr.length ? `Produtos e materiais principais: ${lista(pr, 10)}.` : "",
    adendas.length ? `Adendas: ${adendas.map((a) => `${a.n} (${a.estado}, ${a.motivo}): ${eur(a.total)} com IVA`).join("; ")}.` : "Sem adendas.",
    contrato ? `Valor do contrato com as adendas assinadas: ${eur(contrato.total)} com IVA.` : "",
    parcelas.length ? `Prestações: ${parcelas.map((x) => `${x.nome} ${eur(x.valor)} (${x.paga ? "paga" : x.devida ? "por pagar, já devida" : "por pagar"})`).join("; ")}.` : "",
  ].filter(Boolean).join(" ");
  return { chave: `orcamento:${d.id}`, tipo: "orcamento", numero: d.id, titulo: `Orçamento ${d.id} · ${d.nome}`, texto,
    dados: { cliente: d.nome, fase: FASES[d.fase] ?? "", enviada: o.enviada ?? null, aceite: o.aceite ?? null, desconto: o.desconto || 0, linhas,
      totais: { base: r2(T.base), iva: r2(T.iva), total: r2(T.total), a6: r2(T.mo), a23: r2(T.mat), isento: r2(T.isento) }, porFase, adendas, contrato, parcelas } };
}

/** O custo e a margem (previstos e, com a obra a andar, reais por fase). Só para quem vê custos. Null sem orçamento. */
export function itemCustos(d: Negocio, S: Estado): ItemConhecimento | null {
  if (!d.orc?.linhas?.length) return null;
  let t: ReturnType<typeof tot>;
  try { t = tot(d, S); } catch { return null; }
  // 26/11: quem não vê custos (o robô do servidor, sem quotes.view_costs) lê as linhas com o custo a 0: não se escreve uma margem de 100%.
  // A gravação (20270128300000) guarda os custos que já lá estão quando a lista não traz nenhum.
  if (!(t.custo > 0)) return null;
  let real: ReturnType<typeof realPorFase> = null;
  try { real = d.obra?.plano ? realPorFase(d, S) : null; } catch { real = null; }
  const fases = (real?.fases ?? []).map((f) => ({ nome: f.curto ?? f.nome, prev: r2(f.prev.custo), real: r2(f.real.custo), preco: r2(f.preco), margemPrev: r2(f.margemPrev), margemReal: r2(f.margemReal) }));
  const horasReg = (d.obra?.plano?.tasks ?? []).reduce((a, x) => a + (x.exec?.horas ?? 0), 0);
  const texto = [
    `Custos do negócio ${d.id} de ${d.nome}: custo previsto ${eur(r2(t.custo))}, venda ${eur(r2(t.pf))} sem IVA, margem prevista ${pct(t.m)} (${eur(r2(t.pf - t.custo))}). Horas previstas: ${r2(t.h)} h.`,
    real ? `Com a obra: custo real até agora ${eur(r2(real.custoReal))} para ${eur(r2(real.custoPrev))} previstos; ${r2(horasReg)} h registadas.` : "",
    fases.length ? `Por fase: ${fases.map((f) => `${f.nome} previsto ${eur(f.prev)}, real ${eur(f.real)}, margem ${pct(f.margemPrev)} para ${pct(f.margemReal)}`).join("; ")}.` : "",
  ].filter(Boolean).join(" ");
  return { chave: `custos:${d.id}`, tipo: "custos", numero: d.id, titulo: `Custos e margem ${d.id} · ${d.nome}`, texto,
    dados: { custo: r2(t.custo), venda: r2(t.pf), margem: r2(t.m), lucro: r2(t.pf - t.custo), horas: r2(t.h), horasRegistadas: r2(horasReg),
      custoReal: real ? r2(real.custoReal) : null, custoPrevObra: real ? r2(real.custoPrev) : null, fases } };
}

function itemNegocio(d: Negocio, S: Estado): ItemConhecimento {
  let valor: number | null = null;
  try { valor = d.orc ? totaisIva(d, S).total : null; } catch { valor = null; }
  const fase = FASES[d.fase] ?? `fase ${d.fase}`;
  const texto = `Negócio ${d.id} de ${d.nome}: fase ${fase}${d.perdido ? " (perdido)" : ""}${valor ? `, proposta de ${eur(valor)} com IVA` : ""}${d.obra?.plano ? `, obra ${d.obra.plano.estado}` : ""}.`;
  return { chave: `negocio:${d.id}`, tipo: "negocio", numero: d.id, titulo: `Negócio ${d.id} · ${d.nome}`, texto,
    dados: { fase, faseN: d.fase, perdido: !!d.perdido, valor, obra: d.obra?.plano?.estado ?? null, enviada: d.orc?.enviada ?? null, aceite: d.orc?.aceite ?? null } };
}

/** Tudo o que a base de conhecimento tem para esta organização, a partir dos negócios carregados.
 *  27/11: `origem` diz quem escreveu (o servidor de 15 em 15 min ou a página dos Negócios): o Cérebro mostra a última volta do servidor. */
/** `so` (27/11, o servidor às voltas): só estes negócios, sem o resumo do dia (é parcial; grava-se sem apagar os outros). */
export function itensDoConhecimento(S: Estado, agora = new Date(), origem?: "servidor" | "pagina", so?: Set<number>): ItemConhecimento[] {
  const obras = obrasParaVoz(agora, { S, A: null as never, run: (fn: () => void) => fn() }, so);
  const porId = new Map(obras.map((o) => [o.id, o]));
  const out: ItemConhecimento[] = [...GUIA];
  for (const d of S.deals ?? []) {
    if (so && !so.has(d.id)) continue;
    try {
      out.push(itemNegocio(d, S));
      const orc = itemOrcamento(d, S);
      if (orc) out.push(orc);
      const cus = itemCustos(d, S);
      if (cus) out.push(cus);
      const o = porId.get(d.id);
      if (o && d.obra?.plano) out.push(itemObra(d, o, agora, S));
    } catch { /* um negócio estragado não para a base */ }
  }
  if (so) return out;
  const decisoes = obras.reduce((a, o) => a + o.propostas.filter((x) => x.modo === "pede").length, 0);
  const feitos = obras.reduce((a, o) => a + o.feitos.length, 0);
  const hora = agora.toTimeString().slice(0, 5);
  out.push({ chave: "resumo:dia", tipo: "resumo", titulo: "O dia das obras",
    texto: `Às ${hora}: ${obras.length} ${obras.length === 1 ? "obra em curso ou aprovada" : "obras em curso ou aprovadas"}, ${decisoes} ${decisoes === 1 ? "decisão" : "decisões"} à espera do gestor. ${obras.map((o) => `${o.nome} (${o.id}): ${o.propostas.filter((x) => x.modo === "pede").length} a decidir${o.feitos.length ? `, ${o.feitos.length} feitas hoje pelos agentes` : ""}`).join("; ")}. ${feitos ? `Hoje os agentes fizeram ${feitos} ${feitos === 1 ? "mudança" : "mudanças"}.` : "Hoje os agentes ainda não fizeram nada sozinhos."}`,
    dados: { obras: obras.length, decisoes, feitos, volta: agora.toISOString(), ...(origem ? { origem } : {}) } });
  return out;
}

/** Grava a base desta organização (o que já não existe sai). Devolve quantos itens ficaram. */
export async function gravarConhecimento(sb: SupabaseClient, org: string, itens: ItemConhecimento[], completo = true): Promise<number> {
  const { data, error } = await sb.rpc("olyvia_conhecimento_gravar" as never, { p_org: org, p_itens: itens, p_completo: completo } as never);
  if (error) throw new Error(error.message || "A base de conhecimento não foi gravada.");
  return Number(data ?? 0);
}
