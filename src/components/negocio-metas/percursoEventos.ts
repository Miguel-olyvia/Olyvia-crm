// Os acontecimentos do percurso de um negócio, por ordem cronológica: contactos, visitas (e o resultado), levantamento, orçamentos, proposta,
// contrato e a perda. Tudo DERIVA do que o negócio tem ligado (os registos da pessoa) e dos seus detalhes: nada se guarda à parte. Funções puras.
import { visitasDerivadas } from "./derivadosDoNegocio";
import type { DetalheNegocio, EstadoOrcamentoDetalhe } from "./negocioDetalhes";
import type { EstadoContrato, EstadoProposta, EstadoVisitaNegocio, NegocioMes } from "./negocioMetas";
import type { FaseNaPerda } from "./percursoNegocio";
import type { ContactoPessoa, RegistosDaPessoa, ResultadoVisita } from "./registosTipos";

/** O que se sabe de uma perda para o percurso (o `PerdaNegocio` de `negociosAlterados.ts` serve). */
export interface PerdaDoEvento {
  motivo: string;
  /** AAAA-MM-DD. */
  data: string;
  fase: FaseNaPerda;
}

/** `data` é AAAA-MM-DD; vazia quando o acontecimento não tem dia (uma proposta em rascunho). */
export type EventoPercurso =
  | { tipo: "contacto"; chave: string; data: string; hora?: string; resultado: ContactoPessoa["resultado"]; nota: string }
  | { tipo: "visita"; chave: string; data: string; hora: string; estado: EstadoVisitaNegocio; resultado?: ResultadoVisita }
  | { tipo: "levantamento"; chave: string; data: string; feitoPor: string; linhas: number }
  | { tipo: "orcamento"; chave: string; data: string; valor: number; escolhido: boolean; estado?: EstadoOrcamentoDetalhe }
  | { tipo: "proposta"; chave: string; data: string; estado: EstadoProposta }
  | { tipo: "contrato"; chave: string; data: string; estado: EstadoContrato }
  | { tipo: "perda"; chave: string; data: string; motivo: string; fase: FaseNaPerda };

type TipoEvento = EventoPercurso["tipo"];

/** A ordem dos tipos quando o dia e a hora empatam: a abordagem primeiro, depois a cadeia do negócio. */
const ORDEM: Record<TipoEvento, number> = { contacto: 0, visita: 1, levantamento: 2, orcamento: 3, proposta: 4, contrato: 5, perda: 6 };
const DA_CADEIA: readonly TipoEvento[] = ["orcamento", "proposta", "contrato"];
const FIM_DO_DIA = "24:00";
const SEM_DIA = "9999-12-31";

function dosRegistos(negocio: NegocioMes, ligados: RegistosDaPessoa): EventoPercurso[] {
  const contactos = ligados.contactos.map((c): EventoPercurso => ({
    tipo: "contacto", chave: `contacto-${c.id}`, data: c.data, hora: c.hora, resultado: c.resultado, nota: c.nota,
  }));
  const visitas = visitasDerivadas(negocio, ligados).map((v): EventoPercurso => ({
    tipo: "visita", chave: `visita-${v.id}`, data: v.data, hora: v.hora, estado: v.estado, resultado: "resultado" in v ? (v.resultado as ResultadoVisita | undefined) : undefined,
  }));
  const doRegisto = ligados.levantamentos.map((l): EventoPercurso => ({
    tipo: "levantamento", chave: `levantamento-${l.id}`, data: l.data, feitoPor: l.feitoPor, linhas: l.rascunho.linhas.length,
  }));
  // Um negócio de exemplo antigo, sem levantamento ligado, mostra o que trazia.
  const antigo: EventoPercurso[] = doRegisto.length === 0 && negocio.levantamento
    ? [{ tipo: "levantamento", chave: "levantamento-antigo", data: negocio.levantamento.data, feitoPor: negocio.levantamento.feitoPor, linhas: negocio.levantamento.linhas.length }]
    : [];
  return [...contactos, ...visitas, ...doRegisto, ...antigo];
}

function daCadeia(negocio: NegocioMes, detalhe: DetalheNegocio | null): EventoPercurso[] {
  const orcamentos = negocio.orcamentos.map((o): EventoPercurso => {
    const d = detalhe?.orcamentos?.[o.id];
    return { tipo: "orcamento", chave: `orcamento-${o.id}`, data: d?.data ?? "", valor: o.valor, escolhido: o.escolhido, estado: d?.estado };
  });
  const proposta: EventoPercurso[] = negocio.proposta
    ? [{ tipo: "proposta", chave: "proposta", data: detalhe?.proposta?.enviadaEm ?? "", estado: negocio.proposta.estado }]
    : [];
  const contrato: EventoPercurso[] = negocio.contrato
    ? [{ tipo: "contrato", chave: "contrato", data: detalhe?.contrato?.assinadoEm ?? detalhe?.contrato?.criadoEm ?? "", estado: negocio.contrato.estado }]
    : [];
  return [...orcamentos, ...proposta, ...contrato];
}

const maisTarde = (dias: readonly string[]): string => dias.reduce((a, b) => (b > a ? b : a), "");

/**
 * O dia pelo qual se ordena. Um acontecimento sem dia (a proposta em rascunho) herda o do último passo da cadeia que o antecede (e, sem
 * nenhum, o mais tardio dos registos e, sem registos, o do passo seguinte que tem dia), para ficar logo a seguir ao que já lá estava, e
 * não no fim de tudo.
 */
function diasEfetivos(eventos: readonly EventoPercurso[]): Map<string, string> {
  const efetivos = new Map<string, string>();
  const registos = maisTarde(eventos.filter((e) => !DA_CADEIA.includes(e.tipo) && e.tipo !== "perda").map((e) => e.data));
  let cadeia = "";
  const passos = eventos.filter((x) => DA_CADEIA.includes(x.tipo)).sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo]);
  passos.forEach((e, i) => {
    cadeia = maisTarde([cadeia, e.data]);
    const seguinte = passos.slice(i + 1).find((x) => x.data !== "")?.data ?? "";
    efetivos.set(e.chave, e.data || cadeia || registos || seguinte || SEM_DIA);
  });
  for (const e of eventos) if (!efetivos.has(e.chave)) efetivos.set(e.chave, e.data || SEM_DIA);
  return efetivos;
}

/** Os acontecimentos do percurso do negócio, do mais antigo para o mais recente (a perda, se há, é sempre o último). */
export function eventosDoPercurso(
  negocio: NegocioMes, ligados: RegistosDaPessoa, detalhe: DetalheNegocio | null, perda: PerdaDoEvento | undefined,
): EventoPercurso[] {
  const perdaEvento: EventoPercurso[] = perda ? [{ tipo: "perda", chave: "perda", data: perda.data, motivo: perda.motivo, fase: perda.fase }] : [];
  const todos = [...dosRegistos(negocio, ligados), ...daCadeia(negocio, detalhe), ...perdaEvento];
  const dia = diasEfetivos(todos);
  const horaDe = (e: EventoPercurso): string => ("hora" in e && e.hora ? e.hora : FIM_DO_DIA);
  return todos
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      Number(a.e.tipo === "perda") - Number(b.e.tipo === "perda") ||
      (dia.get(a.e.chave) ?? "").localeCompare(dia.get(b.e.chave) ?? "") || horaDe(a.e).localeCompare(horaDe(b.e)) || ORDEM[a.e.tipo] - ORDEM[b.e.tipo] || a.i - b.i)
    .map(({ e }) => e);
}
