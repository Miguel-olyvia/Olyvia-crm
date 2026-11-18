// HTML que os botões do editor de minutas inserem no corpo («Espaço para assinatura» e «+ Cláusula»), no idioma
// do corpo que se está a editar. Em português é exatamente o HTML de sempre; o bloco de assinatura leva, a mais,
// as marcas por classe que o detetor de assinaturas (src/lib/idiomaDocumento) procura primeiro.
// Idiomas sem palavras próprias aqui usam o português (como o dicionário do núcleo).

import { IDIOMAS, IDIOMA_BASE, normalizarCodigo } from "@/lib/idiomaDocumento/registo";
import { CLASSE_ASSINATURAS, CLASSE_ASSINATURA_CLIENTE, CLASSE_ASSINATURA_EMPRESA } from "@/lib/idiomaDocumento/assinaturas";
import { CLAUSE_ORDINALS } from "@/utils/contractBaseTemplates";

interface PalavrasDeBloco {
  empresa: string;
  empresaLegenda: string;
  cliente: string;
  clienteLegenda: string;
  tituloClausula: string;
  instrucaoClausula: string;
  ordinais: readonly string[];
  /** Antes do número, quando acabam os ordinais («CLÁUSULA 16»). */
  clausulaN: string;
  /** Reconhece o título de uma cláusula já escrita (para contar a próxima). */
  tituloExistente: RegExp;
}

export const ORDINAIS_EN = [
  "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH",
  "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH",
  "ELEVENTH", "TWELFTH", "THIRTEENTH", "FOURTEENTH", "FIFTEENTH",
] as const;

const PALAVRAS: Record<string, PalavrasDeBloco> = {
  pt: {
    empresa: "A PRIMEIRA CONTRATANTE",
    empresaLegenda: "(Nome / Carimbo)",
    cliente: "O SEGUNDO CONTRATANTE",
    clienteLegenda: "(Nome / Assinatura)",
    tituloClausula: "Título da Cláusula",
    instrucaoClausula: "(clique aqui para editar esta cláusula...)",
    ordinais: CLAUSE_ORDINALS,
    clausulaN: "CLÁUSULA",
    tituloExistente: /<strong>([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+) —/g,
  },
  en: {
    empresa: "THE FIRST PARTY",
    empresaLegenda: "(Name / Stamp)",
    cliente: "THE SECOND PARTY",
    clienteLegenda: "(Name / Signature)",
    tituloClausula: "Clause Title",
    instrucaoClausula: "(click here to edit this clause...)",
    ordinais: ORDINAIS_EN,
    clausulaN: "CLAUSE",
    tituloExistente: /<strong>([A-Z\s]+) —/g,
  },
};

function palavras(idioma?: string): PalavrasDeBloco {
  const codigo = normalizarCodigo(idioma) ?? IDIOMA_BASE;
  return PALAVRAS[codigo] ?? PALAVRAS[IDIOMA_BASE];
}

/** O bloco de duas colunas para assinar (empresa e cliente), com as palavras de `idioma`. */
export function htmlBlocoAssinatura(idioma?: string): string {
  const p = palavras(idioma);
  const linha = '<div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>';
  return [
    `<br/><div class="${CLASSE_ASSINATURAS}" style="margin-top:40px;">`,
    '      <div style="display:flex;justify-content:space-between;gap:60px;">',
    `        <div class="${CLASSE_ASSINATURA_EMPRESA}" style="flex:1;text-align:center;">`,
    `          ${linha}`,
    `          <p style="font-size:12px;"><strong>${p.empresa}</strong></p>`,
    `          <p style="font-size:11px;color:#666;">${p.empresaLegenda}</p>`,
    "        </div>",
    `        <div class="${CLASSE_ASSINATURA_CLIENTE}" style="flex:1;text-align:center;">`,
    `          ${linha}`,
    `          <p style="font-size:12px;"><strong>${p.cliente}</strong></p>`,
    `          <p style="font-size:11px;color:#666;">${p.clienteLegenda}</p>`,
    "        </div>",
    "      </div>",
    "    </div><br/>",
  ].join("\n");
}

/** Uma cláusula nova: a próxima ordinal (contada no corpo atual), título e instrução no idioma do corpo. */
export function htmlNovaClausula(idioma: string | undefined, corpoAtual: string): string {
  const p = palavras(idioma);
  const existentes = (corpoAtual || "").match(new RegExp(p.tituloExistente.source, "g"));
  const proxima = existentes ? existentes.length : 0;
  const ordinal = p.ordinais[proxima] || `${p.clausulaN} ${proxima + 1}`;
  return `<br/><p><strong>${ordinal} — ${p.tituloClausula}</strong></p><p><em>${p.instrucaoClausula}</em></p><br/>`;
}

/**
 * O corpo tem onde mostrar o signatário: marcador, `{{signatario_nome}}`, marcas por classe ou a frase da
 * segunda parte de algum idioma registado. (Em português equivale a hasSignatoryHook de contractDocument.)
 */
export function corpoTemLocalDeAssinatura(html: string | null | undefined): boolean {
  if (!html) return false;
  if (/data-signatory-block\s*=\s*"primary"/i.test(html)) return true;
  if (/\{\{\s*signatario_nome\s*\}\}/i.test(html)) return true;
  if (/olv-assinaturas|olv-assinatura-(empresa|cliente)/.test(html)) return true;
  return IDIOMAS.some((i) => i.assinatura?.segundaParte.test(html));
}
