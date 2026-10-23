// A lógica pura das escritas DIRETAS do negócio (UPDATE em `negocios`, sem função neg_*): editar título, notas e comercial, mandar para o lixo e
// restaurar. Os limites são os da base (titulo 1 a 200 sem ser só espaços, notas até 5000); as colunas enviadas são só as permitidas e só as que
// mudaram (estado, fase e motivo de perda nunca vão: a base recusa-os com 42501). Os erros traduzem-se pelo código e pela restrição.
import type { ValoresNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { ErroNeg } from "./chamarNeg";
import { chaveDoErro, codigoDoErro } from "./errosNeg";

export const MAX_TITULO_NEGOCIO = 200;
export const MAX_NOTAS_NEGOCIO = 5000;

const P = "pessoasPagina.neg.write.error.";

export const CHAVE_ESCRITA_GENERICA = "pessoasPagina.erroNeg.generico";

/** As chaves de tradução dos erros das escritas diretas. */
export const CHAVES_ESCRITA = {
  permissao: `${P}permission`,
  titulo: `${P}title`,
  notas: `${P}notes`,
  comercial: `${P}rep`,
  lixo: `${P}trashed`,
  invalido: `${P}invalid`,
  indisponivel: `${P}unavailable`,
  propostaFechada: `${P}proposalClosed`,
} as const;

export interface CamposEdicao {
  titulo: string;
  notas: string;
}

export interface ErrosEdicao {
  titulo?: "empty" | "tooLong";
  notas?: "tooLong";
}

/** O comprimento em caracteres (um emoji vale um), como o `char_length` da base. */
const comprimento = (texto: string): number => Array.from(texto).length;

export function validarEdicao({ titulo, notas }: CamposEdicao): ErrosEdicao {
  const erros: ErrosEdicao = {};
  const limpo = titulo.trim();
  if (limpo === "") erros.titulo = "empty";
  else if (comprimento(limpo) > MAX_TITULO_NEGOCIO) erros.titulo = "tooLong";
  if (comprimento(notas.trim()) > MAX_NOTAS_NEGOCIO) erros.notas = "tooLong";
  return erros;
}

/** As colunas permitidas que mudaram. Vazio = nada a gravar. */
export function colunasDaEdicao(antes: ValoresNegocio, depois: ValoresNegocio): Record<string, string | null> {
  const colunas: Record<string, string | null> = {};
  const titulo = depois.titulo.trim();
  if (titulo !== antes.titulo.trim()) colunas.titulo = titulo;
  const notasNovas = depois.notas.trim() === "" ? null : depois.notas.trim();
  const notasAntigas = antes.notas.trim() === "" ? null : antes.notas.trim();
  if (notasNovas !== notasAntigas) colunas.notas = notasNovas;
  if (depois.comercialId !== antes.comercialId) colunas.assigned_to = depois.comercialId;
  return colunas;
}

const MARCA_INDISPONIVEL = "ninguem";

/** Sinal de que o UPDATE não tocou em nenhuma linha (a política escondeu-a): quem escreve lança-o. */
export const NINGUEM_TOCADO = MARCA_INDISPONIVEL;

function codigoETexto(erro: unknown): { code: string | null; message: string } {
  if (typeof erro !== "object" || erro === null) return { code: null, message: "" };
  const { code, message } = erro as { code?: unknown; message?: unknown };
  return { code: typeof code === "string" ? code : null, message: typeof message === "string" ? message : "" };
}

function chaveDeCheck(message: string): string {
  if (message.includes("negocios_titulo_check")) return CHAVES_ESCRITA.titulo;
  if (message.includes("negocios_notas_check")) return CHAVES_ESCRITA.notas;
  if (/comercial/i.test(message)) return CHAVES_ESCRITA.comercial;
  if (/lixo/i.test(message)) return CHAVES_ESCRITA.lixo;
  return CHAVES_ESCRITA.invalido;
}

/** Converte o que a base devolveu num `ErroNeg` com a chave a traduzir (nunca a mensagem em bruto). */
export function erroDeEscrita(erro: unknown): ErroNeg {
  if (erro instanceof ErroNeg) return erro;
  if (erro === MARCA_INDISPONIVEL) return new ErroNeg(null, null, CHAVES_ESCRITA.indisponivel);
  const { code, message } = codigoETexto(erro);
  if (code === "42501") return new ErroNeg(erro, "42501", CHAVES_ESCRITA.permissao);
  if (code === "23514") return new ErroNeg(erro, "23514", chaveDeCheck(message));
  // Erros de regra levantados pelos gatilhos (NG025, NG027, NG028...): a chave própria, não a genérica.
  const codigoNeg = codigoDoErro(erro);
  if (codigoNeg) return new ErroNeg(erro, codigoNeg, chaveDoErro(erro));
  return new ErroNeg(erro, null, CHAVE_ESCRITA_GENERICA);
}
