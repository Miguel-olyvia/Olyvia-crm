/**
 * @vitest-environment node
 *
 * O limite de uso e o despacho do pedido humano, sem rede.
 */
import { describe, expect, it } from "vitest";
import {
  bucketDoLimite,
  consumirLimiteRegistandoPrimeiro,
  lerCorpoJson,
  tratarPedidoHttp,
  tratarPedidoHumano,
  JANELA_EM_MINUTOS,
  LIMITE_CORPO_BYTES,
  LIMITE_POR_HORA,
  type DependenciasHttp,
  type ResultadoLimite,
} from "./handler.ts";
import type { ClienteJustificacao } from "./accoes.ts";

const UTILIZADOR = "11111111-2222-4333-8444-555555555555";

function svcFalso(): { svc: ClienteJustificacao; chamadas: string[] } {
  const chamadas: string[] = [];
  const svc = {
    rpc: async (nome: string) => {
      chamadas.push(nome);
      return { data: { erro: "sem_permissao" }, error: null };
    },
    storage: { from: () => ({}) },
  } as unknown as ClienteJustificacao;
  return { svc, chamadas };
}

describe("tratarPedidoHumano", () => {
  it("o limite e de 60 por hora", () => {
    expect(LIMITE_POR_HORA).toBe(60);
    expect(JANELA_EM_MINUTOS).toBe(60);
  });

  it("o limite e por utilizador e por accao", async () => {
    const { svc } = svcFalso();
    const vistos: Array<[string, string]> = [];
    const consumirLimite = async (bucket: string, id: string): Promise<ResultadoLimite> => {
      vistos.push([bucket, id]);
      return { allowed: true, retryAfterSeconds: 0 };
    };
    for (const accao of ["url", "abrir"]) {
      await tratarPedidoHumano({ accao, authUid: UTILIZADOR, payload: { anexo_id: "x" }, svc, consumirLimite });
    }
    expect(vistos).toEqual([
      [bucketDoLimite("url"), UTILIZADOR],
      [bucketDoLimite("abrir"), UTILIZADOR],
    ]);
    expect(bucketDoLimite("url")).not.toBe(bucketDoLimite("abrir"));
  });

  it("acima do limite: 429 e nem chega a base", async () => {
    const { svc, chamadas } = svcFalso();
    const r = await tratarPedidoHumano({
      accao: "abrir",
      authUid: UTILIZADOR,
      payload: { anexo_id: "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff" },
      svc,
      consumirLimite: async () => ({ allowed: false, retryAfterSeconds: 120 }),
    });
    expect(r).toEqual({ status: 429, body: { error: "rate_limited", retry_after_seconds: 120 } });
    expect(chamadas).toHaveLength(0);
  });

  it("accao desconhecida (incluindo limpar): 400 e nao gasta o limite", async () => {
    const { svc } = svcFalso();
    let consumidos = 0;
    for (const accao of ["limpar", "", undefined, 3]) {
      const r = await tratarPedidoHumano({
        accao,
        authUid: UTILIZADOR,
        payload: null,
        svc,
        consumirLimite: async () => {
          consumidos += 1;
          return { allowed: true, retryAfterSeconds: 0 };
        },
      });
      expect(r).toEqual({ status: 400, body: { error: "accao_desconhecida" } });
    }
    expect(consumidos).toBe(0);
  });
});

// -- limite: regista antes de contar, falha fechado --------------------------------

/** Uma tabela rate_limit_attempts em memoria; cada passo cede o turno, para as rajadas se entrelacarem. */
function contadorFalso(opcoes: { falharInsert?: boolean; falharSelect?: boolean; lancar?: boolean } = {}) {
  const linhas: Array<{ bucket: string; identifier: string; created_at: string }> = [];
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const cliente = {
    from: () => ({
      insert: async (linha: { bucket: string; identifier: string }) => {
        await tick();
        if (opcoes.lancar) throw new Error("rede");
        if (opcoes.falharInsert) return { error: { message: "boom" } };
        linhas.push({ ...linha, created_at: new Date().toISOString() });
        return { error: null };
      },
      select: () => {
        const filtros: Record<string, unknown> = {};
        let maximo = 1000;
        const q = {
          eq: (c: string, v: unknown) => ((filtros[c] = v), q),
          gte: () => q,
          order: () => q,
          limit: (n: number) => ((maximo = n), q),
          then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
            tick()
              .then(() =>
                opcoes.falharSelect
                  ? { data: null, error: { message: "boom" } }
                  : {
                      data: linhas
                        .filter((l) => l.bucket === filtros.bucket && l.identifier === filtros.identifier)
                        .reverse()
                        .slice(0, maximo),
                      error: null,
                    },
              )
              .then(ok, ko),
        };
        return q;
      },
    }),
  };
  return { cliente, linhas };
}

describe("consumirLimiteRegistandoPrimeiro", () => {
  it("uma rajada paralela nao passa o limite", async () => {
    const { cliente, linhas } = contadorFalso();
    const resultados = await Promise.all(
      Array.from({ length: LIMITE_POR_HORA * 2 }, () => consumirLimiteRegistandoPrimeiro(cliente, "b", "u")),
    );
    const permitidos = resultados.filter((r) => r.allowed).length;
    expect(permitidos).toBeLessThanOrEqual(LIMITE_POR_HORA);
    expect(linhas).toHaveLength(LIMITE_POR_HORA * 2); // todas as tentativas ficam registadas
    expect(resultados.filter((r) => !r.allowed && !r.indisponivel).every((r) => r.retryAfterSeconds > 0)).toBe(true);
  });

  it("uma rajada paralela dentro do limite passa toda", async () => {
    const { cliente } = contadorFalso();
    const resultados = await Promise.all(
      Array.from({ length: LIMITE_POR_HORA }, () => consumirLimiteRegistandoPrimeiro(cliente, "b", "u")),
    );
    expect(resultados.every((r) => r.allowed)).toBe(true);
  });

  it("o pedido 60 passa (a actual conta) e o 61 e recusado, por identificador", async () => {
    const { cliente } = contadorFalso();
    let ultimo: ResultadoLimite | undefined;
    for (let i = 1; i <= LIMITE_POR_HORA; i++) ultimo = await consumirLimiteRegistandoPrimeiro(cliente, "b", "u");
    expect(ultimo?.allowed).toBe(true);
    expect((await consumirLimiteRegistandoPrimeiro(cliente, "b", "u")).allowed).toBe(false);
    expect((await consumirLimiteRegistandoPrimeiro(cliente, "b", "outro")).allowed).toBe(true);
  });

  it("se o registo ou a leitura falham (ou lancam) devolve indisponivel e nao deixa passar", async () => {
    for (const opcoes of [{ falharInsert: true }, { falharSelect: true }, { lancar: true }]) {
      const r = await consumirLimiteRegistandoPrimeiro(contadorFalso(opcoes).cliente, "b", "u");
      expect(r).toEqual({ allowed: false, retryAfterSeconds: 0, indisponivel: true });
    }
  });
});

describe("tratarPedidoHumano com o contador indisponivel", () => {
  const indisponivel = async (): Promise<ResultadoLimite> => ({ allowed: false, retryAfterSeconds: 0, indisponivel: true });

  it("url, abrir e remover falham fechado: 500 uniforme e nem chega a base", async () => {
    for (const accao of ["url", "abrir", "remover"]) {
      const { svc, chamadas } = svcFalso();
      const registados: unknown[] = [];
      const r = await tratarPedidoHumano({
        accao,
        authUid: UTILIZADOR,
        payload: { anexo_id: "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff" },
        svc,
        consumirLimite: indisponivel,
        registarErro: (e) => registados.push(e),
      });
      expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
      expect(chamadas).toHaveLength(0);
      expect(registados).toHaveLength(1);
    }
  });

  it("confirmar continua a funcionar (fecha um upload ja reservado)", async () => {
    const { svc, chamadas } = svcFalso();
    await tratarPedidoHumano({
      accao: "confirmar",
      authUid: UTILIZADOR,
      payload: { anexo_id: "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff" },
      svc,
      consumirLimite: indisponivel,
    });
    expect(chamadas.length).toBeGreaterThan(0);
  });
});

// -- corpo e autenticacao ------------------------------------------------------------

const pedidoHttp = (
  corpo: BodyInit | null,
  headers: Record<string, string> = { "content-type": "application/json" },
  init: object = {},
) => new Request("https://exemplo.invalid/f", { method: "POST", body: corpo, headers, ...init });

describe("lerCorpoJson", () => {
  it("le um objecto JSON normal (com charset)", async () => {
    const r = await lerCorpoJson(pedidoHttp('{"accao":"url"}', { "content-type": "application/json; charset=utf-8" }));
    expect(r).toEqual({ ok: true, corpo: { accao: "url" } });
  });

  it("recusa Content-Type que nao e JSON com 415", async () => {
    for (const tipo of ["text/plain", "multipart/form-data", ""]) {
      const r = await lerCorpoJson(pedidoHttp("{}", tipo ? { "content-type": tipo } : {}));
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ resposta: { status: 415, body: { error: "pedido_invalido" } } });
    }
  });

  it("recusa um corpo acima de 16 KB com 413 pelo Content-Length, sem o ler", async () => {
    const req = pedidoHttp("{}", { "content-type": "application/json", "content-length": String(LIMITE_CORPO_BYTES + 1) });
    const r = await lerCorpoJson(req);
    expect(r).toEqual({ ok: false, resposta: { status: 413, body: { error: "pedido_invalido" } } });
    expect(req.bodyUsed).toBe(false);
  });

  it("recusa um corpo grande mesmo sem Content-Length (a medir os bytes recebidos)", async () => {
    const grande = JSON.stringify({ accao: "url", lixo: "x".repeat(LIMITE_CORPO_BYTES) });
    const r = await lerCorpoJson(pedidoHttp(grande));
    expect(r).toMatchObject({ ok: false, resposta: { status: 413 } });
    const emFluxo = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(4096).fill(120));
      },
    });
    const r2 = await lerCorpoJson(pedidoHttp(emFluxo, { "content-type": "application/json" }, { duplex: "half" }));
    expect(r2).toMatchObject({ ok: false, resposta: { status: 413 } });
  });

  it("JSON invalido ou que nao e objecto da corpo nulo", async () => {
    for (const texto of ["{", "[1]", "3", "null", ""]) {
      expect(await lerCorpoJson(pedidoHttp(texto || null))).toEqual({ ok: true, corpo: null });
    }
  });
});

describe("tratarPedidoHttp", () => {
  const ok = { status: 200, body: { ok: true } };
  function deps(sobre: Partial<DependenciasHttp> = {}) {
    const vistos = { limpar: 0, humano: 0 };
    const dep: DependenciasHttp = {
      eCron: () => false,
      resolverChamador: async () => ({ isServiceRole: false, authUid: UTILIZADOR }),
      limpar: async () => ((vistos.limpar += 1), ok),
      humano: async () => ((vistos.humano += 1), ok),
      ...sobre,
    };
    return { dep, vistos };
  }

  it("limpar sem segredo nem sessao: 401 e o corpo nem e lido", async () => {
    const { dep, vistos } = deps({
      resolverChamador: async () => {
        throw Object.assign(new Error("Authorization header required"), { status: 401 });
      },
    });
    const req = pedidoHttp('{"accao":"limpar"}');
    await expect(tratarPedidoHttp(req, dep)).rejects.toMatchObject({ status: 401 });
    expect(req.bodyUsed).toBe(false);
    expect(vistos).toEqual({ limpar: 0, humano: 0 });
  });

  it("limpar com o segredo do cron corre a limpeza", async () => {
    const { dep, vistos } = deps({ eCron: () => true });
    expect(await tratarPedidoHttp(pedidoHttp('{"accao":"limpar"}'), dep)).toEqual(ok);
    expect(vistos).toEqual({ limpar: 1, humano: 0 });
  });

  it("o segredo do cron nao serve para accoes humanas, nem a chave de servico por JWT", async () => {
    const a = deps({ eCron: () => true });
    expect(await tratarPedidoHttp(pedidoHttp('{"accao":"url"}'), a.dep)).toEqual({ status: 403, body: { error: "sem_permissao" } });
    const b = deps({ resolverChamador: async () => ({ isServiceRole: true, authUid: "service_role" }) });
    expect(await tratarPedidoHttp(pedidoHttp('{"accao":"url"}'), b.dep)).toEqual({ status: 403, body: { error: "sem_permissao" } });
    expect(a.vistos.humano + b.vistos.humano).toBe(0);
  });

  it("um humano com sessao nunca corre a limpeza e um corpo grande e recusado antes de despachar", async () => {
    const { dep, vistos } = deps();
    await tratarPedidoHttp(pedidoHttp('{"accao":"limpar"}'), dep);
    expect(vistos).toEqual({ limpar: 0, humano: 1 });
    const grande = pedidoHttp("{}", { "content-type": "application/json", "content-length": "20000" });
    expect(await tratarPedidoHttp(grande, dep)).toEqual({ status: 413, body: { error: "pedido_invalido" } });
    expect(vistos.humano).toBe(1);
  });
});
