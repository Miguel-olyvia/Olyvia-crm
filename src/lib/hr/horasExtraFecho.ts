/**
 * O que o fecho da folha faz com as horas extra APROVADAS antes de gravar (sem React). A base, com a contagem ligada no periodo,
 * recusa o fecho se houver horas extra pendentes ou se a `horas_extra_assinatura` do resultado nao for a das horas extra de agora.
 *
 * REGRA: o que segue no resultado e SEMPRE a chave do CALCULO (a assinatura que o calculo leu, e so quando o calculo foi em modo
 * aprovadas/misto), nunca a assinatura lida agora. A assinatura fresca serve so para CONFERIR: se difere da do calculo, as horas
 * extra mudaram depois de calcular e nao se fecha. Assim um calculo em bruto nunca se grava com a contagem ligada: ou o
 * interruptor mudou depois do calculo (reler o interruptor aqui apanha-o), ou o cliente nao pode ler as horas extra (recusa) e
 * o resultado segue sem assinatura, que a base recusa com a contagem ligada.
 *
 * Uma base sem a RPC (migration por aplicar) nao tem horas extra aprovadas: segue sem assinaturas. Sem permissao (42501) a
 * base decide.
 */
import { lerAssinaturasDeHorasExtra, lerHorasExtraDoPeriodo } from "@/lib/hr/horasExtraContagemRpc";
import { rpcDeDesviosIndisponivel } from "@/lib/hr/desviosBase";
import type { FonteHorasExtra } from "@/lib/hr/horasExtraRelatorio";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";

export type PreparacaoHorasExtraDoFecho =
  | { ok: true; assinaturas: Map<string, string> }
  /** As horas extra de `mudou` pessoas ja nao sao as que o calculo leu: reler, recalcular e fechar de novo. */
  | { ok: false; motivo: "mudaram"; mudou: number }
  /** A contagem das horas extra aprovadas foi ligada (ou mudou de data) depois do calculo: este foi feito sem as confirmadas. */
  | { ok: false; motivo: "sem_confirmadas" }
  | { ok: false; motivo: "erro"; texto: string };

const recusadoPorPermissao = (erro: unknown): boolean => (erro as { code?: unknown } | null)?.code === "42501";

/** Quantas pessoas tem agora uma assinatura diferente da que o calculo leu (ausente = vazia). */
export function pessoasComHorasExtraMudadas(
  calculadas: ReadonlyMap<string, string>,
  atuais: ReadonlyMap<string, string>,
): number {
  let mudou = 0;
  for (const [pessoaId, usada] of calculadas) if ((atuais.get(pessoaId) ?? "") !== usada) mudou += 1;
  return mudou;
}

export interface ArgsPrepararFechoHorasExtra {
  periodoId: string;
  /**
   * A chave de horas extra que o calculo leu, de TODAS as pessoas obrigatorias cuja leitura correu (vazia = sem linhas). Quem
   * foi recusado por permissao nao entra: nao se sabe o que o calculo viu.
   */
  calculadas?: ReadonlyMap<string, string>;
  /**
   * Uma pessoa cujo calculo leu o interruptor, e o que leu (`null` = desligado): volta a le-lo; se mudou, o calculo e anterior a
   * contagem ligada e nao se fecha. Sem referencia (todas recusadas) nao se confere: a base decide.
   */
  referencia?: { organizationId: string; pessoaId: string; de: string; ate: string; desdeCalculo: string | null };
}

export async function prepararFechoComHorasExtra(args: ArgsPrepararFechoHorasExtra): Promise<PreparacaoHorasExtraDoFecho> {
  try {
    if (args.referencia) {
      const r = args.referencia;
      try {
        const agora = await lerHorasExtraDoPeriodo(r.organizationId, r.pessoaId, r.de, r.ate);
        if (agora.aprovacaoDesde !== r.desdeCalculo) return { ok: false, motivo: "sem_confirmadas" };
      } catch (erro) {
        // Sem a RPC ou sem permissao: nao se sabe; a base decide. Qualquer outro erro impede o fecho.
        if (!rpcDeDesviosIndisponivel(erro, "rpc_hr_horas_extra_do_periodo") && !recusadoPorPermissao(erro)) throw erro;
      }
    }
    const assinaturas = await lerAssinaturasDeHorasExtra(args.periodoId);
    const mudou = args.calculadas ? pessoasComHorasExtraMudadas(args.calculadas, assinaturas) : 0;
    if (mudou > 0) return { ok: false, motivo: "mudaram", mudou };
    return { ok: true, assinaturas };
  } catch (erro) {
    if (rpcDeDesviosIndisponivel(erro, "rpc_hr_horas_extra_assinaturas") || recusadoPorPermissao(erro)) {
      return { ok: true, assinaturas: new Map() };
    }
    captureFlowError(erro, "hr-horas-extra-listar");
    return { ok: false, motivo: "erro", texto: getLocalizedFallback("rhProcReal.fecho.erroHorasExtra") };
  }
}

/** O que o calculo de uma pessoa leu das horas extra (os campos de `TotaisRelatorioMensal`). */
export interface TotaisHorasExtraDoCalculo {
  horasExtraFonte?: FonteHorasExtra;
  horasExtraChave?: string;
  horasExtraAprovacaoDesde?: string | null;
  horasExtraRecusadas?: boolean;
  horasExtraNaoLidas?: boolean;
}

/**
 * Os argumentos da preparacao do fecho: TODAS as pessoas obrigatorias cujo calculo leu as horas extra entram em `calculadas` (com
 * a chave que leu, vazia se nao tinham linhas; as calculadas em bruto tambem), e a primeira que leu o interruptor serve de
 * referencia para o reler. Quem foi recusado por permissao (ou nao se leu) fica de fora: nao se sabe o que o calculo viu.
 */
export function argsDoFechoDeHorasExtra(a: {
  organizationId: string;
  periodoId: string;
  de: string;
  ate: string;
  obrigatorias: readonly string[];
  totaisDe: (pessoaId: string) => TotaisHorasExtraDoCalculo | undefined;
}): ArgsPrepararFechoHorasExtra {
  const calculadas = new Map<string, string>();
  let referencia: ArgsPrepararFechoHorasExtra["referencia"];
  for (const pessoaId of a.obrigatorias) {
    const t = a.totaisDe(pessoaId);
    if (!t || t.horasExtraRecusadas === true || t.horasExtraNaoLidas === true) continue;
    calculadas.set(pessoaId, t.horasExtraChave ?? "");
    if (!referencia && t.horasExtraAprovacaoDesde !== undefined) {
      referencia = { organizationId: a.organizationId, pessoaId, de: a.de, ate: a.ate, desdeCalculo: t.horasExtraAprovacaoDesde };
    }
  }
  return { periodoId: a.periodoId, calculadas, referencia };
}

/**
 * O que segue em `horas_extra_assinatura`: a chave do CALCULO, so quando este foi em modo aprovadas/misto e ha chave; senao nada.
 * Nunca a assinatura lida agora: um calculo em bruto com a contagem ligada nao pode apresentar uma assinatura valida.
 */
export function assinaturaDeHorasExtraDoCalculo(t: TotaisHorasExtraDoCalculo | undefined): string | null {
  const aprovadas = t?.horasExtraFonte === "aprovadas" || t?.horasExtraFonte === "misto";
  return aprovadas && t?.horasExtraChave ? t.horasExtraChave : null;
}