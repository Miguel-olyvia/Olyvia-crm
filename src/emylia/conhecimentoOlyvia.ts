// 26/11 (Rúben: «temos de criar uma base de conhecimento para que o chat com a AI consiga servir informação a partir de qualquer página»).
// A base de conhecimento da Olyvia (tabela olyvia_conhecimento, migração 20270128000000): o guia de como a plataforma funciona, o resumo do
// dia das obras, cada negócio e cada obra. Monta-se aqui a partir dos negócios carregados (no servidor, pelos agentes de 15 em 15 minutos;
// no browser, pela página dos Negócios de 10 em 10) e grava-se de uma vez. O chat (ai-assistant) e a voz (olyvia-comando) leem-na de
// qualquer página; a RLS só deixa ver os negócios que a pessoa já vê.
import type { SupabaseClient } from "@supabase/supabase-js";
import { FASES, TECS, totaisIva, type Estado, type Negocio } from "./motor";
import { rotuloDia } from "./preparacaoObra";
import { estadoVivo, nomeNoPlano } from "./estudioObra/planoVivo";
import { obrasParaVoz, type ObraVoz } from "./estudioObra/agentesPorVoz";

export type TipoConhecimento = "guia" | "resumo" | "negocio" | "obra";
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

const eur = (n: number) => `${n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const tecNome = (id: string | null | undefined) => TECS.find((x) => x.id === id)?.n ?? "por atribuir";

function itemObra(d: Negocio, o: ObraVoz): ItemConhecimento {
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
    dados: { estado: p.estado, fim: o.fim, decisoes: o.propostas.filter((x) => x.modo === "pede").length, propostas: o.propostas.map((x) => ({ ref: x.ref, agente: x.agente, modo: x.modo, titulo: x.titulo })) } };
}

function itemNegocio(d: Negocio, S: Estado): ItemConhecimento {
  let valor: number | null = null;
  try { valor = d.orc ? totaisIva(d, S).total : null; } catch { valor = null; }
  const fase = FASES[d.fase] ?? `fase ${d.fase}`;
  const texto = `Negócio ${d.id} de ${d.nome}: fase ${fase}${d.perdido ? " (perdido)" : ""}${valor ? `, proposta de ${eur(valor)} com IVA` : ""}${d.obra?.plano ? `, obra ${d.obra.plano.estado}` : ""}.`;
  return { chave: `negocio:${d.id}`, tipo: "negocio", numero: d.id, titulo: `Negócio ${d.id} · ${d.nome}`, texto,
    dados: { fase, perdido: !!d.perdido, valor, obra: d.obra?.plano?.estado ?? null } };
}

/** Tudo o que a base de conhecimento tem para esta organização, a partir dos negócios carregados. */
export function itensDoConhecimento(S: Estado, agora = new Date()): ItemConhecimento[] {
  const obras = obrasParaVoz(agora, { S, A: null as never, run: (fn: () => void) => fn() });
  const porId = new Map(obras.map((o) => [o.id, o]));
  const out: ItemConhecimento[] = [...GUIA];
  for (const d of S.deals ?? []) {
    try {
      out.push(itemNegocio(d, S));
      const o = porId.get(d.id);
      if (o && d.obra?.plano) out.push(itemObra(d, o));
    } catch { /* um negócio estragado não para a base */ }
  }
  const decisoes = obras.reduce((a, o) => a + o.propostas.filter((x) => x.modo === "pede").length, 0);
  const feitos = obras.reduce((a, o) => a + o.feitos.length, 0);
  const hora = agora.toTimeString().slice(0, 5);
  out.push({ chave: "resumo:dia", tipo: "resumo", titulo: "O dia das obras",
    texto: `Às ${hora}: ${obras.length} ${obras.length === 1 ? "obra em curso ou aprovada" : "obras em curso ou aprovadas"}, ${decisoes} ${decisoes === 1 ? "decisão" : "decisões"} à espera do gestor. ${obras.map((o) => `${o.nome} (${o.id}): ${o.propostas.filter((x) => x.modo === "pede").length} a decidir${o.feitos.length ? `, ${o.feitos.length} feitas hoje pelos agentes` : ""}`).join("; ")}. ${feitos ? `Hoje os agentes fizeram ${feitos} ${feitos === 1 ? "mudança" : "mudanças"}.` : "Hoje os agentes ainda não fizeram nada sozinhos."}`,
    dados: { obras: obras.length, decisoes, feitos } });
  return out;
}

/** Grava a base desta organização (o que já não existe sai). Devolve quantos itens ficaram. */
export async function gravarConhecimento(sb: SupabaseClient, org: string, itens: ItemConhecimento[]): Promise<number> {
  const { data, error } = await sb.rpc("olyvia_conhecimento_gravar" as never, { p_org: org, p_itens: itens, p_completo: true } as never);
  if (error) throw new Error(error.message || "A base de conhecimento não foi gravada.");
  return Number(data ?? 0);
}
