// Os nomes dos trabalhos do orçamento: os mesmos do levantamento (`businessGoals.new.work.<chave>`), mais o "Outro trabalho" (o texto
// "Outro (escrever)" do levantamento não faz sentido num orçamento) e os trabalhos escritos à mão, que levam o próprio texto.
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { ChaveTrabalho } from "./catalogoTrabalhos";
import type { LinhaTrabalho } from "./orcamentoCalculo";

/** O nome de um trabalho do catálogo, na língua em uso. */
export const rotuloDoTrabalho = (t: Traduzir, chave: ChaveTrabalho): string =>
  t(chave === "outro" ? "pessoasPagina.quote.work.outro" : `businessGoals.new.work.${chave}`);

/** O nome de uma linha: o texto escrito à mão (se tiver), ou o nome do trabalho. */
export const nomeDaLinha = (t: Traduzir, linha: Pick<LinhaTrabalho, "trabalho" | "nome">): string => linha.nome ?? rotuloDoTrabalho(t, linha.trabalho);
