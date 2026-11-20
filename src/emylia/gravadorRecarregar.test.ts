// 18/11 (Rúben: «preciso de gravar a chamada da visita e do contacto… quando clico não faz nada»; o ecrã dizia «A app foi atualizada
// entretanto. Recarregue a página (F5)»): o separador aberto antes de um deploy já não encontra o pedaço do VAD. Recarrega-se sozinho e
// começa a gravar; uma vez só (nunca em ciclo).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ falha: true }));
vi.mock("./chamadaNuvem", async (importOriginal) => {
  const real = await importOriginal<typeof import("./chamadaNuvem")>();
  return {
    ...real,
    carregarVad: async () => {
      if (sim.falha) throw new real.AppAtualizada("A app foi atualizada entretanto. Recarregue a página (F5) e tente outra vez.");
      return { MicVAD: { new: async () => ({ start: async () => undefined, pause: async () => undefined, destroy: async () => undefined }) } };
    },
    semWorkers: async () => undefined,
    ecraAceso: async () => () => undefined,
  };
});

import { recarregarParaGravar, retomarDepoisDeRecarregar } from "./gravador";
import * as gravador from "./gravador";

const A = { negocio: 1007, nome: "Cliente Demo", modo: "chamada" as const, voltar: "/negocios?negocio=1007" };
const pista = { label: "Micro", readyState: "live", muted: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), stop: vi.fn() };

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); sim.falha = true;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [pista], getTracks: () => [pista] })), enumerateDevices: async () => [],
  } });
  vi.stubGlobal("AudioContext", class {
    state = "running";
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: () => undefined }; }
    createMediaStreamSource() { return { connect: () => undefined }; }
    async close() { /* */ }
    async resume() { /* */ }
  });
});
afterEach(() => { gravador._repor(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("18/11: gravar depois de um deploy", () => {
  it("guarda o pedido e recarrega; à segunda vez seguida não recarrega (sem ciclo)", () => {
    const recarregar = vi.fn();
    expect(recarregarParaGravar(A, false, recarregar)).toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("olyvia-gravar-depois-de-recarregar")!).a.negocio).toBe(1007);
    expect(recarregarParaGravar(A, false, recarregar)).toBe(false);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("na página nova começa a gravar sozinha o mesmo negócio, e limpa o pedido", async () => {
    sessionStorage.setItem("olyvia-gravar-depois-de-recarregar", JSON.stringify({ a: A, continuar: false, em: Date.now() }));
    sim.falha = false;
    retomarDepoisDeRecarregar();
    await vi.waitFor(() => expect(gravador.gravacaoAtual().estado).toBe("a_ouvir"));
    expect(gravador.gravacaoAtual().negocio).toBe(1007);
    expect(sessionStorage.getItem("olyvia-gravar-depois-de-recarregar")).toBeNull();
  });

  it("um pedido velho (mais de um minuto) não grava", async () => {
    sessionStorage.setItem("olyvia-gravar-depois-de-recarregar", JSON.stringify({ a: A, continuar: false, em: Date.now() - 120_000 }));
    sim.falha = false;
    retomarDepoisDeRecarregar();
    await new Promise((r) => setTimeout(r, 20));
    expect(gravador.gravacaoAtual().estado).toBe("parado");
    expect(sessionStorage.getItem("olyvia-gravar-depois-de-recarregar")).toBeNull();
  });
});
