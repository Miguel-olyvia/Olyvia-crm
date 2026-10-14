/**
 * O store dos fluxos 4, 5 e 7 de RH de exemplo (horario por tipo e versoes, alertas do fim do dia,
 * justificacoes, texto sensivel das faltas), a parte das fichas (`loja.ts`) e da gestao (`lojaGestao.ts`).
 * Em memoria; recarregar repoe tudo. `reporFluxosB()` volta ao inicial a partir das fichas actuais.
 */
import { useSyncExternalStore } from "react";
import { diaDaSemana, diaIso } from "@/components/rh-exemplo/dados/datas";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import type { EstadoRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { horariosIniciais } from "@/components/rh-exemplo/dados/horariosIniciaisB";
import { PRAZO_JUSTIFICACAO_FALTA_DIAS_UTEIS } from "@/components/rh-exemplo/lib/faltasB";
import type { AlertaDia, JustificacaoPicagem } from "@/components/rh-exemplo/lib/alertasFimDia";
import type { HorarioPessoa } from "@/components/rh-exemplo/lib/horarioTipos";

export interface AcessoTexto {
  faltaId: string;
  quem: string;
  quando: string;
}

export interface EstadoFluxosB {
  horarios: Record<string, HorarioPessoa>;
  alertas: AlertaDia[];
  justificacoesPicagem: JustificacaoPicagem[];
  /** Prazo da organizacao para justificar uma falta, em dias uteis. */
  prazoFaltaDias: number;
  /** O texto de justificacao de cada falta: sensivel, so se le com «Ver texto», que regista o acesso. */
  textosFalta: Record<string, string>;
  acessosTexto: AcessoTexto[];
}

function alerta(id: string, pessoaId: string, dias: number, campos: Partial<AlertaDia>): AlertaDia {
  return {
    id,
    pessoaId,
    data: diaIso(dias),
    tipo: "pendente_par",
    horaInicio: null,
    horaFim: null,
    minutos: null,
    distanciaM: null,
    estado: "pendente",
    motivo: null,
    tratadoPor: null,
    tratadoEm: null,
    ...campos,
  };
}

/**
 * O primeiro dia de trabalho da pessoa, a recuar a partir de `dias` (negativo). As horas realizadas de exemplo
 * so existem nos ultimos 14 dias, por isso um alerta de "planeado sem realizado" mais antigo e coerente com
 * os dados (e o prazo de 5 dias uteis ja passou: aparece a falta sugerida).
 */
function diaDeTrabalho(estado: EstadoRh, pessoaId: string, dias: number): number {
  const trabalha = new Set(
    (estado.fichas[pessoaId]?.horarioPlaneado ?? []).filter((l) => l.dia_semana !== null && l.data === null).map((l) => l.dia_semana),
  );
  let atual = dias;
  while (trabalha.size > 0 && !trabalha.has(diaDaSemana(diaIso(atual))) && atual > dias - 7) atual -= 1;
  return atual;
}

function alertasIniciais(estado: EstadoRh): AlertaDia[] {
  return [
    alerta("alb-sofia", "p-sofia", -1, { tipo: "pendente_par", horaInicio: "14:00:00" }),
    alerta("alb-hugo", "p-hugo", diaDeTrabalho(estado, "p-hugo", -16), { tipo: "planeado_sem_realizado", horaInicio: "09:00:00", horaFim: "13:00:00", minutos: 240 }),
    alerta("alb-ines", "p-ines", -5, { tipo: "realizado_sem_planeado", horaInicio: "18:00:00", horaFim: "19:30:00", minutos: 90 }),
    alerta("alb-rui", "p-rui", -1, { tipo: "pendente_par", horaInicio: "14:00:00" }),
    alerta("alb-carolina", "p-carolina", diaDeTrabalho(estado, "p-carolina", -15), { tipo: "parcialmente_realizado", horaInicio: "09:00:00", horaFim: "13:00:00", minutos: 75 }),
    alerta("alb-tiago", "p-tiago", -2, { tipo: "fora_do_local", distanciaM: 640 }),
    alerta("alb-andre", "p-andre", -2, { tipo: "pendente_par", horaInicio: "14:00:00", estado: "justificacao_recebida" }),
  ];
}

function justificacoesIniciais(): JustificacaoPicagem[] {
  return [
    {
      id: "jpb-andre",
      alertaId: "alb-andre",
      pessoaId: "p-andre",
      horaReal: "18:00",
      motivo: "Esqueci-me de picar a saída, saí às 18:00 depois de fechar o armazém.",
      anexoNome: null,
      enviadaEm: `${diaIso(-1)}T09:30:00.000Z`,
      estado: "pendente",
      decididaPor: null,
      decididaEm: null,
      motivoRecusa: null,
    },
  ];
}

export function criarFluxosBInicial(estado: EstadoRh): EstadoFluxosB {
  return {
    horarios: horariosIniciais(estado),
    alertas: alertasIniciais(estado),
    justificacoesPicagem: justificacoesIniciais(),
    prazoFaltaDias: PRAZO_JUSTIFICACAO_FALTA_DIAS_UTEIS,
    textosFalta: {
      "fa-tiago": "Consulta de urgência no centro de saúde. O atestado vai entregue ao RH.",
      "fa-hugo": "Acompanhei um familiar a uma consulta marcada há meses.",
    },
    acessosTexto: [],
  };
}

let estado: EstadoFluxosB = criarFluxosBInicial(lerEstado());
let contador = 0;
const ouvintes = new Set<() => void>();

export function lerFluxosB(): EstadoFluxosB {
  return estado;
}

export function subscreverFluxosB(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Substitui o estado por uma copia alterada (nunca se muta o estado actual). */
export function definirFluxosB(alterar: (actual: EstadoFluxosB) => EstadoFluxosB): void {
  estado = alterar(estado);
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function reporFluxosB(): void {
  estado = criarFluxosBInicial(lerEstado());
  contador = 0;
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** Um identificador novo, estavel dentro da sessao. */
export function novoIdB(prefixo: string): string {
  contador += 1;
  return `${prefixo}-b${contador}`;
}

/** Le uma fatia do estado. O selector tem de devolver sempre a mesma referencia se nada mudou. */
export function useFluxosB<T>(selector: (e: EstadoFluxosB) => T): T {
  return useSyncExternalStore(subscreverFluxosB, () => selector(estado), () => selector(estado));
}
