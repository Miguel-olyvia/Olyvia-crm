// Os campos da ficha submetida que o RH revê e pode comentar, com o código do rótulo, e como se mostra cada valor (o IBAN e o
// NISS só pelos últimos quatro caracteres). As chaves são as do contrato do convite (`conviteAdmissaoPayload.ts`).

/** O código do rótulo (`hr.pendencias.campo.*`) de cada chave que não se chama como ele. */
const CODIGO_DO_ROTULO: Record<string, string> = {
  morada_linha1: "linha1", morada_codigo_postal: "codigo_postal", morada_localidade: "localidade", iban: "conta_numero",
};

export const CAMPOS_REVISAVEIS = [
  "data_nascimento", "genero", "nacionalidade", "telefone_pessoal", "email_pessoal", "estado_civil", "dependentes",
  "tipo_documento", "numero_documento", "validade_documento", "nif", "niss", "morada_linha1", "morada_codigo_postal",
  "morada_localidade", "iban", "conta_titular", "conta_banco", "tamanho_cima", "tamanho_baixo", "tamanho_calcado",
] as const;

const MASCARADOS = new Set(["iban", "niss"]);

export const codigoDoRotulo = (chave: string): string => CODIGO_DO_ROTULO[chave] ?? chave;

/** O valor tal como o RH o vê; vazio quando a pessoa não preencheu. */
export function valorParaRever(chave: string, bruto: unknown): string {
  const texto = bruto === null || bruto === undefined ? "" : String(bruto).trim();
  if (texto === "") return "";
  return MASCARADOS.has(chave) ? `•••• ${texto.slice(-4)}` : texto;
}

/** Só os campos que a pessoa preencheu, pela ordem da ficha. */
export function camposPreenchidos(dados: Record<string, unknown>): string[] {
  return CAMPOS_REVISAVEIS.filter((c) => valorParaRever(c, dados[c]) !== "");
}
