/**
 * O store em memória das horas extra, do banco de horas e do fecho do mês (frente C), à parte dos outros:
 * `loja.ts` (fichas) e `lojaGestao.ts` (gestão) ficam como estão. Recarregar repõe tudo; `reporFluxosC()` serve os testes.
 */
import { useSyncExternalStore } from "react";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { limiteAnualMin } from "./limitePessoa";
import { validarMovimento, type MovimentoBanco, type ResultadoMovimento } from "./bancoHorasRegras";
import { criarEstadoFluxosC, type EstadoFluxosC } from "./dadosFluxosC";
import { comFechoDeAgosto } from "./fechoAgostoExemplo";
import {
  avaliarCandidata, avaliarLimites, decidirHoraExtra, tempoAMaisPorTipo,
  type EntradaTempoAMais, type HoraExtra, type LimitesHE, type RegrasPagamentoHE, type ResultadoDecisao, type ResultadoPipeline,
} from "./horasExtraRegras";
import { fecharMes, reabrirMes, type FechoMes, type ReciboCongelado, type ResultadoReabrir } from "./salarioFecho";

let estado: EstadoFluxosC = comFechoDeAgosto(criarEstadoFluxosC());
let contador = 0;
const ouvintes = new Set<() => void>();

const avisar = (): void => ouvintes.forEach((o) => o());
export const lerFluxosC = (): EstadoFluxosC => estado;
export function subscreverFluxosC(o: () => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}
function definir(alterar: (e: EstadoFluxosC) => EstadoFluxosC): void {
  estado = alterar(estado);
  avisar();
}
export function reporFluxosC(): void {
  estado = comFechoDeAgosto(criarEstadoFluxosC());
  contador = 0;
  avisar();
}
const novoIdC = (prefixo: string): string => `${prefixo}-c${(contador += 1)}`;

export function useFluxosC<T>(selector: (e: EstadoFluxosC) => T): T {
  return useSyncExternalStore(subscreverFluxosC, () => selector(estado), () => selector(estado));
}

/** Quem está a decidir: a pessoa «eu» da apresentação. */
export function nomeDeQuemDecide(): string {
  const e = lerEstado();
  return (e.minhaPessoaId && e.fichas[e.minhaPessoaId]?.pessoa.nome_completo) || "RH";
}

export function definirPodeHorasExtra(pessoaId: string, pode: boolean): void {
  definir((e) => ({ ...e, podeHE: { ...e.podeHE, [pessoaId]: pode } }));
}

export function definirLimitesHorasExtra(limites: LimitesHE): void {
  definir((e) => ({ ...e, limites }));
}

/** Os coeficientes de pagamento (Processamento salarial > Configuração): o cálculo do mês usa-os de imediato. */
export function definirRegrasPagamentoHE(regras: RegrasPagamentoHE): void {
  definir((e) => ({ ...e, regras }));
}

export function decidirHoraExtraNaLoja(id: string, decisao: "confirmar" | "rejeitar", motivo: string): ResultadoDecisao {
  const hora = estado.horasExtra.find((h) => h.id === id);
  if (!hora) return { ok: false, erro: "ja_decidida" };
  const r = decidirHoraExtra(hora, decisao, motivo, nomeDeQuemDecide());
  if (r.ok) definir((e) => ({ ...e, horasExtra: e.horasExtra.map((h) => (h.id === id ? r.hora : h)) }));
  return r;
}

export interface PedidoTempoAMais extends EntradaTempoAMais {
  pessoaId: string;
  data: string;
  nocturnoMin: number;
  motivoOrigem: string;
}

export interface RespostaTempoAMais {
  resultado: ResultadoPipeline;
  minutos: number;
  criadas: number;
  acimaDoLimiteMin: number;
  alerta: boolean;
}

const naoRejeitada = (h: HoraExtra): boolean => h.estado !== "rejeitada";

/** O pipeline do fluxo 6, ponta a ponta, para um tempo a mais. Cria 0, 1 ou 2 pendentes. */
export function registarTempoAMais(p: PedidoTempoAMais): RespostaTempoAMais {
  const { minutos, origem } = tempoAMaisPorTipo(p);
  const resultado = avaliarCandidata(minutos, estado.podeHE[p.pessoaId] === true, estado.limites.minimoMin);
  const nenhuma: RespostaTempoAMais = { resultado, minutos, criadas: 0, acimaDoLimiteMin: 0, alerta: false };
  if (resultado !== "cria_pendente" || !origem) return nenhuma;
  const dela = estado.horasExtra.filter((h) => h.pessoaId === p.pessoaId && naoRejeitada(h));
  const ava = avaliarLimites(minutos, {
    jaNoDiaMin: dela.filter((h) => h.data === p.data).reduce((s, h) => s + h.minutos, 0),
    jaNoAnoMin: dela.filter((h) => h.data.slice(0, 4) === p.data.slice(0, 4)).reduce((s, h) => s + h.minutos, 0),
  }, { ...estado.limites, anoMin: limiteAnualMin(lerEstado().fichas[p.pessoaId], estado.limites.anoMin) });
  const nocNormal = Math.min(p.nocturnoMin, ava.normaisMin);
  const parte = (min: number, noc: number, acima: boolean): HoraExtra => ({
    id: novoIdC("he"), pessoaId: p.pessoaId, data: p.data, minutos: min, nocturnoMin: noc, origem,
    motivoOrigem: p.motivoOrigem, estado: "pendente", acimaDoLimite: acima, motivoDecisao: null, decididoPor: null,
  });
  const novas = [
    ...(ava.normaisMin > 0 ? [parte(ava.normaisMin, nocNormal, false)] : []),
    ...(ava.acimaDoLimiteMin > 0 ? [parte(ava.acimaDoLimiteMin, Math.max(0, p.nocturnoMin - nocNormal), true)] : []),
  ];
  definir((e) => ({ ...e, horasExtra: [...e.horasExtra, ...novas] }));
  return { ...nenhuma, criadas: novas.length, acimaDoLimiteMin: ava.acimaDoLimiteMin, alerta: ava.alertaDia || ava.alertaAno };
}

export function adicionarMovimentoBanco(pessoaId: string, deltaMin: number, motivo: string): ResultadoMovimento {
  const saldo = estado.banco.filter((m) => m.pessoaId === pessoaId).reduce((s, m) => s + m.minutos, 0);
  const r = validarMovimento(saldo, deltaMin, motivo, estado.limitesBanco);
  if (!r.ok) return r;
  const mov: MovimentoBanco = { id: novoIdC("bh"), pessoaId, data: hojeIso(), minutos: deltaMin, motivo: motivo.trim(), origem: "manual" };
  definir((e) => ({ ...e, banco: [...e.banco, mov] }));
  return r;
}

export type ErroPontual = "mes_fechado" | "descricao" | "valor";

export function adicionarPontual(pessoaId: string, mes: string, descricao: string, valor: number): ErroPontual | null {
  if (estado.fechos[mes]) return "mes_fechado";
  if (!descricao.trim()) return "descricao";
  if (!Number.isFinite(valor) || valor === 0 || Math.abs(valor) > 1_000_000) return "valor";
  definir((e) => ({ ...e, pontuais: [...e.pontuais, { id: novoIdC("pt"), pessoaId, mes, descricao: descricao.trim(), valor }] }));
  return null;
}

export function fecharMesNaLoja(mes: string, recibos: readonly ReciboCongelado[]): FechoMes | null {
  if (estado.fechos[mes]) return null;
  const fecho = fecharMes(mes, nomeDeQuemDecide(), new Date().toISOString(), recibos);
  definir((e) => ({ ...e, fechos: { ...e.fechos, [mes]: fecho } }));
  return fecho;
}

export function reabrirMesNaLoja(mes: string, motivo: string, autorizado: boolean): ResultadoReabrir {
  const fecho = estado.fechos[mes];
  if (!fecho) return { ok: false, erro: "sem_autorizacao" };
  const r = reabrirMes(fecho, nomeDeQuemDecide(), new Date().toISOString(), motivo, autorizado);
  if (r.ok) {
    definir((e) => ({
      ...e,
      fechos: Object.fromEntries(Object.entries(e.fechos).filter(([chave]) => chave !== mes)),
      reaberturas: [...e.reaberturas, r.registo],
    }));
  }
  return r;
}
