// O que se oferece num negócio, em duas regras. (1) Um negócio que não está aberto (ganho ou perdido) só se edita depois de reaberto: editar o título,
// as notas e o comercial, as condições da proposta e criar documentos não se oferecem; o ecrã mostra «Reabrir negócio» (ganho) ou «Anular perda»
// (perdido) e só depois os botões de editar. (2) Com a bandeira da migration B ligada, editar e o lixo seguem o que a ficha devolve PARA ESTE negócio
// (`pode_editar`, `pode_apagar`, `pode_restaurar`: o âmbito de cada um), em vez de uma permissão geral da página. Sem o campo (a base ainda não o
// devolve) nada se restringe mais do que antes, e o que a página já sabe (pessoas.delete) nunca se alarga: o campo só pode esconder.
import { useDadosNegocio, type DadosNegocio, type PermissoesDoNegocio } from "@/components/negocio-metas/costuraNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { useAlteracoesNegocios } from "@/components/negocio-metas/negociosAlterados";
import { usePermissoesPorNegocio } from "@/hooks/pessoas/bandeirasNegocio";

/** Em que estado fechado está o negócio (a perda da ficha também conta), ou `null` se está aberto. */
export function estadoFechado(negocio: NegocioMes, perda: unknown): "ganho" | "perdido" | null {
  if (perda !== undefined && perda !== null) return "perdido";
  if (negocio.estadoReal === "ganho" || negocio.estadoReal === "perdido") return negocio.estadoReal;
  const resultado = (negocio as { resultado?: unknown }).resultado;
  return resultado === "ganho" || resultado === "perdido" ? resultado : null;
}

export const negocioFechado = (negocio: NegocioMes, perda: unknown): boolean => estadoFechado(negocio, perda) !== null;

export interface AcoesDoNegocio {
  /** Ganho ou perdido: só se edita depois de reaberto. */
  fechado: boolean;
  /** Pode mexer neste negócio (perder, anular a perda, reabrir): permissão de edição, com o âmbito deste negócio quando a ficha o diz. */
  podeAgir: boolean;
  /** Pode editar o título, as notas, o comercial e as condições, e criar documentos: pode agir e o negócio está aberto. */
  podeEditar: boolean;
  podeApagar: boolean;
  podeRestaurar: boolean;
}

/** O que a ficha diz deste negócio, só com a bandeira ligada; senão (ou sem o campo) nada. */
function permissoesDoCampo(dados: DadosNegocio, negocioId: string, porNegocio: boolean): PermissoesDoNegocio {
  return porNegocio ? dados.permissoesNegocio?.(negocioId) ?? {} : {};
}

export function acoesDoNegocio(
  dados: DadosNegocio | null, negocio: NegocioMes, { perda, porNegocio }: { perda: unknown; porNegocio: boolean },
): AcoesDoNegocio {
  const fechado = negocioFechado(negocio, perda);
  if (!dados) return { fechado, podeAgir: false, podeEditar: false, podeApagar: false, podeRestaurar: false };
  const campo = permissoesDoCampo(dados, negocio.id, porNegocio);
  const podeAgir = dados.podeEditar === true && campo.editar !== false;
  const podeNoLixo = podeAgir && dados.podeApagar === true;
  return {
    fechado, podeAgir, podeEditar: podeAgir && !fechado,
    podeApagar: podeNoLixo && campo.apagar !== false, podeRestaurar: podeNoLixo && campo.restaurar !== false,
  };
}

/** Restaurar um negócio do lixo: a lista do lixo lê-se à parte (um negócio apagado não vem na ficha), por isso só vale o campo se a ficha o trouxe. */
export function podeRestaurarDoLixo(dados: DadosNegocio | null, negocioId: string, porNegocio: boolean): boolean {
  if (!dados) return false;
  const campo = permissoesDoCampo(dados, negocioId, porNegocio);
  return campo.restaurar !== false && campo.editar !== false;
}

export function useAcoesDoNegocio(negocio: NegocioMes): AcoesDoNegocio {
  const dados = useDadosNegocio();
  const perda = useAlteracoesNegocios().perdidos[negocio.id];
  return acoesDoNegocio(dados, negocio, { perda, porNegocio: usePermissoesPorNegocio() });
}
