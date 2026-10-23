// O formato CSV do Inventário (o mesmo nos dois sentidos) e o que cada entidade diz sobre exportar e importar: funções puras, sem React.
import { ErroInv } from "./base";
import type { Inventario } from "./tipos";

export type EstadoImp = "Novo" | "Atualizar" | "Sem alterações" | "Erro";
export interface Verificacao { st: EstadoImp; key: string; msg?: string }
type Celula = string | number | boolean | null | undefined;

/** Uma entidade que se exporta e importa (o XP.x do mockup). */
export interface DefImportacao<R> {
  rotulo: string; ficheiro: string; regra?: string;
  /** As colunas: o nome (igual ao do mockup) e como se tira o valor de uma linha. */
  cols: readonly (readonly [string, (r: R) => Celula])[];
  /** As linhas a exportar agora (as filtradas no ecrã). */
  linhas: () => R[];
  /** Diz o que a importação faria com uma linha, sem alterar nada. */
  verificar: (o: Record<string, string>, db: Inventario) => Verificacao;
  /** Aplica a linha (`db` é a cópia sobre a qual se está a agir; as regras lançam ErroInv). */
  aplicar: (o: Record<string, string>, db: Inventario, v: Verificacao) => void;
}

export const BOM = "\uFEFF";
const celula = (v: Celula): string => { const t = v == null ? "" : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function paraCsv<R>(def: DefImportacao<R>, linhas: readonly R[]): string {
  return BOM + [def.cols.map((c) => c[0]).join(";"), ...linhas.map((r) => def.cols.map((c) => celula(c[1](r))).join(";"))].join("\r\n");
}

/** Lê CSV com `;` (ou `,` quando não há `;`), aspas duplas e linhas CRLF/LF; ignora linhas vazias (parseCSV do mockup). */
export function lerCsv(texto: string): string[][] {
  const t = String(texto || "").replace(/^\uFEFF/, "");
  const linhas: string[][] = []; let linha: string[] = [], cur = "", aspas = false;
  const temPv = t.includes(";");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else aspas = false; } else cur += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === ";" || (ch === "," && !temPv)) { linha.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; linha.push(cur); cur = ""; if (linha.some((x) => x !== "")) linhas.push(linha); linha = []; }
    else cur += ch;
  }
  linha.push(cur); if (linha.some((x) => x !== "")) linhas.push(linha);
  return linhas;
}

/** As linhas do CSV como objetos {coluna: valor}; recusa um cabeçalho diferente do da exportação. */
export function objetosDe<R>(def: DefImportacao<R>, texto: string): Record<string, string>[] {
  const rows = lerCsv(texto);
  if (!rows.length) return [];
  const cab = rows[0].map((h) => h.trim().toLowerCase());
  if (def.cols.some((c) => !cab.includes(c[0].toLowerCase()))) throw new ErroInv(`Cabeçalho diferente do formato de exportação. Esperado: ${def.cols.map((c) => c[0]).join(";")}`);
  return rows.slice(1).map((r) => { const o: Record<string, string> = {}; cab.forEach((h, i) => { o[h] = (r[i] || "").trim(); }); return o; });
}

