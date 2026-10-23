/**
 * Título da proposta a partir do template escolhido.
 *
 * A regra existe em dois ecrãs (a página de Propostas e o diálogo usado na ficha
 * do cliente) e vive aqui para não divergirem.
 *
 * O título só é preenchido enquanto ainda não for da pessoa: ou está vazio, ou
 * continua a ser exactamente o nome do template escolhido antes — é isso que
 * permite trocar de template e ver o título acompanhar, sem nunca apagar um
 * título escrito à mão. Ao editar uma proposta existente o título nunca está
 * vazio, por isso este caminho não lhe toca.
 */
export interface TemplateBasico {
  id: string;
  name: string;
}

export function proposalTitleFromTemplate(
  tituloActual: string,
  templateAnterior: TemplateBasico | undefined,
  templateEscolhido: TemplateBasico | undefined,
): string {
  const podePreencher =
    tituloActual.trim() === "" ||
    (!!templateAnterior && tituloActual === templateAnterior.name);

  if (!podePreencher || !templateEscolhido) return tituloActual;
  return templateEscolhido.name;
}
