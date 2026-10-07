/**
 * As tres accoes de anexos pelo RH: `url`, `confirmar` e `remover`. Toda a
 * logica vive aqui; o index.ts so liga os portos (JWT, rate limit, CORS).
 *
 * Sem importar URLs https nem Deno: o cliente de servico entra por um tipo
 * ESTRUTURAL (`ClienteAnexos`, o do convite), por isso o vitest testa isto com
 * um falso.
 *
 * Segue o ciclo do convite (convite-admissao/accoesAnexos.ts), trocando o hash
 * do token pelo auth uid de quem esta autenticado e as RPCs do convite pelas
 * rpc_hr_anexo_rh_*. A Edge NAO decide permissoes: passa o auth uid as RPCs,
 * que leem a pessoa (ou o anexo) pela chave primaria, tiram a ORGANIZACAO DA
 * LINHA e verificam a permissao de escrita do tipo nessa organizacao. Nenhuma
 * organizacao entra pelo pedido.
 *
 * REGRAS QUE NAO SE PODEM PARTIR (as do convite, mais as da substituicao)
 * -----------------------------------------------------------------------
 *  - O objecto final existe ANTES de a linha ser promovida, e desfaz-se se a
 *    base recusar: nunca ha linha promovida sem objecto.
 *  - Nunca se apaga o objecto final de uma linha cujo descarte a base nao
 *    confirmou: se a linha estiver promovida, o objecto e o que a sustenta.
 *  - Nunca se apagam objectos de uma linha sem a base ter confirmado que a
 *    apagou (remover) ou substituiu (promover).
 *  - Nenhuma resposta traz organization_id, pessoa_id nem o caminho final.
 *  - Erros sao sempre `{error: codigo_estavel}`: nunca texto da base nem do
 *    Storage.
 *  - Falhas de limpeza nao sao erro para o RH, mas ficam registadas (so tipo e
 *    codigo, nunca caminhos nem nomes) e a limpeza diaria apanha o que ficar:
 *    o caminho final e o da quarentena sao os do convite.
 */
import { detectSignature } from "../_shared/fileSignature.ts";
import { UUID_RE, eUuid } from "../_shared/uuid.ts";
import {
  BUCKET_FINAL,
  BUCKET_QUARENTENA,
  alvosDoDescarte,
  copiarParaFinal,
  lerObjecto,
  sha256Hex,
  tentar,
  type ClienteAnexos,
} from "../convite-admissao/accoesAnexos.ts";
import {
  MIME_POR_ASSINATURA,
  eTipoAnexo,
  extensaoDoMime,
  sanitizarNomeOriginal,
  validarFicheiroReal,
  validarPedidoAnexo,
  type TipoAnexo,
} from "../convite-admissao/anexos.ts";
import { eCodigoRh, statusRh } from "./erros.ts";

export type { ClienteAnexos };

/** Bytes da cabeca de que a deteccao de assinatura precisa (a maior tem 12). */
const BYTES_DA_CABECA = 64;

export type AccaoRh = "url" | "confirmar" | "remover";
export const ACCOES_RH: readonly string[] = ["url", "confirmar", "remover"];

export function eAccaoRh(accao: unknown): accao is AccaoRh {
  return typeof accao === "string" && ACCOES_RH.includes(accao);
}

export interface RespostaAccao {
  status: number;
  body: Record<string, unknown>;
}

export interface PedidoAccaoRh {
  accao: string;
  svc: ClienteAnexos;
  /** Auth uid (uuid) de quem esta autenticado. */
  authUid: string;
  payload: Record<string, unknown> | null;
  /** Falhas inesperadas (Sentry). Nunca recebe caminhos nem nomes. */
  registarErro?: (erro: unknown) => void;
}

type RegistarErro = (e: unknown) => void;

const erro = (codigo: string): RespostaAccao => ({ status: statusRh(codigo), body: { error: codigo } });
const inesperado = (): RespostaAccao => erro("erro_inesperado");

function comoObjecto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function motivoDaResposta(data: unknown): string | null {
  const motivo = comoObjecto(data)?.erro;
  return typeof motivo === "string" ? motivo : null;
}

/** Um motivo da base, como resposta: so codigos do catalogo do RH; o resto e inesperado. */
function respostaDeMotivo(motivo: string, registarErro?: RegistarErro): RespostaAccao {
  if (eCodigoRh(motivo)) return erro(motivo);
  registarErro?.(new Error("hr-anexo-rh: motivo de anexo fora do catalogo"));
  return inesperado();
}

/**
 * Como `respostaDeMotivo`, para as accoes que partem de um anexo (confirmar,
 * remover): um anexo de outra organizacao nao se distingue de um inexistente,
 * por isso `pessoa_nao_encontrada` sai como `anexo_nao_encontrado`.
 */
function respostaDeMotivoAnexo(motivo: string, registarErro?: RegistarErro): RespostaAccao {
  return respostaDeMotivo(motivo === "pessoa_nao_encontrada" ? "anexo_nao_encontrado" : motivo, registarErro);
}

/**
 * Quem chama tem de ser um humano com JWT: uma chamada com a chave de servico
 * (ou do gatilho da base) nao tem utilizador para a auditoria. `null` = segue.
 */
export function recusarSeNaoForHumano(caller: { isServiceRole: boolean }): RespostaAccao | null {
  return caller.isServiceRole ? erro("sem_permissao") : null;
}

/** `substitui_anexo_id` opcional: ausente/null -> `undefined`; presente mas invalido -> `"invalido"`. */
function lerSubstituto(payload: Record<string, unknown> | null): string | undefined | "invalido" {
  const valor = payload?.substitui_anexo_id;
  if (valor === undefined || valor === null) return undefined;
  return typeof valor === "string" && UUID_RE.test(valor) ? valor : "invalido";
}

// -- url ---------------------------------------------------------------------

function descartar(svc: ClienteAnexos, authUid: string, anexoId: string, motivo: string, registarErro?: RegistarErro) {
  return tentar(
    () => svc.rpc("rpc_hr_anexo_rh_descartar", { p_auth_uid: authUid, p_anexo_id: anexoId, p_motivo: motivo }),
    registarErro,
  );
}

/**
 * Descarta a linha pendente (liberta a vaga) e diz se a base o confirmou. Quando
 * nao confirma, a falha fica registada e a linha expira por si (3 h).
 */
async function descartarOuRegistar(
  svc: ClienteAnexos,
  authUid: string,
  anexoId: string,
  motivo: string,
  registarErro?: RegistarErro,
): Promise<boolean> {
  const confirmado = await descartar(svc, authUid, anexoId, motivo, registarErro);
  if (!confirmado) registarErro?.(new Error("hr-anexo-rh: descarte da reserva nao confirmado"));
  return confirmado;
}

async function accaoUrl(p: PedidoAccaoRh): Promise<RespostaAccao> {
  const { svc, authUid, payload, registarErro } = p;
  const pessoaId = payload?.pessoa_id;
  const tipo = payload?.tipo;
  const nome = payload?.nome;
  const tamanho = payload?.tamanho;
  const mime = payload?.mime;
  if (typeof pessoaId !== "string" || !UUID_RE.test(pessoaId)) return erro("pedido_invalido");
  if (typeof tipo !== "string" || typeof nome !== "string" || typeof mime !== "string") return erro("pedido_invalido");
  if (typeof tamanho !== "number" || !Number.isSafeInteger(tamanho) || tamanho <= 0) return erro("pedido_invalido");
  const substitui = lerSubstituto(payload);
  if (substitui === "invalido") return erro("pedido_invalido");

  const recusa = validarPedidoAnexo({ tipo, tamanho, mime });
  if (recusa) return erro(recusa);

  const { data, error } = await svc.rpc("rpc_hr_anexo_rh_reservar", {
    p_auth_uid: authUid,
    p_pessoa_id: pessoaId,
    p_tipo: tipo,
    p_nome_original: sanitizarNomeOriginal(nome),
    p_tamanho_declarado: tamanho,
    p_mime_declarado: mime.trim().toLowerCase(),
    ...(substitui ? { p_substitui_anexo_id: substitui } : {}),
  });
  if (error) {
    registarErro?.(error);
    return inesperado();
  }
  const motivo = motivoDaResposta(data);
  if (motivo) return respostaDeMotivo(motivo, registarErro);

  const reserva = comoObjecto(data);
  const anexoId = reserva?.anexo_id;
  const caminho = reserva?.caminho;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId) || typeof caminho !== "string" || caminho === "") {
    registarErro?.(new Error("hr-anexo-rh: reservar devolveu uma forma inesperada"));
    return inesperado();
  }

  let uploadToken: string | null = null;
  try {
    const { data: assinado, error: erroAssinar } = await svc.storage
      .from(BUCKET_QUARENTENA)
      .createSignedUploadUrl(caminho, { upsert: false });
    if (erroAssinar) registarErro?.(erroAssinar);
    uploadToken = typeof assinado?.token === "string" && assinado.token !== "" ? assinado.token : null;
  } catch (e) {
    registarErro?.(e);
  }
  if (!uploadToken) {
    // A reserva conta para os tectos: liberta-a em vez de a deixar a ocupar uma vaga.
    await descartarOuRegistar(svc, authUid, anexoId, "upload_abandonado", registarErro);
    return erro("anexo_falha_envio");
  }

  return { status: 200, body: { ok: true, anexo_id: anexoId, caminho, upload_token: uploadToken } };
}

// -- confirmar ---------------------------------------------------------------

interface ContextoAnexo {
  tipo: TipoAnexo;
  caminho: string;
  organizationId: string;
  pessoaId: string;
}

function lerContexto(data: unknown): ContextoAnexo | null {
  const c = comoObjecto(data);
  if (!c || !eTipoAnexo(c.tipo)) return null;
  const { caminho, organization_id: org, pessoa_id: pessoa } = c;
  if (typeof caminho !== "string" || caminho === "") return null;
  if (!eUuid(org) || !eUuid(pessoa)) return null;
  return { tipo: c.tipo, caminho, organizationId: org, pessoaId: pessoa };
}

/** Recusas do contexto que dizem que a linha nao e deste utilizador (ou ja nao esta pendente): nao se descarta. */
const MOTIVOS_DE_OUTRA_LINHA: readonly string[] = [
  "pessoa_nao_encontrada",
  "anexo_nao_encontrado",
  "sem_permissao",
  "sem_sessao",
  "anexo_estado_invalido",
];

function motivoDeDescarte(codigo: string): "demasiado_grande" | "formato_invalido" {
  return codigo === "anexo_demasiado_grande" || codigo === "anexo_fotografia_demasiado_grande"
    ? "demasiado_grande"
    : "formato_invalido";
}

interface DadosDaPromocao {
  svc: ClienteAnexos;
  authUid: string;
  anexoId: string;
  caminhoFinal: string;
  caminhoQuarentena: string;
  mime: string;
  tamanho: number;
  hash: string;
  substitui?: string;
  registarErro?: RegistarErro;
}

/**
 * Desfaz uma copia que a base nao aceitou. O objecto final so se apaga depois de
 * a base confirmar o descarte da linha: sem essa confirmacao a linha pode estar
 * promovida, e o objecto e o que a sustenta. Se o descarte falhar, a linha
 * pendente expira e a limpeza devolve os caminhos finais possiveis.
 */
async function desfazerCopia(d: DadosDaPromocao): Promise<void> {
  const descartado = await descartar(d.svc, d.authUid, d.anexoId, "upload_abandonado", d.registarErro);
  if (!descartado) return;
  await tentar(() => d.svc.storage.from(BUCKET_FINAL).remove([d.caminhoFinal]), d.registarErro);
  await tentar(() => d.svc.storage.from(BUCKET_QUARENTENA).remove([d.caminhoQuarentena]), d.registarErro);
}

interface PromocaoFeita {
  anexo: Record<string, unknown>;
  substituido: Record<string, unknown> | null;
}

/** Promove a linha ao objecto final; se a base recusar ou rebentar, desfaz e devolve a resposta. */
async function promoverOuDesfazer(d: DadosDaPromocao): Promise<PromocaoFeita | { resposta: RespostaAccao }> {
  let promovido: { data: unknown; error: { message?: string; code?: string } | null };
  try {
    promovido = await d.svc.rpc("rpc_hr_anexo_rh_promover", {
      p_auth_uid: d.authUid,
      p_anexo_id: d.anexoId,
      p_caminho_final: d.caminhoFinal,
      p_mime: d.mime,
      p_tamanho: d.tamanho,
      p_hash: d.hash,
      ...(d.substitui ? { p_substitui_anexo_id: d.substitui } : {}),
    });
  } catch (e) {
    d.registarErro?.(e);
    await desfazerCopia(d);
    return { resposta: inesperado() };
  }
  if (promovido.error) {
    d.registarErro?.(promovido.error);
    await desfazerCopia(d);
    return { resposta: inesperado() };
  }
  const motivo = motivoDaResposta(promovido.data);
  const anexo = comoObjecto(comoObjecto(promovido.data)?.anexo);
  if (motivo || !anexo) {
    await desfazerCopia(d);
    return { resposta: motivo ? respostaDeMotivoAnexo(motivo, d.registarErro) : inesperado() };
  }
  return { anexo, substituido: comoObjecto(comoObjecto(promovido.data)?.substituido) };
}

/**
 * Remove os objectos que a base diz existirem agora (uma linha apagada ou
 * substituida) e, se TODOS sairam, marca a linha com objecto removido. Qualquer
 * falha fica registada e a limpeza repete.
 */
async function removerObjectosDaLinha(
  svc: ClienteAnexos,
  anexoId: string,
  dadosDaBase: unknown,
  registarErro?: RegistarErro,
): Promise<void> {
  const alvos = alvosDoDescarte(dadosDaBase);
  let todosSairam = true;
  for (const alvo of alvos) {
    const saiu = await tentar(() => svc.storage.from(alvo.bucket).remove([alvo.caminho]), registarErro);
    if (!saiu) todosSairam = false;
  }
  if (alvos.length > 0 && todosSairam) {
    await tentar(() => svc.rpc("hr_convite_anexos_objecto_removido", { p_ids: [anexoId] }), registarErro);
  }
}

async function accaoConfirmar(p: PedidoAccaoRh): Promise<RespostaAccao> {
  const { svc, authUid, payload, registarErro } = p;
  const anexoId = payload?.anexo_id;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId)) return erro("pedido_invalido");
  const substitui = lerSubstituto(payload);
  if (substitui === "invalido") return erro("pedido_invalido");

  const { data: dadosContexto, error: erroContexto } = await svc.rpc("rpc_hr_anexo_rh_contexto", {
    p_auth_uid: authUid,
    p_anexo_id: anexoId,
  });
  // Daqui para a frente a linha pode ser deste utilizador e estar pendente a
  // ocupar uma vaga: todo o erro definitivo descarta-a antes de responder.
  const descartarReserva = () => descartarOuRegistar(svc, authUid, anexoId, "upload_abandonado", registarErro);
  if (erroContexto) {
    registarErro?.(erroContexto);
    await descartarReserva();
    return inesperado();
  }
  const motivoContexto = motivoDaResposta(dadosContexto);
  if (motivoContexto) {
    if (!MOTIVOS_DE_OUTRA_LINHA.includes(motivoContexto)) await descartarReserva();
    return respostaDeMotivoAnexo(motivoContexto, registarErro);
  }
  const contexto = lerContexto(dadosContexto);
  if (!contexto) {
    registarErro?.(new Error("hr-anexo-rh: contexto do anexo com forma inesperada"));
    await descartarReserva();
    return inesperado();
  }

  const quarentena = svc.storage.from(BUCKET_QUARENTENA);
  // So se mexe na quarentena depois de a base confirmar o descarte; se nao
  // confirmar, a linha pendente guarda o caminho e a limpeza apanha-o.
  const descartarELimpar = async (): Promise<void> => {
    if (await descartarReserva()) await tentar(() => quarentena.remove([contexto.caminho]), registarErro);
  };
  const bytes = await lerObjecto(quarentena, contexto.caminho, registarErro);
  if (!bytes) {
    await descartarELimpar();
    return erro("anexo_nao_carregado");
  }

  const tamanho = bytes.length;
  const assinatura = detectSignature(bytes.subarray(0, BYTES_DA_CABECA));
  const recusa = validarFicheiroReal({ tipo: contexto.tipo, assinatura, tamanho });
  if (recusa) {
    // Se a remocao falhar, a linha apagada guarda o caminho e a limpeza apanha-o.
    if (await descartarOuRegistar(svc, authUid, anexoId, motivoDeDescarte(recusa), registarErro)) {
      await tentar(() => quarentena.remove([contexto.caminho]), registarErro);
    }
    return erro(recusa);
  }

  const mime = MIME_POR_ASSINATURA[assinatura as string];
  const extensao = extensaoDoMime(mime);
  if (!extensao) {
    registarErro?.(new Error("hr-anexo-rh: tipo real sem extensao conhecida"));
    await descartarELimpar();
    return inesperado();
  }
  const hash = await sha256Hex(bytes);
  // Igual ao do convite: e o que faz a limpeza existente apanhar os orfaos do RH.
  const caminhoFinal = `${contexto.organizationId}/${contexto.pessoaId}/admissao/${anexoId}.${extensao}`;

  // O objecto final tem de existir ANTES de a linha ser promovida.
  if (!(await copiarParaFinal(svc.storage.from(BUCKET_FINAL), caminhoFinal, bytes, mime, hash, registarErro))) {
    await descartarELimpar();
    return erro("anexo_falha_envio");
  }

  const resultado = await promoverOuDesfazer({
    svc, authUid, anexoId, caminhoFinal, caminhoQuarentena: contexto.caminho, mime, tamanho, hash, substitui, registarErro,
  });
  if ("resposta" in resultado) return resultado.resposta;
  const { anexo, substituido } = resultado;

  // A linha promovida guarda o caminho da quarentena (caminho_quarentena): se
  // este remove falhar, a limpeza devolve-o na proxima volta.
  await tentar(() => quarentena.remove([contexto.caminho]), registarErro);

  // O antigo foi apagado na mesma transaccao: os objectos dele saem agora.
  if (substituido) {
    const idAntigo = eUuid(substituido.anexo_id) ? substituido.anexo_id : substitui;
    if (idAntigo) await removerObjectosDaLinha(svc, idAntigo, substituido, registarErro);
  }

  return {
    status: 200,
    body: {
      ok: true,
      anexo: {
        id: anexo.id ?? anexoId,
        tipo: anexo.tipo,
        nome_original: anexo.nome_original,
        tamanho_bytes: anexo.tamanho_bytes,
        mime_type: anexo.mime_type,
      },
    },
  };
}

// -- remover -----------------------------------------------------------------

async function accaoRemover(p: PedidoAccaoRh): Promise<RespostaAccao> {
  const { svc, authUid, payload, registarErro } = p;
  const anexoId = payload?.anexo_id;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId)) return erro("pedido_invalido");

  const { data, error } = await svc.rpc("rpc_hr_anexo_rh_remover", { p_auth_uid: authUid, p_anexo_id: anexoId });
  if (error) {
    registarErro?.(error);
    return inesperado();
  }
  const motivo = motivoDaResposta(data);
  if (motivo) return respostaDeMotivoAnexo(motivo, registarErro);

  // A linha ja esta apagada: so agora saem os objectos (e o ficheiro apaga-se de vez).
  await removerObjectosDaLinha(svc, anexoId, data, registarErro);
  return { status: 200, body: { ok: true } };
}

// -- despacho ----------------------------------------------------------------

export async function tratarAccaoRh(pedido: PedidoAccaoRh): Promise<RespostaAccao> {
  if (!eAccaoRh(pedido.accao)) return erro("accao_desconhecida");
  if (!eUuid(pedido.authUid)) return erro("sem_sessao");
  const normalizado = { ...pedido, payload: comoObjecto(pedido.payload) };
  try {
    switch (pedido.accao) {
      case "url":
        return await accaoUrl(normalizado);
      case "confirmar":
        return await accaoConfirmar(normalizado);
      default:
        return await accaoRemover(normalizado);
    }
  } catch (e) {
    pedido.registarErro?.(e);
    return inesperado();
  }
}
