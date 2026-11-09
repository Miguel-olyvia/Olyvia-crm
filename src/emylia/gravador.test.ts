// 9/11 (Rúben, a visita real: «a transcrição não corre enquanto estamos no Estúdio ou em background, e não ficou gravada; tem muitos
// erros»): o gravador da app. Com o microfone e o VAD simulados: as falas seguidas da visita juntam-se num pedaço e vão como «visita»
// com o contexto; cada fala transcrita fica guardada neste browser; recarregar a meio deixa a gravação «interrompida» com as falas;
// uma fala longa vai em pedaços de até 20 s.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Opcoes = { onSpeechStart: () => void; onSpeechEnd: (a: Float32Array) => void; redemptionMs: number };
const sim = vi.hoisted(() => ({ opcoes: null as null | Opcoes, transcrever: vi.fn() }));
vi.mock("./chamadaNuvem", async (importOriginal) => {
  const real = await importOriginal<typeof import("./chamadaNuvem")>();
  return {
    ...real,
    carregarVad: async () => ({ MicVAD: { new: async (o: Opcoes) => { sim.opcoes = o; return { start: async () => undefined, pause: async () => undefined, destroy: async () => undefined }; } } }),
    semWorkers: async () => undefined,
    ecraAceso: async () => () => undefined,
    transcreverFala: sim.transcrever,
  };
});

const pista = { label: "Microfone de teste", readyState: "live", muted: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), stop: vi.fn() };
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
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
  sim.transcrever.mockReset();
  sim.transcrever.mockImplementation(async (_pcm: Float32Array, ini: number) => [{ inicio: ini, fim: ini + 1, texto: `fala aos ${Math.round(ini)} s`, confianca: 0.9 }]);
});
afterEach(async () => { const g = await import("./gravador"); g._repor(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const segundos = (s: number) => new Float32Array(Math.round(16000 * s)).fill(0.1);

describe("o gravador da visita (9/11)", () => {
  it("as falas seguidas juntam-se num pedaço e vão como «visita», com o que já se disse; ficam guardadas no browser", async () => {
    const g = await import("./gravador");
    await g.iniciarGravacao({ negocio: 5, nome: "Bruno", modo: "visita", voltar: "/negocios?negocio=5" });
    expect(g.gravacaoAtual().estado).toBe("a_ouvir");
    expect(sim.opcoes!.redemptionMs).toBe(900);
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(3));
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(4));
    expect(sim.transcrever).not.toHaveBeenCalled(); // ainda a juntar
    await vi.advanceTimersByTimeAsync(2600);         // 2,5 s de silêncio fecham o pedaço
    expect(sim.transcrever).toHaveBeenCalledTimes(1);
    const [pcm, , , , opcoes] = sim.transcrever.mock.calls[0];
    expect(pcm.length).toBe(16000 * 7 + 4000);       // as duas falas com 0,25 s entre elas
    expect(opcoes).toMatchObject({ tipo: "visita" });
    // a segunda vez já leva o contexto
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(2));
    await vi.advanceTimersByTimeAsync(2600);
    expect(sim.transcrever.mock.calls[1][4].contexto).toMatch(/fala aos/);
    const guardada = JSON.parse(localStorage.getItem("olyvia.gravacao.v1")!);
    expect(guardada).toMatchObject({ negocio: 5, estado: "a_ouvir" });
    expect(guardada.falas).toHaveLength(2);
    const falas = await g.terminarGravacao();
    expect(falas).toHaveLength(2);
    expect(g.gravacaoAtual().estado).toBe("terminada");
    g.descartarGravacao();
    expect(localStorage.getItem("olyvia.gravacao.v1")).toBeNull();
  });

  it("terminar entrega o que está a meio (sem esperar pelo silêncio)", async () => {
    const g = await import("./gravador");
    await g.iniciarGravacao({ negocio: 6, nome: "Ana", modo: "visita", voltar: "/negocios?negocio=6" });
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(2));
    const falas = await g.terminarGravacao();
    expect(sim.transcrever).toHaveBeenCalledTimes(1);
    expect(falas).toHaveLength(1);
  });

  it("uma fala que falha tenta outra vez sozinha", async () => {
    const g = await import("./gravador");
    sim.transcrever.mockRejectedValueOnce(new Error("sem rede"));
    await g.iniciarGravacao({ negocio: 7, nome: "Rui", modo: "chamada", voltar: "/negocios?negocio=7" });
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(2));
    await vi.advanceTimersByTimeAsync(10);
    expect(g.gravacaoAtual().falas).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3100);
    expect(sim.transcrever).toHaveBeenCalledTimes(2);
    expect(g.gravacaoAtual().falas).toHaveLength(1);
  });

  it("recarregar a meio: a gravação fica «interrompida», com as falas, e pode continuar", async () => {
    localStorage.setItem("olyvia.gravacao.v1", JSON.stringify({ negocio: 8, nome: "Eva", modo: "visita", voltar: "/x", estado: "a_ouvir", inicioEm: 1, pausas: 0,
      falas: [{ inicio: 1, fim: 2, texto: "olá", falante: "cliente", confianca_falante: 1 }] }));
    vi.resetModules();
    const g = await import("./gravador");
    expect(g.gravacaoAtual()).toMatchObject({ negocio: 8, estado: "interrompida" });
    expect(g.gravacaoAtual().falas).toHaveLength(1);
    await g.iniciarGravacao({ negocio: 8, nome: "Eva", modo: "visita", voltar: "/x" }, true);
    expect(g.gravacaoAtual()).toMatchObject({ estado: "a_ouvir", pausas: 1 });
    expect(g.gravacaoAtual().falas).toHaveLength(1);
  });

  it("uma fala longa vai em pedaços de até 20 s", async () => {
    const { cortarLongo } = await import("./gravador");
    const partes = cortarLongo(segundos(47));
    expect(partes.length).toBeGreaterThanOrEqual(3);
    expect(partes.every((p) => p.pcm.length <= 20 * 16000)).toBe(true);
    expect(partes.reduce((s, p) => s + p.pcm.length, 0)).toBe(Math.round(47 * 16000));
  });
});
