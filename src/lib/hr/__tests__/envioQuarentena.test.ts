/**
 * `enviarParaQuarentena`: o PUT por XHR para o URL assinado, com o XHR simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEMPO_MAXIMO_ENVIO_MS,
  enviarParaQuarentena,
  enviarParaQuarentenaComMotivo,
} from "../envioQuarentena";

class FakeXHR {
  static instances: FakeXHR[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  timeout = 0;
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(nome: string, valor: string) {
    this.headers[nome.toLowerCase()] = valor;
  }
  send(body: unknown) {
    this.body = body;
  }
}

const FICHEIRO = () => new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" });

beforeEach(() => {
  FakeXHR.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co/");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-publicavel");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("enviarParaQuarentena", () => {
  it("faz PUT para o URL assinado da quarentena, com apikey e sem upsert", async () => {
    const promessa = enviarParaQuarentena("admissao/rh/A 1.pdf", "tok/en", FICHEIRO(), () => {});
    const xhr = FakeXHR.instances[0];
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe(
      "https://exemplo.supabase.co/storage/v1/object/upload/sign/hr-documentos-quarantine/admissao/rh/A%201.pdf?token=tok%2Fen",
    );
    expect(xhr.headers.apikey).toBe("chave-publicavel");
    expect(xhr.headers["x-upsert"]).toBe("false");
    xhr.status = 200;
    xhr.onload?.();
    await expect(promessa).resolves.toBe(true);
  });

  it("devolve o progresso em percentagem", async () => {
    const progressos: number[] = [];
    const promessa = enviarParaQuarentena("admissao/rh/A.pdf", "t", FICHEIRO(), (p) => progressos.push(p));
    const xhr = FakeXHR.instances[0];
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 1, total: 0 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 300, total: 100 });
    expect(progressos).toEqual([25, 100]);
    xhr.status = 200;
    xhr.onload?.();
    await promessa;
  });

  it("so 2xx conta; erro, aborto, timeout e excepcao resolvem false", async () => {
    for (const falha of ["onerror", "onabort", "ontimeout"] as const) {
      const p = enviarParaQuarentena("admissao/rh/A.pdf", "t", FICHEIRO(), () => {});
      FakeXHR.instances[FakeXHR.instances.length - 1][falha]?.();
      await expect(p).resolves.toBe(false);
    }
    const p = enviarParaQuarentena("admissao/rh/A.pdf", "t", FICHEIRO(), () => {});
    const xhr = FakeXHR.instances[FakeXHR.instances.length - 1];
    xhr.status = 413;
    xhr.onload?.();
    await expect(p).resolves.toBe(false);

    vi.stubGlobal("XMLHttpRequest", function () {
      throw new Error("sem xhr");
    });
    await expect(enviarParaQuarentena("admissao/rh/A.pdf", "t", FICHEIRO(), () => {})).resolves.toBe(false);
  });

  it("sem VITE_SUPABASE_URL resolve false sem abrir pedido", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    await expect(enviarParaQuarentena("admissao/rh/A.pdf", "t", FICHEIRO(), () => {})).resolves.toBe(false);
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it("poe um tempo maximo de 2 minutos no XHR", () => {
    expect(TEMPO_MAXIMO_ENVIO_MS).toBe(120_000);
    void enviarParaQuarentena("admissao/rh/A.pdf", "t", FICHEIRO(), () => {});
    expect(FakeXHR.instances[0].timeout).toBe(120_000);
  });
});

describe("enviarParaQuarentenaComMotivo", () => {
  it("2xx: ok sem motivo", async () => {
    const p = enviarParaQuarentenaComMotivo("admissao/rh/A.pdf", "t", FICHEIRO(), () => {});
    const xhr = FakeXHR.instances[0];
    xhr.status = 201;
    xhr.onload?.();
    await expect(p).resolves.toEqual({ ok: true, motivo: null });
  });

  it("tempo esgotado tem motivo proprio", async () => {
    const p = enviarParaQuarentenaComMotivo("admissao/rh/A.pdf", "t", FICHEIRO(), () => {});
    FakeXHR.instances[0].ontimeout?.();
    await expect(p).resolves.toEqual({ ok: false, motivo: "tempo_esgotado" });
  });

  it("erro, aborto, recusa e excepcao dao motivo falha", async () => {
    for (const falha of ["onerror", "onabort"] as const) {
      const p = enviarParaQuarentenaComMotivo("admissao/rh/A.pdf", "t", FICHEIRO(), () => {});
      FakeXHR.instances[FakeXHR.instances.length - 1][falha]?.();
      await expect(p).resolves.toEqual({ ok: false, motivo: "falha" });
    }
    vi.stubGlobal("XMLHttpRequest", function () {
      throw new Error("sem xhr");
    });
    await expect(
      enviarParaQuarentenaComMotivo("admissao/rh/A.pdf", "t", FICHEIRO(), () => {}),
    ).resolves.toEqual({ ok: false, motivo: "falha" });
  });
});
