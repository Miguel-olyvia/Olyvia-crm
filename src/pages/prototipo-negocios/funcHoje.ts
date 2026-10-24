// A lista de trabalho "Hoje" da V2 funcional de Pessoas, e a camada dos registos do dia a dia por cima dos dados derivados.
// Funções puras: recebem o Estado (só para ler), as pessoas derivadas e os registos (diaADia.ts) e devolvem cópias ajustadas. Nada aqui
// escreve no Estado, no seed ou nos registos. Cada pessoa aparece numa só lista: a de maior prioridade (Contactar, Visitas, Espera, Contratos).
import type { Estado } from "./motor";
import { atrasada, idade, somarDias, tempoDesde } from "./leadsDocs";
import { todosApp, type PessoaApp } from "./pessoasDocs";
import { perfilDe, type ItemAtividade, type Interacao, type Nota, type Perfil } from "./perfilDocs";
import { resultadoContacto, voltouAContactar } from "./camposPessoa";
import { toquesDe } from "./toquesDocs";
import { docFase } from "./negociosApp";
import { PASSOS, type Registo } from "./diaADia";

/** "Hoje" do protótipo, fixo (o mesmo de leadsDocs e perfilDocs). */
export const HOJE_FUNC = "10/10";
/** Visitas nos próximos 7 dias; leads contactadas sem avanço há 7 ou mais dias; propostas enviadas há 5 ou mais dias. */
export const DIAS_VISITAS = 7;
export const DIAS_SEM_AVANCO = 7;
export const DIAS_PROPOSTA = 5;
const LIGAR_MAIS_TARDE = "Atendeu · ligar mais tarde";
/** O registo é o contacto mais recente de hoje: fica no fim do dia para nenhum toque de hoje parecer posterior a ele. */
const AGORA = "hoje 23:59";
export const REGISTADO_AGORA = "registado agora";

export type IdGrupo = "contactar" | "visitas" | "espera" | "contratos";
export const GRUPOS: readonly { id: IdGrupo; nome: string; vazio: string }[] = [
  { id: "contactar", nome: "Contactar hoje", vazio: "Nada por contactar hoje." },
  { id: "visitas", nome: "Visitas esta semana", vazio: "Sem visitas nos próximos 7 dias." },
  { id: "espera", nome: "À espera de resposta", vazio: "Ninguém à espera de resposta." },
  { id: "contratos", nome: "Contratos e faturação", vazio: "Nada por assinar nem por faturar." },
];

export interface ItemHoje { p: PessoaApp; f: Perfil; grupo: IdGrupo; razao: string }
export interface GrupoHoje { id: IdGrupo; nome: string; vazio: string; itens: ItemHoje[] }

/* ---------------------------------------------------------------- os registos de uma pessoa */

export const registosDe = (regs: readonly Registo[], nome: string): Registo[] => regs.filter((r) => r.nome === nome);

const chamadasDe = (regs: readonly Registo[], nome: string) =>
  registosDe(regs, nome).flatMap((r) => (r.tipo === "chamada" ? [r] : []));

/** Daqui a quantos dias é o próximo contacto marcado pelos registos (0: hoje); `null` quando nenhum registo o marcou. O registo mais recente manda. */
export function proximoContactoDias(regs: readonly Registo[], nome: string): number | null {
  let dias: number | null = null;
  for (const r of registosDe(regs, nome)) {
    if (r.tipo === "adiar") dias = r.dias;
    if (r.tipo === "chamada") dias = r.passo === "ligar_hoje" ? 0 : r.passo === "ligar_amanha" ? 1 : null;
  }
  return dias;
}

/** O perfil com os registos aplicados (uma cópia): a chamada passa a ser o último contacto e dá o resultado, as notas entram à frente e o adiamento muda o prazo. */
export function perfilFunc(f: Perfil, regs: readonly Registo[], nome: string): Perfil {
  const meus = registosDe(regs, nome);
  if (!meus.length) return f;
  const chamadas: Interacao[] = chamadasDe(regs, nome).reverse().map((r) => ({
    id: `reg-${r.id}`, tipo: "chamada", titulo: "Chamada registada", detalhe: r.resultado, q: AGORA, exemplo: true,
  }));
  const notas: Nota[] = meus.flatMap((r): Nota[] => {
    const texto = r.tipo === "nota" ? r.texto : r.tipo === "chamada" ? r.nota : "";
    return texto.trim() ? [{ id: `reg-${r.id}`, autor: f.comercial, q: REGISTADO_AGORA, texto: texto.trim(), exemplo: false }] : [];
  }).reverse();
  const dias = proximoContactoDias(regs, nome);
  return {
    ...f,
    interacoes: [...chamadas, ...f.interacoes],
    notas: [...notas, ...f.notas],
    ...(chamadas.length ? { ultimoContacto: AGORA, diasSemContacto: 0 } : {}),
    ...(dias !== null ? { prazo: { data: somarDias(HOJE_FUNC, dias), atrasado: false } } : {}),
  };
}

const nomePasso = (id: string): string => PASSOS.find((x) => x.id === id)?.nome ?? id;

/** Os registos de uma pessoa como linhas da Atividade, do mais recente para o mais antigo, com a marca "registado agora". */
export function atividadeRegistada(regs: readonly Registo[], nome: string): ItemAtividade[] {
  return registosDe(regs, nome).reverse().map((r): ItemAtividade => {
    const base = { id: `reg-${r.id}`, q: REGISTADO_AGORA, exemplo: false };
    if (r.tipo === "nota") return { ...base, tipo: "nota", titulo: r.texto, detalhe: "Nota rápida" };
    if (r.tipo === "adiar") return { ...base, tipo: "historico", titulo: `Próximo contacto adiado para ${somarDias(HOJE_FUNC, r.dias)}`, detalhe: "" };
    const detalhe = [r.resultado, `Próximo passo: ${nomePasso(r.passo)}`, r.nota.trim()].filter(Boolean).join(" · ");
    return { ...base, tipo: "chamada", titulo: "Chamada registada", detalhe };
  });
}

/* ---------------------------------------------------------------- as razões de cada lista */

/** Dias até uma data com "dd/mm" algures no texto ("qui 15/10", "15/10 10:00"); `null` sem data. Negativo: já passou. */
export function diasAte(texto: string): number | null {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(texto);
  return m ? -idade(`${m[1]}/${m[2]}`) : null;
}

const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

function quandoVoltou(S: Estado, p: PessoaApp): string {
  const t = toquesDe(S, p.nome).filter((x) => x.via === "online" && x.estado === "associada").slice(-1)[0];
  return t ? tempoDesde(t.data) || "hoje" : "hoje";
}

/** Porque é que a lead entra em "Contactar hoje" (até duas razões); `null` se não entra. Depois de uma chamada registada só entra se ficou combinado ligar hoje. */
function razaoContactar(S: Estado, p: PessoaApp, f: Perfil, regs: readonly Registo[]): string | null {
  if (p.papel !== "lead") return null;
  if (proximoContactoDias(regs, p.nome) === 0) return "Combinado ligar outra vez hoje";
  if (chamadasDe(regs, p.nome).length) return null;
  const r: string[] = [];
  if (voltouAContactar(S, p, f)) r.push(`Voltou a contactar ${quandoVoltou(S, p)}`);
  if (p.principal.fase === 0) {
    const n = idade(f.criada);
    r.push(n <= 0 ? "Sem contacto, chegou hoje" : `Sem contacto há ${plural(n, "dia", "dias")}`);
  }
  if (atrasada(p)) r.push("Tarefa atrasada");
  if (resultadoContacto(f) === LIGAR_MAIS_TARDE) r.push("Pediu para ligar mais tarde");
  const religar = diasAte(isoParaDia(p.principal.f.religar ?? ""));
  if (religar !== null && religar <= 0) r.push(religar === 0 ? "Ficou de voltar a ligar hoje" : `Ficou de voltar a ligar a ${isoParaDia(p.principal.f.religar ?? "")}`);
  return r.length ? r.slice(0, 2).join(" · ") : null;
}

/** "2026-10-12" (o campo "Voltar a ligar em") passa a "12/10"; o resto fica como está. */
export const isoParaDia = (t: string): string => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(t.trim());
  return m ? `${m[2]}/${m[1]}` : t;
};

function razaoVisita(f: Perfil): string | null {
  const v = f.visita;
  if (!v || v.estado !== "Marcada") return null;
  const dias = diasAte(v.data);
  return dias !== null && dias >= 0 && dias <= DIAS_VISITAS ? `Visita ${v.data}${v.hora ? ` · ${v.hora}` : ""}` : null;
}

function razaoEspera(p: PessoaApp, f: Perfil): string | null {
  const propostas = p.todos.filter((n) => n.perdido === null && docFase(n.deal) === "proposta")
    .map((n) => idade(n.deal.orc?.enviada ?? n.deal.quando)).filter((d) => d >= DIAS_PROPOSTA);
  if (propostas.length) return `Proposta enviada há ${plural(Math.max(...propostas), "dia", "dias")}`;
  if (p.papel === "lead" && p.principal.fase === 1 && f.diasSemContacto >= DIAS_SEM_AVANCO) return `Contactada há ${plural(f.diasSemContacto, "dia", "dias")}, sem avanço`;
  return null;
}

function razaoContratos(p: PessoaApp): string | null {
  const r = p.todos.filter((n) => n.perdido === null).flatMap((n): string[] => {
    const doc = docFase(n.deal);
    if (doc === "contrato") return [`Contrato por assinar · ${n.titulo}`];
    return doc === "financeiro" && !n.deal.fin.fatura ? [`Por faturar · ${n.titulo}`] : [];
  });
  return r.length ? r[0] + (r.length > 1 ? ` (e mais ${r.length - 1})` : "") : null;
}

/** A lista do Hoje em que a pessoa entra e a razão, ou `null`. Uma pessoa perdida, ou adiada para depois de hoje, não entra em nenhuma. */
export function grupoDe(S: Estado, p: PessoaApp, f: Perfil, regs: readonly Registo[]): { grupo: IdGrupo; razao: string } | null {
  if (p.perdida !== null) return null;
  const dias = proximoContactoDias(regs, p.nome);
  if (dias !== null && dias > 0) return null;
  const regras: [IdGrupo, () => string | null][] = [
    ["contactar", () => razaoContactar(S, p, f, regs)], ["visitas", () => razaoVisita(f)], ["espera", () => razaoEspera(p, f)], ["contratos", () => razaoContratos(p)],
  ];
  for (const [grupo, razao] of regras) {
    const t = razao();
    if (t) return { grupo, razao: t };
  }
  return null;
}

/** As quatro listas do Hoje, pela ordem de prioridade; dentro de cada uma, a ordem da página de Pessoas (leads por urgência, depois clientes). */
export function hojePessoas(S: Estado, regs: readonly Registo[]): GrupoHoje[] {
  const itens = todosApp(S).flatMap((p): ItemHoje[] => {
    const f = perfilFunc(perfilDe(p, S), regs, p.nome), g = grupoDe(S, p, f, regs);
    return g ? [{ p, f, ...g }] : [];
  });
  return GRUPOS.map((g) => ({ ...g, itens: itens.filter((i) => i.grupo === g.id) }));
}

/** Quantas pessoas há no Hoje (a soma das listas). */
export const totalHoje = (gs: readonly GrupoHoje[]): number => gs.reduce((a, g) => a + g.itens.length, 0);
