import { reflexaoEmTexto, type ConfigNegocios } from "@/hooks/pessoas/workflow/configNegocios";

/** Os quatro campos de escolha e o prazo tal como se escreve (o texto só vira número ao guardar). */
export interface EdicaoNegocios extends Omit<ConfigNegocios, "reflexaoDias"> {
  reflexao: string;
}

export const edicaoDaConfig = (c: ConfigNegocios): EdicaoNegocios => ({
  conversaoAoGanhar: c.conversaoAoGanhar, recusaProposta: c.recusaProposta, recusaContrato: c.recusaContrato,
  cancelamentoNoPrazo: c.cancelamentoNoPrazo, reflexao: reflexaoEmTexto(c.reflexaoDias),
});

/** Há alguma coisa escrita que difere do que a base tem (voltar ao valor gravado deixa de contar). */
export function edicaoSuja(edicao: EdicaoNegocios | null, dados: ConfigNegocios | null): boolean {
  if (!edicao || !dados) return false;
  const gravada = edicaoDaConfig(dados);
  return edicao.conversaoAoGanhar !== gravada.conversaoAoGanhar || edicao.recusaProposta !== gravada.recusaProposta
    || edicao.recusaContrato !== gravada.recusaContrato || edicao.cancelamentoNoPrazo !== gravada.cancelamentoNoPrazo
    || edicao.reflexao.trim() !== gravada.reflexao.trim();
}
