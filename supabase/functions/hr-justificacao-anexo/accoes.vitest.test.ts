/**
 * @vitest-environment node
 *
 * As accoes de anexos de justificacoes, com um cliente de servico falso: sem
 * rede, sem Deno. Verifica comportamento: que RPCs se chamam e por que ordem,
 * que objectos ficam onde, que codigos saem -- e que nenhum caminho sai.
 */
import { describe, expect, it } from "vitest";
import {
  BUCKET_JUSTIFICACOES,
  BUCKET_QUARENTENA,
  TTL_ABERTURA_SEGUNDOS,
  alvosDaRemocao,
  tratarAccaoHumana,
  type ClienteJustificacao,
  type RespostaAccao,
} from "./accoes.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PESSOA = "0a1b2c3d-1111-4222-8333-444455556666";
const JUSTIFICACAO = "c0c0c0c0-1111-4222-8333-444455556666";
const ANEXO = "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff";
const UTILIZADOR = "11111111-2222-4333-8444-555555555555";
const CAMINHO_QUARENTENA = `justificacoes/${ANEXO}.pdf`;
const CAMINHO_FINAL = `${ORG}/${PESSOA}/${JUSTIFICACAO}/${ANEXO}.pdf`;

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0, 0, 0, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

type Manipulador = (args: Record<string, unknown>) => { data: unknown; error: { message?: string } | null };

interface Opcoes {
  rpcs?: Record<string, Manipulador>;
  quarentena?: Record<string, Uint8Array>;
  falharAssinarUpload?: boolean;
  falharUrl?: boolean;
  tamanhoNosMetadados?: number;
}

function criarFalso(opcoes: Opcoes = {}) {
  const buckets: Record<string, Map<string, Uint8Array>> = {
    [BUCKET_QUARENTENA]: new Map(Object.entries(opcoes.quarentena ?? {})),
    [BUCKET_JUSTIFICACOES]: new Map(),
  };
  const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const remocoes: Array<{ bucket: string; caminho: string }> = [];
  const urls: Array<{ bucket: string; caminho: string; ttl: number }> = [];
  const descarregados: string[] = [];

  const svc: ClienteJustificacao = {
    rpc: async (fn, args) => {
      chamadas.push({ fn, args });
      const h = opcoes.rpcs?.[fn];
      if (!h) return { data: null, error: { message: `rpc inesperada: ${fn}` } };
      return h(args);
    },
    storage: {
      from: (bucket) => ({
        createSignedUploadUrl: async () =>
          opcoes.falharAssinarUpload ? { data: null, error: { message: "boom" } } : { data: { token: "tok" }, error: null },
        createSignedUrl: async (caminho, ttl) => {
          urls.push({ bucket, caminho, ttl });
          return opcoes.falharUrl
            ? { data: null, error: { message: "boom" } }
            : { data: { signedUrl: "https://exemplo.invalid/assinado" }, error: null };
        },
        list: async (pasta, o) => {
          const itens = [...buckets[bucket].entries()]
            .filter(([c]) => c.startsWith(`${pasta}/`))
            .map(([c, b]) => ({ name: c.slice(pasta.length + 1), metadata: { size: opcoes.tamanhoNosMetadados ?? b.length } }))
            .filter((i) => !o?.search || i.name.includes(o.search));
          return { data: itens, error: null };
        },
        download: async (caminho) => {
          descarregados.push(caminho);
          const bytes = buckets[bucket].get(caminho);
          if (!bytes) return { data: null, error: { message: "Object not found" } };
          return { data: { arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer }, error: null };
        },
        upload: async (caminho, corpo, o) => {
          if (!o.upsert && buckets[bucket].has(caminho)) return { data: null, error: { message: "exists" } };
          buckets[bucket].set(caminho, corpo);
          return { data: {}, error: null };
        },
        remove: async (caminhos) => {
          for (const caminho of caminhos) {
            remocoes.push({ bucket, caminho });
            buckets[bucket].delete(caminho);
          }
          return { data: [], error: null };
        },
      }),
    },
  };
  return { svc, chamadas, remocoes, urls, descarregados, buckets };
}

const pedido = (accao: string, payload: Record<string, unknown> | null, svc: ClienteJustificacao) =>
  tratarAccaoHumana({ accao, svc, authUid: UTILIZADOR, payload });

const contextoOk: Manipulador = () => ({
  data: { anexo_id: ANEXO, caminho: CAMINHO_QUARENTENA, organization_id: ORG, pessoa_id: PESSOA, justificacao_id: JUSTIFICACAO },
  error: null,
});
const verificarOk: Manipulador = (a) => ({
  data: { ok: true, anexo: { id: ANEXO, nome_original: "baixa.pdf", tamanho_bytes: a.p_tamanho, mime_type: a.p_mime } },
  error: null,
});
const descartarOk: Manipulador = () => ({
  data: { ok: true, bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA, caminho_quarentena: null },
  error: null,
});

const semCaminhos = (r: RespostaAccao) => {
  const texto = JSON.stringify(r.body);
  expect(texto).not.toContain(ORG);
  expect(texto).not.toContain(PESSOA);
};

describe("url", () => {
  const corpo = { justificacao_dia_id: JUSTIFICACAO, nome: "baixa.pdf", tamanho: 1000, mime: "application/pdf" };
  const reservarOk: Manipulador = () => ({ data: { anexo_id: ANEXO, caminho: CAMINHO_QUARENTENA }, error: null });

  it("reserva com o utilizador e devolve o token de upload para a quarentena", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_justificacao_anexo_reservar: reservarOk } });
    const r = await pedido("url", corpo, f.svc);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, anexo_id: ANEXO, bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA, upload_token: "tok" });
    expect(f.chamadas[0].args).toMatchObject({
      p_auth_uid: UTILIZADOR,
      p_justificacao_dia_id: JUSTIFICACAO,
      p_falta_justificacao_id: null,
      p_mime_declarado: "application/pdf",
    });
    semCaminhos(r);
  });

  it("recusa sem chamar a base: dois alvos, nenhum, ids invalidos, formato, vazio, grande", async () => {
    const f = criarFalso();
    const casos: Array<[Record<string, unknown>, string]> = [
      [{ ...corpo, falta_justificacao_id: JUSTIFICACAO }, "pedido_invalido"],
      [{ nome: "a", tamanho: 1, mime: "application/pdf" }, "pedido_invalido"],
      [{ ...corpo, justificacao_dia_id: "nao-e-uuid" }, "pedido_invalido"],
      [{ ...corpo, tamanho: "1000" }, "pedido_invalido"],
      [{ ...corpo, mime: "image/gif" }, "anexo_formato_invalido"],
      [{ ...corpo, mime: "image/heic" }, "anexo_formato_invalido"],
      [{ ...corpo, tamanho: 0 }, "anexo_vazio"],
      [{ ...corpo, tamanho: 10485761 }, "anexo_demasiado_grande"],
    ];
    for (const [c, codigo] of casos) {
      const r = await pedido("url", c, f.svc);
      expect(r.body).toEqual({ error: codigo });
    }
    expect(f.chamadas).toHaveLength(0);
  });

  it("traduz as recusas da base e nao deixa passar codigos desconhecidos", async () => {
    for (const [erro, status, codigo] of [
      ["justificacao_nao_encontrada", 404, "justificacao_nao_encontrada"],
      ["justificacao_decidida", 409, "justificacao_decidida"],
      ["sem_permissao", 403, "sem_permissao"],
      ["anexo_maximo_ficheiros", 409, "anexo_maximo_ficheiros"],
      ["coisa_estranha", 500, "erro_inesperado"],
    ] as const) {
      const f = criarFalso({ rpcs: { rpc_hr_justificacao_anexo_reservar: () => ({ data: { erro }, error: null }) } });
      const r = await pedido("url", corpo, f.svc);
      expect(r).toEqual({ status, body: { error: codigo } });
    }
  });

  it("um motivo herdado do prototipo (constructor, toString, __proto__) da o erro uniforme, sem lancar", async () => {
    for (const erro of ["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"]) {
      const registados: unknown[] = [];
      const f = criarFalso({ rpcs: { rpc_hr_justificacao_anexo_reservar: () => ({ data: { erro }, error: null }) } });
      const r = await tratarAccaoHumana({
        accao: "url",
        svc: f.svc,
        authUid: UTILIZADOR,
        payload: corpo,
        registarErro: (e) => registados.push(e),
      });
      expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
      expect(registados).toHaveLength(1);
    }
  });

  it("um erro da base (RAISE) nunca mostra o texto", async () => {
    const f = criarFalso({
      rpcs: { rpc_hr_justificacao_anexo_reservar: () => ({ data: null, error: { message: "segredo da base" } }) },
    });
    const r = await pedido("url", corpo, f.svc);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
  });

  it("se nao consegue assinar o upload, liberta a reserva", async () => {
    const f = criarFalso({
      falharAssinarUpload: true,
      rpcs: { rpc_hr_justificacao_anexo_reservar: reservarOk, rpc_hr_justificacao_anexo_descartar: descartarOk },
    });
    const r = await pedido("url", corpo, f.svc);
    expect(r.body).toEqual({ error: "anexo_falha_envio" });
    expect(f.chamadas.map((c) => c.fn)).toEqual(["rpc_hr_justificacao_anexo_reservar", "rpc_hr_justificacao_anexo_descartar"]);
    expect(f.chamadas[1].args.p_motivo).toBe("upload_abandonado");
  });
});

describe("confirmar", () => {
  const rpcsBase = {
    rpc_hr_justificacao_anexo_contexto: contextoOk,
    rpc_hr_justificacao_anexo_verificar: verificarOk,
    rpc_hr_justificacao_anexo_descartar: descartarOk,
  };

  it("verifica o ficheiro real, copia para hr-justificacoes no caminho certo e tira a quarentena", async () => {
    const f = criarFalso({ rpcs: rpcsBase, quarentena: { [CAMINHO_QUARENTENA]: PDF } });
    const r = await pedido("confirmar", { anexo_id: ANEXO }, f.svc);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, anexo: { id: ANEXO, nome_original: "baixa.pdf", mime_type: "application/pdf" } });
    semCaminhos(r);
    expect(f.buckets[BUCKET_JUSTIFICACOES].has(CAMINHO_FINAL)).toBe(true);
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(false);
    const verificar = f.chamadas.find((c) => c.fn === "rpc_hr_justificacao_anexo_verificar")!;
    expect(verificar.args).toMatchObject({ p_auth_uid: UTILIZADOR, p_caminho_final: CAMINHO_FINAL, p_mime: "application/pdf" });
    expect(verificar.args.p_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o tipo vem da assinatura e nao do que se declarou: um gif e recusado e sai da quarentena", async () => {
    const f = criarFalso({ rpcs: rpcsBase, quarentena: { [CAMINHO_QUARENTENA]: GIF } });
    const r = await pedido("confirmar", { anexo_id: ANEXO }, f.svc);
    expect(r).toEqual({ status: 422, body: { error: "anexo_formato_invalido" } });
    expect(f.chamadas.find((c) => c.fn === "rpc_hr_justificacao_anexo_descartar")!.args.p_motivo).toBe("formato_invalido");
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(false);
    expect(f.buckets[BUCKET_JUSTIFICACOES].size).toBe(0);
  });

  it("recusa pelo tamanho dos metadados SEM descarregar", async () => {
    const f = criarFalso({ rpcs: rpcsBase, quarentena: { [CAMINHO_QUARENTENA]: PDF }, tamanhoNosMetadados: 20_000_000 });
    const r = await pedido("confirmar", { anexo_id: ANEXO }, f.svc);
    expect(r.body).toEqual({ error: "anexo_demasiado_grande" });
    expect(f.descarregados).toHaveLength(0);
    expect(f.chamadas.find((c) => c.fn === "rpc_hr_justificacao_anexo_descartar")!.args.p_motivo).toBe("demasiado_grande");
  });

  it("nada na quarentena: anexo_nao_carregado, sem descartar", async () => {
    const f = criarFalso({ rpcs: rpcsBase });
    const r = await pedido("confirmar", { anexo_id: ANEXO }, f.svc);
    expect(r).toEqual({ status: 409, body: { error: "anexo_nao_carregado" } });
    expect(f.chamadas.map((c) => c.fn)).toEqual(["rpc_hr_justificacao_anexo_contexto"]);
  });

  it("justificacao ja decidida: descarta o envio e tira-o da quarentena", async () => {
    const f = criarFalso({
      rpcs: { ...rpcsBase, rpc_hr_justificacao_anexo_contexto: () => ({ data: { erro: "justificacao_decidida" }, error: null }) },
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
    });
    const r = await pedido("confirmar", { anexo_id: ANEXO }, f.svc);
    expect(r).toEqual({ status: 409, body: { error: "justificacao_decidida" } });
    expect(f.chamadas.some((c) => c.fn === "rpc_hr_justificacao_anexo_descartar")).toBe(true);
  });

  it("se a base recusar a verificacao, desfaz a copia final (descarte confirmado) e a quarentena", async () => {
    const f = criarFalso({
      rpcs: { ...rpcsBase, rpc_hr_justificacao_anexo_verificar: () => ({ data: { erro: "anexo_maximo_ficheiros" }, error: null }) },
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
    });
    const r = await pedido("confirmar", { anexo_id: ANEXO }, f.svc);
    expect(r.body).toEqual({ error: "anexo_maximo_ficheiros" });
    expect(f.buckets[BUCKET_JUSTIFICACOES].has(CAMINHO_FINAL)).toBe(false);
    expect(f.buckets[BUCKET_QUARENTENA].has(CAMINHO_QUARENTENA)).toBe(false);
  });

  it("estado_invalido ao verificar (confirmacao em paralelo ou removido): NAO apaga o objecto final", async () => {
    const f = criarFalso({
      rpcs: { ...rpcsBase, rpc_hr_justificacao_anexo_verificar: () => ({ data: { erro: "anexo_estado_invalido" }, error: null }) },
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
    });
    const r = await pedido("confirmar", { anexo_id: ANEXO }, f.svc);
    expect(r).toEqual({ status: 409, body: { error: "anexo_estado_invalido" } });
    expect(f.buckets[BUCKET_JUSTIFICACOES].has(CAMINHO_FINAL)).toBe(true);
    expect(f.chamadas.some((c) => c.fn === "rpc_hr_justificacao_anexo_descartar")).toBe(false);
  });

  it("erro da base ao verificar: nada se apaga (nao se sabe se verificou)", async () => {
    const f = criarFalso({
      rpcs: { ...rpcsBase, rpc_hr_justificacao_anexo_verificar: () => ({ data: null, error: { message: "boom" } }) },
      quarentena: { [CAMINHO_QUARENTENA]: PDF },
    });
    const r = await pedido("confirmar", { anexo_id: ANEXO }, f.svc);
    expect(r.status).toBe(500);
    expect(f.buckets[BUCKET_JUSTIFICACOES].has(CAMINHO_FINAL)).toBe(true);
  });

  it("anexo_id invalido", async () => {
    const f = criarFalso();
    expect((await pedido("confirmar", { anexo_id: "x" }, f.svc)).body).toEqual({ error: "pedido_invalido" });
    expect((await pedido("confirmar", null, f.svc)).body).toEqual({ error: "pedido_invalido" });
  });
});

describe("remover", () => {
  it("remove os objectos que a base indica e marca o objecto removido", async () => {
    const f = criarFalso({
      rpcs: {
        rpc_hr_justificacao_anexo_remover: () => ({
          data: { ok: true, bucket: BUCKET_JUSTIFICACOES, caminho: CAMINHO_FINAL, caminho_quarentena: CAMINHO_QUARENTENA },
          error: null,
        }),
        rpc_hr_justificacao_anexo_objecto_removido: () => ({ data: 1, error: null }),
      },
    });
    const r = await pedido("remover", { anexo_id: ANEXO }, f.svc);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(f.remocoes).toEqual([
      { bucket: BUCKET_JUSTIFICACOES, caminho: CAMINHO_FINAL },
      { bucket: BUCKET_QUARENTENA, caminho: CAMINHO_QUARENTENA },
    ]);
    expect(f.chamadas[1]).toEqual({ fn: "rpc_hr_justificacao_anexo_objecto_removido", args: { p_ids: [ANEXO] } });
  });

  it("devolve a recusa da base tal e qual (sem permissao, decidida, nao encontrado) e nao apaga nada", async () => {
    for (const erro of ["sem_permissao", "justificacao_decidida", "anexo_nao_encontrado"]) {
      const f = criarFalso({ rpcs: { rpc_hr_justificacao_anexo_remover: () => ({ data: { erro }, error: null }) } });
      const r = await pedido("remover", { anexo_id: ANEXO }, f.svc);
      expect(r.body).toEqual({ error: erro });
      expect(f.remocoes).toHaveLength(0);
    }
  });

  it("so toca nos dois buckets destes anexos", () => {
    expect(alvosDaRemocao({ bucket: "hr-documentos", caminho: "x", caminho_quarentena: null })).toEqual([]);
  });
});

describe("abrir", () => {
  const autorizado: Manipulador = () => ({
    data: { ok: true, anexo_id: ANEXO, bucket: BUCKET_JUSTIFICACOES, caminho: CAMINHO_FINAL, mime_type: "application/pdf", nome_original: "baixa.pdf", registado: true },
    error: null,
  });

  it("a base autoriza (e regista) ANTES de se assinar o URL; o URL vale 60 s e o caminho nao sai", async () => {
    const ordem: string[] = [];
    const f = criarFalso({
      rpcs: {
        rpc_hr_justificacao_anexo_autorizar_abertura: (a) => {
          ordem.push("autorizar");
          return autorizado(a);
        },
      },
    });
    const original = f.svc.storage.from;
    f.svc.storage.from = (b) => {
      const bucket = original(b);
      const assinar = bucket.createSignedUrl.bind(bucket);
      bucket.createSignedUrl = (c, t) => {
        ordem.push("assinar");
        return assinar(c, t);
      };
      return bucket;
    };
    const r = await pedido("abrir", { anexo_id: ANEXO }, f.svc);
    expect(ordem).toEqual(["autorizar", "assinar"]);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      url: "https://exemplo.invalid/assinado",
      expiraEmSegundos: 60,
      mime_type: "application/pdf",
    });
    // O nome do ficheiro pode ser dado de saúde (a listagem esconde-o): a base devolve-o e a Edge não o repassa.
    expect(JSON.stringify(r.body)).not.toContain("baixa.pdf");
    expect(TTL_ABERTURA_SEGUNDOS).toBe(60);
    expect(f.urls).toEqual([{ bucket: BUCKET_JUSTIFICACOES, caminho: CAMINHO_FINAL, ttl: 60 }]);
    expect(JSON.stringify(r.body)).not.toContain(CAMINHO_FINAL);
    semCaminhos(r);
  });

  it("recusada pela base (so .edit, nao encontrado, em quarentena): sem URL", async () => {
    for (const [erro, status] of [["sem_permissao", 403], ["anexo_nao_encontrado", 404], ["anexo_estado_invalido", 409]] as const) {
      const f = criarFalso({ rpcs: { rpc_hr_justificacao_anexo_autorizar_abertura: () => ({ data: { erro }, error: null }) } });
      const r = await pedido("abrir", { anexo_id: ANEXO }, f.svc);
      expect(r).toEqual({ status, body: { error: erro } });
      expect(f.urls).toHaveLength(0);
    }
  });

  it("falha da base ao autorizar/registar: sem URL", async () => {
    const f = criarFalso({ rpcs: { rpc_hr_justificacao_anexo_autorizar_abertura: () => ({ data: null, error: { message: "boom" } }) } });
    const r = await pedido("abrir", { anexo_id: ANEXO }, f.svc);
    expect(r.status).toBe(500);
    expect(f.urls).toHaveLength(0);
  });

  it("recusa um bucket que nao e hr-justificacoes", async () => {
    const f = criarFalso({
      rpcs: { rpc_hr_justificacao_anexo_autorizar_abertura: () => ({ data: { ok: true, bucket: "hr-documentos", caminho: "x" }, error: null }) },
    });
    const r = await pedido("abrir", { anexo_id: ANEXO }, f.svc);
    expect(r.status).toBe(500);
    expect(f.urls).toHaveLength(0);
  });

  it("falha ao assinar: erro_url", async () => {
    const f = criarFalso({ falharUrl: true, rpcs: { rpc_hr_justificacao_anexo_autorizar_abertura: autorizado } });
    expect((await pedido("abrir", { anexo_id: ANEXO }, f.svc)).body).toEqual({ error: "erro_url" });
  });
});

describe("despacho", () => {
  it("accao desconhecida", async () => {
    expect((await pedido("limpar", {}, criarFalso().svc)).body).toEqual({ error: "accao_desconhecida" });
  });
});
