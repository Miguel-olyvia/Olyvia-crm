/**
 * O store, em memória, do custo (fluxo 11): os valores avulsos de exemplo (quilómetros, ajudas de custo) e o mês que o
 * separador Custo da ficha e o módulo «Custos» mostram. Nada aqui fala com lado nenhum; recarregar a página repõe tudo.
 * É um store próprio (não toca no `loja.ts`): `reporCusto()` volta ao início.
 *
 * Os EQUIPAMENTOS, as DEFINIÇÕES (taxa da empresa, seguro, valor por km e por dia — por organização) e as EXCEÇÕES de taxa
 * por pessoa já não vivem aqui: vêm da base pelos hooks `useEquipamentosCusto`, `useCustoDefinicoes` e `useCustoExcecoes`
 * (rh-exemplo/hooks). Os valores avulsos reais (os lançamentos do processamento) também não passam por aqui; ficam só os de
 * exemplo, que servem aos testes e ao protótipo.
 *
 * Cada valor avulso tem o seu «como conta» (de uma vez, repartido por N meses, todos os meses), escolhido ao registar e
 * editável depois. Um valor conta no mês da sua data e nunca noutro. O mês mostrado começa em Setembro de 2026, o mês do
 * «Cálculo do mês».
 */
import { useSyncExternalStore } from "react";
import { avulsosIniciais } from "@/components/rh-exemplo/dados/custoExemplo";
import { MES_PROCESSAVEL } from "@/components/rh-exemplo/dados/assiduidadeSetembro";
import {
  anularAvulsoErro,
  validarAvulso,
  valorDeAjudaDeCusto,
  valorDeKm,
  type ErroAnulacao,
  type ErroAvulso,
} from "@/components/rh-exemplo/lib/custo";
import { contaUmaVez, normalizarConta, validarConta, type ContaItem, type ErroConta } from "@/components/rh-exemplo/lib/comoConta";
import type { AvulsoCusto, TipoAvulso } from "@/components/rh-exemplo/lib/custoMes";

interface EstadoCusto {
  avulsos: AvulsoCusto[];
  /** O mês («AAAA-MM») que a aba Custo e o módulo «Custos» mostram. */
  mes: string;
}

export interface NovoAvulso {
  pessoaId: string;
  tipo: TipoAvulso;
  data: string;
  descricao: string;
  /** km ou dias (1 num valor único). */
  quantidade: number;
  /** Valor por km, por dia ou valor único: editável ao registar. */
  valorUnitario: number;
  autor: string;
  podeProcessar: boolean;
  /** Como conta; sem isto, de uma vez na data indicada. */
  conta?: ContaItem;
}

const estadoInicial = (): EstadoCusto => ({
  avulsos: avulsosIniciais(),
  mes: MES_PROCESSAVEL,
});

let estado: EstadoCusto = estadoInicial();
let contador = 0;
const ouvintes = new Set<() => void>();

const definir = (novo: EstadoCusto): void => {
  estado = novo;
  ouvintes.forEach((o) => o());
};

export function subscreverCusto(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export const lerCusto = (): EstadoCusto => estado;

/** Lê uma fatia do store. O selector tem de devolver a mesma referência se nada mudou. */
export function useCusto<T>(selector: (e: EstadoCusto) => T): T {
  return useSyncExternalStore(subscreverCusto, () => selector(estado), () => selector(estado));
}

function valorDoAvulso(a: Pick<NovoAvulso, "tipo" | "quantidade" | "valorUnitario">): number {
  return a.tipo === "km" ? valorDeKm(a.quantidade, a.valorUnitario) : valorDeAjudaDeCusto(a.quantidade, a.valorUnitario);
}

/** Valida e guarda um valor avulso, com autor e data. Devolve o motivo da recusa, se houver. */
export function registarAvulso(novo: NovoAvulso): { erro: ErroAvulso | ErroConta | null } {
  const valor = valorDoAvulso(novo);
  const pedida = novo.conta ?? contaUmaVez();
  const erro = validarAvulso({ descricao: novo.descricao, valor, podeProcessar: novo.podeProcessar, data: novo.data }) ?? validarConta(pedida);
  if (erro) return { erro };
  const conta = normalizarConta(pedida);
  contador += 1;
  const registo: AvulsoCusto = {
    id: `cu-novo-${contador}`,
    pessoaId: novo.pessoaId,
    tipo: novo.tipo,
    data: novo.data,
    conta,
    descricao: novo.descricao.trim(),
    quantidade: novo.quantidade,
    valorUnitario: novo.valorUnitario,
    valor,
    autor: novo.autor,
    criadoEm: new Date().toISOString(),
    anulado: null,
  };
  definir({ ...estado, avulsos: [...estado.avulsos, registo] });
  return { erro: null };
}

/** Anula com motivo: o valor continua visível, deixa de contar. */
export function anularAvulso(id: string, motivo: string, por: string, podeProcessar: boolean): { erro: ErroAnulacao | null } {
  const erro = anularAvulsoErro(motivo, podeProcessar);
  if (erro) return { erro };
  const em = new Date().toISOString();
  definir({
    ...estado,
    avulsos: estado.avulsos.map((a) => (a.id === id && a.anulado === null ? { ...a, anulado: { motivo: motivo.trim(), por, em } } : a)),
  });
  return { erro: null };
}

/** Muda o «como conta» de um valor avulso (continua a partir do mês da sua data). */
export function alterarContaAvulso(id: string, nova: ContaItem): { erro: ErroConta | null } {
  const erro = validarConta(nova);
  if (erro) return { erro };
  const conta = normalizarConta(nova);
  definir({ ...estado, avulsos: estado.avulsos.map((a) => (a.id === id ? { ...a, conta } : a)) });
  return { erro: null };
}

/** O mês («AAAA-MM») que a aba Custo e o módulo «Custos» mostram; um valor que não seja um mês é ignorado. */
export function definirMesCusto(mes: string): void {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) definir({ ...estado, mes });
}

export function reporCusto(): void {
  contador = 0;
  definir(estadoInicial());
}
