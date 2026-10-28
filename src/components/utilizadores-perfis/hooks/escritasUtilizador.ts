// Wrapper: as escritas de utilizadores na base, com a lógica de UsersNew.tsx: a Edge create-user (cria com palavra-passe, não
// envia convite nem email), rpc_update_user pelo nif-write-proxy (editar e mudar a role de um vínculo), update-user-password,
// e delete-user/restore-user + rpc_delete_user/rpc_restore_user (desativar é um soft delete reversível). Cada função devolve
// `{ ok }` ou `{ ok: false, erro }`: nunca se engole um erro.
import { callNifWriteProxy } from "@/lib/nif/callNifWriteProxy";
import { corpoCriarUtilizador, paramsAtualizarUtilizador, type ValoresGravar } from "../payloadsUtilizador";
import { mensagemDeErro } from "../rolesReais";
import type { ResultadoMutacao, Utilizador, Vinculo } from "../tipos";
import { db } from "./clienteBase";
import { carregarDetalheUtilizador } from "./detalheUtilizador";
import { mensagemDaFuncao } from "./erroFuncaoEdge";

/** O código que sobe quando o email já tem conta; o ecrã traduz-o. */
export const ERRO_EMAIL_EXISTENTE = "EMAIL_EXISTS";
export const MIN_PALAVRA_PASSE_BASE = 6;

const falha = (e: unknown): ResultadoMutacao => ({ ok: false, erro: mensagemDeErro(e) });
const EMAIL_JA_REGISTADO = /already been registered|email_exists/i;

export async function criarUtilizadorNaBase(valores: ValoresGravar, vinculos: readonly Vinculo[]): Promise<ResultadoMutacao> {
  try {
    const resposta = await db.functions.invoke("create-user", { body: corpoCriarUtilizador(valores, vinculos) });
    if (resposta.error) {
      const mensagem = await mensagemDaFuncao(resposta, resposta.error);
      if (mensagem && EMAIL_JA_REGISTADO.test(mensagem)) return { ok: false, erro: ERRO_EMAIL_EXISTENTE };
      return { ok: false, erro: mensagem ?? "Não foi possível criar o utilizador." };
    }
    const criado = (resposta.data as { anew_user_id?: string } | null)?.anew_user_id;
    if (!criado) return { ok: false, erro: "A base não devolveu o utilizador criado." };
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}

async function mudarPalavraPasse(authUserId: string, palavraPasse: string): Promise<void> {
  const resposta = await db.functions.invoke("update-user-password", { body: { targetUserId: authUserId, newPassword: palavraPasse } });
  if (resposta.error) throw new Error((await mensagemDaFuncao(resposta, resposta.error)) ?? "Erro ao atualizar a palavra-passe.");
}

export interface PedidoAtualizar {
  utilizador: Utilizador;
  valores: ValoresGravar;
  vinculos: Vinculo[];
  ambitosEditaveis: boolean;
}

export async function atualizarUtilizadorNaBase(p: PedidoAtualizar): Promise<ResultadoMutacao> {
  try {
    const detalhe = await carregarDetalheUtilizador(p.utilizador);
    const { params, nif } = paramsAtualizarUtilizador({ ...p, detalhe });
    const { error } = await callNifWriteProxy("rpc_update_user", params, nif);
    if (error) return falha(error);
    const nova = p.valores.palavraPasse.trim();
    if (nova.length >= MIN_PALAVRA_PASSE_BASE && p.utilizador.authUserId) {
      try {
        await mudarPalavraPasse(p.utilizador.authUserId, nova);
      } catch (e) {
        return { ok: false, erro: `Os dados foram gravados, mas a palavra-passe não foi alterada: ${mensagemDeErro(e)}` };
      }
    }
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}

/** Muda a role de um vínculo já existente: a base não tem escrita direta, tudo passa pelo rpc_update_user. */
export function mudarRoleNaBase(u: Utilizador, membershipId: string, roleId: string, ambitosEditaveis: boolean): Promise<ResultadoMutacao> {
  const vinculos = u.vinculos.filter((v) => v.ativo).map((v) => (v.membershipId === membershipId ? { ...v, roleId } : v));
  return atualizarUtilizadorNaBase({
    utilizador: u, vinculos, ambitosEditaveis,
    valores: { nome: u.nome, email: u.email, telefone: u.telefone ?? "", posicao: u.posicao ?? "", palavraPasse: "" },
  });
}

/** Desativar: revoga o login (delete-user) e marca o utilizador inativo (rpc_delete_user). Reversível. */
export async function desativarUtilizadorNaBase(u: Utilizador): Promise<ResultadoMutacao> {
  try {
    if (u.authUserId) {
      const r = await db.functions.invoke("delete-user", { body: { userId: u.authUserId } });
      if (r.error) return { ok: false, erro: (await mensagemDaFuncao(r, r.error)) ?? "Não foi possível desativar o login." };
    }
    const { error } = await db.rpc("rpc_delete_user", { p_user_id: u.id });
    return error ? falha(error) : { ok: true };
  } catch (e) {
    return falha(e);
  }
}

export async function reativarUtilizadorNaBase(u: Utilizador): Promise<ResultadoMutacao> {
  try {
    if (u.authUserId) {
      const r = await db.functions.invoke("restore-user", { body: { userId: u.authUserId } });
      if (r.error) return { ok: false, erro: (await mensagemDaFuncao(r, r.error)) ?? "Não foi possível reativar o login." };
    }
    const { error } = await db.rpc("rpc_restore_user", { p_user_id: u.id });
    return error ? falha(error) : { ok: true };
  } catch (e) {
    return falha(e);
  }
}
