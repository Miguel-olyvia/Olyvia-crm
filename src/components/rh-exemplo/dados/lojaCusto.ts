/**
 * O store, em memória, do separador Custo da ficha (fluxo 11): valores avulsos (quilómetros, ajudas de custo, equipamento),
 * as definições da empresa (taxa, seguro, valor por km e por dia) e a exceção de taxa por pessoa. Nada aqui fala com lado
 * nenhum; recarregar a página repõe tudo. É um store próprio (não toca no `loja.ts`): `reporCusto()` volta ao início.
 *
 * O mês aberto é o mês de hoje; os anteriores contam-se como fechados (regra de exemplo, o fecho real é do fluxo 10).
 */
import { useSyncExternalStore } from "react";
import { diaIso, hojeIso } from "@/components/rh-exemplo/dados/datas";
import {
  anularAvulsoErro,
  mesDaData,
  mesDeContagem,
  validarAvulso,
  valorDeAjudaDeCusto,
  valorDeKm,
  type ErroAnulacao,
  type ErroAvulso,
} from "@/components/rh-exemplo/lib/custo";
import type { AvulsoCusto, DefinicoesCusto, TipoAvulso } from "@/components/rh-exemplo/lib/custoMes";

interface EstadoCusto {
  avulsos: AvulsoCusto[];
  definicoes: DefinicoesCusto;
  excecoes: Record<string, number | null>;
}

export interface NovoAvulso {
  pessoaId: string;
  tipo: TipoAvulso;
  data: string;
  descricao: string;
  /** km, dias (ou 1 num valor único) ou, no equipamento, 1. */
  quantidade: number;
  /** Valor por km, por dia, valor único ou valor de compra: editável ao registar. */
  valorUnitario: number;
  devolucao: string | null;
  autor: string;
  podeProcessar: boolean;
}

const DEFINICOES_INICIAIS: DefinicoesCusto = { taxaEmpresa: 23.75, seguro: 0, valorPorKm: 0.4, ajudaPorDia: 25 };

const semanas = (n: number) => diaIso(-7 * n);

function avulsosIniciais(): AvulsoCusto[] {
  const mes = mesDaData(hojeIso());
  const base = { dataReal: null, devolucao: null, autor: "Sofia Rebelo", criadoEm: new Date().toISOString(), anulado: null };
  return [
    { ...base, id: "cu-1", pessoaId: "p-tiago", tipo: "km", data: hojeIso(), mesContagem: mes, descricao: "Visita ao cliente do Porto", quantidade: 120, valorUnitario: 0.4, valor: 48 },
    { ...base, id: "cu-2", pessoaId: "p-tiago", tipo: "ajuda", data: hojeIso(), mesContagem: mes, descricao: "Deslocação a feira", quantidade: 2, valorUnitario: 25, valor: 50 },
    { ...base, id: "cu-3", pessoaId: "p-rui", tipo: "equipamento", data: semanas(9), mesContagem: mesDaData(semanas(9)), descricao: "Portátil", quantidade: 1, valorUnitario: 900, valor: 900 },
  ];
}

const estadoInicial = (): EstadoCusto => ({ avulsos: avulsosIniciais(), definicoes: DEFINICOES_INICIAIS, excecoes: {} });

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

export const mesAbertoDoCusto = (): string => mesDaData(hojeIso());

function valorDoAvulso(a: Pick<NovoAvulso, "tipo" | "quantidade" | "valorUnitario">): number {
  if (a.tipo === "km") return valorDeKm(a.quantidade, a.valorUnitario);
  if (a.tipo === "ajuda") return valorDeAjudaDeCusto(a.quantidade, a.valorUnitario);
  return a.valorUnitario;
}

/** Valida e guarda um valor avulso, com autor e data. Devolve o motivo da recusa, se houver. */
export function registarAvulso(novo: NovoAvulso): { erro: ErroAvulso | null } {
  const valor = valorDoAvulso(novo);
  const erro = validarAvulso({ descricao: novo.descricao, valor, podeProcessar: novo.podeProcessar });
  if (erro) return { erro };
  contador += 1;
  const { mes, dataReal } = mesDeContagem(novo.data, mesAbertoDoCusto());
  const registo: AvulsoCusto = {
    id: `cu-novo-${contador}`,
    pessoaId: novo.pessoaId,
    tipo: novo.tipo,
    data: novo.data,
    mesContagem: mes,
    dataReal,
    descricao: novo.descricao.trim(),
    quantidade: novo.quantidade,
    valorUnitario: novo.valorUnitario,
    valor,
    devolucao: novo.tipo === "equipamento" ? novo.devolucao : null,
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

export function definirDefinicoesCusto(definicoes: DefinicoesCusto): void {
  definir({ ...estado, definicoes });
}

/** `null` tira a exceção e volta à taxa da empresa. */
export function definirExcecaoTaxa(pessoaId: string, taxa: number | null): void {
  definir({ ...estado, excecoes: { ...estado.excecoes, [pessoaId]: taxa } });
}

export function reporCusto(): void {
  contador = 0;
  definir(estadoInicial());
}
