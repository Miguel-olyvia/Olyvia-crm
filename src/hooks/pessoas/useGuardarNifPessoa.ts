import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVE_NIF_INDISPONIVEL, chaveDoErro, codigoDoErro } from "./errosNeg";
import { invalidarPessoas } from "./invalidarPessoas";
import { useFontePessoas } from "./useFontePessoas";

/** O que a função devolve: só os últimos 3 dígitos (nunca o NIF) e se algo mudou. */
export interface ResultadoNif {
  nifUltimos3: string | null;
  mudou: boolean;
}

export interface GuardarNif {
  /** `""` limpa o NIF. Lança `ErroNeg` se falhar. */
  guardar: (nif: string) => Promise<ResultadoNif>;
}

const SEM_RESULTADO: ResultadoNif = { nifUltimos3: null, mudou: false };
const RPC = "neg_guardar_nif_pessoa";
// A função (ou o proxy que a deixa passar) ainda não está publicada: o proxy recusa-a, ou o PostgREST não a encontra.
const NAO_DISPONIVEL = /RPC n[ãa]o permitida|PGRST202|Could not find the function|does not exist/i;

function lerResultado(dados: unknown): ResultadoNif {
  const corpo = typeof dados === "object" && dados !== null ? (dados as { data?: unknown }).data : null;
  if (typeof corpo !== "object" || corpo === null) return SEM_RESULTADO;
  const d = corpo as Record<string, unknown>;
  return { nifUltimos3: typeof d.nif_ultimos3 === "string" ? d.nif_ultimos3 : null, mudou: d.mudou === true };
}

/** A mensagem do corpo do erro do proxy (`{ error }`), ou null. O proxy nunca lá põe o NIF. */
async function mensagemDoProxy(erro: unknown): Promise<{ status: number | null; mensagem: string | null }> {
  const contexto = typeof erro === "object" && erro !== null ? (erro as { context?: unknown }).context : null;
  if (typeof contexto !== "object" || contexto === null) return { status: null, mensagem: null };
  const { status, json } = contexto as { status?: unknown; json?: unknown };
  let mensagem: string | null = null;
  if (typeof json === "function") {
    try {
      const corpo = await (json as () => Promise<unknown>).call(contexto);
      const texto = typeof corpo === "object" && corpo !== null ? (corpo as { error?: unknown }).error : null;
      mensagem = typeof texto === "string" ? texto : null;
    } catch {
      mensagem = null;
    }
  }
  return { status: typeof status === "number" ? status : null, mensagem };
}

async function erroDoProxy(erro: unknown): Promise<ErroNeg> {
  const { mensagem } = await mensagemDoProxy(erro);
  // Só a mensagem o diz: um 404 sozinho pode ser a pessoa inexistente ou outro erro, nunca «função por publicar».
  if (mensagem !== null && NAO_DISPONIVEL.test(mensagem)) return new ErroNeg(erro, null, CHAVE_NIF_INDISPONIVEL);
  const sintetico = mensagem !== null ? { message: mensagem } : null;
  const codigo = sintetico ? codigoDoErro(sintetico) : null;
  // Os códigos NG são esperados (o ecrã diz o que se passa); o resto é avaria. Só o erro original vai ao Sentry: a mensagem do proxy não leva o NIF, mas não se arrisca.
  if (!codigo) captureFlowError(erro, "pessoas-neg");
  return new ErroNeg(erro, codigo, sintetico ? chaveDoErro(sintetico) : CHAVE_ERRO_GENERICO);
}

/**
 * Grava o NIF da pessoa com `neg_guardar_nif_pessoa`, pelo `nif-write-proxy` (o hash e a cifra do NIF só se calculam no servidor, onde estão as chaves).
 * O NIF só viaja no corpo do pedido: nunca vai a log, a erro nem ao Sentry. Lança `ErroNeg`: NG030 (NIF de outra pessoa), NG009 (inválido),
 * NG003 (pessoa indisponível), a chave `nifIndisponivel` se a função ainda não existe, ou a genérica. Depois de um sucesso refaz a ficha e as listas
 * (se a releitura falhar a base já gravou e não se lança).
 */
export function useGuardarNifPessoa(pessoaId: string): GuardarNif {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const guardar = useCallback(async (nif: string): Promise<ResultadoNif> => {
    if (!organizationId || !pessoaId) throw new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
    const limpo = nif.trim();
    let resposta: { data: unknown; error: unknown };
    try {
      resposta = await supabase.functions.invoke("nif-write-proxy", {
        body: { rpc: RPC, nif: limpo === "" ? null : limpo, params: { p_organization_id: organizationId, p_entity_id: pessoaId, p_nif: limpo } },
      });
    } catch (excecao) {
      captureFlowError(excecao, "pessoas-neg");
      throw new ErroNeg(excecao, null, CHAVE_ERRO_GENERICO);
    }
    if (resposta.error) throw await erroDoProxy(resposta.error);
    try {
      await invalidarPessoas(client, organizationId, pessoaId);
    } catch {
      // A base já gravou: a ficha refaz-se na próxima leitura.
    }
    return lerResultado(resposta.data);
  }, [organizationId, pessoaId, client]);
  return { guardar };
}
