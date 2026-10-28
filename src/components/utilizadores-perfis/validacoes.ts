// Validações puras dos formulários de role e de utilizador (exemplo, sem base). As chaves de erro são códigos curtos;
// o texto vem das traduções (`usersProfiles.form.error.<campo>.<código>`).
import { normalizar } from "./logica";
import type { Role, Utilizador, Vinculo } from "./tipos";

export const MAX_NOME_ROLE = 100;
export const MAX_CODIGO_ROLE = 50;
/** Como em /users (users.passwordMinLength): 6 caracteres. */
export const MIN_PALAVRA_PASSE = 6;
export const MAX_PALAVRA_PASSE = 72;
/** O código de uma role: minúsculas, algarismos e sublinhado, a começar por uma letra. */
export const FORMATO_CODIGO = /^[a-z][a-z0-9_]*$/;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FORMATO_TELEFONE = /^\+?[0-9 ]{9,18}$/;

/** O código sugerido para um nome: sem acentos, minúsculas, o resto vira sublinhado ("Gestor de Vendas" dá gestor_de_vendas). */
export function gerarCodigo(nome: string): string {
  return nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_CODIGO_ROLE)
    .replace(/_+$/, "");
}

export interface ValoresRole {
  nome: string;
  codigo: string;
}
export type ErrosRole = Partial<Record<"nome" | "codigo", string>>;

/** Nome e código obrigatórios; o código no formato e sem repetir o de outra role (a própria role, ao editar, não conta). */
export function validarRole(v: ValoresRole, existentes: readonly Role[], idAtual?: string): ErrosRole {
  const erros: ErrosRole = {};
  const nome = v.nome.trim();
  const codigo = v.codigo.trim();
  if (!nome) erros.nome = "required";
  else if (nome.length > MAX_NOME_ROLE) erros.nome = "tooLong";
  if (!codigo) erros.codigo = "required";
  else if (!FORMATO_CODIGO.test(codigo) || codigo.length > MAX_CODIGO_ROLE) erros.codigo = "format";
  else if (existentes.some((r) => r.id !== idAtual && r.codigo === codigo)) erros.codigo = "duplicate";
  return erros;
}

export interface ValoresUtilizador {
  nome: string;
  email: string;
  telefone: string;
  palavraPasse: string;
  vinculos: readonly Pick<Vinculo, "organizacaoId" | "roleId">[];
}
export type CampoUtilizador = "nome" | "email" | "telefone" | "palavraPasse" | "vinculos";
export type ErrosUtilizador = Partial<Record<CampoUtilizador, string>>;

function erroPalavraPasse(p: string, criar: boolean): string | undefined {
  const texto = p.trim();
  if (!texto) return criar ? "required" : undefined;
  if (texto.length < MIN_PALAVRA_PASSE) return "short";
  return texto.length > MAX_PALAVRA_PASSE ? "long" : undefined;
}

function erroVinculos(vinculos: ValoresUtilizador["vinculos"]): string | undefined {
  if (vinculos.length === 0) return "min";
  if (vinculos.some((v) => !v.organizacaoId || !v.roleId)) return "incomplete";
  const organizacoes = vinculos.map((v) => v.organizacaoId);
  return new Set(organizacoes).size < organizacoes.length ? "duplicate" : undefined;
}

/** Nome, email (formato e único), telefone (formato), palavra-passe (obrigatória só ao criar) e vínculos (1+, sem repetir organização). */
export function validarUtilizador(
  v: ValoresUtilizador, existentes: readonly Utilizador[], opcoes: { criar: boolean; idAtual?: string },
): ErrosUtilizador {
  const erros: ErrosUtilizador = {};
  const email = normalizar(v.email);
  if (!v.nome.trim()) erros.nome = "required";
  if (!email) erros.email = "required";
  else if (!FORMATO_EMAIL.test(email)) erros.email = "format";
  else if (existentes.some((u) => u.id !== opcoes.idAtual && normalizar(u.email) === email)) erros.email = "duplicate";
  if (v.telefone.trim() && !FORMATO_TELEFONE.test(v.telefone.trim())) erros.telefone = "format";
  const palavra = erroPalavraPasse(v.palavraPasse, opcoes.criar);
  if (palavra) erros.palavraPasse = palavra;
  const vinculos = erroVinculos(v.vinculos);
  if (vinculos) erros.vinculos = vinculos;
  return erros;
}

type Aba = "geral" | "permissoes";
/** As abas da role que têm erros (os campos de nome e código vivem todos na aba Geral). */
export const abasComErroRole = (e: ErrosRole): Aba[] => (e.nome || e.codigo ? ["geral"] : []);

/** O primeiro campo errado, pela ordem do ecrã, e a aba onde vive. */
export function primeiroErroUtilizador(e: ErrosUtilizador): { campo: CampoUtilizador; aba: "dados" | "vinculos" } | null {
  const ordem: CampoUtilizador[] = ["nome", "email", "telefone", "palavraPasse", "vinculos"];
  const campo = ordem.find((c) => e[c]);
  if (!campo) return null;
  return { campo, aba: campo === "vinculos" ? "vinculos" : "dados" };
}

/** Quais das abas do utilizador têm erros. */
export function abasComErroUtilizador(e: ErrosUtilizador): { dados: boolean; vinculos: boolean } {
  return { dados: !!(e.nome || e.email || e.telefone || e.palavraPasse), vinculos: !!e.vinculos };
}
