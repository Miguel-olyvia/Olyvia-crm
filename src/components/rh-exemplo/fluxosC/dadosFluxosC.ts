/**
 * Dados de exemplo das horas extra, do banco de horas e do processamento salarial (frente C).
 * Tudo cai no MÊS ATUAL (e o histórico anual da Sofia no mês de Janeiro), para os ecrãs nunca ficarem vazios.
 */
import { diaIso, hojeIso } from "@/components/rh-exemplo/dados/datas";
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
  /** Minutos de falta marcada no mês, por pessoa (a vir do ecrã de faltas; aqui, exemplo fixo). */
  faltasMin: Record<string, number>;
  fechos: Record<string, FechoMes>;
  reaberturas: Reabertura[];
}

export const mesAtual = (): string => hojeIso().slice(0, 7);

const diaDoMes = (dia: number): string => `${mesAtual()}-${String(dia).padStart(2, "0")}`;

function he(id: string, pessoaId: string, dia: string, minutos: number, p: Partial<HoraExtra> = {}): HoraExtra {
  return {
    id, pessoaId, data: dia, minutos, nocturnoMin: 0, origem: "diaria", motivoOrigem: "", estado: "pendente",
    acimaDoLimite: false, motivoDecisao: null, decididoPor: null, ...p,
  };
}

function horasExtraIniciais(): HoraExtra[] {
  const ano = hojeIso().slice(0, 4);
  const rh = "Sofia Rebelo";
  return [
    he("he-sofia-ano", "p-sofia", `${ano}-01-15`, 116 * 60, { estado: "confirmada", motivoOrigem: "acumulado do ano (exemplo)", decididoPor: rh }),
    he("he-sofia-1", "p-sofia", diaDoMes(3), 120, { estado: "confirmada", motivoOrigem: "fecho de inventário, saiu às 20:00", decididoPor: rh }),
    he("he-sofia-2", "p-sofia", diaDoMes(5), 90, { motivoOrigem: "saiu às 19:30" }),
    he("he-sofia-3", "p-sofia", diaDoMes(9), 60, { acimaDoLimite: true, motivoOrigem: "3 h a mais: passa as 2 h por dia" }),
    he("he-sofia-4", "p-sofia", diaDoMes(2), 40, { estado: "rejeitada", motivoOrigem: "saiu às 18:40", motivoDecisao: "Foi tempo de formação, não trabalho extra", decididoPor: rh }),
    he("he-rui-1", "p-rui", diaDoMes(6), 90, { estado: "confirmada", nocturnoMin: 40, motivoOrigem: "inventário nocturno", decididoPor: rh }),
    he("he-rui-2", "p-rui", diaDoMes(7), 480, { estado: "confirmada", origem: "feriado", motivoOrigem: "feriado trabalhado", decididoPor: rh }),
    he("he-hugo-1", "p-hugo", diaDoMes(8), 120, { estado: "confirmada", origem: "descanso", motivoOrigem: "domingo de descanso trabalhado", decididoPor: rh }),
    he("he-hugo-2", "p-hugo", diaDoMes(4), 30, { estado: "rejeitada", motivoOrigem: "saiu às 18:30", motivoDecisao: "Sem autorização da chefia", decididoPor: rh }),
    he("he-tiago-1", "p-tiago", diaDoMes(11), 60, { motivoOrigem: "saiu às 19:00" }),
    he("he-andre-1", "p-andre", diaDoMes(10), 45, { motivoOrigem: "descarga de camião fora de horas" }),
    he("he-andre-2", "p-andre", diaDoMes(1), 150, { estado: "confirmada", origem: "semanal", motivoOrigem: "semana com 2 h 30 a mais", decididoPor: rh }),
  ];
}

function bancoInicial(): MovimentoBanco[] {
  const m = (id: string, pessoaId: string, dias: number, minutos: number, motivo: string): MovimentoBanco => ({
    id, pessoaId, data: diaIso(dias), minutos, motivo, origem: "automatico",
  });
  return [
    m("bh-s-1", "p-sofia", -340, 600, "Saldo de abertura"),
    m("bh-s-2", "p-sofia", -20, 60, "Dia com 9 h feitas (8 h planeadas)"),
    m("bh-s-3", "p-sofia", -18, -60, "Dia com 7 h feitas (8 h planeadas)"),
    m("bh-s-4", "p-sofia", -10, -480, "Folga gozada por banco de horas"),
    m("bh-s-5", "p-sofia", -5, 60, "Dia com 9 h feitas (8 h planeadas)"),
    m("bh-a-1", "p-andre", -30, 120, "Sábado de inventário"),
    m("bh-a-2", "p-andre", -10, -60, "Saída mais cedo acordada"),
  ];
}

export function criarEstadoFluxosC(): EstadoFluxosC {
  return {
    podeHE: { "p-sofia": true, "p-rui": true, "p-ines": true, "p-tiago": true, "p-hugo": true, "p-andre": true },
    limites: { ...LIMITES_OMISSAO },
    regras: { ...REGRAS_PAGAMENTO_OMISSAO },
    horasExtra: horasExtraIniciais(),
    banco: bancoInicial(),
    limitesBanco: { ...LIMITES_BANCO_OMISSAO },
    pontuais: [{ id: "pt-1", pessoaId: "p-rui", mes: mesAtual(), descricao: "Prémio de objectivos", valor: 30 }],
    faltasMin: { "p-hugo": 120, "p-carolina": 480 },
    fechos: {},
    reaberturas: [],
  };
}
