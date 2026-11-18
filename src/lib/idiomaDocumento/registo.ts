// Registo dos idiomas em que um documento (contrato ou proposta) pode ser escrito.
//
// Módulo NEUTRO: não importa nada do portal nem do resto da aplicação. Os códigos são strings abertas
// (minúsculas, 2 letras): acrescentar um idioma é acrescentar uma entrada aqui (e, se houver palavras
// próprias, um dicionário em dicionario.ts). Nada no resto do código assume "pt | en".

export interface FrasesDeAssinatura {
  /** Quem assina em nome da empresa (primeira parte). */
  primeiraParte: RegExp;
  /** O cliente (segunda parte) — é ela que identifica a coluna do cliente no bloco de assinatura. */
  segundaParte: RegExp;
}

export interface IdiomaDef {
  codigo: string;
  /** Nome em português (para listas e ecrãs do CRM). */
  nome: string;
  nomeNativo: string;
  /** Locale para formatar datas com o motor do browser (Intl). */
  locale: string;
  /** Frases que identificam o bloco de assinatura neste idioma. */
  assinatura?: FrasesDeAssinatura;
}

export const IDIOMA_BASE = "pt";

export const IDIOMAS: readonly IdiomaDef[] = [
  {
    codigo: "pt",
    nome: "Português",
    nomeNativo: "Português",
    locale: "pt-PT",
    // Exatamente as expressões de contractDocument.ts (SECOND_PARTY_RE / FIRST_PARTY_RE).
    assinatura: { primeiraParte: /A PRIMEIRA CONTRATANTE/i, segundaParte: /O SEGUNDO CONTRATANTE|\bO CLIENTE\b/i },
  },
  {
    codigo: "en",
    nome: "English",
    nomeNativo: "English",
    locale: "en-GB",
    assinatura: {
      primeiraParte: /THE FIRST PARTY|THE COMPANY|THE SERVICE PROVIDER|THE SUPPLIER/i,
      segundaParte: /THE SECOND PARTY|\bTHE CLIENT\b|\bTHE CUSTOMER\b/i,
    },
  },
  { codigo: "es", nome: "Espanhol", nomeNativo: "Español", locale: "es-ES" },
  { codigo: "fr", nome: "Francês", nomeNativo: "Français", locale: "fr-FR" },
];

export function obterIdioma(codigo: unknown): IdiomaDef | undefined {
  const c = typeof codigo === "string" ? codigo.trim().toLowerCase() : "";
  return IDIOMAS.find((i) => i.codigo === c);
}

export function idiomaRegistado(codigo: unknown): codigo is string {
  return obterIdioma(codigo) !== undefined;
}

/** O código em minúsculas e sem espaços, ou null se não estiver registado. */
export function normalizarCodigo(codigo: unknown): string | null {
  return obterIdioma(codigo)?.codigo ?? null;
}

export function nomeDoIdioma(codigo: string): string {
  return obterIdioma(codigo)?.nome ?? codigo;
}

export function localeDoIdioma(codigo: string | null | undefined): string {
  return (obterIdioma(codigo) ?? IDIOMAS[0]).locale;
}

/** Ordena pela ordem do registo (português primeiro), sem repetidos e sem códigos desconhecidos. */
export function ordenarPorRegisto(codigos: readonly string[]): string[] {
  const pedidos = new Set(codigos.map((c) => normalizarCodigo(c)).filter((c): c is string => c !== null));
  return IDIOMAS.map((i) => i.codigo).filter((c) => pedidos.has(c));
}
