// O que o painel «Visita e levantamento» grava na base, e por que ordem. Função pura: compara o que o painel tem com o que a base já tem e devolve
// os passos, sem relógio (o instante de agora chega por parâmetro) nem rede. Ordem: as visitas (criar, alterar, concluir, cancelar, pela ordem
// cronológica dentro de cada grupo) e só depois o levantamento, que se liga a uma visita já gravada. Recusa-se ANTES de escrever o que a base
// não aceitaria (sem dia ou hora, visita feita no futuro, sem quadro ou recurso), para uma gravação não ficar a meio por um erro previsível.
import type { TipoVisitaNegocio, VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { moradaAparada } from "@/components/negocio-metas/moradaObra";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { ordenarVisitas } from "@/components/negocio-metas/visitasNegocio";
import { passoLevantamento, type LevantamentoLivre, type PassoLevantamento } from "./planoLevantamento";
import { instanteLisboa, paraAlterarVisita, paraGuardarVisita, type EntradaVisita, type ErroEntradaVisita } from "./visitaDb";

export type { LevantamentoLivre, LinhaDb, PassoLevantamento } from "./planoLevantamento";

/** Uma visita que a base já tem, vista pelo painel: o id que a base lhe deu, e como está gravada (o painel pode tê-la com outro id local). */
export interface BaseVisita {
  idReal: string;
  visita: VisitaPessoa;
}

export type Passo =
  | { tipo: "criarVisita"; id: string; entrada: EntradaVisita }
  | { tipo: "alterarVisita"; id: string; idReal: string; entrada: EntradaVisita; recursosAtuais: readonly string[] }
  /** `idReal` é `null` quando a visita é criada neste mesmo plano: o executor usa o id que a criação devolver. */
  | { tipo: "concluirVisita"; id: string; idReal: string | null }
  | { tipo: "cancelarVisita"; id: string; idReal: string }
  | PassoLevantamento;

export type FaltaGravacao = ErroEntradaVisita | "dataEmFalta" | "horaEmFalta" | "feitaNoFuturo";
export type Plano = { ok: true; passos: Passo[] } | { ok: false; falta: FaltaGravacao; visitaId: string };

export interface EntradaPlano {
  organizationId: string;
  pessoaId: string;
  nome: string;
  /** A lista de visitas do painel. */
  visitas: readonly VisitaNegocio[];
  /** O que a base já tem, pelo id da visita no painel. */
  base: ReadonlyMap<string, BaseVisita>;
  /** Os ids (no painel) das visitas criadas por este painel numa gravação anterior: se o utilizador as tirou entretanto, cancelam-se. */
  sessao?: ReadonlySet<string>;
  /** O quadro e o recurso para uma visita nova (o painel não os pergunta). */
  omissao: { boardId: string | null; recursoId: string | null };
  /** O nome do tipo («Levantamento»), para o título «tipo · nome». */
  tituloDoTipo: (tipo: TipoVisitaNegocio | "") => string;
  /** Agora, em milissegundos. */
  agora: number;
  /** AAAA-MM-DD. */
  hoje: string;
  comercial: string;
  /** O negócio a que as visitas novas e o levantamento ficam ligados; `null` sem negócio. */
  negocioId: string | null;
  rascunho: RascunhoLevantamento;
  levantamentoLivre: LevantamentoLivre | null;
  novoIdLevantamento: () => string;
}

const igualTexto = (a: string, b: string): boolean => a.trim() === b.trim();

/** A visita do painel difere da gravada em algum campo que se envia (a hora, a morada, as notas...). */
function mudou(v: VisitaNegocio, b: VisitaPessoa): boolean {
  const m = moradaAparada(v.morada);
  const g = moradaAparada(b.morada);
  return v.data !== b.data || v.hora !== b.hora || v.duracao !== b.duracao || v.tipo !== b.tipo || v.quemVaiEstar !== b.quemVaiEstar
    || !igualTexto(v.nota, b.nota) || v.igualALead !== b.igualALead
    || m.rua !== g.rua || m.codigoPostal !== g.codigoPostal || m.localidade !== g.localidade || m.andar !== g.andar;
}

function titulo(e: EntradaPlano, tipo: TipoVisitaNegocio | ""): string {
  return [e.tituloDoTipo(tipo), e.nome].filter(Boolean).join(" · ");
}

function entradaNova(v: VisitaNegocio, e: EntradaPlano): EntradaVisita {
  return {
    boardId: e.omissao.boardId, data: v.data, hora: v.hora, duracao: v.duracao, recursos: e.omissao.recursoId ? [e.omissao.recursoId] : [],
    tipo: v.tipo, titulo: titulo(e, v.tipo), nota: v.nota.trim(), morada: moradaAparada(v.morada), igualALead: v.igualALead,
    quemVaiEstar: v.quemVaiEstar, negocioId: e.negocioId,
  };
}

/** Alterar reenvia tudo (a base apaga o que vier a NULL), com o quadro, os recursos e a duração que a visita já tem; o título só se refaz se o tipo mudou. */
function entradaAlterada(v: VisitaNegocio, b: VisitaPessoa, e: EntradaPlano): { entrada: EntradaVisita; recursosAtuais: string[] } {
  const recursosDaBase = (b.agenda?.recursos ?? []).map((r) => r.id);
  const recursos = recursosDaBase.length > 0 ? recursosDaBase : e.omissao.recursoId ? [e.omissao.recursoId] : [];
  const duracaoMinutos = v.duracao === b.duracao ? b.agenda?.duracaoMinutos ?? null : null;
  return {
    recursosAtuais: recursosDaBase,
    entrada: {
      boardId: b.agenda?.boardId ?? e.omissao.boardId, data: v.data, hora: v.hora, duracao: v.duracao, ...(duracaoMinutos !== null ? { duracaoMinutos } : {}),
      recursos, tipo: v.tipo, titulo: v.tipo === b.tipo ? "" : titulo(e, v.tipo), nota: v.nota.trim(), morada: moradaAparada(v.morada),
      igualALead: v.igualALead, quemVaiEstar: v.quemVaiEstar,
    },
  };
}

type Falta = FaltaGravacao | null;

/** O dia e a hora têm de estar escritos para uma visita que se cria ou altera (a hora é obrigatória). */
function faltaDeDiaEHora(v: VisitaNegocio): Falta {
  if (v.data === "") return "dataEmFalta";
  return v.hora === "" ? "horaEmFalta" : null;
}

/** Dar uma visita como feita antes de ela acontecer a base recusa (NG009), e já com a visita criada: antes de escrever, recusa-se aqui. */
function faltaDeFeita(v: VisitaNegocio, agora: number): Falta {
  const inicio = instanteLisboa(v.data, v.hora);
  return inicio !== null && Date.parse(inicio) > agora ? "feitaNoFuturo" : null;
}

interface Acumulado {
  criar: Passo[];
  alterar: Passo[];
  concluir: Passo[];
  cancelar: Passo[];
}

function planearVisita(v: VisitaNegocio, e: EntradaPlano, a: Acumulado): Falta {
  const b = e.base.get(v.id);
  if (!b) {
    if (v.estado === "cancelada") return null;
    const falta = faltaDeDiaEHora(v) ?? (v.estado === "feita" ? faltaDeFeita(v, e.agora) : null);
    if (falta) return falta;
    const entrada = entradaNova(v, e);
    const valida = paraGuardarVisita(e.organizationId, e.pessoaId, entrada);
    if (!valida.ok) return valida.erro;
    a.criar.push({ tipo: "criarVisita", id: v.id, entrada });
    if (v.estado === "feita") a.concluir.push({ tipo: "concluirVisita", id: v.id, idReal: null });
    return null;
  }
  // Uma visita já feita ou cancelada na base só se lê.
  if (b.visita.estado !== "porFazer") return null;
  if (v.estado === "cancelada") {
    a.cancelar.push({ tipo: "cancelarVisita", id: v.id, idReal: b.idReal });
    return null;
  }
  const alterada = mudou(v, b.visita);
  if (alterada) {
    const falta = faltaDeDiaEHora(v);
    if (falta) return falta;
    const { entrada, recursosAtuais } = entradaAlterada(v, b.visita, e);
    const valida = paraAlterarVisita(b.idReal, entrada, recursosAtuais);
    if (!valida.ok) return valida.erro;
    a.alterar.push({ tipo: "alterarVisita", id: v.id, idReal: b.idReal, entrada, recursosAtuais });
  }
  if (v.estado === "feita") {
    const falta = faltaDeFeita(v, e.agora);
    if (falta) return falta;
    a.concluir.push({ tipo: "concluirVisita", id: v.id, idReal: b.idReal });
  }
  return null;
}

/** As visitas criadas por este painel numa gravação anterior e que o utilizador tirou da lista: cancelam-se (existem na base). */
function tiradasDaSessao(e: EntradaPlano): Passo[] {
  const noPainel = new Set(e.visitas.map((v) => v.id));
  return [...(e.sessao ?? [])].flatMap((id): Passo[] => {
    const b = e.base.get(id);
    return b && !noPainel.has(id) && b.visita.estado === "porFazer" ? [{ tipo: "cancelarVisita", id, idReal: b.idReal }] : [];
  });
}

export function planoGravacao(e: EntradaPlano): Plano {
  const a: Acumulado = { criar: [], alterar: [], concluir: [], cancelar: tiradasDaSessao(e) };
  for (const v of ordenarVisitas(e.visitas)) {
    const falta = planearVisita(v, e, a);
    if (falta) return { ok: false, falta, visitaId: v.id };
  }
  const levantamento = passoLevantamento({
    rascunho: e.rascunho, vivas: e.visitas.filter((v) => v.estado !== "cancelada"), todas: e.visitas, hoje: e.hoje, negocioId: e.negocioId, livre: e.levantamentoLivre,
    idRealDe: (id) => e.base.get(id)?.idReal, novoId: e.novoIdLevantamento,
  });
  return { ok: true, passos: [...a.criar, ...a.alterar, ...a.concluir, ...a.cancelar, ...(levantamento ? [levantamento] : [])] };
}
