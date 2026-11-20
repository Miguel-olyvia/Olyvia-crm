// 20/11 (auditoria de 19/11): uma gravação carregada de ficheiro era tudo ou nada. Se um bloco falhava 3 vezes, perdia-se tudo o que já
// estava transcrito; e uma hora de áudio descodificava-se inteira em memória (~230 MB, o dobro em estéreo). Agora os blocos feitos ficam e
// repetem-se só os que falharam; acima de 90 min, um ficheiro com duração conhecida é recusado sem o abrir, e um sem duração fica com o início.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nuvem = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: nuvem.invoke } } }));

import { DURACAO_MAX_S, TranscricaoIncompleta, audioDeFicheiro, transcreverAudio } from "./chamadaNuvem";
import { cortarEmBlocos } from "./blocosAudio";

/** 150 s de som (uma onda): dá 3 blocos. */
const som = (s: number) => new Float32Array(Math.round(16000 * s)).map((_, i) => 0.2 * Math.sin(i / 9));
/** A função responde com uma frase por bloco; os blocos em `falham` (pelo segundo em que começam) dão sempre erro. */
function responder(falham: Set<number>) {
  nuvem.invoke.mockImplementation(async (_f: string, { body }: { body: { deslocamento_s: number } }) => {
    const ini = Math.round(body.deslocamento_s);
    if (falham.has(ini)) return { data: null, error: { message: "sem rede" } };
    return { data: { modo: "bloco", frases: [{ inicio: body.deslocamento_s + 1, fim: body.deslocamento_s + 2, texto: `bloco aos ${ini} s`, falante: "cliente" }] }, error: null };
  });
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); nuvem.invoke.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("transcreverAudio: um bloco que falha não deita fora os outros", () => {
  it("os feitos ficam; repete-se só o que falhou", async () => {
    const pcm = som(150);
    const blocos = cortarEmBlocos(pcm, 16000);
    const n = blocos.length;
    expect(n).toBeGreaterThanOrEqual(3);
    const texto = (i: number) => `bloco aos ${Math.round(blocos[i].ini / 16000)} s`;
    responder(new Set([Math.round(blocos[1].ini / 16000)]));
    const progresso: number[] = [];
    const p = transcreverAudio(pcm, "visita", (k) => progresso.push(k)).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000); // as esperas entre tentativas (3 s e 6 s)
    const e = await p;
    expect(e).toBeInstanceOf(TranscricaoIncompleta);
    const inc = e as TranscricaoIncompleta;
    expect(inc.falhados).toEqual([1]);
    expect(inc.total).toBe(n);
    expect(inc.falas.map((f) => f.texto)).toEqual(blocos.map((_, i) => i).filter((i) => i !== 1).map(texto));
    expect(inc.message).toMatch(new RegExp(`Faltam 1 de ${n} partes \\(chamada-transcrever: sem rede\\)`));
    expect(progresso).toHaveLength(n - 1);
    // cada bloco uma vez, mais 3 tentativas do que falhou
    expect(nuvem.invoke).toHaveBeenCalledTimes(n - 1 + 3);

    // com rede outra vez: só o bloco que faltava vai à função
    nuvem.invoke.mockClear();
    responder(new Set());
    const falas = await transcreverAudio(pcm, "visita", undefined, inc.porBloco);
    expect(nuvem.invoke).toHaveBeenCalledTimes(1);
    expect(nuvem.invoke.mock.calls[0][1].body.deslocamento_s).toBeCloseTo(blocos[1].ini / 16000, 3);
    expect(falas.map((f) => f.texto)).toEqual(blocos.map((_, i) => texto(i)));
  });

  it("sem falhas, devolve as falas como antes", async () => {
    responder(new Set());
    const falas = await transcreverAudio(som(40), "chamada");
    expect(falas.map((f) => f.texto)).toEqual(["bloco aos 0 s"]);
  });
});

describe("audioDeFicheiro: a duração máxima", () => {
  const ficheiro = { arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Blob;
  /** Um AudioContext que «descodifica» num buffer com estes canais. */
  function contexto(canais: Float32Array[]) {
    const criado = vi.fn();
    vi.stubGlobal("AudioContext", class {
      constructor() { criado(); }
      async decodeAudioData() { return { numberOfChannels: canais.length, length: canais[0].length, getChannelData: (c: number) => canais[c] }; }
      async close() { /* */ }
    });
    return criado;
  }

  it("com a duração conhecida acima do máximo, recusa sem descodificar (não enche a memória)", async () => {
    const criado = contexto([new Float32Array(10)]);
    await expect(audioDeFicheiro(ficheiro, async () => 2 * 3600 + 600)).rejects.toThrow(/tem 2 h 10 min\. O máximo é 1 h 30 min/);
    expect(criado).not.toHaveBeenCalled();
    expect(DURACAO_MAX_S).toBe(90 * 60);
  });

  it("dentro do máximo abre; estéreo fica com a média dos canais, sem cópia a mais", async () => {
    const esquerdo = new Float32Array([0.2, 0.4, 0.6]), direito = new Float32Array([0, 0, 0.2]);
    contexto([esquerdo, direito]);
    const pcm = await audioDeFicheiro(ficheiro, async () => 60);
    expect(Array.from(pcm).map((x) => Math.round(x * 100) / 100)).toEqual([0.1, 0.2, 0.4]);
    expect(pcm.buffer).toBe(esquerdo.buffer); // o canal 0 serve de saída
  });

  it("sem duração conhecida, um ficheiro acima do máximo fica só com o início (aqui, um máximo de 2 s)", async () => {
    contexto([new Float32Array(16000 * 3).fill(0.1), new Float32Array(16000 * 3).fill(0.3)]);
    const pcm = await audioDeFicheiro(ficheiro, async () => null, 2);
    expect(pcm.length).toBe(16000 * 2);
    expect(pcm[0]).toBeCloseTo(0.2, 5);
    expect(pcm[16000 * 2 - 1]).toBeCloseTo(0.2, 5);
  });
});
