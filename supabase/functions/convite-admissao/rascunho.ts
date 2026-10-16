/**
 * O rascunho do convite ANTES de chegar a `rpc_hr_convite_admissao_rascunho`.
 *
 * Desde a V2 (20261210420000) a coluna `rascunho` tem um CHECK com uma lista
 * branca de 45 chaves de topo e um tecto de 20 000 bytes. NISS, IBAN e o
 * numero da conta ficam de fora: nao se guardam em claro no staging. Um
 * rascunho que viole o CHECK e recusado POR INTEIRO (23514) e a pessoa perde
 * tudo o que escreveu desde a ultima gravacao -- por isso o ecra, que ainda
 * envia essas tres chaves, tem de ser limpo aqui, antes da RPC.
 *
 * A lista tem de ser IGUAL a do CHECK `pessoas_convites_admissao_rascunho_lista_branca`.
 * Modulo puro (sem Deno, sem rede): testavel no vitest.
 */

/** As 45 chaves de topo que o CHECK da V2 aceita. */
export const CHAVES_RASCUNHO_PERMITIDAS: readonly string[] = [
  "assinatura_nome",
  "carta_conducao_categorias",
  "carta_conducao_numero",
  "carta_conducao_validade",
  "codigo_postal",
  "conjuge_situacao_profissional",
  "conta_banco",
  "conta_bic",
  "conta_formato",
  "conta_swift",
  "conta_titular",
  "data_nascimento",
  "dependentes",
  "dependentes_deficientes",
  "distrito",
  "email_pessoal",
  "estado_civil",
  "genero",
  "habilitacao_academica",
  "habilitacao_data_conclusao",
  "linha1",
  "linha2",
  "localidade",
  "morada_codigo_postal",
  "morada_distrito",
  "morada_linha1",
  "morada_linha2",
  "morada_localidade",
  "morada_pais",
  "nacionalidade",
  "naturalidade_concelho",
  "naturalidade_freguesia",
  "naturalidade_pais",
  "nif",
  "numero_documento",
  "pais",
  "tamanho_baixo",
  "tamanho_baixo_detalhe",
  "tamanho_calcado",
  "tamanho_calcado_detalhe",
  "tamanho_cima",
  "tamanho_cima_detalhe",
  "telefone_pessoal",
  "tipo_documento",
  "validade_documento",
];

/** O que o ecra ainda envia e a V2 nao aceita: retira-se em silencio, nao se recusa. */
export const CHAVES_RASCUNHO_RETIRADAS: readonly string[] = ["niss", "iban", "conta_numero"];

/** O CHECK da V2: cada valor e texto (ate 500 caracteres), numero, booleano ou nulo. */
export const RASCUNHO_TEXTO_MAX = 500;

/** O tecto do CHECK: `octet_length(rascunho::text) <= 20000`. */
export const RASCUNHO_MAX_BYTES = 20000;

export type ResultadoRascunho =
  | { ok: true; rascunho: Record<string, unknown> }
  | { ok: false; codigo: "pedido_invalido" | "rascunho_chave_invalida" | "rascunho_valor_invalido" | "rascunho_demasiado_grande" };

/**
 * O texto que o Postgres daria a `jsonb::text`: o mesmo que `JSON.stringify`,
 * mas com `": "` e `", "` (um byte a mais por chave e por separador). Medir
 * pelo compacto deixava passar rascunhos que o CHECK depois recusa.
 */
function textoJsonb(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(textoJsonb).join(", ")}]`;
  if (valor !== null && typeof valor === "object") {
    const partes = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${textoJsonb(v)}`);
    return `{${partes.join(", ")}}`;
  }
  return JSON.stringify(valor === undefined ? null : valor);
}

function eObjecto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/** Escalar aceite pelo CHECK; objectos, arrays e textos longos nao (comprimento em pontos de codigo, como o Postgres). */
function eValorEscalarValido(valor: unknown): boolean {
  if (typeof valor === "string") return [...valor].length <= RASCUNHO_TEXTO_MAX;
  if (typeof valor === "number") return Number.isFinite(valor);
  return typeof valor === "boolean" || valor === null;
}

/**
 * Limpa o rascunho para a RPC: retira niss, iban e conta_numero, recusa
 * qualquer outra chave fora da lista e o que passa do tamanho. Nunca altera
 * o objecto recebido.
 */
export function prepararRascunho(entrada: unknown): ResultadoRascunho {
  if (!eObjecto(entrada)) return { ok: false, codigo: "pedido_invalido" };

  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(entrada)) {
    if (CHAVES_RASCUNHO_RETIRADAS.includes(chave)) continue;
    if (!CHAVES_RASCUNHO_PERMITIDAS.includes(chave)) {
      return { ok: false, codigo: "rascunho_chave_invalida" };
    }
    if (!eValorEscalarValido(valor)) return { ok: false, codigo: "rascunho_valor_invalido" };
    limpo[chave] = valor;
  }

  if (new TextEncoder().encode(textoJsonb(limpo)).length > RASCUNHO_MAX_BYTES) {
    return { ok: false, codigo: "rascunho_demasiado_grande" };
  }
  return { ok: true, rascunho: limpo };
}
