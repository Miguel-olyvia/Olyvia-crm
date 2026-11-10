/**
 * Seguro de acidentes de trabalho por cargo (`hr_cargos.seguro_acidentes_pct`): percentagem sobre o salario base,
 * `numeric(5,2)`, de 0 a 100; NULL = cargo sem seguro. Puro, sem base: le o que o RH escreve, formata, e traduz
 * os erros da RPC `rpc_hr_cargo_definir_seguro`.
 */
import { isPermissionError } from "@/lib/hr/hrDb";

export type LeituraPercentagemSeguro = { ok: true; valor: number | null } | { ok: false };

/** Ate tres inteiros e, opcionalmente, virgula ou ponto com um ou dois decimais. */
const PADRAO = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

/**
 * Le o texto do campo. Vazio e valido (`valor: null` = sem seguro). Recusa o que nao seja 0 a 100 com no maximo
 * 2 decimais (negativos, letras, notacao cientifica, separadores de milhares, mais de 2 decimais).
 */
export function lerPercentagemSeguro(texto: string): LeituraPercentagemSeguro {
  if (typeof texto !== "string") return { ok: false };
  const limpo = texto.trim();
  if (limpo === "") return { ok: true, valor: null };
  const partes = PADRAO.exec(limpo);
  if (!partes) return { ok: false };
  const valor = Number(`${partes[1]}.${partes[2] ?? "0"}`);
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) return { ok: false };
  return { ok: true, valor };
}

/** "1,5" em pt, "1.5" nas outras linguas; sem zeros a mais. */
export function formatarPercentagemSeguro(valor: number, language: string): string {
  const texto = String(Math.round(valor * 100) / 100);
  return language === "pt" ? texto.replace(".", ",") : texto;
}

/** O que o campo mostra ao abrir: vazio para sem seguro (null/undefined); 0 e um valor. */
export function paraTextoDoCampo(valor: number | null | undefined, language: string): string {
  return valor === null || valor === undefined ? "" : formatarPercentagemSeguro(valor, language);
}

/** O numeric do PostgREST pode vir como numero ou como texto; o que nao for um numero finito e "sem seguro". */
export function lerSeguroDaLinha(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

const CHAVES = {
  naoEncontrado: "hr.cargos.seguro.erro.naoEncontrado",
  semPermissao: "hr.cargos.seguro.erro.semPermissao",
  invalida: "hr.cargos.seguro.erro.invalida",
} as const;

/** SQLSTATE de valor numerico fora do intervalo / parametro invalido (22023, o da RPC) / violacao de CHECK. */
const CODIGOS_PERCENTAGEM_INVALIDA = new Set(["22003", "22023", "23514"]);

/**
 * A chave de traducao do erro da RPC, ou `null` quando nao e conhecido (o ecra cai no texto generico).
 * A base (20270112600000) responde 'nao_encontrado' com HRC02 (cargo de outra organizacao ou inexistente),
 * 'insufficient_privilege' com 42501 e 'seguro_invalido' com 22023 (fora de 0 a 100 ou mais de 2 decimais).
 */
export function chaveDeErroSeguro(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  const texto = typeof message === "string" ? message : "";
  if (code === "42501" || isPermissionError(erro)) return CHAVES.semPermissao;
  const token = texto.split(":")[0].trim();
  if (code === "HRC02" || token === "nao_encontrado") return CHAVES.naoEncontrado;
  if (token === "seguro_invalido") return CHAVES.invalida;
  if (typeof code === "string" && CODIGOS_PERCENTAGEM_INVALIDA.has(code)) return CHAVES.invalida;
  return null;
}
