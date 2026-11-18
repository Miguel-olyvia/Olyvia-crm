// A tradução propriamente dita, sem React: idioma -> pt -> a própria chave; {x} e {{x}} como o t() do CRM;
// plurais por duas chaves explícitas (traduzirN). Em desenvolvimento avisa (uma vez) das chaves em falta.
import { dicionarios } from "./dicionarios";
import { formatarNumero } from "./formato";
import type { ParamsDeTraducao, PortalIdioma } from "./tipos";

const avisados = new Set<string>();

/** Só chaves do próprio objeto: «toString» ou «constructor» não são traduções. (Object.hasOwn não está no lib ES2020.) */
function temChave(objeto: object, chave: string): boolean {
  return Object.prototype.hasOwnProperty.call(objeto, chave);
}

/** Lido de cada vez (não ao importar) para os testes o poderem trocar com vi.stubEnv. */
function emDesenvolvimento(): boolean {
  return Boolean(import.meta.env?.DEV);
}

function avisarUmaVez(idioma: PortalIdioma, chave: string, completamenteEmFalta: boolean): void {
  if (!emDesenvolvimento()) return;
  const id = `${idioma}|${chave}`;
  if (avisados.has(id)) return;
  avisados.add(id);
  const consequencia = completamenteEmFalta ? "não existe em pt nem em en" : `falta em ${idioma}, a usar pt`;
  console.warn(`[portal-i18n] chave "${chave}": ${consequencia}`);
}

/** Só para testes: volta a permitir o aviso de chaves já avisadas. */
export function reporAvisosDeChavesEmFalta(): void {
  avisados.clear();
}

function procurar(idioma: PortalIdioma, chave: string): string | undefined {
  const texto = temChave(dicionarios[idioma], chave) ? dicionarios[idioma][chave] : undefined;
  return typeof texto === "string" ? texto : undefined;
}

function aplicarParametros(texto: string, params?: ParamsDeTraducao): string {
  if (!params) return texto;
  return texto.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (marcador, nomeDuplo?: string, nomeSimples?: string) => {
    const nome = nomeDuplo ?? nomeSimples ?? "";
    return temChave(params, nome) ? String(params[nome]) : marcador;
  });
}

export function traduzir(idioma: PortalIdioma, chave: string, params?: ParamsDeTraducao): string {
  const doIdioma = procurar(idioma, chave);
  if (doIdioma !== undefined) return aplicarParametros(doIdioma, params);

  const doPt = idioma === "pt" ? undefined : procurar("pt", chave);
  if (doPt !== undefined) {
    avisarUmaVez(idioma, chave, false);
    return aplicarParametros(doPt, params);
  }

  avisarUmaVez(idioma, chave, true);
  return chave;
}

/**
 * Plural: `chaveUm` só para n = 1 (0 e todos os outros usam `chaveVarios`). O texto recebe {n}, já formatado
 * pelo idioma («1,500» / «1500»), e os restantes parâmetros; um `n` nos parâmetros tem prioridade.
 */
export function traduzirN(
  idioma: PortalIdioma,
  chaveUm: string,
  chaveVarios: string,
  n: number,
  params?: ParamsDeTraducao,
): string {
  const nTexto = Number.isFinite(n) ? formatarNumero(n, idioma) : String(n);
  return traduzir(idioma, n === 1 ? chaveUm : chaveVarios, { n: nTexto, ...params });
}
