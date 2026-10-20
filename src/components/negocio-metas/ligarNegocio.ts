// Criar um negócio à mão e LIGAR registos existentes da pessoa: os contactos e as visitas que se marcam, e o levantamento (usar um que já
// existe, fazer um novo, ou dispensar). Nada se copia: um registo liga-se a um só negócio (`negocioId`). Lógica pura; o store dos registos
// (`registosPessoa.ts`) aplica-a. O levantamento é opcional e só a pessoa é obrigatória para criar o negócio.
import { ligarRegistos, podeLigar, registosDaPessoa } from "./acoesRegistos";
import type { DecisaoLevantamento, EstadoRegistos, RefRegisto, RegistosDaPessoa } from "./registosTipos";

/** O que se escolhe para o levantamento ao criar o negócio. */
export type EscolhaLevantamento = { tipo: "existente"; id: string } | { tipo: "novo" } | { tipo: "dispensar" };

/** O que o formulário entrega: os contactos e visitas marcados, e a escolha do levantamento. */
export interface LigarRegistos {
  /** Só contactos e visitas: o levantamento vai em `levantamento`. */
  registos: readonly RefRegisto[];
  levantamento: EscolhaLevantamento;
}

/** Usar um existente e fazer um novo deixam o levantamento «ligado» (o negócio fica em Levantamento até haver um ligado); dispensar segue para Orçamento. */
export const decisaoDaEscolha = (e: EscolhaLevantamento): DecisaoLevantamento => (e.tipo === "dispensar" ? "dispensado" : "ligado");

/** Os registos a ligar: os marcados e, se se usa um levantamento existente, esse também. */
export const refsDaLigacao = (l: LigarRegistos): RefRegisto[] => [
  ...l.registos, ...(l.levantamento.tipo === "existente" ? [{ tipo: "levantamento" as const, id: l.levantamento.id }] : []),
];

/**
 * A escolha com que o formulário abre: todos os contactos e visitas por ligar da pessoa marcados (podem desmarcar-se) e o levantamento
 * por ligar mais recente; sem nenhum, fazer um novo.
 */
export function escolhaInicial(porLigar: RegistosDaPessoa): { marcados: RefRegisto[]; levantamento: EscolhaLevantamento } {
  const maisRecente = [...porLigar.levantamentos].sort((a, b) => b.data.localeCompare(a.data))[0];
  return {
    marcados: [
      ...porLigar.contactos.map((c): RefRegisto => ({ tipo: "contacto", id: c.id })),
      ...porLigar.visitas.filter((v) => v.estado !== "cancelada").map((v): RefRegisto => ({ tipo: "visita", id: v.id })),
    ],
    levantamento: maisRecente ? { tipo: "existente", id: maisRecente.id } : { tipo: "novo" },
  };
}

/** A escolha de partida de uma pessoa, no formato do formulário (ver `escolhaInicial`). */
export function ligarInicial(porLigar: RegistosDaPessoa): LigarRegistos {
  const { marcados, levantamento } = escolhaInicial(porLigar);
  return { registos: marcados, levantamento };
}

/** O registo existe, é da pessoa e está livre (ou já é deste negócio)? */
function ligavel(estado: EstadoRegistos, pessoaId: string, ref: RefRegisto, negocioId: string): boolean {
  const dela = registosDaPessoa(estado, pessoaId);
  const chave = ref.tipo === "contacto" ? "contactos" : ref.tipo === "visita" ? "visitas" : "levantamentos";
  return dela[chave].some((r) => r.id === ref.id) && podeLigar(estado, ref, negocioId);
}

/**
 * Liga ao negócio os registos escolhidos da pessoa. Os que não se podem ligar (já estão ligados a outro negócio, são de outra pessoa,
 * ou não existem) voltam à parte e ficam como estavam. Sem registos recusados, o estado novo; senão, o das ligações possíveis.
 */
export function ligarRegistosDaPessoa(
  estado: EstadoRegistos, negocioId: string, pessoaId: string, l: LigarRegistos,
): { estado: EstadoRegistos; recusados: RefRegisto[] } {
  const refs = refsDaLigacao(l);
  const boas = refs.filter((r) => ligavel(estado, pessoaId, r, negocioId));
  const naoLigaveis = refs.filter((r) => !boas.includes(r));
  const { estado: seguinte } = ligarRegistos(estado, boas, negocioId);
  return { estado: boas.length === 0 ? estado : seguinte, recusados: naoLigaveis };
}
