// A procura de duplicados da «Nova lead» de Pessoas: neg_procurar_duplicados (uma só chamada: email, telefone e NIF) e, para cada pessoa
// encontrada nesta organização, a leitura dos dados dela com a sessão de quem cria (só select). Substitui, em Pessoas, as procuras por
// identidade, por nome e por grupo de Leads. O NIF só vai por hash, calculado no servidor (a chave nunca chega ao browser): com NIF a
// chamada passa pela Edge Function neg-procurar-duplicados-proxy, que chama a mesma função da base com a sessão de quem pede.
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chamarNeg, ErroNeg } from "../chamarNeg";
import { CHAVES_ERRO_NEG, CHAVE_ERRO_GENERICO } from "../errosNeg";
import type {
  CampoForte, Escrito, LeadConhecida, LinhaDuplicado, OutraEmpresa, PessoaEncontrada, ResultadoDuplicados,
} from "./tiposNovaLead";

const PAIS = "PT";
const FUNCAO_NIF = "neg-procurar-duplicados-proxy";
const CAMPOS: readonly CampoForte[] = ["email", "telefone", "nif"];
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RE_TELEFONE = /^\+?[0-9 ().-]+$/;

const texto = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);
const generico = (causa: unknown): ErroNeg => new ErroNeg(causa, null, CHAVE_ERRO_GENERICO);

export interface Verificaveis { email: string | null; telefone: string | null; nif: string | null }

/**
 * Só vai à base o que ela aceita: email com formato (até 254), telefone de 7 a 15 dígitos, NIF com algum dígito. O resto não se verifica
 * (a base daria NG009 e a «Nova lead» ficava bloqueada por um campo mal escrito; a validação do formulário é que o apanha).
 */
export function identificadoresVerificaveis(escrito: Escrito): Verificaveis {
  const email = texto(escrito.email);
  const telefone = texto(escrito.telefone);
  const nif = texto(escrito.nif);
  const digitos = (telefone ?? "").replace(/\D/g, "").length;
  return {
    email: email !== null && email.length <= 254 && RE_EMAIL.test(email) ? email : null,
    telefone: telefone !== null && telefone.length <= 30 && RE_TELEFONE.test(telefone) && digitos >= 7 && digitos <= 15 ? telefone : null,
    nif: nif !== null && nif.length <= 30 && /\d/.test(nif) ? nif : null,
  };
}

function lerLinhas(dados: unknown): LinhaDuplicado[] {
  if (!Array.isArray(dados)) return [];
  const linhas: LinhaDuplicado[] = [];
  for (const bruta of dados) {
    if (typeof bruta !== "object" || bruta === null) continue;
    const l = bruta as Record<string, unknown>;
    const campo = CAMPOS.find((c) => c === l.campo);
    const ambito = l.ambito === "organizacao" || l.ambito === "grupo" ? l.ambito : null;
    if (!campo || !ambito) continue;
    const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
    linhas.push({
      pessoa: typeof l.pessoa === "number" ? l.pessoa : null,
      campo,
      ambito,
      entityId: str(l.entity_id),
      nome: str(l.nome),
      visivel: typeof l.visivel === "boolean" ? l.visivel : null,
      organizacaoId: str(l.organizacao_id),
      organizacaoNome: str(l.organizacao_nome),
    });
  }
  return linhas;
}

/** A chamada à base: a RPC, ou a Edge Function quando há NIF (o hash calcula-se lá). Lança ErroNeg. */
async function chamarProcura(organizationId: string, v: Verificaveis): Promise<unknown> {
  if (v.nif === null) {
    return chamarNeg<unknown>("neg_procurar_duplicados", {
      p_organization_id: organizationId, p_email: v.email, p_telefone: v.telefone, p_nif_hash: null, p_pais: PAIS,
    });
  }
  let resposta: { data?: { success?: boolean; data?: unknown; code?: string } | null; error?: unknown } | null = null;
  try {
    resposta = await supabase.functions.invoke(FUNCAO_NIF, {
      body: { orgId: organizationId, email: v.email, phone: v.telefone, nif: v.nif, countryCode: PAIS },
    });
  } catch (excecao) {
    captureFlowError(excecao, "pessoas-neg");
    throw generico(excecao);
  }
  if (resposta?.error) {
    captureFlowError(resposta.error, "pessoas-neg");
    throw generico(resposta.error);
  }
  const corpo = resposta?.data;
  if (corpo?.success !== true) {
    const codigo = typeof corpo?.code === "string" && Object.prototype.hasOwnProperty.call(CHAVES_ERRO_NEG, corpo.code) ? corpo.code : null;
    if (codigo) throw new ErroNeg(null, codigo, CHAVES_ERRO_NEG[codigo]);
    captureFlowError(new Error("neg-procurar-duplicados-proxy sem sucesso"), "pessoas-neg");
    throw generico(null);
  }
  return corpo.data;
}

interface PessoaBase { entityId: string | null; nome: string | null; visivel: boolean; campos: CampoForte[] }

function agruparPessoas(linhas: readonly LinhaDuplicado[]): PessoaBase[] {
  const grupos = new Map<string, PessoaBase>();
  for (const l of linhas) {
    if (l.ambito !== "organizacao") continue;
    // Linhas da mesma pessoa partilham o número; sem número (não devia acontecer) cada linha é uma pessoa.
    const chave = l.pessoa !== null ? `n${l.pessoa}` : `x${grupos.size}`;
    const existente = grupos.get(chave);
    if (existente) {
      if (!existente.campos.includes(l.campo)) existente.campos.push(l.campo);
      continue;
    }
    grupos.set(chave, { entityId: l.entityId, nome: l.nome, visivel: l.visivel === true && l.entityId !== null, campos: [l.campo] });
  }
  return [...grupos.values()];
}

function agruparGrupo(linhas: readonly LinhaDuplicado[]): OutraEmpresa[] {
  const porOrg = new Map<string, OutraEmpresa>();
  for (const l of linhas) {
    if (l.ambito !== "grupo") continue;
    const chave = l.organizacaoId ?? l.organizacaoNome ?? "?";
    const e = porOrg.get(chave);
    if (e) {
      if (!e.campos.includes(l.campo)) e.campos.push(l.campo);
    } else {
      porOrg.set(chave, { organizacaoId: l.organizacaoId, nome: l.organizacaoNome ?? "", campos: [l.campo] });
    }
  }
  return [...porOrg.values()];
}

type Linha = Record<string, unknown>;

async function ler(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<Linha[]> {
  const { data, error } = await consulta;
  if (error) {
    captureFlowError(error, "pessoas-neg");
    throw generico(error);
  }
  return Array.isArray(data) ? (data as Linha[]) : [];
}

const doEntity = (linhas: Linha[], id: string): Linha[] => linhas.filter((l) => l.entity_id === id);
const principal = (linhas: Linha[], coluna: string): string | null => {
  const escolhida = linhas.find((l) => l.is_primary === true) ?? linhas[0];
  return escolhida && typeof escolhida[coluna] === "string" ? (escolhida[coluna] as string) : null;
};
const todos = (linhas: Linha[], coluna: string): string[] => linhas.map((l) => l[coluna]).filter((v): v is string => typeof v === "string" && v !== "");
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Lê, com a sessão de quem cria, os dados de cada pessoa visível da organização. Só select; qualquer falha lança (fail-closed). */
async function lerPessoas(organizationId: string, bases: readonly PessoaBase[]): Promise<PessoaEncontrada[]> {
  const ids = bases.filter((b) => b.visivel && b.entityId).map((b) => b.entityId as string);
  const db = supabase as unknown as { from: (t: string) => any };
  let entidades: Linha[] = [], emails: Linha[] = [], telefones: Linha[] = [], leads: Linha[] = [], clientes: Linha[] = [], utilizadores: Linha[] = [];
  if (ids.length > 0) {
    [entidades, emails, telefones, leads, clientes] = await Promise.all([
      ler(db.from("anew_entities").select("id, display_name, created_at").in("id", ids)),
      ler(db.from("anew_entity_emails").select("entity_id, email, is_primary").in("entity_id", ids)),
      ler(db.from("anew_entity_phones").select("entity_id, phone_number, is_primary").in("entity_id", ids)),
      ler(db.from("anew_leads").select("id, entity_id, status, closure_result, created_at, assigned_to")
        .eq("organization_id", organizationId).in("entity_id", ids).is("deleted_at", null)),
      ler(db.from("anew_clients").select("id, entity_id, status, created_at")
        .eq("organization_id", organizationId).in("entity_id", ids).is("deleted_at", null)),
    ]);
    const atribuidos = [...new Set(leads.map((l) => str(l.assigned_to)).filter((v): v is string => v !== null))];
    if (atribuidos.length > 0) utilizadores = await ler(db.from("anew_users").select("id, name").in("id", atribuidos));
  }
  const nomeDe = (id: string | null): string | null => (id ? str(utilizadores.find((u) => u.id === id)?.name) : null);
  return bases.map((b): PessoaEncontrada => {
    if (!b.visivel || !b.entityId) {
      return {
        entityId: null, nome: null, visivel: false, campos: b.campos, emailPrincipal: null, emails: [], telefonePrincipal: null, telefones: [],
        leads: [], temCliente: false, clienteAtivo: false, criadaEm: null,
      };
    }
    const id = b.entityId;
    const e = doEntity(emails, id);
    const t = doEntity(telefones, id);
    const cs = doEntity(clientes, id);
    const ls: LeadConhecida[] = doEntity(leads, id).map((l) => ({
      id: String(l.id),
      estado: str(l.status) ?? "",
      encerrada: str(l.closure_result) !== null,
      motivoEncerramento: str(l.closure_result),
      criadaEm: str(l.created_at),
      atribuidoA: nomeDe(str(l.assigned_to)),
    }));
    const entidade = entidades.find((x) => x.id === id);
    return {
      entityId: id,
      nome: str(entidade?.display_name) ?? b.nome,
      visivel: true,
      campos: b.campos,
      emailPrincipal: principal(e, "email"),
      emails: todos(e, "email"),
      telefonePrincipal: principal(t, "phone_number"),
      telefones: todos(t, "phone_number"),
      leads: ls,
      temCliente: cs.length > 0,
      clienteAtivo: cs.some((c) => c.status !== "inactive"),
      criadaEm: str(entidade?.created_at),
    };
  });
}

/**
 * Procura pessoas com o mesmo email, telefone ou NIF nesta organização (e, como informação, nas do grupo). Lança ErroNeg se a procura
 * ou a leitura falhar: quem chama NÃO deve criar nem gravar a seguir a uma falha (a regra é «não se cria nada» sem esta verificação).
 */
export async function procurarDuplicados(organizationId: string, escrito: Escrito): Promise<ResultadoDuplicados> {
  const v = identificadoresVerificaveis(escrito);
  if (v.email === null && v.telefone === null && v.nif === null) return { pessoas: [], grupo: [] };
  const linhas = lerLinhas(await chamarProcura(organizationId, v));
  const pessoas = await lerPessoas(organizationId, agruparPessoas(linhas));
  return { pessoas, grupo: agruparGrupo(linhas) };
}
