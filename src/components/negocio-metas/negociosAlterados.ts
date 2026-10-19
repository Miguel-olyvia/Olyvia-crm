// O que se mudou nos negócios nesta sessão (um orçamento novo, um passo ganho ou perdido): vive só em memória, neste
// módulo, e perde-se ao recarregar. Mesmo padrão de `negociosNovos.ts` (useSyncExternalStore e `repor()` para os
// testes). A página de Negócio e metas e a ficha de Pessoas leem-no, por isso as duas mostram o mesmo. As funções
// `negociosDoQuadro` e `negociosComPerdidos` aplicam o que está guardado a uma lista de negócios (puras).
import { useSyncExternalStore } from "react";
import { useDadosNegocio } from "./costuraNegocio";
import type { Aplicacao } from "./negocioAcoes";
import { DETALHES_EXEMPLO } from "./negocioDetalhesExemplo";
import type { DetalheNegocio, OrcamentoDetalhe } from "./negocioDetalhes";
import type { NegocioMes } from "./negocioMetas";
import { faseNaPerda, type FaseNaPerda } from "./percursoNegocio";
import { registosAtuais } from "./registosPessoa";

export interface PerdaNegocio {
  motivo: string;
  /** AAAA-MM. */
  mes: string;
  /** AAAA-MM-DD. */
  data: string;
  /** A fase em que o negócio estava quando se perdeu (conta para as metas conforme esta fase, ver `contaParaMetas`). */
  fase: FaseNaPerda;
}

export interface Alteracoes {
  /** A versão atual de cada negócio mudado (pelo id). */
  editados: Readonly<Record<string, NegocioMes>>;
  /** Os negócios perdidos: saem do quadro e ficam como terminados na ficha da pessoa. */
  perdidos: Readonly<Record<string, PerdaNegocio>>;
  /** Os detalhes (data e estado) dos orçamentos criados, por negócio e por id do orçamento. */
  detalhes: Readonly<Record<string, Readonly<Record<string, OrcamentoDetalhe>>>>;
  /** Número de série dos orçamentos criados (para os ids). */
  sequencia: number;
}

/** Um negócio perdido tal como a ficha de uma pessoa o conta (um terminado de um mês). */
export type NegocioPerdido = NegocioMes & { mes: string; resultado: "perdido"; motivoPerda: string; faseDaPerda?: FaseNaPerda };

const SEM_ALTERACOES: Alteracoes = { editados: {}, perdidos: {}, detalhes: {}, sequencia: 0 };

let estado: Alteracoes = SEM_ALTERACOES;
const ouvintes = new Set<() => void>();

const mudar = (seguinte: Alteracoes): void => {
  estado = seguinte;
  ouvintes.forEach((ouvinte) => ouvinte());
};

function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** O que está guardado agora (o mesmo objeto até haver uma mudança). */
export const alteracoesAtuais = (): Alteracoes => estado;

/** O número de série do próximo orçamento (para o id); não guarda nada. */
export const proximaSequenciaOrcamento = (): number => estado.sequencia + 1;

/** Guarda a nova versão de um negócio e, se veio com um orçamento novo, o detalhe dele. */
export function guardarNegocio(negocio: NegocioMes, orcamento?: { id: string; detalhe: OrcamentoDetalhe }): void {
  const detalhes = orcamento
    ? { ...estado.detalhes, [negocio.id]: { ...estado.detalhes[negocio.id], [orcamento.id]: orcamento.detalhe } }
    : estado.detalhes;
  mudar({
    ...estado, detalhes, sequencia: orcamento ? estado.sequencia + 1 : estado.sequencia,
    editados: { ...estado.editados, [negocio.id]: negocio },
  });
}

/** Marca o negócio como perdido (em qualquer fase), com o motivo, no dia `hoje`; guarda a fase em que estava. */
export function perderNegocio(negocio: NegocioMes, motivo: string, hoje: string): void {
  const perda: PerdaNegocio = { motivo, mes: hoje.slice(0, 7), data: hoje, fase: faseNaPerda(negocio, registosAtuais()) };
  mudar({
    ...estado, editados: { ...estado.editados, [negocio.id]: negocio },
    perdidos: { ...estado.perdidos, [negocio.id]: perda },
  });
}

/** Grava o resultado de um evento do Workflow: um perdido guarda a perda (com motivo e fase); um em curso ou ganho guarda a versão nova. */
export function gravarAplicacao(resultado: Aplicacao, hoje: string): void {
  if (resultado.tipo === "perdido") perderNegocio(resultado.negocio, resultado.motivo, hoje);
  else guardarNegocio(resultado.negocio);
}

/** A perda guardada de um negócio; `undefined` se não está perdido. */
export const perdaDoNegocio = (negocioId: string, a: Alteracoes = estado): PerdaNegocio | undefined => a.perdidos[negocioId];

/** Anula a perda: o negócio volta ao quadro, na fase em que estava. Um negócio que não está perdido fica como está. */
export function anularPerda(negocioId: string): void {
  if (!estado.perdidos[negocioId]) return;
  const { [negocioId]: _anulada, ...resto } = estado.perdidos;
  mudar({ ...estado, perdidos: resto });
}

/** Esquece tudo (para os testes e para repor o exemplo). */
export function repor(): void {
  mudar(SEM_ALTERACOES);
}

/** As alterações, atualizadas sempre que se muda um negócio. Na ficha real (com `DadosNegocio`) são as da base, nunca as do store. */
export function useAlteracoesNegocios(): Alteracoes {
  const doStore = useSyncExternalStore(subscrever, alteracoesAtuais, alteracoesAtuais);
  return useDadosNegocio()?.alteracoes ?? doStore;
}

/** O detalhe de um negócio: o da ficha real (ou `null`, nunca o de exemplo de outro negócio) ou, sem ela, o do store. */
export function useDetalheDoNegocio(negocioId: string): DetalheNegocio | null {
  const doStore = useAlteracoesNegocios();
  const dados = useDadosNegocio();
  return dados ? dados.detalhe(negocioId) : detalheDoNegocio(negocioId, doStore);
}

const comEdicao = (negocios: readonly NegocioMes[], a: Alteracoes): NegocioMes[] => negocios.map((n) => a.editados[n.id] ?? n);

/** Os negócios do quadro: com o que se mudou, e sem os perdidos (esses já não estão em curso nem ganhos). */
export function negociosDoQuadro(negocios: readonly NegocioMes[], a: Alteracoes): NegocioMes[] {
  return comEdicao(negocios, a).filter((n) => !a.perdidos[n.id]);
}

/** Os negócios de uma pessoa: com o que se mudou, e os perdidos como terminados do mês em que se perderam. */
export function negociosComPerdidos<T extends NegocioMes>(negocios: readonly T[], a: Alteracoes): (NegocioMes | NegocioPerdido)[] {
  return negocios.map((n) => {
    const perda = a.perdidos[n.id];
    const atual = a.editados[n.id] ?? n;
    return perda ? { ...atual, mes: perda.mes, resultado: "perdido" as const, motivoPerda: perda.motivo, faseDaPerda: perda.fase } : atual;
  });
}

/** Os detalhes de um negócio: os de exemplo e os dos orçamentos criados nesta sessão. */
export function detalheDoNegocio(negocioId: string, a: Alteracoes = estado): DetalheNegocio | null {
  const base = DETALHES_EXEMPLO[negocioId] ?? null;
  const novos = a.detalhes[negocioId];
  if (!novos) return base;
  return { ...base, orcamentos: { ...base?.orcamentos, ...novos } };
}
