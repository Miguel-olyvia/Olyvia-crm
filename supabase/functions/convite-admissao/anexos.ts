/**
 * Regras puras dos anexos do convite de admissao (cartao de cidadao,
 * comprovativo de IBAN e fotografia): tipos, tectos, tipo REAL do ficheiro e
 * nome seguro. Sem Deno, sem rede -- e o que as torna testaveis no vitest.
 *
 * AS CONSTANTES SAO UM CONTRATO DE TRES LADOS, e tem de ser iguais:
 *   - estas, na Edge Function (primeira recusa, antes de gastar um upload);
 *   - as das RPCs rpc_hr_convite_anexo_* (a verdade, impostas na base);
 *   - src/lib/hr/conviteAnexos.ts (pre-verificacao no ecra, so para dar
 *     resposta rapida; o servidor e que decide).
 *
 * O tipo que o browser declara (`mime`) so serve para recusar cedo: o que
 * conta, ao confirmar, e a assinatura binaria lida do ficheiro que de facto
 * chegou ao servidor (`validarFicheiroReal`).
 */

export const TIPOS_ANEXO = ["cartao_cidadao", "comprovativo_iban", "fotografia"] as const;
export type TipoAnexo = (typeof TIPOS_ANEXO)[number];

export const LIMITES = {
  /** Anexos activos (pendente mais ligado) por convite. */
  maxActivos: 4,
  /** Anexos activos por tipo. */
  porTipo: { cartao_cidadao: 2, comprovativo_iban: 1, fotografia: 1 } as Readonly<Record<TipoAnexo, number>>,
  /** 10 MB: o limite dos dois buckets de RH. */
  tamanhoMaxBytes: 10485760,
  /** 5 MB para a fotografia. */
  fotografiaMaxBytes: 5242880,
  /** Reservas por convite na vida dele, apagadas incluidas. */
  maxReservas: 12,
} as const;

/** Assinatura binaria reconhecida -> tipo MIME gravado. Nada mais e aceite. */
export const MIME_POR_ASSINATURA: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
};

const MIMES_ACEITES: readonly string[] = Object.values(MIME_POR_ASSINATURA);
const MIMES_FOTOGRAFIA: readonly string[] = ["image/png", "image/jpeg"];
const EXTENSAO_POR_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};
const TAMANHO_MAX_NOME = 200;
const NOME_POR_OMISSAO = "ficheiro";

export type CodigoAnexo =
  | "anexo_tipo_invalido"
  | "anexo_formato_invalido"
  | "anexo_fotografia_formato"
  | "anexo_demasiado_grande"
  | "anexo_fotografia_demasiado_grande"
  | "anexo_vazio";

export function eTipoAnexo(valor: unknown): valor is TipoAnexo {
  return typeof valor === "string" && (TIPOS_ANEXO as readonly string[]).includes(valor);
}

/** Tamanho maximo em bytes para o tipo. */
export function tamanhoMaximo(tipo: TipoAnexo): number {
  return tipo === "fotografia" ? LIMITES.fotografiaMaxBytes : LIMITES.tamanhoMaxBytes;
}

function codigoDemasiadoGrande(tipo: TipoAnexo): CodigoAnexo {
  return tipo === "fotografia" ? "anexo_fotografia_demasiado_grande" : "anexo_demasiado_grande";
}

/**
 * So o nome base: sem pastas (barras directas ou invertidas), sem caracteres
 * de controlo, no maximo 200 caracteres; vazio (ou so pontos) vira "ficheiro".
 */
export function sanitizarNomeOriginal(nome: unknown): string {
  if (typeof nome !== "string") return NOME_POR_OMISSAO;
  const base = nome.split(/[\\/]/).pop() ?? "";
  const limpo = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "")
    .trim();
  if (limpo === "" || /^\.+$/.test(limpo)) return NOME_POR_OMISSAO;
  return Array.from(limpo).slice(0, TAMANHO_MAX_NOME).join("");
}

/**
 * A pre-verificacao do pedido de upload, pela mesma ordem das recusas da
 * RPC de reserva: tipo, formato declarado, vazio, tamanho. `null` = segue.
 */
export function validarPedidoAnexo(pedido: {
  tipo: unknown;
  tamanho: unknown;
  mime: unknown;
}): CodigoAnexo | null {
  if (!eTipoAnexo(pedido.tipo)) return "anexo_tipo_invalido";
  const tipo = pedido.tipo;

  const mime = typeof pedido.mime === "string" ? pedido.mime.trim().toLowerCase() : "";
  if (!MIMES_ACEITES.includes(mime)) return "anexo_formato_invalido";
  if (tipo === "fotografia" && !MIMES_FOTOGRAFIA.includes(mime)) return "anexo_fotografia_formato";

  const tamanho = pedido.tamanho;
  if (typeof tamanho !== "number" || !Number.isFinite(tamanho) || tamanho <= 0) return "anexo_vazio";
  if (tamanho > tamanhoMaximo(tipo)) return codigoDemasiadoGrande(tipo);
  return null;
}

/**
 * A verificacao do ficheiro que de facto chegou: a assinatura REAL (nunca o
 * tipo declarado) e o tamanho REAL. Gif, webp, zip, office, texto: recusados.
 */
export function validarFicheiroReal(ficheiro: {
  tipo: TipoAnexo;
  assinatura: string | null;
  tamanho: number;
}): CodigoAnexo | null {
  const { tipo, assinatura, tamanho } = ficheiro;
  if (!assinatura || !(assinatura in MIME_POR_ASSINATURA)) return "anexo_formato_invalido";
  if (tipo === "fotografia" && assinatura === "pdf") return "anexo_fotografia_formato";
  if (!Number.isFinite(tamanho) || tamanho <= 0) return "anexo_vazio";
  if (tamanho > tamanhoMaximo(tipo)) return codigoDemasiadoGrande(tipo);
  return null;
}

/** pdf, png ou jpg pelo tipo REAL; `null` para qualquer outro. */
export function extensaoDoMime(mime: string): string | null {
  return EXTENSAO_POR_MIME[mime] ?? null;
}
