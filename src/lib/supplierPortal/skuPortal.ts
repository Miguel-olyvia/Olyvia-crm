// O SKU do artigo do fornecedor. Quem o gera é a base (fn_sp_catalog_sku). Aqui fazem-se as mesmas contas para o fornecedor
// ver o código antes de gravar; as regras têm de ficar iguais às de fn_sp_codigo_medida, fn_sp_codigo_cor e fn_sp_catalog_sku.
//   • Regra nova (20270101440000, reunião de 30/10): categoria-subcategoria-número de 4 algarismos-medida-cor
//     (ELE-ILU-0001-18X18-PRE). O número dá-se ao gravar.
//   • Regra antiga (20270101310000): categoria-subcategoria-medida-cor, com -2, -3… quando repete. Os artigos que já a têm
//     ficam com ela enquanto não mudarem de categoria nem de subcategoria.

/** A medida em código: maiúsculas; ×, x e * passam a X; a vírgula a ponto; fica só o que é número, ponto e X ("30 x 60 cm" → 30X60). */
export function codigoMedida(medida: string | null | undefined): string {
  return (medida ?? "")
    .toUpperCase()
    .replace(/[×*]/g, "X")
    .replace(/,/g, ".")
    .replace(/[^0-9.X]/g, "")
    .replace(/X{2,}/g, "X")
    .replace(/^[X.]+|[X.]+$/g, "");
}

/** A cor em código: as 3 primeiras letras da primeira palavra, sem acentos ("Branco mate" → BRA). */
export function codigoCor(cor: string | null | undefined): string {
  const palavra = (cor ?? "").trim().split(" ")[0] ?? "";
  return palavra.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
}

/** O SKU sem o número de repetido. Sem categoria, não há. */
export function skuBase(categoria: string | null | undefined, subcategoria: string | null | undefined, medida?: string | null, cor?: string | null): string | null {
  if (!categoria) return null;
  return [categoria, subcategoria, codigoMedida(medida), codigoCor(cor)].filter(Boolean).join("-");
}

/** O lugar do número antes de gravar. */
export const NUMERO_POR_DAR = "····";

/**
 * O SKU que o fornecedor vê no formulário. `skuAtual` é o que o artigo já tem (ao editar), e `mesmaClassificacao` diz se a
 * categoria e a subcategoria são as que o artigo já tinha.
 */
export function skuPrevisto(
  categoria: string | null | undefined,
  subcategoria: string | null | undefined,
  medida?: string | null,
  cor?: string | null,
  skuAtual?: string | null,
  mesmaClassificacao = false,
): string | null {
  if (!categoria) return null;
  const prefixo = [categoria, subcategoria].filter(Boolean).join("-");
  const resto = [codigoMedida(medida), codigoCor(cor)].filter(Boolean);
  if (skuAtual) {
    const num = new RegExp(`^${prefixo}-(\\d{4})(-|$)`).exec(skuAtual)?.[1];
    if (num) return [prefixo, num, ...resto].join("-");
    if (mesmaClassificacao) {
      const base = skuBase(categoria, subcategoria, medida, cor);
      if (base && (skuAtual === base || (skuAtual.startsWith(`${base}-`) && /^\d+$/.test(skuAtual.slice(base.length + 1))))) return skuAtual;
      return base;
    }
  }
  return [prefixo, NUMERO_POR_DAR, ...resto].join("-");
}
