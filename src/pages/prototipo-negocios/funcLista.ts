// A Lista de Pessoas da V2 funcional, sem React: as linhas com os registos do dia a dia aplicados, as vistas rápidas (com as mesmas regras do Hoje),
// a ordem por coluna e as colunas que se podem esconder. Funções puras: nada aqui muda o Estado nem os registos.
import type { Estado } from "./motor";
import type { Ordem, PessoaApp, SeparadorLista } from "./pessoasDocs";
import { perfilDe, type Perfil } from "./perfilDocs";
import { resultadoContacto, voltouAContactar, SEM_CONTACTO } from "./camposPessoa";
import { linhasDe, listaP, selecionar, type FiltrosP, type LinhaP } from "./filtrosPessoas";
import { valorColuna } from "./listaDocs";
import { diasAte, grupoDe, perfilFunc, type IdGrupo } from "./funcHoje";
import { ordenarPor, type Chave, type ColunaOrdem, type OrdemLista } from "./funcOrdenar";
import type { Registo } from "./diaADia";

/** Uma linha da Lista funcional: a linha dos filtros (com o resultado e o "voltou" já ajustados), o perfil ajustado e a lista do Hoje em que a pessoa está. */
export interface LinhaFunc extends LinhaP { f: Perfil; hoje: IdGrupo | null }

/** Todas as pessoas, com os registos aplicados: os filtros, o dashboard e a lista contam o mesmo que se vê. */
export function linhasFunc(S: Estado, regs: readonly Registo[]): LinhaFunc[] {
  return linhasDe(S).map((l): LinhaFunc => {
    const f = perfilFunc(perfilDe(l.p, S), regs, l.p.nome);
    return { ...l, f, resultado: resultadoContacto(f), voltou: voltouAContactar(S, l.p, f), hoje: grupoDe(S, l.p, f, regs)?.grupo ?? null };
  });
}

/* ---------------------------------------------------------------- vistas rápidas */

export type VistaP = "contactar" | "visitas" | "espera" | "voltaram" | "sem_contacto" | "perdidas";
export const VISTAS_P: readonly { id: VistaP; nome: string }[] = [
  { id: "contactar", nome: "Contactar hoje" }, { id: "visitas", nome: "Visitas esta semana" }, { id: "espera", nome: "À espera de resposta" },
  { id: "voltaram", nome: "Voltaram a contactar" }, { id: "sem_contacto", nome: "Sem contacto" }, { id: "perdidas", nome: "Perdidas" },
];

const REGRA: Record<Exclude<VistaP, "perdidas">, (l: LinhaFunc) => boolean> = {
  contactar: (l) => l.hoje === "contactar", visitas: (l) => l.hoje === "visitas", espera: (l) => l.hoje === "espera",
  voltaram: (l) => l.voltou, sem_contacto: (l) => l.resultado === SEM_CONTACTO,
};

/** A lista com a vista aplicada por cima dos filtros. "Perdidas" é o estado Perdidas (as leads em curso não as têm). */
export function selecionarFunc(linhas: readonly LinhaFunc[], aba: SeparadorLista, f: FiltrosP, vista: VistaP | null): LinhaFunc[] {
  if (vista === "perdidas") return selecionar(linhas, aba, { ...f, estado: "perdidas" }) as LinhaFunc[];
  const sel = selecionar(linhas, aba, f) as LinhaFunc[];
  return vista ? sel.filter(REGRA[vista]) : sel;
}

/** Quantas pessoas a vista daria, com os filtros de agora. */
export const contarVista = (linhas: readonly LinhaFunc[], aba: SeparadorLista, f: FiltrosP, v: VistaP): number => selecionarFunc(linhas, aba, f, v).length;

/* ---------------------------------------------------------------- ordenar por coluna */

function chaveDe(S: Estado, coluna: ColunaOrdem): (l: LinhaFunc) => Chave {
  if (coluna === "pessoa") return (l) => l.p.nome;
  if (coluna === "contacto") return (l) => l.f.diasSemContacto;
  if (coluna === "proximo") return (l) => (l.p.perdida !== null ? null : diasAte(l.f.prazo.data));
  return (l) => valorColuna(S, l.p);
}

/** A lista pela coluna escolhida (estável; sem coluna, fica como veio). */
export function ordenarLista(S: Estado, ls: readonly LinhaFunc[], ordem: OrdemLista | null): LinhaFunc[] {
  return ordem ? ordenarPor(ls, chaveDe(S, ordem.coluna), ordem.dir) : [...ls];
}

/** A lista como se vê: os filtros, a vista rápida, a ordem do painel Filtros e, por cima, a ordem da coluna escolhida. */
export function listaFunc(S: Estado, linhas: readonly LinhaFunc[], aba: SeparadorLista, f: FiltrosP, vista: VistaP | null, ordem: Ordem, col: OrdemLista | null): LinhaFunc[] {
  const passam = new Set(selecionarFunc(linhas, aba, f, vista).map((l) => l.p.nome));
  const base = listaP(S, linhas, aba, vista === "perdidas" ? { ...f, estado: "perdidas" } : f, ordem).filter((l) => passam.has(l.p.nome)) as LinhaFunc[];
  return ordenarLista(S, base, col);
}

/* ---------------------------------------------------------------- colunas */

export type ColunaOpcional = "formulario" | "etapa" | "origem" | "contacto" | "proximo" | "valor";
export const COLUNAS_OPCIONAIS: readonly { id: ColunaOpcional; nome: string }[] = [
  { id: "formulario", nome: "Formulário" }, { id: "etapa", nome: "Etapa" }, { id: "origem", nome: "Origem" },
  { id: "contacto", nome: "Último contacto" }, { id: "proximo", nome: "Próximo passo" }, { id: "valor", nome: "Valor" },
];
/** Por omissão as mesmas colunas da V2 (a Origem fica escondida). */
export const COLUNAS_INICIAIS: readonly ColunaOpcional[] = ["etapa", "formulario", "contacto", "proximo", "valor"];

/** Liga ou desliga uma coluna (uma lista nova, pela ordem de COLUNAS_OPCIONAIS). */
export function alternarColuna(atuais: readonly ColunaOpcional[], c: ColunaOpcional): ColunaOpcional[] {
  const set = new Set(atuais);
  if (set.has(c)) set.delete(c); else set.add(c);
  return COLUNAS_OPCIONAIS.map((x) => x.id).filter((x) => set.has(x));
}

/** As pessoas das linhas, para o painel e para o CSV. */
export const pessoasDe = (ls: readonly LinhaFunc[]): { p: PessoaApp; f: Perfil }[] => ls.map((l) => ({ p: l.p, f: l.f }));
