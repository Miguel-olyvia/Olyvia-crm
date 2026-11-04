// Os problemas que o cliente reporta na conversa (3/11/2026, Rúben): «se ele demonstrar um problema e submeter fotos com o problema, o gestor
// de obra cria novas tasks, mete técnicos associados e gera ou não orçamento para ela».
// · O cliente escreve na conversa do portal com fotografias (20270105400000). Uma mensagem do cliente com fotografias é um problema por
//   tratar na página da obra; o gestor também pode tratar como problema uma mensagem só com texto, ou dizer que não é um problema.
// · O gestor (o papel operacoes) cria uma ou mais tarefas (o trabalho, as horas e o técnico) e escolhe:
//   - sem orçamento (garantia, erro nosso, oferta): as tarefas entram já no plano e os técnicos são avisados; o cliente não paga nada;
//   - com orçamento: uma ADENDA ao contrato (adendas.ts) com uma linha livre por tarefa (o preço sem IVA), com o percurso de sempre
//     (margens, proposta, contrato da adenda, assinatura no portal). Assinada, as tarefas entram no plano com os técnicos que o gestor
//     escolheu. Recusada, o gestor volta a decidir: fazer sem custo, outra proposta, ou não fazer.
// · O cliente vê a decisão na conversa (a resposta da equipa, textoResposta*) e, com orçamento, a adenda no portal. Tudo fica no histórico.
// A adenda liga-se ao problema pela origem (origem.imprevisto = «PC-…»: a coluna imprevisto_ref da base já existe). Sem React; o motor
// chama estas funções (A.tratarProblema, A.descartarProblema, A.decidirProblema, A.problemaRespondido).
import { HORAS_DIA } from "./ganttOrcamento";
import { fimDe } from "./ajustesPlano";
import { deIso, diasDaObra } from "./planoObra";
import { perfilDoTecnico, type FichaTecnico } from "./equipa/tecnicos";

/** O que se usa de cada técnico (o registo vivo, TECS). */
type Tec = Pick<FichaTecnico, "id" | "n" | "sk"> & { perfilId?: string };
import type { Adenda } from "./adendas";
import type { LinhaLivre } from "./imprevistos";
import type { MensagemObra, Negocio, Plano, Tarefa } from "./motor";

const r2 = (x: number) => Math.round(x * 100) / 100;

/** aberto: à espera de (outra) proposta · proposta: a adenda está com o cliente · aprovado: assinada, as tarefas no plano · recusado: o
 *  cliente não aceitou (o gestor decide) · resolvido: sem custo, as tarefas no plano · fechado: não se faz · descartado: não era um problema. */
export type EstadoProblema = "aberto" | "proposta" | "aprovado" | "recusado" | "resolvido" | "fechado" | "descartado";
/** Uma tarefa que resolve o problema: o trabalho, as horas, o técnico (o id do RH) e, com orçamento, o preço sem IVA. */
export interface TarefaProblema { n: string; h: number; tec: string | null; preco?: number }
export interface ProblemaCliente {
  /** PC-<negócio>-<n> */
  id: string;
  /** A mensagem do cliente: o id na base; no protótipo, «local-<índice>». */
  msg: string;
  /** O que o cliente escreveu e as fotografias (os ids na base; no protótipo, a imagem). */
  texto: string; fotos: string[];
  /** Quando o gestor o tratou. */
  q: string;
  estado: EstadoProblema;
  /** Gera orçamento (adenda) ou não. */
  cobrar: boolean;
  /** Sem orçamento: porquê (MOTIVOS_SEM_CUSTO). */
  motivo?: string;
  tarefas: TarefaProblema[];
  /** A adenda que o orçamenta. */
  adenda?: string;
  /** O que o gestor decidiu (ao descartar, ou com a proposta recusada). */
  decisao?: string;
  /** A resposta ao cliente na conversa e quando seguiu (sem `respondida`, o gestor volta a enviá-la). */
  resposta?: string; respondida?: string;
}

/** O motivo das adendas que nascem de um problema reportado pelo cliente. */
export const MOTIVO_PROBLEMA = "Problema reportado pelo cliente";
/** Porque não se cobra. */
export const MOTIVOS_SEM_CUSTO = ["Garantia", "Erro nosso", "Oferta ao cliente"] as const;
/** Com a proposta recusada: o que o gestor pode fazer. */
export const DECISOES_PROBLEMA = [
  { k: "sem_custo", t: "Fazer sem custo", sub: "As tarefas entram já no plano; o cliente não paga" },
  { k: "refazer", t: "Fazer outra proposta", sub: "Volta a abrir, para propor outra coisa" },
  { k: "nao_fazer", t: "Não fazer", sub: "Fica fechado; o cliente é avisado" },
] as const;
export type DecisaoProblema = (typeof DECISOES_PROBLEMA)[number]["k"];

export const problemasDe = (d: Negocio): ProblemaCliente[] => d.obra.problemas ?? [];
export const novoIdProblema = (d: Negocio) => `PC-${d.id}-${problemasDe(d).length + 1}`;
/** A referência da origem de uma adenda é de um problema do cliente (e não de um imprevisto). */
export const ehRefProblema = (ref?: string | null): boolean => !!ref && ref.startsWith("PC-");
/** O problema que uma adenda orçamenta (ou nenhum). */
export const problemaDaAdenda = (d: Negocio, a: Pick<Adenda, "origem">): ProblemaCliente | undefined =>
  a.origem && ehRefProblema(a.origem.imprevisto) ? problemasDe(d).find((p) => p.id === a.origem!.imprevisto) : undefined;
/** O problema de uma mensagem (a chave: o id da base, ou «local-<índice>» no protótipo). */
export const problemaDaMensagem = (d: Negocio, chave: string): ProblemaCliente | undefined => problemasDe(d).find((p) => p.msg === chave);

export const chaveMensagem = (m: MensagemObra, i: number): string => m.id ?? `local-${i}`;
/** As fotografias de uma mensagem: os ids da base, ou a imagem do protótipo. */
export const fotosDe = (m: MensagemObra): string[] => m.fotos?.length ? m.fotos : m.foto ? [m.foto] : [];

/** As mensagens do cliente com fotografias que ninguém tratou ainda: o gestor vê-as como problemas por tratar (a mais recente primeiro). */
export function mensagensPorTratar(d: Negocio, msgs: readonly MensagemObra[]): { m: MensagemObra; chave: string }[] {
  return msgs.map((m, i) => ({ m, chave: chaveMensagem(m, i) }))
    .filter(({ m, chave }) => m.de === "cliente" && fotosDe(m).length > 0 && !problemaDaMensagem(d, chave))
    .reverse();
}
/** Os problemas que esperam pelo gestor: à espera de proposta, recusados, ou com a resposta ao cliente por enviar. */
export const problemasPorTratar = (d: Negocio): ProblemaCliente[] =>
  problemasDe(d).filter((p) => p.estado === "aberto" || p.estado === "recusado" || respostaPorEnviar(p));
/** Os que ainda se mostram na obra (os fechados e os descartados saem; ficam no histórico). */
export const problemasAbertos = (d: Negocio): ProblemaCliente[] =>
  problemasDe(d).filter((p) => (p.estado !== "fechado" && p.estado !== "descartado" && p.estado !== "resolvido" && p.estado !== "aprovado") || respostaPorEnviar(p));
export const respostaPorEnviar = (p: ProblemaCliente): boolean => !!p.resposta && !p.respondida;

/** O que falta nas tarefas antes de decidir (null: pode seguir). */
export function erroTarefas(T: readonly TarefaProblema[], cobrar: boolean): string | null {
  if (!T.length) return "Junte pelo menos uma tarefa.";
  if (T.some((x) => !x.n.trim())) return "Falta o trabalho de uma tarefa.";
  if (T.some((x) => !(x.h > 0))) return "Falta as horas de uma tarefa.";
  if (T.some((x) => !x.tec)) return "Falta o técnico de uma tarefa.";
  if (cobrar && T.some((x) => !((x.preco ?? 0) > 0))) return "Falta o preço de uma tarefa.";
  return null;
}

/** O índice do dia de hoje no plano (os dias úteis desde o início; pode passar do fim da obra). Sem datas reais (o protótipo), o dia
 *  a seguir ao fim. Serve para reabrir uma obra concluída: as tarefas da assistência começam hoje. */
export function diaDeHoje(p: Plano, hoje = new Date()): number {
  const fim = fimDe(p.tasks);
  if (p.origem !== "orcamento" || !p.inicio) return fim;
  const hj = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()), dias = diasDaObra(deIso(p.inicio), fim + 400);
  let k = -1;
  for (let i = 0; i < dias.length && dias[i] <= hj; i++) k = i;
  return Math.max(fim, k);
}

/** O primeiro dia das tarefas de um problema: hoje, com a obra em curso; antes de arrancar, no fim do plano. */
export const inicioProblema = (p: Plano): number => (p.estado === "em curso" ? p.dia : fimDe(p.tasks));

/** Uma tarefa do problema, pronta a juntar ao plano (sem custo): o ofício é o do técnico escolhido. */
export function tarefaDoProblema(p: Plano, pr: Pick<ProblemaCliente, "id">, x: TarefaProblema, tecs: readonly Tec[]): Tarefa {
  const tec = tecs.find((t) => t.id === x.tec), perfilId = tec ? perfilDoTecnico(tec) : "";
  const dur = Math.max(1, Math.ceil(x.h / HORAS_DIA - 1e-9));
  return { nome: `${x.n.trim()} (${pr.id})`, svcs: [], dia: inicioProblema(p), dur, sk: tec?.sk ?? "", ...(perfilId ? { perfilId } : {}),
    h: r2(x.h), tec: x.tec, nova: true, mats: [], problema: pr.id };
}

/** As linhas livres da adenda (com orçamento): uma por tarefa, com o ofício do técnico escolhido e o preço sem IVA. */
export function livresDoProblema(T: readonly TarefaProblema[], tecs: readonly Tec[]): LinhaLivre[] {
  return T.map((x) => ({ n: x.n.trim(), h: r2(x.h), preco: r2(x.preco ?? 0), perfil: tecs.find((t) => t.id === x.tec)?.sk || "Canalização", mats: [] }));
}

/* ------------------------------------------------------------------ o que o cliente lê na conversa */
const curto = (t: string) => { const x = t.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, ""); return x.length > 80 ? x.slice(0, 79).trimEnd() + "…" : x; };
const sobre = (pr: Pick<ProblemaCliente, "texto">) => `Sobre o problema que nos mostrou («${curto(pr.texto)}»)`;
const lista = (T: readonly { n: string }[]) => T.map((x) => x.n.trim().replace(/^./, (c) => c.toLowerCase())).join(", ");
const primeiro = (n?: string) => (n ?? "").replace(/\s*\([^)]*\)/g, "").trim().split(" ")[0];

/** Sem orçamento: o que se faz, sem custo, a partir de quando e com quem. */
export function textoRespostaSemCusto(pr: Pick<ProblemaCliente, "texto" | "motivo" | "tarefas">, quando: string, tecs: readonly Pick<Tec, "id" | "n">[]): string {
  const nomes = [...new Set(pr.tarefas.map((x) => primeiro(tecs.find((t) => t.id === x.tec)?.n)).filter(Boolean))];
  const porque = pr.motivo ? ` (${pr.motivo.toLowerCase()})` : "";
  return `${sobre(pr)}: vamos resolvê-lo sem custo para si${porque}. Fica marcado: ${lista(pr.tarefas)}, a partir de ${quando}${nomes.length ? `, com ${nomes.join(" e ")}` : ""}.`;
}
/** Com orçamento: a proposta (adenda) no portal, ou que vai seguir (à espera da Direção). */
export function textoRespostaComOrcamento(pr: Pick<ProblemaCliente, "texto" | "tarefas">, adenda: string, enviada: boolean, totalIva: string): string {
  return enviada
    ? `${sobre(pr)}: para o resolver é preciso ${lista(pr.tarefas)}. Preparámos uma proposta, a adenda ${adenda} (${totalIva} € com IVA). Pode vê-la e aceitá-la aqui no portal; depois de assinada, marcamos o trabalho.`
    : `${sobre(pr)}: para o resolver é preciso ${lista(pr.tarefas)}. Vamos enviar-lhe uma proposta aqui no portal; depois de a aceitar e assinar, marcamos o trabalho.`;
}
/** A proposta recusada e o gestor decidiu não fazer. */
export const textoRespostaNaoFazer = (pr: Pick<ProblemaCliente, "texto">): string =>
  `${sobre(pr)}: como não aceitou a proposta, não vamos fazer esse trabalho. Se mudar de ideias, diga-nos aqui.`;
