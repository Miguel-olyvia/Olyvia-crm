// O SKU do artigo do fornecedor (migration 20270101310000): categoria-subcategoria-medida-cor, em códigos (REV-PAR-30X60-BRA).
// Quem o gera é a base (fn_sp_catalog_sku), que junta -2, -3… quando o código já existe. Aqui fazem-se as mesmas contas para o
// fornecedor ver o código antes de gravar; as regras têm de ficar iguais às de fn_sp_codigo_medida e fn_sp_codigo_cor.

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
