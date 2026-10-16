// O orçamento tal como está no formulário do editor: quantidades, preços e desconto em texto (o que se escreve, com vírgula decimal),
// e a leitura para números. Funções puras. O cálculo em tempo real trata o que ainda não é número como 0; guardar exige números válidos.
import { lerMedida } from "@/components/negocio-metas/levantamento";
import type { ChaveTrabalho } from "./catalogoTrabalhos";
import { DESCONTO_MAXIMO, type EntradaOrcamento, type LinhaTrabalho } from "./orcamentoCalculo";
import { numeroParaTexto } from "./formatoOrcamento";
import type { DadosDoOrcamento } from "./transicoes";

/** Uma linha tal como está no formulário. */
export interface LinhaEditavel {
  id: string;
  trabalho: ChaveTrabalho;
  /** O texto de um trabalho escrito à mão ("outro"). */
  nome?: string;
  quantidade: string;
  preco: string;
}

export const paraEditavel = (l: LinhaTrabalho): LinhaEditavel => ({
  id: l.id, trabalho: l.trabalho, ...(l.nome === undefined ? {} : { nome: l.nome }),
  quantidade: numeroParaTexto(l.quantidade), preco: numeroParaTexto(l.precoUnitario),
});

/** Os ids dos campos de uma linha (o editor leva o foco a eles); `base` é a base dos ids do editor. */
export const idsDaLinha = (base: string, linha: Pick<LinhaEditavel, "id">) => ({
  quantidade: `${base}-${linha.id}-quantidade`, preco: `${base}-${linha.id}-preco`,
});

/** O número escrito, ou 0 se ainda não é um número (para o cálculo em tempo real). */
const numeroOuZero = (texto: string): number => {
  const n = lerMedida(texto);
  return Number.isFinite(n) ? n : 0;
};

const positivo = (texto: string): boolean => numeroOuZero(texto) > 0;

/** Que campos da linha estão por corrigir: a quantidade e o preço têm de ser números maiores que 0. */
export const errosDaLinha = (l: LinhaEditavel): { quantidade: boolean; preco: boolean } => ({
  quantidade: !positivo(l.quantidade), preco: !positivo(l.preco),
});

/** O desconto vazio vale 0; senão tem de ser um número de 0 a 50. */
export function erroDoDesconto(texto: string): boolean {
  if (texto.trim() === "") return false;
  const n = lerMedida(texto);
  return !(Number.isFinite(n) && n >= 0 && n <= DESCONTO_MAXIMO);
}

/** O desconto escrito; 0 se está vazio ou inválido. */
const descontoDe = (texto: string): number => (erroDoDesconto(texto) ? 0 : numeroOuZero(texto));

const paraLinha = (l: LinhaEditavel): LinhaTrabalho => ({
  id: l.id, trabalho: l.trabalho, quantidade: numeroOuZero(l.quantidade), precoUnitario: numeroOuZero(l.preco),
  ...(l.nome === undefined ? {} : { nome: l.nome }),
});

/** O que o cálculo dos totais lê enquanto se escreve. */
export const entradaDoCalculo = (linhas: readonly LinhaEditavel[], desconto: string): EntradaOrcamento => ({
  linhas: linhas.map(paraLinha), desconto: descontoDe(desconto),
});

/** O que se guarda (só depois de os campos estarem válidos). */
export const paraDados = (linhas: readonly LinhaEditavel[], desconto: string, vendaDireta: boolean): DadosDoOrcamento => ({
  ...entradaDoCalculo(linhas, desconto), vendaDireta,
});
