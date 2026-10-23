// Apoio dos exemplos variados (ver `pessoasExemploVariado.ts`): os dias relativos a HOJE_EXEMPLO, as visitas e os levantamentos de
// exemplo. O texto dos levantamentos sai das mesmas listas da aba Visita (e das traduções em português), nunca escrito à mão.
// Só em memória, sem Supabase.
import { paraLevantamentoNegocio, type LinhaForm } from "@/components/negocio-metas/levantamento";
import type {
  LevantamentoNegocio, MoradaObraNegocio, SeccaoVisitaNegocio, VisitaNegocio,
} from "@/components/negocio-metas/negocioMetas";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { somarDias, type RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { chaveOpcao, chavePergunta, chaveSeccao, perguntasDosBlocos, visitaEmTexto } from "@/components/negocio-metas/respostasVisita";
import { SECCOES_VISITA } from "@/components/negocio-metas/visitaExemplo";
import { negocioMetasNovoTranslations } from "@/translations/negocioMetasNovo";
import type { Pessoa } from "./pessoasTipos";

/** O dia `n` dias depois (ou antes, se negativo) de HOJE_EXEMPLO. */
export const dia = (n: number): string => somarDias(HOJE_EXEMPLO, n);

/** A morada da pessoa no formato da morada de uma visita (sem andar). */
export const moradaDe = (p: Pick<Pessoa, "morada">): MoradaObraNegocio => ({
  rua: p.morada?.linha ?? "", codigoPostal: p.morada?.cp ?? "", localidade: p.morada?.localidade ?? "", andar: "",
});

type DadosVisita = Pick<VisitaNegocio, "data" | "estado" | "feitoPor"> & Partial<VisitaNegocio>;

/** Uma visita de exemplo na morada indicada (por omissão Levantamento às 10:00, na morada da lead). */
export const visitaDe = (id: string, morada: MoradaObraNegocio, dados: DadosVisita): VisitaNegocio => ({
  hora: "10:00", tipo: "levantamento", quemVaiEstar: "", duracao: "", igualALead: true, nota: "", ...dados, id, morada: { ...morada },
});

/** Uma linha do levantamento no formato do formulário (medida em texto, como se escreve). */
export const linha = (id: string, divisao: string, trabalho: string, medida: string, unidade = "m2", observacoes = ""): LinhaForm => ({
  id, divisao, trabalho, trabalhoOutro: "", medida, unidade, observacoes,
});

/** Uma linha com um trabalho escrito à mão ("Outro"). */
export const linhaOutro = (id: string, divisao: string, texto: string, medida: string, unidade = "un"): LinhaForm => ({
  ...linha(id, divisao, "outro", medida, unidade), trabalhoOutro: texto,
});

const TEXTOS = new Map<string, string>(
  SECCOES_VISITA.flatMap((s) => [
    [chaveSeccao(s.id), s.titulo[0]] as const,
    ...perguntasDosBlocos(s.blocos).flatMap((p) => [
      [chavePergunta(p.id), p.rotulo[0]] as const,
      ...p.opcoes.map(([chave, pt]) => [chaveOpcao(p.id, chave), pt] as const),
    ]),
  ]),
);
const textoPt = (chave: string): string => TEXTOS.get(chave) ?? chave;
const rotuloPt = (grupo: "room" | "work" | "unit", chave: string): string => negocioMetasNovoTranslations.pt[`businessGoals.new.${grupo}.${chave}`] ?? chave;

/** O levantamento de um pedido: linhas de medidas, observações e as respostas das secções da visita (chaves das opções). */
export const levantamentoDoPedido = (linhas: LinhaForm[], respostas: Record<string, string>, observacoes: string): RascunhoLevantamento => ({
  linhas, observacoes, respostas,
});

/** O que um negócio criado a partir de uma visita feita leva: o levantamento em texto e as secções da visita respondidas. */
export function levantamentoDoNegocio(
  rascunho: RascunhoLevantamento, data: string, feitoPor: string,
): { levantamento: LevantamentoNegocio; visita: SeccaoVisitaNegocio[] } {
  return {
    levantamento: paraLevantamentoNegocio(
      { data, feitoPor, estado: "feito", linhas: rascunho.linhas, observacoes: rascunho.observacoes }, rotuloPt,
    ),
    visita: visitaEmTexto(SECCOES_VISITA, rascunho.respostas, textoPt),
  };
}
