/**
 * @vitest-environment node
 *
 * As accoes de anexos do convite, com um cliente de servico falso: sem rede,
 * sem Deno. O que se verifica e o comportamento: que objectos ficam onde, que
 * RPCs se chamam, que codigos saem -- e que nada de organizacao ou pessoa sai.
 */
import { describe, expect, it } from "vitest";
import {
  BUCKET_FINAL,
  BUCKET_QUARENTENA,
  copiarParaFinal,
  lerObjecto,
  tratarAccaoAnexo,
  type ClienteAnexos,
  type RespostaAccao,
} from "./accoesAnexos.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PESSOA = "0a1b2c3d-1111-4222-8333-444455556666";
const ANEXO = "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff";
const OUTRO_ANEXO = "12345678-aaaa-4bbb-8ccc-ddddeeeeffff";
const CONVITE = "c0c0c0c0-1111-4222-8333-444455556666";
const HASH = "a".repeat(64);
const CAMINHO_QUARENTENA = `admissao/${CONVITE}/${ANEXO}.pdf`;
const CAMINHO_FINAL_PDF = `${ORG}/${PESSOA}/admissao/${ANEXO}.pdf`;

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0, 0, 0, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
/** JPEG minimo valido: SOI, JFIF, SOF0, SOS, dois bytes de dados, EOI. */
const JPEG = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xc0, 0, 0x0b, 8, 0, 1, 0, 1, 1, 1, 0x11, 0,
  0xff, 0xda, 0, 0x08, 1, 1, 0, 0, 0x3f, 0,
  0x12, 0x34,
  0xff, 0xd9,
]);
const SESSAO_HASH = "b".repeat(64);

type Manipulador = (args: Record<string, unknown>) => { data: unknown; error: { message?: string } | null };

interface Opcoes {
  rpcs?: Record<string, Manipulador>;
  quarentena?: Record<string, Uint8Array>;
  falharRemoverEm?: string[];
  falharAssinar?: boolean;
  falharUploadFinal?: boolean;
  /** O Storage falha ao listar (o tamanho nao se consegue ler). */
  falharListar?: boolean;
  /** O Storage lista o objecto mas sem tamanho nos metadados. */
  semTamanhoNosMetadados?: boolean;
  /** O tamanho que os metadados dizem, em vez do real (para provar que se recusa SEM descarregar). */
  tamanhoNosMetadados?: number;
  /** Objectos que ja estao em hr-documentos antes do pedido (o upload com upsert false recusa-os). */
  finalInicial?: Record<string, Uint8Array>;
}

function contexto(tipo = "comprovativo_iban", caminho = CAMINHO_QUARENTENA): Manipulador {
  return () => ({
    data: { anexo_id: ANEXO, tipo, estado: "pendente", caminho, organization_id: ORG, pessoa_id: PESSOA },
    error: null,
  });
}

function ligarOk(tipo = "comprovativo_iban"): Manipulador {
  return (a) => ({
    data: {
      ok: true,
      anexo: {
        id: ANEXO,
        tipo,
        nome_original: "cc.pdf",
        tamanho_bytes: a.p_tamanho,
        mime_type: a.p_mime,
      },
    },
    error: null,
  });
}

function criarFalso(opcoes: Opcoes = {}) {
  const buckets: Record<string, Map<string, Uint8Array>> = {
    [BUCKET_QUARENTENA]: new Map(Object.entries(opcoes.quarentena ?? {})),
    [BUCKET_FINAL]: new Map(Object.entries(opcoes.finalInicial ?? {})),
  };
  const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const remocoes: Array<{ bucket: string; caminho: string }> = [];
  const uploads: Array<{ bucket: string; caminho: string; contentType: string; upsert: boolean; cacheControl?: string }> = [];
  const assinados: Array<{ bucket: string; caminho: string; upsert?: boolean }> = [];
  const descarregados: Array<{ bucket: string; caminho: string }> = [];

  const svc: ClienteAnexos = {
    rpc: async (fn, args) => {
      chamadas.push({ fn, args });
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
        list: async (pasta, o) => {
          if (opcoes.falharListar) return { data: null, error: { message: "boom" } };
          const itens = [...buckets[bucket].entries()]
            .filter(([c]) => c.startsWith(`${pasta}/`) && !c.slice(pasta.length + 1).includes("/"))
            .map(([c, b]) => ({
              name: c.slice(pasta.length + 1),
              metadata: opcoes.semTamanhoNosMetadados ? null : { size: opcoes.tamanhoNosMetadados ?? b.length },
            }))
            .filter((i) => !o?.search || i.name.includes(o.search));
          return { data: itens, error: null };
        },
        download: async (caminho) => {
          descarregados.push({ bucket, caminho });
          const bytes = buckets[bucket].get(caminho);
          if (!bytes) return { data: null, error: { message: "Object not found" } };
          return { data: { arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer }, error: null };
        },
        upload: async (caminho, corpo, o) => {
          uploads.push({ bucket, caminho, contentType: o.contentType, upsert: o.upsert, cacheControl: o.cacheControl });
          if (opcoes.falharUploadFinal && bucket === BUCKET_FINAL) return { data: null, error: { message: "boom" } };
          // upsert false: um objecto que ja existe recusa-se, como no Storage verdadeiro
          if (!o.upsert && buckets[bucket].has(caminho)) return { data: null, error: { message: "The resource already exists" } };
          buckets[bucket].set(caminho, corpo);
          return { data: {}, error: null };
        },
        remove: async (caminhos) => {
          for (const caminho of caminhos) {
            remocoes.push({ bucket, caminho });
            if (opcoes.falharRemoverEm?.includes(bucket)) return { data: null, error: { message: "boom" } };
            buckets[bucket].delete(caminho);
          }
          return { data: [], error: null };
        },
      }),
    },
  };
  const chamou = (fn: string) => chamadas.filter((c) => c.fn === fn);
  return { svc, buckets, chamadas, chamou, remocoes, uploads, assinados, descarregados };
}

function pedir(svc: ClienteAnexos, accao: string, payload: Record<string, unknown> | null): Promise<RespostaAccao> {
  return tratarAccaoAnexo({
    accao, svc, tokenHash: HASH, sessaoHash: SESSAO_HASH, payload, ip: "203.0.113.7", supabaseUrl: "https://x.supabase.co",
  });
}

/** O erro que o PostgREST devolve quando a RPC faz RAISE com este SQLSTATE e esta mensagem. */
const raise = (code: string, message: string): Manipulador => () => ({ data: null, error: { code, message } });

/** Como `pedir`, mas com as falhas registadas (o que iria para o Sentry) a acumular em `erros`. */
function pedirComErros(
  svc: ClienteAnexos,
  accao: string,
  payload: Record<string, unknown> | null,
  erros: unknown[],
): Promise<RespostaAccao> {
  return tratarAccaoAnexo({
    accao, svc, tokenHash: HASH, sessaoHash: SESSAO_HASH, payload, ip: "203.0.113.7", registarErro: (e) => erros.push(e),
  });
}

/** Nenhuma resposta traz a organizacao nem a pessoa. */
function semOrgNemPessoa(r: RespostaAccao) {
  const texto = JSON.stringify(r.body);
  expect(texto).not.toContain(ORG);
  expect(texto).not.toContain(PESSOA);
  expect(texto).not.toContain("organization_id");
  expect(texto).not.toContain("pessoa_id");
}

const RESERVA_OK: Manipulador = () => ({ data: { anexo_id: ANEXO, caminho: CAMINHO_QUARENTENA }, error: null });
const PEDIDO_URL = { tipo: "comprovativo_iban", nome: "../../cc frente.pdf", tamanho: 2048, mime: "application/pdf" };

describe("anexo_url", () => {
  it("reserva, assina o upload na quarentena e devolve so o necessario", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_reservar: RESERVA_OK } });
    const r = await pedir(f.svc, "anexo_url", PEDIDO_URL);

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, anexo_id: ANEXO, caminho: CAMINHO_QUARENTENA, upload_token: "tok-de-upload" });
    expect(f.assinados).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA, upsert: false }]);
    // o nome vai sanitizado e o IP vai para a reserva
    expect(f.chamou("rpc_hr_convite_anexo_reservar")[0].args).toEqual({
      p_token_hash: HASH,
      p_sessao_hash: SESSAO_HASH,
      p_tipo: "comprovativo_iban",
      p_nome_original: "cc frente.pdf",
      p_tamanho_declarado: 2048,
      p_mime_declarado: "application/pdf",
      p_ip: "203.0.113.7",
    });
    semOrgNemPessoa(r);
  });

  it.each([
    ["gif declarado", { ...PEDIDO_URL, mime: "image/gif" }, 422, "anexo_formato_invalido"],
    ["fotografia (fechada)", { tipo: "fotografia", nome: "a.png", tamanho: 2048, mime: "image/png" }, 422, "anexo_tipo_invalido"],
    ["cartao de cidadao (fechado)", { ...PEDIDO_URL, tipo: "cartao_cidadao" }, 422, "anexo_tipo_invalido"],
    ["tipo desconhecido", { ...PEDIDO_URL, tipo: "passaporte" }, 422, "anexo_tipo_invalido"],
    ["10 MB mais um byte", { ...PEDIDO_URL, tamanho: 10485761 }, 413, "anexo_demasiado_grande"],
  ])("recusa cedo, sem tocar na base: %s", async (_nome, payload, status, codigo) => {
    const f = criarFalso();
    const r = await pedir(f.svc, "anexo_url", payload);
    expect(r).toEqual({ status, body: { error: codigo } });
    expect(f.chamadas).toHaveLength(0);
    expect(f.assinados).toHaveLength(0);
  });

  it.each([
    ["tamanho zero", { ...PEDIDO_URL, tamanho: 0 }],
    ["tamanho negativo", { ...PEDIDO_URL, tamanho: -4 }],
    ["tamanho decimal", { ...PEDIDO_URL, tamanho: 10.5 }],
    ["tamanho em texto", { ...PEDIDO_URL, tamanho: "2048" }],
    ["sem nome", { ...PEDIDO_URL, nome: undefined }],
    ["sem tipo", { ...PEDIDO_URL, tipo: undefined }],
    ["sem mime", { ...PEDIDO_URL, mime: undefined }],
  ])("pedido mal formado: %s", async (_nome, payload) => {
    const f = criarFalso();
    const r = await pedir(f.svc, "anexo_url", payload as Record<string, unknown>);
    expect(r).toEqual({ status: 400, body: { error: "pedido_invalido" } });
    expect(f.chamadas).toHaveLength(0);
  });

  it("corpo ausente e pedido invalido", async () => {
    const f = criarFalso();
    expect(await pedir(f.svc, "anexo_url", null)).toEqual({ status: 400, body: { error: "pedido_invalido" } });
  });

  it.each([
    ["anexo_tipo_cheio", 409],
    ["anexo_maximo_ficheiros", 409],
    ["anexo_limite_convite", 409],
    ["convite_expirado", 401],
    ["convite_ja_usado", 401],
    ["anexo_tipo_bloqueado", 409],
  ])("a recusa %s da base (jsonb) sai com o seu estado %i", async (codigo, status) => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_reservar: () => ({ data: { erro: codigo }, error: null }) } });
    const r = await pedir(f.svc, "anexo_url", PEDIDO_URL);
    expect(r).toEqual({ status, body: { error: codigo } });
    expect(f.assinados).toHaveLength(0);
  });

  it.each([
    ["HRA51", "sessao_ausente", "sessao_ausente", 401],
    ["HRA52", "sessao_expirada", "sessao_expirada", 401],
    ["HRA53", "sessao_substituida", "sessao_expirada", 401],
    ["HRA38", "estado_invalido", "estado_invalido", 409],
    ["HRA02", "convite_ja_usado", "convite_ja_usado", 401],
    ["HRA31", "nao_encontrado", "convite_invalido", 401],
  ])("o RAISE %s das RPCs (sessao, estado, convite) sai como %s", async (sqlstate, mensagem, codigo, status) => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_reservar: raise(sqlstate, mensagem) } });
    const r = await pedir(f.svc, "anexo_url", PEDIDO_URL);
    expect(r).toEqual({ status, body: { error: codigo } });
    expect(f.assinados).toHaveLength(0);
  });

  it("um motivo fora do catalogo e erro_inesperado, nunca o texto da base", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_reservar: () => ({ data: { erro: "segredo_da_base" }, error: null }) } });
    const r = await tratarAccaoAnexo({
      accao: "anexo_url", svc: f.svc, tokenHash: HASH, sessaoHash: SESSAO_HASH, payload: PEDIDO_URL, ip: null, registarErro: (e) => erros.push(e),
    });
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(JSON.stringify(r.body)).not.toContain("segredo_da_base");
    expect(erros).toHaveLength(1);
  });

  it("um erro da base nunca vai em bruto para a resposta", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_reservar: () => ({ data: null, error: { message: 'relation "pessoas_anexos" does not exist' } }) } });
    const r = await pedir(f.svc, "anexo_url", PEDIDO_URL);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
  });

  it("se o URL assinado falha, liberta a reserva e diz anexo_falha_envio", async () => {
    const f = criarFalso({
      falharAssinar: true,
      rpcs: { rpc_hr_convite_anexo_reservar: RESERVA_OK, rpc_hr_convite_anexo_descartar: () => ({ data: { ok: true }, error: null }) },
    });
    const r = await pedir(f.svc, "anexo_url", PEDIDO_URL);
    expect(r).toEqual({ status: 400, body: { error: "anexo_falha_envio" } });
    expect(f.chamou("rpc_hr_convite_anexo_descartar")[0].args).toMatchObject({
      p_sessao_hash: SESSAO_HASH, p_anexo_id: ANEXO, p_motivo: "upload_abandonado",
    });
  });
});

describe("anexo_confirmar", () => {
  const rpcsOk = (tipo = "comprovativo_iban"): Record<string, Manipulador> => ({
    rpc_hr_convite_anexo_contexto: contexto(tipo),
    rpc_hr_convite_anexo_ligar: ligarOk(tipo),
    rpc_hr_convite_anexo_descartar: () => ({ data: { ok: true }, error: null }),
  });

  it("sucesso: copia para hr-documentos com o tipo REAL, liga e limpa a quarentena", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      anexo: { id: ANEXO, tipo: "comprovativo_iban", nome_original: "cc.pdf", tamanho_bytes: PDF.length, mime_type: "application/pdf" },
    });
    expect(f.uploads).toEqual([
      { bucket: BUCKET_FINAL, caminho: CAMINHO_FINAL_PDF, contentType: "application/pdf", upsert: false, cacheControl: "0" },
    ]);
    expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(false);

    const ligar = f.chamou("rpc_hr_convite_anexo_ligar")[0].args;
    expect(ligar).toMatchObject({ p_token_hash: HASH, p_anexo_id: ANEXO, p_caminho_final: CAMINHO_FINAL_PDF, p_mime: "application/pdf", p_tamanho: PDF.length });
    expect(ligar.p_hash).toMatch(/^[0-9a-f]{64}$/);
    // o caminho final e as ids da organizacao e da pessoa nunca saem
    semOrgNemPessoa(r);
    expect(JSON.stringify(r.body)).not.toContain("admissao/");
  });

  it("o hash e o SHA-256 dos bytes recebidos", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk() });
    await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    const esperado = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", PDF)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(f.chamou("rpc_hr_convite_anexo_ligar")[0].args.p_hash).toBe(esperado);
  });

  it("o tipo REAL manda: um JPEG enviado como .pdf vai para .jpg com image/jpeg", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: JPEG }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
    expect(f.uploads[0]).toMatchObject({ caminho: `${ORG}/${PESSOA}/admissao/${ANEXO}.jpg`, contentType: "image/jpeg" });
    expect(f.chamou("rpc_hr_convite_anexo_ligar")[0].args).toMatchObject({ p_mime: "image/jpeg" });
  });

  it("a sessao vai em todas as RPCs do confirmar (contexto e ligar)", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk() });
    await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(f.chamou("rpc_hr_convite_anexo_contexto")[0].args).toMatchObject({ p_sessao_hash: SESSAO_HASH });
    expect(f.chamou("rpc_hr_convite_anexo_ligar")[0].args).toMatchObject({ p_sessao_hash: SESSAO_HASH });
  });

  it("PDF com conteudo activo: recusado com anexo_conteudo_recusado (422), nada e copiado nem ligado", async () => {
    const activo = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /J#61vaScript /JS (app.alert(1)) >> >>\nendobj\n");
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: activo }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 422, body: { error: "anexo_conteudo_recusado" } });
    expect(f.uploads).toHaveLength(0);
    expect(f.chamou("rpc_hr_convite_anexo_ligar")).toHaveLength(0);
    expect(f.chamou("rpc_hr_convite_anexo_descartar")[0].args).toMatchObject({ p_motivo: "formato_invalido" });
    expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
  });

  it("imagem com EXIF: o que se guarda e liga e a imagem limpa, com o hash e o tamanho dos bytes limpos", async () => {
    const comExif = Uint8Array.from([
      ...JPEG.subarray(0, 2),
      0xff, 0xe1, 0, 0x0a, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x47, 0x50, // APP1 Exif com "GP"
      ...JPEG.subarray(2),
      0x00, 0x00, 0x99, // lixo depois do fim
    ]);
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: comExif }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
    const guardado = f.buckets[BUCKET_FINAL].get(`${ORG}/${PESSOA}/admissao/${ANEXO}.jpg`)!;
    expect(Array.from(guardado)).toEqual(Array.from(JPEG));
    const esperado = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", JPEG)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(f.chamou("rpc_hr_convite_anexo_ligar")[0].args).toMatchObject({ p_tamanho: JPEG.length, p_hash: esperado });
  });

  it("ficheiro ausente da quarentena: anexo_nao_carregado (409), sem ligar nada", async () => {
    const f = criarFalso({ rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 409, body: { error: "anexo_nao_carregado" } });
    expect(f.chamou("rpc_hr_convite_anexo_ligar")).toHaveLength(0);
    expect(f.uploads).toHaveLength(0);
  });

  it("gif recusado: descarta com formato_invalido e remove da quarentena (sem marcar nada: a limpeza trata do resto)", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: GIF }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });

    expect(r).toEqual({ status: 422, body: { error: "anexo_formato_invalido" } });
    expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
    expect(f.chamou("rpc_hr_convite_anexo_descartar")[0].args).toMatchObject({ p_anexo_id: ANEXO, p_motivo: "formato_invalido" });
    // marcar objecto_removido numa linha com menos de 3 h nao faz nada na base: nao se chama
    expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
    expect(f.uploads).toHaveLength(0);
    expect(f.chamou("rpc_hr_convite_anexo_ligar")).toHaveLength(0);
  });

  it("gif recusado com a remocao a falhar: a pessoa recebe o mesmo erro e a falha fica registada", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: GIF }, rpcs: rpcsOk(), falharRemoverEm: [BUCKET_QUARENTENA] });
    const r = await pedirComErros(f.svc, "anexo_confirmar", { anexo_id: ANEXO }, erros);
    expect(r.body).toEqual({ error: "anexo_formato_invalido" });
    expect(erros).toHaveLength(1);
  });

  it("tamanho REAL acima do tecto: recusado com demasiado_grande SEM descarregar o objecto", async () => {
    const grande = new Uint8Array(10485761);
    grande.set(PDF);
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: grande }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 413, body: { error: "anexo_demasiado_grande" } });
    expect(f.chamou("rpc_hr_convite_anexo_descartar")[0].args).toMatchObject({ p_motivo: "demasiado_grande" });
    expect(f.descarregados).toHaveLength(0);
    expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
  });

  it("sem tamanho nos metadados ou com o Storage a falhar a listar: fecha-se, nao se descarrega", async () => {
    for (const opcoes of [{ semTamanhoNosMetadados: true }, { falharListar: true }]) {
      const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk(), ...opcoes });
      const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
      expect(r).toEqual({ status: 400, body: { error: "anexo_falha_envio" } });
      expect(f.descarregados).toHaveLength(0);
      expect(f.uploads).toHaveLength(0);
    }
  });

  it("os metadados mandam: um objecto que diz 11 MB nao e descarregado, mesmo que os bytes fossem pequenos", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk(), tamanhoNosMetadados: 11 * 1024 * 1024 });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r.status).toBe(413);
    expect(f.descarregados).toHaveLength(0);
  });

  it("sessao caida na ligacao NAO desfaz o envio: a copia e a quarentena ficam para repetir a confirmacao", async () => {
    for (const [sqlstate, mensagem, codigo] of [
      ["HRA51", "sessao_ausente", "sessao_ausente"],
      ["HRA52", "sessao_expirada", "sessao_expirada"],
      ["HRA53", "sessao_substituida", "sessao_expirada"],
      ["HRA31", "nao_encontrado", "convite_invalido"],
    ]) {
      const f = criarFalso({
        quarentena: { [CAMINHO_QUARENTENA]: PDF },
        rpcs: { ...rpcsOk(), rpc_hr_convite_anexo_ligar: raise(sqlstate, mensagem) },
      });
      const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
      expect(r).toEqual({ status: 401, body: { error: codigo } });
      expect(f.chamou("rpc_hr_convite_anexo_descartar")).toHaveLength(0);
      expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    }
  });

  it("duas confirmacoes em paralelo: o ligar da segunda devolve anexo_estado_invalido e NAO desfaz nada (ja ligado pela outra)", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { ...rpcsOk(), rpc_hr_convite_anexo_ligar: () => ({ data: { erro: "anexo_estado_invalido" }, error: null }) },
    });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, anexo: { id: ANEXO, tipo: "comprovativo_iban", mime_type: "application/pdf" } });
    // nada descartado, e o objecto final (o mesmo caminho do anexo ligado pela outra) fica
    expect(f.chamou("rpc_hr_convite_anexo_descartar")).toHaveLength(0);
    expect(f.remocoes.filter((x) => x.bucket === BUCKET_FINAL)).toEqual([]);
    expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    semOrgNemPessoa(r);
  });

  it("estado invalido (HRA38) na ligacao desfaz a copia: ja nao ha onde ligar", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { ...rpcsOk(), rpc_hr_convite_anexo_ligar: raise("HRA38", "estado_invalido") },
    });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 409, body: { error: "estado_invalido" } });
    expect(f.chamou("rpc_hr_convite_anexo_descartar")).toHaveLength(1);
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
  });

  it("anexo_tipo_bloqueado vindo do contexto (jsonb) sai com 409 e nada e lido do Storage", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { rpc_hr_convite_anexo_contexto: () => ({ data: { erro: "anexo_tipo_bloqueado" }, error: null }) },
    });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 409, body: { error: "anexo_tipo_bloqueado" } });
    expect(f.descarregados).toHaveLength(0);
  });

  it("exactamente no tecto de 10 MB passa", async () => {
    const justo = new Uint8Array(10485760);
    justo.set(PDF);
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: justo }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
  });

  it("ficheiro vazio e recusado", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: new Uint8Array(0) }, rpcs: rpcsOk() });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    // sem assinatura reconhecivel: e um formato invalido
    expect(r.status).toBe(422);
    expect(f.uploads).toHaveLength(0);
  });

  it("se a base recusa a ligacao, o objecto final que acabou de nascer e apagado", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { ...rpcsOk(), rpc_hr_convite_anexo_ligar: () => ({ data: { erro: "anexo_maximo_ficheiros" }, error: null }) },
    });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });

    expect(r).toEqual({ status: 409, body: { error: "anexo_maximo_ficheiros" } });
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
    expect(f.remocoes).toContainEqual({ bucket: BUCKET_FINAL, caminho: CAMINHO_FINAL_PDF });
    expect(f.chamou("rpc_hr_convite_anexo_descartar")[0].args).toMatchObject({ p_motivo: "upload_abandonado" });
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(false);
  });

  it("se a ligacao rebenta por erro da base, desfaz tudo e so devolve erro_inesperado", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { ...rpcsOk(), rpc_hr_convite_anexo_ligar: () => ({ data: null, error: { message: "deadlock detected" } }) },
    });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
    expect(JSON.stringify(r.body)).not.toContain("deadlock");
  });

  it("se a copia para hr-documentos falha: anexo_falha_envio e nada fica ligado", async () => {
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk(), falharUploadFinal: true });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r.body).toEqual({ error: "anexo_falha_envio" });
    expect(f.chamou("rpc_hr_convite_anexo_ligar")).toHaveLength(0);
    // o ficheiro continua na quarentena: a pessoa pode tentar de novo
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(true);
  });

  it("depois de ligar, se a remocao da quarentena falha: 200 para a pessoa, falha registada, e nada se apaga a mais", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({ quarentena: { [CAMINHO_QUARENTENA]: PDF }, rpcs: rpcsOk(), falharRemoverEm: [BUCKET_QUARENTENA] });
    const r = await pedirComErros(f.svc, "anexo_confirmar", { anexo_id: ANEXO }, erros);

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true });
    expect(erros).toHaveLength(1);
    // o objecto final fica, a linha esta ligada, e a copia da quarentena fica para
    // a limpeza: a base guarda o caminho em caminho_quarentena e devolve-o
    // (ver limpeza.vitest.test.ts, "linha ligada ou promovida")
    expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(true);
    expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
    expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
  });

  it("ligacao recusada E remocao do objecto final a falhar: nao engole, regista, e a linha fica descartada para a limpeza", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { ...rpcsOk(), rpc_hr_convite_anexo_ligar: () => ({ data: { erro: "convite_ja_usado" }, error: null }) },
      falharRemoverEm: [BUCKET_FINAL],
    });
    const r = await pedirComErros(f.svc, "anexo_confirmar", { anexo_id: ANEXO }, erros);

    expect(r).toEqual({ status: 401, body: { error: "convite_ja_usado" } });
    // o descarte foi pedido (a linha passa a apagada; a limpeza devolve os caminhos finais possiveis)
    expect(f.chamou("rpc_hr_convite_anexo_descartar")[0].args).toMatchObject({ p_motivo: "upload_abandonado" });
    expect(f.remocoes).toContainEqual({ bucket: BUCKET_FINAL, caminho: CAMINHO_FINAL_PDF });
    expect(erros).toHaveLength(1);
  });

  it("se o descarte nao e confirmado pela base, o objecto final NAO se apaga (a linha pode estar ligada)", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: {
        ...rpcsOk(),
        rpc_hr_convite_anexo_ligar: () => ({ data: null, error: { message: "timeout" } }),
        rpc_hr_convite_anexo_descartar: () => ({ data: null, error: { message: "deadlock detected" } }),
      },
    });
    const r = await pedirComErros(f.svc, "anexo_confirmar", { anexo_id: ANEXO }, erros);

    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    expect(f.remocoes).toHaveLength(0);
    expect(erros).toHaveLength(2);
  });

  it("um descarte que a base recusa em jsonb ({erro}) tambem nao conta como sucesso", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: {
        ...rpcsOk(),
        rpc_hr_convite_anexo_ligar: () => ({ data: { erro: "anexo_maximo_ficheiros" }, error: null }),
        rpc_hr_convite_anexo_descartar: () => ({ data: { erro: "convite_invalido" }, error: null }),
      },
    });
    const r = await pedirComErros(f.svc, "anexo_confirmar", { anexo_id: ANEXO }, erros);

    expect(r).toEqual({ status: 409, body: { error: "anexo_maximo_ficheiros" } });
    expect(f.buckets[BUCKET_FINAL].has(CAMINHO_FINAL_PDF)).toBe(true);
    expect(erros).toHaveLength(1);
  });

  it("repetir a confirmacao com o objecto final ja la (mesmo conteudo) e idempotente, nao anexo_falha_envio", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      finalInicial: { [CAMINHO_FINAL_PDF]: PDF },
      rpcs: rpcsOk(),
    });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
    expect(f.chamou("rpc_hr_convite_anexo_ligar")).toHaveLength(1);
  });

  it("objecto final ja la mas com OUTRO conteudo: anexo_falha_envio, nada e ligado nem sobreposto", async () => {
    const outro = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32, 9, 9, 9, 9]);
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      finalInicial: { [CAMINHO_FINAL_PDF]: outro },
      rpcs: rpcsOk(),
    });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r.body).toEqual({ error: "anexo_falha_envio" });
    expect(f.chamou("rpc_hr_convite_anexo_ligar")).toHaveLength(0);
    expect(f.buckets[BUCKET_FINAL].get(CAMINHO_FINAL_PDF)).toBe(outro);
  });

  it("token de outro convite: anexo_nao_encontrado e nada e lido do Storage", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { rpc_hr_convite_anexo_contexto: () => ({ data: { erro: "anexo_nao_encontrado" }, error: null }) },
    });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: OUTRO_ANEXO });
    expect(r).toEqual({ status: 404, body: { error: "anexo_nao_encontrado" } });
    expect(f.uploads).toHaveLength(0);
    expect(f.remocoes).toHaveLength(0);
  });

  it("anexo que ja nao esta pendente: anexo_estado_invalido (409)", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_contexto: () => ({ data: { erro: "anexo_estado_invalido" }, error: null }) } });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 409, body: { error: "anexo_estado_invalido" } });
  });

  it("convite morto devolve o motivo do convite", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_contexto: () => ({ data: { erro: "convite_expirado" }, error: null }) } });
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 401, body: { error: "convite_expirado" } });
  });

  it.each([[undefined], [null], [""], ["nao-e-uuid"], [42]])("anexo_id invalido (%s) nao chega a base", async (anexo_id) => {
    const f = criarFalso();
    const r = await pedir(f.svc, "anexo_confirmar", { anexo_id });
    expect(r).toEqual({ status: 400, body: { error: "pedido_invalido" } });
    expect(f.chamadas).toHaveLength(0);
  });
});

describe("anexo_remover", () => {
  /** O que a base devolve: onde o objecto esta agora e a copia da quarentena (igual ao caminho se estava pendente). */
  const descartarOk = (bucket: string, caminho: string, caminhoQuarentena: string = caminho): Manipulador => () => ({
    data: { ok: true, bucket, caminho, caminho_quarentena: caminhoQuarentena },
    error: null,
  });

  it("anexo ligado: remove o objecto final E a copia que ficou na quarentena", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { rpc_hr_convite_anexo_descartar: descartarOk(BUCKET_FINAL, CAMINHO_FINAL_PDF, CAMINHO_QUARENTENA) },
    });
    f.buckets[BUCKET_FINAL].set(CAMINHO_FINAL_PDF, PDF);
    const r = await pedir(f.svc, "anexo_remover", { anexo_id: ANEXO });

    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(f.chamou("rpc_hr_convite_anexo_descartar")[0].args).toMatchObject({ p_anexo_id: ANEXO, p_motivo: "removido_pela_pessoa" });
    expect(f.remocoes).toEqual([
      { bucket: BUCKET_FINAL, caminho: CAMINHO_FINAL_PDF },
      { bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA },
    ]);
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
    expect(f.buckets[BUCKET_QUARENTENA].size).toBe(0);
    // a base nao precisa de ser avisada: a limpeza apanha o que falhar
    expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
    semOrgNemPessoa(r);
  });

  it("anexo pendente: o caminho e a quarentena coincidem e remove-se uma so vez", async () => {
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { rpc_hr_convite_anexo_descartar: descartarOk(BUCKET_QUARENTENA, CAMINHO_QUARENTENA) },
    });
    const r = await pedir(f.svc, "anexo_remover", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
    expect(f.remocoes).toEqual([{ bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA }]);
  });

  it("uma falha do remove nao e erro para a pessoa: fica registada e a limpeza apanha-a; o outro objecto sai na mesma", async () => {
    const erros: unknown[] = [];
    const f = criarFalso({
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
      rpcs: { rpc_hr_convite_anexo_descartar: descartarOk(BUCKET_FINAL, CAMINHO_FINAL_PDF, CAMINHO_QUARENTENA) },
      falharRemoverEm: [BUCKET_QUARENTENA],
    });
    f.buckets[BUCKET_FINAL].set(CAMINHO_FINAL_PDF, PDF);
    const r = await pedirComErros(f.svc, "anexo_remover", { anexo_id: ANEXO }, erros);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(f.buckets[BUCKET_FINAL].size).toBe(0);
    expect(erros).toHaveLength(1);
    expect(f.chamou("hr_convite_anexos_objecto_removido")).toHaveLength(0);
  });

  it("um caminho de quarentena vazio ou ausente nao gera remocao nenhuma", async () => {
    const f = criarFalso({
      rpcs: { rpc_hr_convite_anexo_descartar: () => ({ data: { ok: true, bucket: BUCKET_FINAL, caminho: CAMINHO_FINAL_PDF, caminho_quarentena: "" }, error: null }) },
    });
    await pedir(f.svc, "anexo_remover", { anexo_id: ANEXO });
    expect(f.remocoes).toEqual([{ bucket: BUCKET_FINAL, caminho: CAMINHO_FINAL_PDF }]);
  });

  it("um bucket desconhecido devolvido pela base nao e tocado", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_descartar: descartarOk("outro-bucket", "x/y.pdf", "") } });
    const r = await pedir(f.svc, "anexo_remover", { anexo_id: ANEXO });
    expect(r.status).toBe(200);
    expect(f.remocoes).toHaveLength(0);
  });

  it("anexo de outro convite: anexo_nao_encontrado e nada e removido", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_descartar: () => ({ data: { erro: "anexo_nao_encontrado" }, error: null }) } });
    const r = await pedir(f.svc, "anexo_remover", { anexo_id: OUTRO_ANEXO });
    expect(r).toEqual({ status: 404, body: { error: "anexo_nao_encontrado" } });
    expect(f.remocoes).toHaveLength(0);
  });

  it("convite ja usado: o motivo do convite, nada removido", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_descartar: () => ({ data: { erro: "convite_ja_usado" }, error: null }) } });
    const r = await pedir(f.svc, "anexo_remover", { anexo_id: ANEXO });
    expect(r).toEqual({ status: 401, body: { error: "convite_ja_usado" } });
  });

  it("anexo_id invalido nao chega a base", async () => {
    const f = criarFalso();
    expect(await pedir(f.svc, "anexo_remover", { anexo_id: "x" })).toEqual({ status: 400, body: { error: "pedido_invalido" } });
    expect(f.chamadas).toHaveLength(0);
  });

  it("o motivo do descarte e FIXADO no servidor: removido_pela_pessoa, qualquer motivo do pedido e ignorado, e a sessao vai", async () => {
    const f = criarFalso({
      rpcs: { rpc_hr_convite_anexo_descartar: descartarOk(BUCKET_QUARENTENA, CAMINHO_QUARENTENA) },
    });
    await pedir(f.svc, "anexo_remover", { anexo_id: ANEXO, motivo: "upload_abandonado", p_motivo: "formato_invalido" });
    const args = f.chamou("rpc_hr_convite_anexo_descartar")[0].args;
    expect(args).toEqual({
      p_token_hash: HASH,
      p_sessao_hash: SESSAO_HASH,
      p_anexo_id: ANEXO,
      p_motivo: "removido_pela_pessoa",
    });
  });

  it.each([
    ["HRA51", "sessao_ausente", "sessao_ausente"],
    ["HRA52", "sessao_expirada", "sessao_expirada"],
    ["HRA38", "estado_invalido", "estado_invalido"],
  ])("o RAISE %s do descarte sai como %s e nada se remove", async (sqlstate, mensagem, codigo) => {
    const f = criarFalso({ rpcs: { rpc_hr_convite_anexo_descartar: raise(sqlstate, mensagem) } });
    const r = await pedir(f.svc, "anexo_remover", { anexo_id: ANEXO });
    expect(r.body).toEqual({ error: codigo });
    expect(f.remocoes).toHaveLength(0);
  });
});

describe("despacho", () => {
  it("accao desconhecida", async () => {
    const f = criarFalso();
    expect(await pedir(f.svc, "anexo_apagar_tudo", {})).toEqual({ status: 400, body: { error: "accao_desconhecida" } });
  });

  it("uma excepcao inesperada vira erro_inesperado, sem texto", async () => {
    const erros: unknown[] = [];
    const svc = {
      rpc: () => {
        throw new Error("ligacao rebentou com o token abc");
      },
      storage: { from: () => ({}) },
    } as unknown as ClienteAnexos;
    const r = await tratarAccaoAnexo({
      accao: "anexo_remover", svc, tokenHash: HASH, sessaoHash: SESSAO_HASH, payload: { anexo_id: ANEXO }, ip: null, registarErro: (e) => erros.push(e),
    });
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(erros).toHaveLength(1);
  });
});

describe("lerObjecto e copiarParaFinal registam as falhas do Storage", () => {
  const bucket = (download: () => Promise<{ data: unknown; error: unknown }>, upload?: () => Promise<{ data: unknown; error: unknown }>) =>
    ({
      createSignedUploadUrl: async () => ({ data: null, error: null }),
      list: async () => ({ data: [], error: null }),
      download,
      upload: upload ?? (async () => ({ data: {}, error: null })),
      remove: async () => ({ data: [], error: null }),
    }) as unknown as Parameters<typeof lerObjecto>[0];

  it("objecto em falta (nao chegou nada): null e nada registado", async () => {
    const erros: unknown[] = [];
    const b = bucket(async () => ({ data: null, error: { message: "Object not found", statusCode: "404" } }));
    expect(await lerObjecto(b, "x/y.pdf", (e) => erros.push(e))).toBeNull();
    expect(erros).toHaveLength(0);
  });

  it("falha do Storage: null e o erro registado", async () => {
    const erros: unknown[] = [];
    const erro = { message: "Internal Server Error", statusCode: "500" };
    const b = bucket(async () => ({ data: null, error: erro }));
    expect(await lerObjecto(b, "x/y.pdf", (e) => erros.push(e))).toBeNull();
    expect(erros).toEqual([erro]);
  });

  it("sem registarErro continua a devolver null sem rebentar", async () => {
    const b = bucket(async () => ({ data: null, error: { message: "boom" } }));
    expect(await lerObjecto(b, "x/y.pdf")).toBeNull();
  });

  it("copiarParaFinal grava com cacheControl 0 e upsert false", async () => {
    const chamadas: unknown[] = [];
    const b = bucket(
      async () => ({ data: null, error: null }),
      async () => ({ data: {}, error: null }),
    );
    const original = b.upload.bind(b);
    b.upload = (c, corpo, o) => {
      chamadas.push(o);
      return original(c, corpo, o);
    };
    expect(await copiarParaFinal(b, "o/p/a.pdf", new Uint8Array([1]), "application/pdf", "h")).toBe(true);
    expect(chamadas).toEqual([{ contentType: "application/pdf", upsert: false, cacheControl: "0" }]);
  });

  it("copiarParaFinal: o upload falha e a releitura tambem falha por erro do Storage: ambas registadas", async () => {
    const erros: unknown[] = [];
    const b = bucket(
      async () => ({ data: null, error: { message: "Internal Server Error" } }),
      async () => ({ data: null, error: { message: "boom" } }),
    );
    expect(await copiarParaFinal(b, "o/p/a.pdf", new Uint8Array([1]), "application/pdf", "h", (e) => erros.push(e))).toBe(false);
    expect(erros).toHaveLength(2);
  });
});
