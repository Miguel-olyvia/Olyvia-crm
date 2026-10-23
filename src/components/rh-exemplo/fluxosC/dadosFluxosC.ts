/**
 * Dados de exemplo das horas extra, do banco de horas e do processamento salarial (frente C).
 * Tudo cai no MÊS ATUAL (e o histórico anual da Sofia no mês de Janeiro), para os ecrãs nunca ficarem vazios.
 */
import { MES_PROCESSAVEL, PODE_HE_EXEMPLO, todasAsSaidasGeradas } from "@/components/rh-exemplo/dados/assiduidadeSetembro";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { LIMITES_BANCO_OMISSAO, type LimitesBanco, type MovimentoBanco } from "./bancoHorasRegras";
import { LIMITES_OMISSAO, REGRAS_PAGAMENTO_OMISSAO, type HoraExtra, type LimitesHE, type RegrasPagamentoHE } from "./horasExtraRegras";
import type { FechoMes, Reabertura } from "./salarioFecho";
import type { Pontual } from "./salarioRegras";

export interface EstadoFluxosC {
  podeHE: Record<string, boolean>;
  limites: LimitesHE;
  regras: RegrasPagamentoHE;
  horasExtra: HoraExtra[];
  banco: MovimentoBanco[];
  limitesBanco: LimitesBanco;
  pontuais: Pontual[];
  fechos: Record<string, FechoMes>;
  reaberturas: Reabertura[];
}

export const mesAtual = (): string => hojeIso().slice(0, 7);

function he(id: string, pessoaId: string, dia: string, minutos: number, p: Partial<HoraExtra> = {}): HoraExtra {
  return {
    id, pessoaId, data: dia, minutos, nocturnoMin: 0, origem: "diaria", motivoOrigem: "", estado: "pendente",
    acimaDoLimite: false, motivoDecisao: null, decididoPor: null, ...p,
  };
}

/** O acumulado do ano da Sofia, em Janeiro; o resto das horas extra vem do gerador da assiduidade (Agosto em diante). */
function horasExtraIniciais(): HoraExtra[] {
  const ano = hojeIso().slice(0, 4);
  const doAno = he("he-sofia-ano", "p-sofia", `${ano}-01-15`, 116 * 60, { estado: "confirmada", motivoOrigem: "acumulado do ano (exemplo)", decididoPor: "Sofia Rebelo" });
  return [doAno, ...todasAsSaidasGeradas().flatMap((s) => s.horasExtra)];
}

/** Os movimentos do banco de horas: so quem tem horario de banco de horas os tem (vêm do gerador). */
function bancoInicial(): MovimentoBanco[] {
  return todasAsSaidasGeradas().flatMap((s) => s.banco);
}

export function criarEstadoFluxosC(): EstadoFluxosC {
  return {
    podeHE: { ...PODE_HE_EXEMPLO },
    limites: { ...LIMITES_OMISSAO },
    regras: { ...REGRAS_PAGAMENTO_OMISSAO },
    horasExtra: horasExtraIniciais(),
    banco: bancoInicial(),
    limitesBanco: { ...LIMITES_BANCO_OMISSAO },
    pontuais: [{ id: "pt-1", pessoaId: "p-rui", mes: MES_PROCESSAVEL, descricao: "Prémio de objectivos", valor: 30 }],
    fechos: {},
    reaberturas: [],
  };
}
