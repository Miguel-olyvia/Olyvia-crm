// Verificação de margem de um orçamento. Espelho de public.fn_margem_verificar_calc.
// A base manda (rpc_margem_verificar); isto serve para mostrar o mesmo no ecrã
// antes de gravar e para os testes.
//
// Por linha: receita = total sem IVA × (1 − desconto global); custo = custo unitário × qt.
//   • preço abaixo do custo            → bloqueio  'abaixo_custo' (nunca se aprova)
//   • margem abaixo do mínimo da linha → aprovação 'abaixo_minimo' (ou
//     'desconto_come_margem', quando só o desconto global a põe abaixo)
//   • linha com preço e sem custo      → aviso     'sem_custo'
// No total: margem abaixo da mínima geral → aprovação 'margem_total'
// (só se nenhuma linha já pedir aprovação nem bloquear).

import { formatarEur as eur, formatarPct } from "./formatar";

export type NivelAlerta = "bloqueio" | "aprovacao" | "aviso";
export type TipoAlerta =
  | "abaixo_custo"
  | "abaixo_minimo"
  | "desconto_come_margem"
  | "margem_total"
  | "sem_custo"
  | "sem_receita"
  | "sem_custo_hora"
  | "custo_desatualizado"
  | "consumivel_sem_preco";

export interface AlertaMargem {
  tipo: TipoAlerta;
  nivel: NivelAlerta;
  mensagem: string;
  linha_id?: string;
  linha?: string;
  preco?: number;
  custo?: number;
  margem?: number | null;
  margem_minima?: number;
}

export type EstadoMargem = "ok" | "precisa_aprovacao" | "aguarda_aprovacao" | "aprovado" | "recusado" | "bloqueado";

export interface AprovacaoMargem {
  id: string;
  estado: "pendente" | "aprovada" | "recusada" | "anulada";
  margem: number | null;
  margem_linha_min?: number | null;
  motivo?: string;
  pedida_em?: string;
  decidida_em?: string | null;
  motivo_decisao?: string | null;
}

/** O que rpc_margem_verificar devolve. */
export interface VerificacaoMargem {
  quote_id?: string;
  quote_number?: string | null;
  estado: EstadoMargem;
  pode_enviar: boolean;
  precisa_aprovacao: boolean;
  bloqueado: boolean;
  preco_total: number;
  custo_total: number;
  margem_total: number | null;
  margem_linha_min: number | null;
  margem_minima: number | null;
  desconto_global: number;
  aprovacao: AprovacaoMargem | null;
  alertas: AlertaMargem[];
}

export interface LinhaOrcamento {
  id: string;
  nome: string;
  qt: number;
  totalSemIva: number;
  /** custo_material_unit + custo_mao_obra_unit (ou cost_price, quando esses são 0). */
  custoUnit: number;
  margemMinima: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (x: number) => String(r2(x)).replace(".", ",");

export function verificarMargem(
  linhas: LinhaOrcamento[],
  opcoes: { descontoGlobal?: number; margemMinimaGeral: number; aprovacao?: AprovacaoMargem | null },
): VerificacaoMargem {
  const desconto = opcoes.descontoGlobal ?? 0;
  const fator = 1 - desconto / 100;
  const alertas: AlertaMargem[] = [];
  let totRev = 0;
  let totCusto = 0;
  let bloqueio = false;
  let aprovacao = false;
  let linhaMin: number | null = null;
  let minExigida: number | null = null;

  for (const l of linhas) {
    const revBruto = l.totalSemIva || 0;
    const rev = revBruto * fator;
    const custo = (l.custoUnit || 0) * (l.qt ?? 1);
    if (!(l.custoUnit > 0)) {
      if (revBruto > 0)
        alertas.push({ tipo: "sem_custo", nivel: "aviso", linha_id: l.id, linha: l.nome, mensagem: `${l.nome}: custo desconhecido.` });
      continue;
    }
    totRev += rev;
    totCusto += custo;
    if (rev < custo) {
      bloqueio = true;
      alertas.push({
        tipo: "abaixo_custo", nivel: "bloqueio", linha_id: l.id, linha: l.nome, preco: r2(rev), custo: r2(custo),
        margem: rev > 0 ? r2(((rev - custo) / rev) * 100) : null,
        mensagem: `${l.nome}: o preço (${eur(rev)} €) não cobre o custo (${eur(custo)} €). Não se envia assim.`,
      });
      continue;
    }
    const m = ((rev - custo) / rev) * 100;
    linhaMin = linhaMin == null ? m : Math.min(linhaMin, m);
    if (m < l.margemMinima) {
      aprovacao = true;
      minExigida = Math.max(minExigida ?? 0, l.margemMinima);
      const mBruta = revBruto > 0 ? ((revBruto - custo) / revBruto) * 100 : null;
      const base = { nivel: "aprovacao" as const, linha_id: l.id, linha: l.nome, preco: r2(rev), custo: r2(custo), margem: r2(m), margem_minima: l.margemMinima };
      if (fator < 1 && mBruta != null && mBruta >= l.margemMinima) {
        alertas.push({ ...base, tipo: "desconto_come_margem",
          mensagem: `O desconto de ${num(desconto)}% deixa ${l.nome} com ${formatarPct(m)}% de margem (mínimo ${num(l.margemMinima)}%).` });
      } else {
        alertas.push({ ...base, tipo: "abaixo_minimo",
          mensagem: `${l.nome}: margem de ${formatarPct(m)}%, abaixo do mínimo de ${num(l.margemMinima)}% da linha de serviço. Precisa da aprovação da Direção.` });
      }
    }
  }

  const margemTotal = totRev > 0 ? ((totRev - totCusto) / totRev) * 100 : null;
  if (margemTotal != null && !aprovacao && !bloqueio && margemTotal < opcoes.margemMinimaGeral) {
    aprovacao = true;
    minExigida = opcoes.margemMinimaGeral;
    alertas.push({ tipo: "margem_total", nivel: "aprovacao", margem: r2(margemTotal), margem_minima: opcoes.margemMinimaGeral,
      mensagem: `Margem total de ${formatarPct(margemTotal)}%, abaixo do mínimo geral de ${num(opcoes.margemMinimaGeral)}%.` });
  }

  const ap = opcoes.aprovacao && opcoes.aprovacao.estado !== "anulada" ? opcoes.aprovacao : null;
  let estado: EstadoMargem;
  if (bloqueio) estado = "bloqueado";
  else if (!aprovacao) estado = "ok";
  else if (!ap) estado = "precisa_aprovacao";
  else if (ap.estado === "pendente") estado = "aguarda_aprovacao";
  else if (ap.estado === "aprovada" && (margemTotal ?? 0) >= (ap.margem ?? 0) - 0.01
           && (linhaMin ?? 100) >= (ap.margem_linha_min ?? -1000) - 0.01) estado = "aprovado";
  else if (ap.estado === "recusada") estado = "recusado";
  else estado = "precisa_aprovacao";

  return {
    estado,
    pode_enviar: estado === "ok" || estado === "aprovado",
    precisa_aprovacao: aprovacao && !bloqueio,
    bloqueado: bloqueio,
    preco_total: r2(totRev),
    custo_total: r2(totCusto),
    margem_total: margemTotal == null ? null : r2(margemTotal),
    margem_linha_min: linhaMin == null ? null : r2(linhaMin),
    margem_minima: minExigida,
    desconto_global: desconto,
    aprovacao: ap,
    alertas,
  };
}

/** O que o botão "Enviar proposta" deve fazer com o resultado de rpc_margem_verificar. */
export type AcaoEnvio = "enviar" | "pedir_aprovacao" | "aguardar" | "corrigir_preco";
export function acaoEnvio(v: Pick<VerificacaoMargem, "estado">): AcaoEnvio {
  switch (v.estado) {
    case "ok":
    case "aprovado":
      return "enviar";
    case "aguarda_aprovacao":
      return "aguardar";
    case "bloqueado":
      return "corrigir_preco";
    default:
      return "pedir_aprovacao"; // precisa_aprovacao e recusado (pode pedir de novo, com outro motivo)
  }
}

export const ESTADO_MARGEM_TEXTO: Record<EstadoMargem, string> = {
  ok: "Margem dentro do mínimo",
  precisa_aprovacao: "Precisa da aprovação da Direção",
  aguarda_aprovacao: "À espera da aprovação da Direção",
  aprovado: "Aprovado pela Direção",
  recusado: "Recusado pela Direção",
  bloqueado: "Bloqueado: preço abaixo do custo",
};
