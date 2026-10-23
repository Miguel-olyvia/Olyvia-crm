/**
 * Quem vê o ponto decide o que pode fazer (fluxo 5): a pessoa que se esqueceu de picar JUSTIFICA, em 5 dias úteis, com
 * o motivo e a hora real; só o RH corrige, pede justificação, marca falta ou aceita a diferença. Por isso, na vista da
 * própria pessoa («A minha área») os poderes do RH desaparecem, mesmo que a conta os tenha.
 */
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import type { AlertaDia, JustificacaoPicagem } from "./alertasFimDia";
import { situacaoDoPrazo } from "./alertasFimDia";

/** As permissões que a vista da própria pessoa mantém: ler. Tudo o que escreve no ponto de alguém fica com o RH. */
export function permissoesDaVista(permissoes: PermissoesAssiduidade, souAPessoa: boolean): PermissoesAssiduidade {
  if (!souAPessoa) return permissoes;
  return {
    ...permissoes,
    picarOutros: false,
    gerir: false,
    corrigir: false,
    faltasEdit: false,
    justificacaoEdit: false,
    validarRealizado: false,
    obrasRegistar: false,
  };
}

export interface JustificacaoEnviadaDoDia {
  justificacao: JustificacaoPicagem;
  alerta: AlertaDia;
}

export interface JustificacoesDoDia {
  /** Picagens em falta (ou por emparelhar) deste dia ainda dentro dos 5 dias úteis: a pessoa pode justificar. */
  porJustificar: AlertaDia[];
  /** As justificações já enviadas para este dia, com o estado (pendente, aceite, recusada). */
  enviadas: JustificacaoEnviadaDoDia[];
}

/** O que a pessoa pode justificar, e o que já justificou, num dia. Função pura: recebe tudo o que precisa. */
export function justificacoesDoDia(
  alertas: readonly AlertaDia[],
  justificacoes: readonly JustificacaoPicagem[],
  pessoaId: string,
  data: string,
  hoje: string,
): JustificacoesDoDia {
  const doDia = alertas.filter((a) => a.pessoaId === pessoaId && a.data === data);
  return {
    porJustificar: doDia.filter((a) => situacaoDoPrazo(a, hoje) === "dentro_do_prazo"),
    enviadas: justificacoes
      .filter((j) => j.pessoaId === pessoaId)
      .flatMap((justificacao) => {
        const alerta = doDia.find((a) => a.id === justificacao.alertaId);
        return alerta ? [{ justificacao, alerta }] : [];
      }),
  };
}
