/**
 * @vitest-environment node
 *
 * As accoes de anexos do RH (url, confirmar, remover), com um cliente de
 * servico falso: sem rede, sem Deno. O que se verifica e o comportamento: que
 * RPCs se chamam e com que argumentos, que objectos ficam onde, que codigos
 * saem -- e que nada de organizacao, pessoa ou caminho final sai.
 */
import { describe, expect, it } from "vitest";
import { BUCKET_FINAL, BUCKET_QUARENTENA, type ClienteAnexos } from "../convite-admissao/accoesAnexos.ts";
import { tratarAccaoRh, type RespostaAccao } from "./accoes.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PESSOA = "0a1b2c3d-1111-4222-8333-444455556666";
const ANEXO = "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff";
const ANTIGO = "12345678-aaaa-4bbb-8ccc-ddddeeeeffff";
const UID = "5a5a5a5a-1111-4222-8333-444455556666";
const CAMINHO_QUARENTENA = `admissao/rh/${ANEXO}.pdf`;
const CAMINHO_FINAL_PDF = `${ORG}/${PESSOA}/admissao/${ANEXO}.pdf`;
const CAMINHO_ANTIGO = `${ORG}/${PESSOA}/admissao/${ANTIGO}.jpg`;
const QUARENTENA_ANTIGA = `admissao/rh/${ANTIGO}.jpg`;

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0, 0, 0, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]);

type Manipulador = (args: Record<string, unknown>) => { data: unknown; error: { message?: string } | null };

interface Opcoes {
  rpcs?: Record<string, Manipulador>;
  quarentena?: Record<string, Uint8Array>;
  finalInicial?: Record<string, Uint8Array>;
  falharAssinar?: boolean;
  falharUploadFinal?: boolean;
  falharRemoverEm?: string[];
  /** Mensagem de um erro do Storage no download (por omissao: 'Object not found'). */
  erroDownload?: string;
  /** Ordem global de eventos (rpc:nome, remove:bucket:caminho) para provar sequencias. */
  eventos?: string[];
}

function contexto(tipo = "cartao_cidadao", caminho = CAMINHO_QUARENTENA): Manipulador {
  return () => ({
    data: { tipo, caminho, organization_id: ORG, pessoa_id: PESSOA },
    error: null,
  });
}

function promoverOk(tipo = "cartao_cidadao", substituido: unknown = null): Manipulador {
  return (a) => ({
    data: {
      ok: true,
      anexo: { id: ANEXO, tipo, nome_original: "cc.pdf", tamanho_bytes: a.p_tamanho, mime_type: a.p_mime },
      substituido,
    },
    error: null,
  });
}

const OK: Manipulador = () => ({ data: { ok: true }, error: null });

function criarFalso(opcoes: Opcoes = {}) {
  const buckets: Record<string, Map<string, Uint8Array>> = {
    [BUCKET_QUARENTENA]: new Map(Object.entries(opcoes.quarentena ?? {})),
    [BUCKET_FINAL]: new Map(Object.entries(opcoes.finalInicial ?? {})),
  };
  const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const remocoes: Array<{ bucket: string; caminho: string }> = [];
  const uploads: Array<{ bucket: string; caminho: string; contentType: string; upsert: boolean; cacheControl?: string }> = [];
  const assinados: Array<{ bucket: string; caminho: string; upsert?: boolean }> = [];
  const eventos = opcoes.eventos ?? [];

  const svc: ClienteAnexos = {
    rpc: async (fn, args) => {
      chamadas.push({ fn, args });
      eventos.push(`rpc:${fn}`);
      const h = opcoes.rpcs?.[fn];
      if (!h) return { data: null, error: { message: `rpc inesperada: ${fn}` } };
      return h(args);
    },
    storage: {
      from: (bucket) => ({
        createSignedUploadUrl: async (caminho, o) => {
          assinados.push({ bucket, caminho, upsert: o?.upsert });
          if (opcoes.falharAssinar) return { data: null, error: { message: "boom" } };
          return { data: { token: "tok-de-upload" }, error: null };
        },
        download: async (caminho) => {
          const bytes = buckets[bucket].get(caminho);
          if (!bytes) return { data: null, error: { message: opcoes.erroDownload ?? "Object not found" } };
          return { data: { arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer }, error: null };
        },
        upload: async (caminho, corpo, o) => {
          uploads.push({ bucket, caminho, contentType: o.contentType, upsert: o.upsert, cacheControl: o.cacheControl });
          if (opcoes.falharUploadFinal && bucket === BUCKET_FINAL) return { data: null, error: { message: "boom" } };
          if (!o.upsert && buckets[bucket].has(caminho)) return { data: null, error: { message: "exists" } };
          buckets[bucket].set(caminho, corpo);
          return { data: {}, error: null };
        },
        remove: async (caminhos) => {
          for (const caminho of caminhos) {
            remocoes.push({ bucket, caminho });
            eventos.push(`remove:${bucket}:${caminho}`);
            if (opcoes.falharRemoverEm?.includes(bucket)) return { data: null, error: { message: "boom" } };
            buckets[bucket].delete(caminho);
          }
          return { data: [], error: null };
        },
      }),
    },
  };
  const chamou = (fn: string) => chamadas.filter((c) => c.fn === fn);
  return { svc, buckets, chamadas, chamou, remocoes, uploads, assinados, eventos };
}

function pedir(
  svc: ClienteAnexos,
  accao: string,
  payload: Record<string, unknown> | null,
  erros: unknown[] = [],
): Promise<RespostaAccao> {
  return tratarAccaoRh({ accao, svc, authUid: UID, payload, registarErro: (e) => erros.push(e) });
}

/** Nenhuma resposta traz organizacao, pessoa nem caminho final. */
function semDadosInternos(r: RespostaAccao) {
  const texto = JSON.stringify(r.body);
  expect(texto).not.toContain(ORG);
  expect(texto).not.toContain(PESSOA);
  expect(texto).not.toContain("organization_id");
  expect(texto).not.toContain("pessoa_id");
  expect(texto).not.toContain(CAMINHO_FINAL_PDF);
  expect(texto).not.toContain(`${ORG}/`);
}

const RESERVA_OK: Manipulador = () => ({ data: { anexo_id: ANEXO, caminho: CAMINHO_QUARENTENA }, error: null });
const PEDIDO_URL = { pessoa_id: PESSOA, tipo: "cartao_cidadao", nome: "../../cc frente.pdf", tamanho: 2048, mime: "application/pdf" };

describe("url", () => {
  it("reserva com o auth uid (nunca com organizacao), assina na quarentena e devolve so o necessario", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_reservar: RESERVA_OK } });
    const r = await pedir(f.svc, "url", { ...PEDIDO_URL, organization_id: "outra-org-do-cliente" });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, anexo_id: ANEXO, caminho: CAMINHO_QUARENTENA, upload_token: "tok-de-upload" });
    expect(f.assinados).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA, upsert: false }]);
    expect(f.chamou("rpc_hr_anexo_rh_reservar")[0].args).toEqual({
      p_auth_uid: UID,
      p_pessoa_id: PESSOA,
      p_tipo: "cartao_cidadao",
      p_nome_original: "cc frente.pdf",
      p_tamanho_declarado: 2048,
      p_mime_declarado: "application/pdf",
    });
    semDadosInternos(r);
  });

  it("passa o substituto a reserva quando vem", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_reservar: RESERVA_OK } });
    await pedir(f.svc, "url", { ...PEDIDO_URL, substitui_anexo_id: ANTIGO });
    expect(f.chamou("rpc_hr_anexo_rh_reservar")[0].args).toMatchObject({ p_substitui_anexo_id: ANTIGO });
  });

  it.each([[""], ["nao-e-uuid"], [42]])("substituto invalido (%s) e pedido_invalido sem tocar na base", async (substitui) => {
    const f = criarFalso();
    const r = await pedir(f.svc, "url", { ...PEDIDO_URL, substitui_anexo_id: substitui });
    expect(r).toEqual({ status: 400, body: { error: "pedido_invalido" } });
    expect(f.chamadas).toHaveLength(0);
  });

  it.each([
    ["gif declarado", { ...PEDIDO_URL, mime: "image/gif" }, 422, "anexo_formato_invalido"],
    ["fotografia em pdf", { ...PEDIDO_URL, tipo: "fotografia" }, 422, "anexo_fotografia_formato"],
    ["tipo desconhecido", { ...PEDIDO_URL, tipo: "passaporte" }, 422, "anexo_tipo_invalido"],
    ["10 MB mais um byte", { ...PEDIDO_URL, tamanho: 10485761 }, 413, "anexo_demasiado_grande"],
    ["foto de 5 MB mais um byte", { ...PEDIDO_URL, tipo: "fotografia", mime: "image/png", tamanho: 5242881 }, 413, "anexo_fotografia_demasiado_grande"],
  ])("recusa cedo, sem tocar na base: %s", async (_nome, payload, status, codigo) => {
    const f = criarFalso();
    const r = await pedir(f.svc, "url", payload);
    expect(r).toEqual({ status, body: { error: codigo } });
    expect(f.chamadas).toHaveLength(0);
    expect(f.assinados).toHaveLength(0);
  });

  it("fotografia de exactamente 5 MB e cartao de exactamente 10 MB passam a pre-verificacao", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_reservar: RESERVA_OK } });
    expect((await pedir(f.svc, "url", { ...PEDIDO_URL, tipo: "fotografia", mime: "image/jpeg", tamanho: 5242880 })).status).toBe(200);
    expect((await pedir(f.svc, "url", { ...PEDIDO_URL, tamanho: 10485760 })).status).toBe(200);
  });

  it.each([
    ["sem pessoa", { ...PEDIDO_URL, pessoa_id: undefined }],
    ["pessoa que nao e uuid", { ...PEDIDO_URL, pessoa_id: "x" }],
    ["tamanho zero", { ...PEDIDO_URL, tamanho: 0 }],
    ["tamanho decimal", { ...PEDIDO_URL, tamanho: 10.5 }],
    ["tamanho em texto", { ...PEDIDO_URL, tamanho: "2048" }],
    ["sem nome", { ...PEDIDO_URL, nome: undefined }],
    ["sem tipo", { ...PEDIDO_URL, tipo: undefined }],
    ["sem mime", { ...PEDIDO_URL, mime: undefined }],
  ])("pedido mal formado: %s", async (_nome, payload) => {
    const f = criarFalso();
    const r = await pedir(f.svc, "url", payload as Record<string, unknown>);
    expect(r).toEqual({ status: 400, body: { error: "pedido_invalido" } });
    expect(f.chamadas).toHaveLength(0);
  });

  it("corpo ausente e pedido invalido", async () => {
    const f = criarFalso();
    expect(await pedir(f.svc, "url", null)).toEqual({ status: 400, body: { error: "pedido_invalido" } });
  });

  it.each([
    ["sem_permissao", 403],
    ["pessoa_nao_encontrada", 404],
    ["sem_sessao", 401],
    ["anexo_substituto_invalido", 409],
    ["anexo_limite_pessoa", 429],
    ["anexo_tipo_cheio", 409],
    ["anexo_maximo_ficheiros", 409],
  ])("a recusa %s da base sai com o estado %i e sem assinar nada", async (codigo, status) => {
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_reservar: () => ({ data: { erro: codigo }, error: null }) } });
    const r = await pedir(f.svc, "url", PEDIDO_URL);
    expect(r).toEqual({ status, body: { error: codigo } });
    expect(f.assinados).toHaveLength(0);
  });

  it("um motivo fora do catalogo e erro_inesperado, nunca o texto da base", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_reservar: () => ({ data: { erro: "segredo_da_base" }, error: null }) } });
    const r = await pedir(f.svc, "url", PEDIDO_URL, erros);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(JSON.stringify(r.body)).not.toContain("segredo_da_base");
    expect(erros).toHaveLength(1);
  });

  it("um erro da base nunca vai em bruto para a resposta", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_reservar: () => ({ data: null, error: { message: 'relation "pessoas_anexos" does not exist' } }) } });
    const r = await pedir(f.svc, "url", PEDIDO_URL, erros);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(erros).toHaveLength(1);
  });

  it("reserva com forma inesperada: erro_inesperado e nao assina", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_reservar: () => ({ data: { anexo_id: "x", caminho: "" }, error: null }) } });
    const r = await pedir(f.svc, "url", PEDIDO_URL);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.assinados).toHaveLength(0);
  });

  it("se o URL assinado falha, descarta a reserva (upload_abandonado) e diz anexo_falha_envio", async () => {
    const f = criarFalso({
      falharAssinar: true,
      rpcs: { rpc_hr_anexo_rh_reservar: RESERVA_OK, rpc_hr_anexo_rh_descartar: OK },
    });
    const r = await pedir(f.svc, "url", PEDIDO_URL);
    expect(r).toEqual({ status: 400, body: { error: "anexo_falha_envio" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")[0].args).toEqual({
      p_auth_uid: UID,
      p_anexo_id: ANEXO,
      p_motivo: "upload_abandonado",
    });
  });

  it("URL assinado falha E o descarte nao e confirmado: mesma resposta e a falha do descarte fica registada", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      falharAssinar: true,
      rpcs: { rpc_hr_anexo_rh_reservar: RESERVA_OK, rpc_hr_anexo_rh_descartar: () => ({ data: { erro: "sem_permissao" }, error: null }) },
    });
    const r = await pedir(f.svc, "url", PEDIDO_URL, erros);
    expect(r).toEqual({ status: 400, body: { error: "anexo_falha_envio" } });
    // o erro do assinar e o descarte nao confirmado
    expect(erros.length).toBeGreaterThanOrEqual(2);
  });
});

describe("confirmar", () => {
  const rpcsOk = (tipo = "cartao_cidadao", substituido: unknown = null): Record<string, Manipulador> => ({
    rpc_hr_anexo_rh_contexto: contexto(tipo),
    rpc_hr_anexo_rh_promover: promoverOk(tipo, substituido),
    rpc_hr_anexo_rh_descartar: OK,
    hr_convite_anexos_objecto_removido: OK,
  });

  it("sucesso: copia para hr-documentos com o tipo REAL, promove e limpa a quarentena", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      anexo: { id: ANEXO, tipo: "cartao_cidadao", nome_original: "cc.pdf", tamanho_bytes: PDF.length, mime_type: "application/pdf" },
    });
    expect(f.uploads).toEqual([
      { bucket: BUCKET_FINAL, caminho: CAMINHO_FINAL_PDF, contentType: "application/pdf", upsert: false, cacheControl: "0" },
    ]);
    expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(false);

    const promover = f.chamou("rpc_hr_anexo_rh_promover")[0].args;
    expect(promover).toMatchObject({
      p_auth_uid: UID,
      p_anexo_id: ANEXO,
      p_caminho_final: CAMINHO_FINAL_PDF,
      p_mime: "application/pdf",
      p_tamanho: PDF.length,
    });
    expect(promover.p_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(promover).not.toHaveProperty("organization_id");
    expect(f.chamou("rpc_hr_anexo_rh_contexto")[0].args).toEqual({ p_auth_uid: UID, p_anexo_id: ANEXO });
    semDadosInternos(r);
  });

  it("o hash e o SHA-256 dos bytes recebidos", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk() });
    await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    const esperado = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", PDF)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(f.chamou("rpc_hr_anexo_rh_promover")[0].args.p_hash).toBe(esperado);
  });

  it("o tipo REAL manda: um JPEG enviado como pdf vai para .jpg com image/jpeg", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: JPEG }, rpcs: rpcsOk("fotografia") });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
    expect(f.uploads[0]).toMatchObject({ caminho: `${ORG}/${PESSOA}/admissao/${ANEXO}.jpg`, contentType: "image/jpeg" });
    expect(f.chamou("rpc_hr_anexo_rh_promover")[0].args).toMatchObject({ p_mime: "image/jpeg" });
  });

  it("le a assinatura REAL: declarado png com bytes de gif -> anexo_formato_invalido, descarta e remove", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: GIF }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });

    expect(r).toEqual({ status: 422, body: { error: "anexo_formato_invalido" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")[0].args).toEqual({ p_auth_uid: UID, p_anexo_id: ANEXO, p_motivo: "formato_invalido" });
    expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
    expect(f.uploads).toHaveLength(0);
    expect(f.chamou("rpc_hr_anexo_rh_promover")).toHaveLength(0);
  });

  it("fotografia em pdf recusada com o seu codigo", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk("fotografia") });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 422, body: { error: "anexo_fotografia_formato" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")[0].args).toMatchObject({ p_motivo: "formato_invalido" });
  });

  it("fotografia de 5 MB mais um byte: demasiado_grande (o tecto da foto, nao o de 10 MB)", async () => {
    const grande = new Uint8Array(5242881);
    grande.set(JPEG);
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: grande }, rpcs: rpcsOk("fotografia") });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 413, body: { error: "anexo_fotografia_demasiado_grande" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")[0].args).toMatchObject({ p_motivo: "demasiado_grande" });
  });

  it("cartao de 10 MB mais um byte e recusado; exactamente 10 MB passa", async () => {
    const grande = new Uint8Array(10485761);
    grande.set(PDF);
    const justo = new Uint8Array(10485760);
    justo.set(PDF);
    const a = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: grande }, rpcs: rpcsOk() });
    expect(await pedir(a.svc, "confirmar", { anexo_id: ANEXO })).toEqual({ status: 413, body: { error: "anexo_demasiado_grande" } });
    const b = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: justo }, rpcs: rpcsOk() });
    expect((await pedir(b.svc, "confirmar", { anexo_id: ANEXO })).status).toBe(200);
  });

  it("recusa com a remocao da quarentena a falhar: mesmo erro para o RH e falha registada", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: GIF }, rpcs: rpcsOk(), falharRemoverEm: [BUCKET_QUARENTENA] });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r.body).toEqual({ error: "anexo_formato_invalido" });
    expect(erros).toHaveLength(1);
  });

  it("recusa com o descarte NAO confirmado: a falha fica registada e a quarentena nao se toca", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: GIF },
      rpcs: { ...rpcsOk(), rpc_hr_anexo_rh_descartar: () => ({ data: null, error: { message: "boom" } }) },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r.body).toEqual({ error: "anexo_formato_invalido" });
    expect(erros.length).toBeGreaterThanOrEqual(1);
    expect(f.remocoes).toHaveLength(0);
  });

  it("ficheiro ausente da quarentena: anexo_nao_carregado (409), descarta a reserva, sem promover", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ rpcs: rpcsOk() });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r).toEqual({ status: 409, body: { error: "anexo_nao_carregado" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")[0].args).toEqual({ p_auth_uid: UID, p_anexo_id: ANEXO, p_motivo: "upload_abandonado" });
    expect(f.chamou("rpc_hr_anexo_rh_promover")).toHaveLength(0);
    expect(f.uploads).toHaveLength(0);
    // "nao chegou nada" nao e uma falha do Storage: nao vai para o Sentry
    expect(erros).toHaveLength(0);
  });

  it("falha do Storage a ler a quarentena: anexo_nao_carregado, descarta e REGISTA a falha", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ rpcs: rpcsOk(), erroDownload: "Internal Server Error" });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r).toEqual({ status: 409, body: { error: "anexo_nao_carregado" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")).toHaveLength(1);
    expect(erros).toHaveLength(1);
  });

  it("ficheiro ausente E descarte nao confirmado: mesma resposta, falha registada", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ rpcs: { ...rpcsOk(), rpc_hr_anexo_rh_descartar: () => ({ data: null, error: { message: "boom" } }) } });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r.body).toEqual({ error: "anexo_nao_carregado" });
    expect(erros.length).toBeGreaterThanOrEqual(1);
  });

  it("o objecto final existe ANTES de se chamar promover", async () => {
    const eventos: string[] = [];
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk(), eventos });
    let existiaAoPromover: boolean | null = null;
    const original = f.svc.rpc.bind(f.svc);
    f.svc.rpc = (fn, args) => {
      if (fn === "rpc_hr_anexo_rh_promover") existiaAoPromover = f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF);
      return original(fn, args);
    };
    await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(existiaAoPromover).toBe(true);
  });

  it("a copia para hr-documentos falha: anexo_falha_envio, descarta ANTES de remover a quarentena, nada promovido", async () => {
    const eventos: string[] = [];
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk(), falharUploadFinal: true, eventos });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r.body).toEqual({ error: "anexo_falha_envio" });
    expect(f.chamou("rpc_hr_anexo_rh_promover")).toHaveLength(0);
    expect(f.chamou("rpc_hr_anexo_rh_descartar")[0].args).toEqual({ p_auth_uid: UID, p_anexo_id: ANEXO, p_motivo: "upload_abandonado" });
    const descarte = eventos.indexOf("rpc:rpc_hr_anexo_rh_descartar");
    expect(descarte).toBeGreaterThanOrEqual(0);
    expect(descarte).toBeLessThan(eventos.indexOf(`remove:${BUCKET_QUARENTENA}:${CAMINHO_QUARENTENA}`));
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(false);
  });

  it("a copia falha E o descarte nao e confirmado: a quarentena fica e a falha fica registada", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { ...rpcsOk(), rpc_hr_anexo_rh_descartar: () => ({ data: null, error: { message: "boom" } }) },
      falharUploadFinal: true,
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r.body).toEqual({ error: "anexo_falha_envio" });
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(true);
    expect(erros.length).toBeGreaterThanOrEqual(1);
  });

  it("repetir com o objecto final ja la (mesmo conteudo) e idempotente; com OUTRO conteudo falha sem sobrepor", async () => {
    const igual = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, finalInicial: { [CAMINHO_FINAL_PDF]: PDF }, rpcs: rpcsOk() });
    expect((await pedir(igual.svc, "confirmar", { anexo_id: ANEXO })).status).toBe(200);

    const outro = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32, 9, 9, 9, 9]);
    const dif = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, finalInicial: { [CAMINHO_FINAL_PDF]: outro }, rpcs: rpcsOk() });
    const r = await pedir(dif.svc, "confirmar", { anexo_id: ANEXO });
    expect(r.body).toEqual({ error: "anexo_falha_envio" });
    expect(dif.chamou("rpc_hr_anexo_rh_promover")).toHaveLength(0);
    expect(dif.buckets[BUCKET_FINAL].get(CAMINHO_FINAL_PDF)).toBe(outro);
  });

  it("promover recusado: descarta (upload_abandonado) e SO DEPOIS remove o final e a quarentena", async () => {
    const eventos: string[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { ...rpcsOk(), rpc_hr_anexo_rh_promover: () => ({ data: { erro: "sem_permissao" }, error: null }) },
      eventos,
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });

    expect(r).toEqual({ status: 403, body: { error: "sem_permissao" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")[0].args).toMatchObject({ p_motivo: "upload_abandonado" });
    const iDescartar = eventos.indexOf("rpc:rpc_hr_anexo_rh_descartar");
    const iFinal = eventos.indexOf(`remove:${BUCKET_FINAL}:${CAMINHO_FINAL_PDF}`);
    const iQuarentena = eventos.indexOf(`remove:${BUCKET_QUARENTENA}:${CAMINHO_QUARENTENA}`);
    expect(iDescartar).toBeGreaterThan(-1);
    expect(iFinal).toBeGreaterThan(iDescartar);
    expect(iQuarentena).toBeGreaterThan(iDescartar);
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
  });

  it("promover rebenta por erro da base: desfaz e so devolve erro_inesperado", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { ...rpcsOk(), rpc_hr_anexo_rh_promover: () => ({ data: null, error: { message: "deadlock detected" } }) },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
    expect(JSON.stringify(r.body)).not.toContain("deadlock");
  });

  it("promover lanca uma excepcao: desfaz tambem", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: {
        ...rpcsOk(),
        rpc_hr_anexo_rh_promover: () => {
          throw new Error("ligacao rebentou");
        },
      },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
  });

  it("se o descarte nao e confirmado pela base, o objecto final NAO se apaga (a linha pode estar promovida)", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: {
        ...rpcsOk(),
        rpc_hr_anexo_rh_promover: () => ({ data: null, error: { message: "timeout" } }),
        rpc_hr_anexo_rh_descartar: () => ({ data: { erro: "anexo_estado_invalido" }, error: null }),
      },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    expect(f.remocoes).toHaveLength(0);
    expect(erros).toHaveLength(2);
  });

  it("promover devolve um erro e o descarte falha por excepcao: nada se apaga", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: {
        ...rpcsOk(),
        rpc_hr_anexo_rh_promover: () => ({ data: { erro: "anexo_tipo_cheio" }, error: null }),
        rpc_hr_anexo_rh_descartar: () => {
          throw new Error("rede");
        },
      },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 409, body: { error: "anexo_tipo_cheio" } });
    expect(f.remocoes).toHaveLength(0);
  });

  it("depois de promover, a remocao da quarentena a falhar: 200, falha registada, nada se apaga a mais", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk(), falharRemoverEm: [BUCKET_QUARENTENA] });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true });
    expect(erros).toHaveLength(1);
    expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
  });

  describe("substituicao", () => {
    const SUBSTITUIDO = { anexo_id: ANTIGO, bucket: BUCKET_FINAL, caminho: CAMINHO_ANTIGO, caminho_quarentena: QUARENTENA_ANTIGA };
    const montar = (extra: Partial<Opcoes> = {}) => {
      const f = criarFalso({
        quarentena: { [CAMINHO_QUARENTENA]: PDF, [QUARENTENA_ANTIGA]: JPEG },
        rpcs: rpcsOk("cartao_cidadao", SUBSTITUIDO),
        ...extra,
      });
      f.buckets[BUCKET_FINAL].set(CAMINHO_ANTIGO, JPEG);
      return f;
    };

    it("passa o substituto a promover, remove os objectos antigos e marca objecto_removido", async () => {
      const f = montar();
      const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO, substitui_anexo_id: ANTIGO });

      expect(r.status).toBe(200);
      expect(f.chamou("rpc_hr_anexo_rh_promover")[0].args).toMatchObject({ p_substitui_anexo_id: ANTIGO });
      expect(f.remocoes).toContainEqual({ bucket: BUCKET_FINAL, caminho: CAMINHO_ANTIGO });
      expect(f.remocoes).toContainEqual({ bucket: BUCKET_QUARENTENA, caminho: QUARENTENA_ANTIGA });
      expect(f.buckets[BUCKET_FINAL].has(CAMINHO_ANTIGO)).toBe(false);
      expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
      expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(1);
      expect(f.chamou("hr_convite_anexos_objecto_removido")[0].args).toEqual({ p_ids: [ANTIGO] });
      expect(JSON.stringify(r.body)).not.toContain(CAMINHO_ANTIGO);
      semDadosInternos(r);
    });

    it("so marca objecto_removido se TODOS os objectos antigos sairam", async () => {
      const erros: unknown[] = [];
      const f = montar({ falharRemoverEm: [BUCKET_QUARENTENA] });
      const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO, substitui_anexo_id: ANTIGO }, erros);
      expect(r.status).toBe(200);
      expect(f.buckets[BUCKET_FINAL].has(CAMINHO_ANTIGO)).toBe(false);
      expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
      expect(erros.length).toBeGreaterThan(0);
    });

    it("a falha de marcar objecto_removido nao e erro para o RH", async () => {
      const erros: unknown[] = [];
      const f = montar();
      f.svc.rpc = ((orig) => (fn: string, args: Record<string, unknown>) =>
        fn === "hr_convite_anexos_objecto_removido" ? Promise.resolve({ data: null, error: { message: "boom" } }) : orig(fn, args))(f.svc.rpc);
      const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO, substitui_anexo_id: ANTIGO }, erros);
      expect(r.status).toBe(200);
      expect(erros).toHaveLength(1);
    });

    it("sem substituido na resposta nao se remove nada alem da quarentena do novo", async () => {
      const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk() });
      await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
      expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
      expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
    });

    it("um bucket desconhecido no substituido nao e tocado", async () => {
      const f = criarFalso({
        quarentena: { [CAMINHO_QUARENTENA]: PDF },
        rpcs: rpcsOk("cartao_cidadao", { anexo_id: ANTIGO, bucket: "outro-bucket", caminho: "x/y.pdf", caminho_quarentena: null }),
      });
      await pedir(f.svc, "confirmar", { anexo_id: ANEXO, substitui_anexo_id: ANTIGO });
      expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
      expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
    });

    it.each([[""], ["x"], [7]])("substituto invalido (%s) e pedido_invalido sem tocar na base", async (substitui) => {
      const f = criarFalso();
      const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO, substitui_anexo_id: substitui });
      expect(r).toEqual({ status: 400, body: { error: "pedido_invalido" } });
      expect(f.chamadas).toHaveLength(0);
    });
  });

  it.each([
    ["anexo_nao_encontrado", "anexo_nao_encontrado", 404],
    ["anexo_estado_invalido", "anexo_estado_invalido", 409],
    ["sem_permissao", "sem_permissao", 403],
    // uniforme: um anexo de outra organizacao nao se distingue de um inexistente
    ["pessoa_nao_encontrada", "anexo_nao_encontrado", 404],
  ])("o contexto recusa com %s (sai %s, estado %i): nada e lido do Storage nem descartado (a linha nao e deste utilizador)", async (codigo, saida, status) => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { rpc_hr_anexo_rh_contexto: () => ({ data: { erro: codigo }, error: null }) },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status, body: { error: saida } });
    expect(f.uploads).toHaveLength(0);
    expect(f.remocoes).toHaveLength(0);
    expect(f.chamou("rpc_hr_anexo_rh_descartar")).toHaveLength(0);
  });

  it("contexto com forma inesperada: erro_inesperado e descarta a reserva", async () => {
    const f = criarFalso({
      rpcs: { rpc_hr_anexo_rh_contexto: () => ({ data: { tipo: "outro" }, error: null }), rpc_hr_anexo_rh_descartar: OK },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")[0].args).toEqual({ p_auth_uid: UID, p_anexo_id: ANEXO, p_motivo: "upload_abandonado" });
  });

  it("erro da base no contexto: erro_inesperado, descarta a reserva e regista", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      rpcs: { rpc_hr_anexo_rh_contexto: () => ({ data: null, error: { message: "boom" } }), rpc_hr_anexo_rh_descartar: OK },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO }, erros);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")).toHaveLength(1);
    expect(erros).toHaveLength(1);
  });

  it("contexto com motivo fora do catalogo: erro_inesperado e descarta a reserva", async () => {
    const f = criarFalso({
      rpcs: { rpc_hr_anexo_rh_contexto: () => ({ data: { erro: "segredo" }, error: null }), rpc_hr_anexo_rh_descartar: OK },
    });
    const r = await pedir(f.svc, "confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.chamou("rpc_hr_anexo_rh_descartar")).toHaveLength(1);
  });

  it.each([[undefined], [null], [""], ["nao-e-uuid"], [42]])("anexo_id invalido (%s) nao chega a base", async (anexo_id) => {
    const f = criarFalso();
    const r = await pedir(f.svc, "confirmar", { anexo_id });
    expect(r).toEqual({ status: 400, body: { error: "pedido_invalido" } });
    expect(f.chamadas).toHaveLength(0);
  });
});

describe("remover", () => {
  const removerOk = (bucket: string, caminho: string, caminhoQuarentena: string | null = null): Manipulador => () => ({
    data: { ok: true, bucket, caminho, caminho_quarentena: caminhoQuarentena },
    error: null,
  });

  it("remove o objecto final e a copia da quarentena e marca objecto_removido", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: {
        rpc_hr_anexo_rh_remover: removerOk(BUCKET_FINAL, CAMINHO_FINAL_PDF, CAMINHO_QUARENTENA),
        hr_convite_anexos_objecto_removido: OK,
      },
    });
    f.buckets[BUCKET_FINAL].set(CAMINHO_FINAL_PDF, PDF);
    const r = await pedir(f.svc, "remover", { anexo_id: ANEXO });

    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(f.chamou("rpc_hr_anexo_rh_remover")[0].args).toEqual({ p_auth_uid: UID, p_anexo_id: ANEXO });
    expect(f.remocoes).toEqual([
      { bucket: BUCKET_FINAL, caminho: CAMINHO_FINAL_PDF },
      { bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA },
    ]);
    expect(f.chamou("hr_convite_anexos_objecto_removido")[0].args).toEqual({ p_ids: [ANEXO] });
    semDadosInternos(r);
  });

  it("uma falha do remove nao e erro para o RH: fica registada, o outro objecto sai e nao se marca", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: {
        rpc_hr_anexo_rh_remover: removerOk(BUCKET_FINAL, CAMINHO_FINAL_PDF, CAMINHO_QUARENTENA),
        hr_convite_anexos_objecto_removido: OK,
      },
      falharRemoverEm: [BUCKET_QUARENTENA],
    });
    f.buckets[BUCKET_FINAL].set(CAMINHO_FINAL_PDF, PDF);
    const r = await pedir(f.svc, "remover", { anexo_id: ANEXO }, erros);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
    expect(erros).toHaveLength(1);
    expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
  });

  it("nunca apaga objectos sem a base confirmar (recusa em jsonb ou erro)", async () => {
    for (const resposta of [
      { data: { erro: "sem_permissao" }, error: null },
      { data: { erro: "anexo_nao_encontrado" }, error: null },
      { data: null, error: { message: "boom" } },
    ]) {
      const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_remover: () => resposta } });
      f.buckets[BUCKET_FINAL].set(CAMINHO_FINAL_PDF, PDF);
      const r = await pedir(f.svc, "remover", { anexo_id: ANEXO });
      expect(r.status).not.toBe(200);
      expect(f.remocoes).toHaveLength(0);
      expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    }
  });

  it.each([
    ["sem_permissao", "sem_permissao", 403],
    ["anexo_nao_encontrado", "anexo_nao_encontrado", 404],
    // uniforme: outra organizacao e inexistente dao a mesma resposta
    ["pessoa_nao_encontrada", "anexo_nao_encontrado", 404],
  ])("recusa %s sai como %s com o estado %i", async (codigo, saida, status) => {
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_remover: () => ({ data: { erro: codigo }, error: null }) } });
    expect(await pedir(f.svc, "remover", { anexo_id: ANEXO })).toEqual({ status, body: { error: saida } });
  });

  it("um motivo fora do catalogo e erro_inesperado", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_remover: () => ({ data: { erro: "segredo" }, error: null }) } });
    const r = await pedir(f.svc, "remover", { anexo_id: ANEXO }, erros);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(erros).toHaveLength(1);
  });

  it("pendente: o caminho e a quarentena coincidem e remove-se uma so vez", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { rpc_hr_anexo_rh_remover: removerOk(BUCKET_QUARENTENA, CAMINHO_QUARENTENA, CAMINHO_QUARENTENA), hr_convite_anexos_objecto_removido: OK },
    });
    await pedir(f.svc, "remover", { anexo_id: ANEXO });
    expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
  });

  it("um bucket desconhecido devolvido pela base nao e tocado nem marcado", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_anexo_rh_remover: removerOk("outro-bucket", "x/y.pdf", "") } });
    const r = await pedir(f.svc, "remover", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
    expect(f.remocoes).toHaveLength(0);
    expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
  });

  it.each([[undefined], ["x"], [3]])("anexo_id invalido (%s) nao chega a base", async (anexo_id) => {
    const f = criarFalso();
    expect(await pedir(f.svc, "remover", { anexo_id })).toEqual({ status: 400, body: { error: "pedido_invalido" } });
    expect(f.chamadas).toHaveLength(0);
  });
});

describe("despacho", () => {
  it("accao desconhecida", async () => {
    const f = criarFalso();
    expect(await pedir(f.svc, "apagar_tudo", {})).toEqual({ status: 400, body: { error: "accao_desconhecida" } });
    expect(f.chamadas).toHaveLength(0);
  });

  it("um auth uid que nao e uuid recusa com sem_sessao sem tocar na base", async () => {
    const f = criarFalso();
    const r = await tratarAccaoRh({ accao: "remover", svc: f.svc, authUid: "service_role", payload: { anexo_id: ANEXO } });
    expect(r).toEqual({ status: 401, body: { error: "sem_sessao" } });
    expect(f.chamadas).toHaveLength(0);
  });

  it("uma excepcao inesperada vira erro_inesperado, sem texto", async () => {
    const erros: unknown[] = [];
    const svc = {
      rpc: () => {
        throw new Error("ligacao rebentou com o token abc");
      },
      storage: { from: () => ({}) },
    } as unknown as ClienteAnexos;
    const r = await tratarAccaoRh({
      accao: "remover", svc, authUid: UID, payload: { anexo_id: ANEXO }, registarErro: (e) => erros.push(e),
    });
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(JSON.stringify(r.body)).not.toContain("abc");
    expect(erros).toHaveLength(1);
  });
});
