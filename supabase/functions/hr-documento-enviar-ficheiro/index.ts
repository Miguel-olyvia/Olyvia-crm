/**
 * hr-documento-enviar-ficheiro -- "anexar ficheiro novo e enviar a pessoa" do
 * portal do colaborador, numa so accao. SO no projecto RH.
 *
 * O cliente sobe o ficheiro para hr-documentos-quarantine em
 * <organizacao>/<pessoa>/<documento_novo>/<uuid>.<ext> (o id do documento e
 * gerado por ele) e chama esta funcao com o caminho e os metadados. Aqui:
 *   1. utilizador real (nunca service_role/cron), 10 pedidos por minuto por
 *      actor, organizacao visivel, as duas permissoes (hr.pessoas.documentos.emitir
 *      E .edit), pessoa da organizacao, convite (se vier) da mesma pessoa, e o
 *      objecto da quarentena carregado pelo proprio -- ANTES de tocar no Storage;
 *   2. descarrega, confere o tamanho e o tipo real pelos primeiros bytes DOS
 *      MESMOS bytes que se copiam e de que se calcula o SHA-256;
 *   3. copia para hr-documentos SEM upsert;
 *   4. rpc_hr_portal_documento_novo_enviar: cria o documento ja com o ficheiro
 *      e envia-o, numa transaccao (a base revalida tudo).
 * O objecto copiado so se apaga quando a RPC PROVA o rollback (RAISE da propria
 * funcao) e nenhum documento o refere. Em erros ambiguos nao se apaga nada: um
 * objecto sem documento e invisivel; um documento sem objecto nao.
 *
 * Porque uma funcao nova e nao uma accao na validate-upload: a validate-upload
 * e partilhada com os outros modulos e esta publicada tambem na base
 * principal; esta so existe no projecto RH (desenho-docs-portal.md, ponto 0.6).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AuthError, resolveCallerIdentity, validateOrgScope } from "../_shared/auth.ts";
import { orgScoped, type OrgScopedQueryBuilder } from "../_shared/orgScopedQuery.ts";
import { detectSignature, toHex } from "../_shared/fileSignature.ts";
import { checkRateLimit, recordRateLimitAttempt } from "../_shared/rateLimit.ts";
import {
  LIMITE_POR_MINUTO,
  TAMANHO_MAXIMO_BYTES,
  codigoDoErro,
  decisaoDoDono,
  erroProvaRollback,
  lerPedido,
  mimeConfirmado,
  respostaDoErroRpc,
  type CodigoErro,
  type PedidoEnvio,
} from "./regras.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUARENTENA = "hr-documentos-quarantine";
const FINAL = "hr-documentos";
const BYTES_DA_ASSINATURA = 64;
const BALDE_LIMITE = "hr-documento-enviar-ficheiro";

function json(payload: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" },
  });
}

function falha(status: number, codigo: CodigoErro, extra: Record<string, string> = {}): Response {
  return json({ ok: false, codigo }, status, extra);
}

/** Para o registo: o codigo do erro (PostgREST/Postgres) ou a mensagem de um Error, nunca dados. */
function paraRegisto(e: unknown): string {
  return codigoDoErro(e) ?? (e instanceof Error ? e.message : "desconhecido");
}

// deno-lint-ignore no-explicit-any
type Cliente = any;

/** select() com o filtro da organizacao obrigatorio (regra do projecto para o cliente service_role). */
function porOrganizacao(supabase: Cliente, tabela: string, colunas: string, organizationId: string) {
  return orgScoped(
    { from: (t: string) => supabase.from(t).select(colunas) as unknown as OrgScopedQueryBuilder },
    tabela,
    organizationId,
    // deno-lint-ignore no-explicit-any
  ) as any;
}

/** O Storage respondeu que o objecto nao existe (400/404). */
function objectoInexistente(e: unknown): boolean {
  const r = (e ?? {}) as { status?: unknown; statusCode?: unknown };
  return ["400", "404"].includes(String(r.status ?? r.statusCode ?? ""));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return falha(405, "pedido_invalido");

  const url = Deno.env.get("SUPABASE_URL");
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chave) {
    console.error("hr-documento-enviar-ficheiro: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta");
    return falha(500, "erro_inesperado");
  }
  const supabase = createClient(url, chave);

  // ---- 1. Quem pede ----------------------------------------------------------
  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    if (e instanceof AuthError) return falha(e.status, e.status === 401 ? "nao_autenticado" : "insufficient_privilege");
    console.error("hr-documento-enviar-ficheiro: identidade falhou:", paraRegisto(e));
    return falha(500, "erro_inesperado");
  }
  if (caller.isServiceRole) {
    // Um documento de RH tem sempre um utilizador real por tras (o uid vai para a auditoria).
    return falha(403, "insufficient_privilege");
  }

  // Limite por actor: conta pedidos aceites, antes de qualquer trabalho.
  const limite = await checkRateLimit(supabase, {
    bucket: BALDE_LIMITE, identifier: caller.authUid, maxAttempts: LIMITE_POR_MINUTO, windowMinutes: 1,
  });
  if (!limite.allowed) return falha(429, "limite_excedido", { "Retry-After": String(limite.retryAfterSeconds) });
  await recordRateLimitAttempt(supabase, BALDE_LIMITE, caller.authUid);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return falha(400, "pedido_invalido");
  }
  const leitura = lerPedido(corpo);
  if (!leitura.ok) return falha(leitura.codigo === "estado_invalido" ? 409 : 400, leitura.codigo);
  const p: PedidoEnvio = leitura.pedido;

  // ---- 2. Se pode (ate aqui nada se apaga: so quem prova poder na organizacao
  //         mexe na quarentena dela) ---------------------------------------------
  try {
    if (!(await validateOrgScope(supabase, caller, p.organizationId))) return falha(403, "insufficient_privilege");
    for (const permissao of ["hr.pessoas.documentos.emitir", "hr.pessoas.documentos.edit"]) {
      const { data, error } = await supabase.rpc("has_anew_permission_in_org", {
        _auth_uid: caller.authUid,
        _permission_code: permissao,
        _organization_id: p.organizationId,
      });
      if (error) {
        console.error("hr-documento-enviar-ficheiro: has_anew_permission_in_org falhou:", paraRegisto(error));
        return falha(500, "erro_inesperado");
      }
      if (data !== true) return falha(403, "insufficient_privilege");
    }
  } catch (e) {
    console.error("hr-documento-enviar-ficheiro: verificacao de permissao falhou:", paraRegisto(e));
    return falha(500, "erro_inesperado");
  }

  const apagarQuarentena = async () => {
    const { error } = await supabase.storage.from(QUARENTENA).remove([p.caminho]);
    if (error) console.error("hr-documento-enviar-ficheiro: nao apagou a quarentena:", p.documentoId, paraRegisto(error));
  };
  /** Apaga o objecto final SO se nenhum documento o referir (nunca o de um documento que existe). */
  const apagarFinalSeOrfao = async () => {
    const { data, error } = await porOrganizacao(supabase, "pessoas_documentos", "id", p.organizationId)
      .eq("ficheiro_caminho", p.caminho)
      .limit(1);
    if (error) {
      console.error("hr-documento-enviar-ficheiro: nao confirmou se o objecto final e orfao; fica:", p.documentoId, paraRegisto(error));
      return;
    }
    if (Array.isArray(data) && data.length > 0) return;
    const { error: erroApagar } = await supabase.storage.from(FINAL).remove([p.caminho]);
    if (erroApagar) console.error("hr-documento-enviar-ficheiro: objecto final orfao por apagar:", p.documentoId, paraRegisto(erroApagar));
  };
  const recusar = async (status: number, codigo: CodigoErro) => {
    await apagarQuarentena();
    return falha(status, codigo);
  };
  /**
   * Este pedido ja foi feito (a resposta perdeu-se, ou um pedido igual acabou primeiro):
   * o documento existe com ESTE id e ESTE caminho. Devolve a resposta de sucesso, ou null.
   */
  const respostaSeRepetido = async (): Promise<Response | null> => {
    const { data: doc, error } = await porOrganizacao(
      supabase, "pessoas_documentos", "id, pessoa_id, estado", p.organizationId,
    )
      .eq("id", p.documentoId)
      .eq("ficheiro_caminho", p.caminho)
      .maybeSingle();
    if (error) throw error;
    if (!doc || doc.pessoa_id !== p.pessoaId) return null;
    await apagarQuarentena();
    const { data: envio, error: erroEnvio } = await porOrganizacao(
      supabase, "pessoas_portal_envios", "id", p.organizationId,
    )
      .eq("documento_id", p.documentoId)
      .is("retirado_em", null)
      .maybeSingle();
    // O documento e o envio ja existem; sem o id do envio a resposta continua verdadeira.
    if (erroEnvio) console.error("hr-documento-enviar-ficheiro: leitura do envio repetido falhou:", p.documentoId, paraRegisto(erroEnvio));
    return json({
      ok: true, repetido: true, documentoId: p.documentoId,
      envioId: !erroEnvio && envio ? envio.id : null, estado: doc.estado,
    });
  };

  try {
    // ---- 3. A pessoa, o documento (repetido?), o convite e o dono do ficheiro --
    const { data: pessoa, error: erroPessoa } = await porOrganizacao(supabase, "pessoas", "id", p.organizationId)
      .eq("id", p.pessoaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (erroPessoa) throw erroPessoa;
    if (!pessoa) return await recusar(404, "nao_encontrado");

    const repetido = await respostaSeRepetido();
    if (repetido) return repetido;
    const { data: outro, error: erroOutro } = await porOrganizacao(supabase, "pessoas_documentos", "id", p.organizationId)
      .eq("id", p.documentoId)
      .maybeSingle();
    if (erroOutro) throw erroOutro;
    if (outro) return await recusar(409, "pedido_invalido");

    if (p.conviteId) {
      const { data: convite, error: erroConvite } = await porOrganizacao(
        supabase, "pessoas_convites_admissao", "id, pessoa_id", p.organizationId,
      )
        .eq("id", p.conviteId)
        .maybeSingle();
      if (erroConvite) throw erroConvite;
      if (!convite || convite.pessoa_id !== p.pessoaId) return await recusar(404, "nao_encontrado");
    }

    // Quem carregou o objecto: um dono preenchido e diferente de quem chama e recusado
    // (sem apagar: nao e dele). Dono vazio passa (decisaoDoDono).
    const { data: dono, error: erroDono } = await supabase.rpc("rpc_hr_documento_quarentena_dono", { p_caminho: p.caminho });
    if (erroDono) throw erroDono;
    const decisao = decisaoDoDono(dono, caller.authUid);
    if (decisao === "em_falta") return falha(404, "ficheiro_em_falta");
    if (decisao === "recusar") return falha(403, "insufficient_privilege");

    // ---- 4. O ficheiro: os bytes que se validam sao os que se copiam e se resumem --
    const { data: ficheiro, error: erroDescarga } = await supabase.storage.from(QUARENTENA).download(p.caminho);
    if (erroDescarga && objectoInexistente(erroDescarga)) return falha(404, "ficheiro_em_falta");
    if (erroDescarga || !ficheiro) throw erroDescarga ?? new Error("descarga vazia");
    if (ficheiro.size <= 0) return await recusar(422, "ficheiro_invalido");
    if (ficheiro.size > TAMANHO_MAXIMO_BYTES) return await recusar(422, "ficheiro_demasiado_grande");
    const bytes = new Uint8Array(await ficheiro.arrayBuffer());
    const mime = mimeConfirmado(detectSignature(bytes.subarray(0, BYTES_DA_ASSINATURA)), p.extensao);
    if (!mime) return await recusar(422, "ficheiro_invalido");
    const hash = toHex(await crypto.subtle.digest("SHA-256", bytes));

    // ---- 5. Copia sem upsert: um caminho ja ocupado nunca e escrito por cima ------
    const { error: erroCopia } = await supabase.storage
      .from(FINAL)
      .upload(p.caminho, bytes, { upsert: false, contentType: mime });
    if (erroCopia) {
      const ocupado = String((erroCopia as { statusCode?: unknown }).statusCode ?? "") === "409"
        || /exist/i.test(erroCopia.message ?? "");
      if (ocupado) {
        // Um pedido igual pode ter acabado entretanto: se sim, isto ja esta feito.
        const feito = await respostaSeRepetido();
        if (feito) return feito;
        // Sobra de uma tentativa que caiu entre a copia e a RPC: nao se escreve por
        // cima; o cliente repete com ids novos. O objecto antigo fica (invisivel).
        return await recusar(409, "pedido_repetido");
      }
      // Nao se sabe se o objecto chegou a ser criado: nao se apaga nada.
      console.error("hr-documento-enviar-ficheiro: copia para hr-documentos falhou:", p.documentoId, paraRegisto(erroCopia));
      return falha(500, "erro_inesperado");
    }

    // ---- 6. A transaccao: documento ja com o ficheiro, e o envio -------------------
    const { data: criado, error: erroRpc } = await supabase.rpc("rpc_hr_portal_documento_novo_enviar", {
      p_auth_uid: caller.authUid,
      p_organization_id: p.organizationId,
      p_pessoa_id: p.pessoaId,
      p_documento_id: p.documentoId,
      p_tipo: p.tipo,
      p_titulo: p.titulo,
      p_ficheiro_caminho: p.caminho,
      p_ficheiro_hash_sha256: hash,
      p_exige_assinatura: p.exigeAssinatura,
      p_convite_id: p.conviteId,
      p_vinculo_id: p.vinculoId,
    });
    if (erroRpc) {
      if (erroProvaRollback(erroRpc)) {
        // RAISE da propria RPC: houve ROLLBACK, ninguem refere o objecto copiado.
        await apagarFinalSeOrfao();
        const r = respostaDoErroRpc(erroRpc);
        return await recusar(r.status, r.codigo);
      }
      // Rede, timeout, 5xx ou sem codigo: pode ter havido COMMIT. Nao se apaga nada;
      // repetir o mesmo pedido cai em respostaSeRepetido se o documento ficou criado.
      console.error("hr-documento-enviar-ficheiro: RPC com resultado incerto:", p.documentoId, paraRegisto(erroRpc));
      return falha(500, "erro_inesperado");
    }

    await apagarQuarentena();
    const r = (criado ?? {}) as Record<string, unknown>;
    return json({
      ok: true,
      documentoId: p.documentoId,
      envioId: typeof r.envio_id === "string" ? r.envio_id : null,
      estado: typeof r.estado === "string" ? r.estado : null,
      temTelemovel: typeof r.tem_telemovel === "boolean" ? r.tem_telemovel : null,
      telemovelMascarado: typeof r.telemovel_mascarado === "string" ? r.telemovel_mascarado : null,
    });
  } catch (e) {
    // Nao se sabe em que passo caiu: nunca se apaga nada aqui (nem o final, nem a quarentena).
    console.error("hr-documento-enviar-ficheiro: falha inesperada:", p.documentoId, paraRegisto(e));
    return falha(500, "erro_inesperado");
  }
});
