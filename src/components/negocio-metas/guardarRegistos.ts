// Guardar de uma só vez as visitas e o levantamento de uma pessoa (o painel "Visita e levantamento"), em função pura: recebe os
// registos de agora e devolve os novos, sem tocar no store. Os ids novos chegam por parâmetro. Os registos ligados a um negócio nunca
// se apagam, e o levantamento ligado a um negócio nunca se altera (o novo regista-se à parte).
import type { VisitaNegocio } from "./negocioMetas";
import type { RascunhoLevantamento } from "./novoNegocio";
import { ordenarVisitas } from "./visitasNegocio";
import type { EstadoRegistos, LevantamentoPessoa, TipoRegisto, VisitaPessoa } from "./registosTipos";

export interface DadosGuardarRegistos {
  /** A lista inteira de visitas do painel (as que já eram da pessoa, com o id do store, e as novas, com o id do formulário). */
  visitas: readonly VisitaNegocio[];
  /** O levantamento do painel; sem ele, fica o que havia. */
  levantamento?: RascunhoLevantamento;
  comercial: string;
  /** AAAA-MM-DD. */
  hoje: string;
}

export interface ResultadoGuardar {
  estado: EstadoRegistos;
  /** As visitas que acabam de passar a feita (contam como contacto). */
  passaramAFeita: VisitaPessoa[];
  /** O levantamento guardado é novo, ou diferente do que havia. */
  levantamentoMudou: boolean;
}

const temConteudo = (r: RascunhoLevantamento): boolean =>
  r.linhas.length > 0 || r.observacoes.trim() !== "" || Object.keys(r.respostas).length > 0;

const mesmoRascunho = (a: RascunhoLevantamento, b: RascunhoLevantamento): boolean => JSON.stringify(a) === JSON.stringify(b);

/** As visitas da pessoa depois de guardar: as da lista (atualizadas ou novas) e as ligadas a um negócio que a lista deixou de fora. */
function visitasGuardadas(
  estado: EstadoRegistos, pessoaId: string, d: DadosGuardarRegistos, novoId: (tipo: TipoRegisto) => string,
): { visitas: VisitaPessoa[]; passaramAFeita: VisitaPessoa[] } {
  const dela = estado.visitas.filter((v) => v.pessoaId === pessoaId);
  const passaramAFeita: VisitaPessoa[] = [];
  const daLista = ordenarVisitas(d.visitas).map((v): VisitaPessoa => {
    const atual = dela.find((x) => x.id === v.id);
    const guardada: VisitaPessoa = atual
      ? { ...v, id: atual.id, pessoaId, negocioId: atual.negocioId, ...(atual.resultado ? { resultado: atual.resultado } : {}) }
      : { ...v, id: novoId("visita"), pessoaId, negocioId: null };
    if (guardada.estado === "feita" && atual?.estado !== "feita") passaramAFeita.push(guardada);
    return guardada;
  });
  const ligadasQueFicam = dela.filter((x) => x.negocioId !== null && !d.visitas.some((v) => v.id === x.id));
  return { visitas: [...daLista, ...ligadasQueFicam], passaramAFeita };
}

/** A visita em que se fez o levantamento: a primeira feita da lista; sem nenhuma, `null`. */
const visitaDoLevantamento = (visitas: readonly VisitaPessoa[]): VisitaPessoa | null => visitas.find((v) => v.estado === "feita") ?? null;

function levantamentoGuardado(
  estado: EstadoRegistos, pessoaId: string, visitas: readonly VisitaPessoa[], d: DadosGuardarRegistos, novoId: (tipo: TipoRegisto) => string,
): { levantamentos: LevantamentoPessoa[]; mudou: boolean } {
  if (!d.levantamento) return { levantamentos: [...estado.levantamentos], mudou: false };
  const rascunho = d.levantamento;
  const livre = [...estado.levantamentos].reverse().find((l) => l.pessoaId === pessoaId && l.negocioId === null);
  if (livre) {
    const mudou = !mesmoRascunho(livre.rascunho, rascunho);
    return { levantamentos: estado.levantamentos.map((l) => (l.id === livre.id ? { ...l, rascunho } : l)), mudou };
  }
  if (!temConteudo(rascunho)) return { levantamentos: [...estado.levantamentos], mudou: false };
  const visita = visitaDoLevantamento(visitas);
  const novo: LevantamentoPessoa = {
    id: novoId("levantamento"), pessoaId, visitaId: visita?.id ?? null, data: visita?.data || d.hoje, feitoPor: visita?.feitoPor || d.comercial,
    rascunho, negocioId: null,
  };
  return { levantamentos: [...estado.levantamentos, novo], mudou: true };
}

/** Aplica o que o painel guardou aos registos da pessoa. */
export function guardarRegistosDaPessoa(
  estado: EstadoRegistos, pessoaId: string, d: DadosGuardarRegistos, novoId: (tipo: TipoRegisto) => string,
): ResultadoGuardar {
  const { visitas, passaramAFeita } = visitasGuardadas(estado, pessoaId, d, novoId);
  const { levantamentos, mudou } = levantamentoGuardado(estado, pessoaId, visitas, d, novoId);
  return {
    estado: { ...estado, visitas: [...estado.visitas.filter((v) => v.pessoaId !== pessoaId), ...visitas], levantamentos },
    passaramAFeita, levantamentoMudou: mudou,
  };
}
