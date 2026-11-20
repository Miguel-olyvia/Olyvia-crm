// 9/11 (Rúben, a visita real: «a transcrição não corre enquanto estamos no Estúdio ou em background, e não ficou gravada; tem muitos
// erros»): o gravador da app. Com o microfone e o VAD simulados: as falas seguidas da visita juntam-se num pedaço e vão como «visita»
// com o contexto; cada fala transcrita fica guardada neste browser; recarregar a meio deixa a gravação «interrompida» com as falas;
// uma fala longa vai em pedaços de até 20 s.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Opcoes = { onSpeechStart: () => void; onSpeechEnd: (a: Float32Array) => void; redemptionMs: number };
const sim = vi.hoisted(() => ({ opcoes: null as null | Opcoes, transcrever: vi.fn(), bloco: vi.fn(), vadFalha: false }));
vi.mock("./chamadaNuvem", async (importOriginal) => {
  const real = await importOriginal<typeof import("./chamadaNuvem")>();
  return {
    ...real,
    // 20/11: `vadFalha`: o pedaço do VAD já não existe no servidor (um deploy a meio)
    carregarVad: async () => {
      if (sim.vadFalha) throw new real.AppAtualizada("A app foi atualizada entretanto. Recarregue a página (F5) e tente outra vez.");
      return { MicVAD: { new: async (o: Opcoes) => { sim.opcoes = o; return { start: async () => undefined, pause: async () => undefined, destroy: async () => undefined }; } } };
    },
    semWorkers: async () => undefined,
    ecraAceso: async () => () => undefined,
    transcreverFala: sim.transcrever,
    transcreverBloco: sim.bloco,
  };
});

const pista = { label: "Microfone de teste", readyState: "live", muted: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), stop: vi.fn() };
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); sim.vadFalha = false;
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
  sim.bloco.mockReset();
  sim.bloco.mockResolvedValue([]);
  sim.transcrever.mockImplementation(async (_pcm: Float32Array, ini: number) => [{ inicio: ini, fim: ini + 1, texto: `fala aos ${Math.round(ini)} s`, confianca: 0.9 }]);
});
afterEach(async () => { const g = await import("./gravador"); g._repor(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const segundos = (s: number) => new Float32Array(Math.round(16000 * s)).fill(0.1);

describe("o gravador da visita (9/11)", () => {
  it("as falas seguidas juntam-se num pedaço e vão como «visita», com o que já se disse; ficam guardadas no browser", async () => {
    const g = await import("./gravador");
    await g.iniciarGravacao({ negocio: 5, nome: "Bruno", modo: "visita", voltar: "/negocios?negocio=5" });
    expect(g.gravacaoAtual().estado).toBe("a_ouvir");
    // 13/11 («super reativa»): na visita 0,5 s de silêncio fecha a fala (era 0,9 s), e o pedaço junta até 2 s ou 0,3 s de pausa
    expect(sim.opcoes!.redemptionMs).toBe(500);
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(0.8));
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(0.9));
    expect(sim.transcrever).not.toHaveBeenCalled(); // ainda a juntar
    await vi.advanceTimersByTimeAsync(400);          // 0,3 s de silêncio fecham o pedaço
    expect(sim.transcrever).toHaveBeenCalledTimes(1);
    const [pcm, , , , opcoes] = sim.transcrever.mock.calls[0];
    expect(pcm.length).toBe(Math.round(16000 * 0.8) + Math.round(16000 * 0.9) + 4000); // as duas falas com 0,25 s entre elas
    expect(opcoes).toMatchObject({ tipo: "visita" });
    // a segunda vez já leva o contexto; uma fala de 2 s ou mais vai logo, sem esperar pela pausa
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(2));
    await vi.advanceTimersByTimeAsync(10);
    expect(sim.transcrever).toHaveBeenCalledTimes(2);
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
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(1)); // menos de 2 s: fica a juntar
    expect(sim.transcrever).not.toHaveBeenCalled();
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

  // 11/11 (Rúben: «a transcrição falha muito»): o som contínuo vai em blocos; as frases revistas tomam o lugar das provisórias
  it("o som contínuo vai em blocos cortados no silêncio, e as frases revistas substituem as provisórias desse intervalo", async () => {
    const g = await import("./gravador");
    sim.transcrever.mockImplementation(async (_pcm: Float32Array, ini: number) => [{ inicio: ini, fim: ini + 1, texto: "ingressos para o jogo", confianca: 0.9 }]);
    sim.bloco.mockImplementation(async (pcm: Float32Array, ini: number) => [
      { inicio: ini + 0.5, fim: ini + 2, texto: "Em princípio é para nivelar tudo.", falante: "cliente", confianca_falante: 1, confianca: 0.95, revista: true },
      { inicio: ini + 3, fim: ini + 4, texto: "Muito bem.", falante: "comercial", confianca_falante: 1, confianca: 0.97, revista: true },
      { inicio: ini + pcm.length / 16000 - 1, fim: ini + pcm.length / 16000, texto: "fim do bloco", falante: "cliente", confianca_falante: 1, revista: true },
    ]);
    await g.iniciarGravacao({ negocio: 11, nome: "Inês", modo: "chamada", voltar: "/x" });
    g._ligarBlocos(0);
    // a pré-visualização (fala a fala) chega primeiro
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(2));
    await vi.advanceTimersByTimeAsync(10);
    expect(g.gravacaoAtual().falas.map((f) => f.texto)).toEqual(["ingressos para o jogo"]);
    // 56 s de som, com uma pausa aos 41 s: o bloco corta aí
    const som = new Int16Array(56 * 16000).map((_, i) => Math.round(3000 * Math.sin(i / 7)));
    som.fill(0, 41 * 16000, 41.6 * 16000);
    for (let i = 0; i < som.length; i += 1600) g._chegouAudio(som.slice(i, i + 1600));
    await vi.advanceTimersByTimeAsync(10);
    expect(sim.bloco).toHaveBeenCalledTimes(1);
    const [pcm, ini, tipo] = sim.bloco.mock.calls[0];
    expect(ini).toBe(0);
    expect(tipo).toBe("chamada");
    expect(pcm.length / 16000).toBeGreaterThanOrEqual(41);
    expect(pcm.length / 16000).toBeLessThanOrEqual(41.6);
    const falas = g.gravacaoAtual().falas;
    expect(falas.map((f) => f.texto)).toEqual(["Em princípio é para nivelar tudo.", "Muito bem.", "fim do bloco"]);
    expect(falas.every((f) => f.revista)).toBe(true);
    // terminar manda o resto (o segundo bloco) e espera por ele
    const fim = await g.terminarGravacao();
    expect(sim.bloco).toHaveBeenCalledTimes(2);
    expect(sim.bloco.mock.calls[1][1]).toBeCloseTo(pcm.length / 16000, 3);
    expect(sim.bloco.mock.calls[1][3]).toMatch(/Cliente: Em princípio é para nivelar tudo\./); // o contexto, com quem fala
    expect(fim).toHaveLength(6);
  });

  it("se a função publicada ainda não tiver o modo bloco, fica só a pré-visualização, sem avisos", async () => {
    const g = await import("./gravador");
    sim.bloco.mockRejectedValue(new Error("chamada-transcrever: Fala longa demais"));
    await g.iniciarGravacao({ negocio: 12, nome: "Rui", modo: "chamada", voltar: "/x" });
    g._ligarBlocos(0);
    sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(2));
    for (let i = 0; i < 56 * 16000; i += 1600) g._chegouAudio(new Int16Array(1600).fill(3000));
    await vi.advanceTimersByTimeAsync(30000);
    expect(sim.bloco).toHaveBeenCalledTimes(1);
    expect(g.gravacaoAtual().falhadas).toBe(0);
    expect(g.gravacaoAtual().falas).toHaveLength(1);
  });

  it("uma fala longa vai em pedaços de até 20 s", async () => {
    const { cortarLongo } = await import("./gravador");
    const partes = cortarLongo(segundos(47));
    expect(partes.length).toBeGreaterThanOrEqual(3);
    expect(partes.every((p) => p.pcm.length <= 20 * 16000)).toBe(true);
    expect(partes.reduce((s, p) => s + p.pcm.length, 0)).toBe(Math.round(47 * 16000));
  });

  // 20/11: com o alvo de 2 s (JUNTAR_S desde 13/11) o corte ficava no início e o ciclo nunca acabava (o browser congelava; este ficheiro
  // deixava o worker dos testes pendurado). Um som com silêncio no início é o caso real: o pad antes da fala.
  it("20/11: uma fala longa com silêncio no início corta-se sem ficar presa", async () => {
    const { cortarLongo } = await import("./gravador");
    const pcm = segundos(50); pcm.fill(0, 0, 16000 * 0.4);
    const partes = cortarLongo(pcm);
    expect(partes.length).toBeGreaterThanOrEqual(3);
    expect(partes.every((p) => p.pcm.length >= 16000 && p.pcm.length <= 20 * 16000)).toBe(true);
    expect(partes.reduce((s, p) => s + p.pcm.length, 0)).toBe(pcm.length);
    // com um alvo pequeno de propósito, também avança
    expect(cortarLongo(pcm, 2).every((p) => p.pcm.length > 0)).toBe(true);
  });
});

/** Uma fala de 2 s que falha as 3 tentativas (3 s, 8 s e 20 s depois) e fica para «Tentar outra vez». */
async function falaQueFalha(g: typeof import("./gravador")) {
  sim.transcrever.mockRejectedValue(new Error("sem rede"));
  sim.opcoes!.onSpeechStart(); sim.opcoes!.onSpeechEnd(segundos(2));
  await vi.advanceTimersByTimeAsync(32_000);
  expect(g.gravacaoAtual().falhadas).toBe(1);
  expect(g.gravacaoAtual().falas).toHaveLength(0);
}
const voltaARede = () => sim.transcrever.mockImplementation(async (_pcm: Float32Array, ini: number) => [{ inicio: ini, fim: ini + 1, texto: `fala aos ${Math.round(ini)} s`, confianca: 0.9 }]);

describe("20/11 (auditoria de 19/11): nada se perde sem aviso", () => {
  it("«Continuar a gravar» não deita fora as falas que esperavam por «Tentar outra vez»: ficam e vão logo", async () => {
    const g = await import("./gravador");
    const A = { negocio: 20, nome: "Rita", modo: "chamada" as const, voltar: "/x" };
    await g.iniciarGravacao(A);
    await falaQueFalha(g);
    await g.pausarGravacao();
    expect(g.gravacaoAtual()).toMatchObject({ estado: "interrompida", falhadas: 1 });
    voltaARede();
    const chamadas = sim.transcrever.mock.calls.length;
    await g.iniciarGravacao(A, true);
    await vi.advanceTimersByTimeAsync(10);
    expect(sim.transcrever.mock.calls.length).toBe(chamadas + 1); // foi logo, sem esperar pelo botão
    expect(g.gravacaoAtual()).toMatchObject({ estado: "a_ouvir", falhadas: 0 });
    expect(g.gravacaoAtual().falas.map((f) => f.texto)).toEqual(["fala aos 0 s"]);
  });

  it("começar outra gravação (outro negócio) é que começa do zero", async () => {
    const g = await import("./gravador");
    await g.iniciarGravacao({ negocio: 21, nome: "Rui", modo: "chamada", voltar: "/x" });
    await falaQueFalha(g);
    await g.pausarGravacao();
    await g.iniciarGravacao({ negocio: 22, nome: "Ana", modo: "chamada", voltar: "/y" });
    expect(g.gravacaoAtual()).toMatchObject({ negocio: 22, falhadas: 0 });
  });
});

describe("20/11 (auditoria de 19/11): um separador de cada vez", () => {
  const guardarNoutro = (estado: string, batidoHa = 0) => {
    localStorage.setItem("olyvia.gravacao.v1", JSON.stringify({ negocio: 30, nome: "Eva", modo: "visita", voltar: "/x", estado, inicioEm: 1, pausas: 0, dono: "separador-B",
      falas: [{ inicio: 1, fim: 2, texto: "olá", falante: "cliente", confianca_falante: 1 }] }));
    localStorage.setItem("olyvia.gravacao.batimento", JSON.stringify({ dono: "separador-B", em: Date.now() - batidoHa }));
  };

  it("outro separador a gravar: aqui vê-se «A gravar noutro separador», sem continuar, e nada se escreve por cima", async () => {
    guardarNoutro("a_ouvir");
    vi.resetModules();
    const g = await import("./gravador");
    expect(g.gravacaoAtual()).toMatchObject({ negocio: 30, estado: "interrompida", noutroSeparador: true, msg: g.MSG_NOUTRO_SEPARADOR });
    await expect(g.iniciarGravacao({ negocio: 30, nome: "Eva", modo: "visita", voltar: "/x" }, true)).rejects.toThrow(/noutro separador/);
    await expect(g.iniciarGravacao({ negocio: 31, nome: "Rui", modo: "visita", voltar: "/y" })).rejects.toThrow(/noutro separador/);
    g.descartarGravacao(); // (o fecharGravacao deste separador) não apaga a do outro
    expect(JSON.parse(localStorage.getItem("olyvia.gravacao.v1")!)).toMatchObject({ dono: "separador-B", estado: "a_ouvir" });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("o outro separador fecha (deixa de bater, ou larga ao sair): aqui já se pode continuar a mesma gravação", async () => {
    guardarNoutro("a_ouvir");
    vi.resetModules();
    const g = await import("./gravador");
    expect(g.gravacaoAtual().noutroSeparador).toBe(true);
    // fechou sem largar (caiu): passados 15 s sem batimento, a vigia daqui vê
    localStorage.setItem("olyvia.gravacao.batimento", JSON.stringify({ dono: "separador-B", em: Date.now() - 16_000 }));
    await vi.advanceTimersByTimeAsync(2100);
    expect(g.gravacaoAtual()).toMatchObject({ noutroSeparador: false, estado: "interrompida" });
    expect(g.gravacaoAtual().msg).toMatch(/pode continuar aqui/);
    await g.iniciarGravacao({ negocio: 30, nome: "Eva", modo: "visita", voltar: "/x" }, true);
    expect(g.gravacaoAtual()).toMatchObject({ estado: "a_ouvir", noutroSeparador: false });
    expect(g.gravacaoAtual().falas).toHaveLength(1);
    // agora o dono é este separador, e é ele que bate
    expect(JSON.parse(localStorage.getItem("olyvia.gravacao.v1")!).dono).toBe(g._idSeparador());
    expect(JSON.parse(localStorage.getItem("olyvia.gravacao.batimento")!).dono).toBe(g._idSeparador());
  });

  it("o outro separador larga ao fechar (pagehide): aqui vê-se logo, sem esperar", async () => {
    guardarNoutro("a_ouvir");
    vi.resetModules();
    const g = await import("./gravador");
    localStorage.setItem("olyvia.gravacao.batimento", JSON.stringify({ dono: "separador-B", em: 0 }));
    g._outroSeparadorMudou("olyvia.gravacao.batimento");
    expect(g.gravacaoAtual().noutroSeparador).toBe(false);
  });

  it("este separador gravava e outro tomou conta (este ficou sem bater a tempo): este para e não escreve por cima", async () => {
    const g = await import("./gravador");
    await g.iniciarGravacao({ negocio: 32, nome: "Rita", modo: "chamada", voltar: "/x" });
    expect(JSON.parse(localStorage.getItem("olyvia.gravacao.batimento")!).dono).toBe(g._idSeparador());
    guardarNoutro("a_ouvir");
    g._outroSeparadorMudou("olyvia.gravacao.v1");
    await vi.advanceTimersByTimeAsync(10);
    expect(g.gravacaoAtual()).toMatchObject({ negocio: 30, noutroSeparador: true, estado: "interrompida" });
    expect(g.gravacaoAtual().msg).toMatch(/outro separador/);
    expect(JSON.parse(localStorage.getItem("olyvia.gravacao.v1")!).dono).toBe("separador-B");
  });

  it("uma gravação parada noutro separador (sem batimento) continua-se aqui como antes", async () => {
    guardarNoutro("interrompida");
    vi.resetModules();
    const g = await import("./gravador");
    expect(g.gravacaoAtual()).toMatchObject({ estado: "interrompida", noutroSeparador: false });
    await g.iniciarGravacao({ negocio: 30, nome: "Eva", modo: "visita", voltar: "/x" }, true);
    expect(g.gravacaoAtual().estado).toBe("a_ouvir");
  });
});

describe("20/11 (auditoria de 19/11): recarregar depois de um deploy", () => {
  const A = { negocio: 40, nome: "Inês", modo: "chamada" as const, voltar: "/x" };

  it("antes de recarregar entrega o que estava na fila (a fala por repetir vai e fica guardada); só depois guarda o pedido e recarrega", async () => {
    const g = await import("./gravador");
    await g.iniciarGravacao(A);
    await falaQueFalha(g);
    await g.pausarGravacao();
    voltaARede();
    sim.vadFalha = true;
    await g.iniciarGravacao(A, true);
    expect(g.gravacaoAtual().falhadas).toBe(0);
    expect(JSON.parse(localStorage.getItem("olyvia.gravacao.v1")!).falas.map((f: { texto: string }) => f.texto)).toEqual(["fala aos 0 s"]);
    expect(JSON.parse(sessionStorage.getItem("olyvia-gravar-depois-de-recarregar")!).a.negocio).toBe(40);
    expect(g.gravacaoAtual().msg).toMatch(/a recarregar a página/);
  });

  it("se a fila não se entrega (sem rede), não recarrega: diz o que falta e fica o «Tentar outra vez»", async () => {
    const g = await import("./gravador");
    await g.iniciarGravacao(A);
    await falaQueFalha(g);
    await g.pausarGravacao();
    sim.vadFalha = true;
    const p = g.iniciarGravacao(A, true).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(25_000);
    const e = await p;
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(/por transcrever/);
    expect(sessionStorage.getItem("olyvia-gravar-depois-de-recarregar")).toBeNull();
    expect(g.gravacaoAtual()).toMatchObject({ estado: "interrompida", falhadas: 1 });
  });

  it("Safari: depois de recarregar sem toque o som fica em pausa: não finge que grava, pede «Toque para continuar a gravar»", async () => {
    const som = { resumeFunciona: false };
    vi.stubGlobal("AudioContext", class {
      state = "suspended";
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: () => undefined }; }
      createMediaStreamSource() { return { connect: () => undefined }; }
      async close() { /* */ }
      resume() { if (som.resumeFunciona) { this.state = "running"; return Promise.resolve(); } return new Promise<void>(() => undefined); }
    });
    const g = await import("./gravador");
    const p = g.iniciarGravacao(A);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(g.gravacaoAtual()).toMatchObject({ estado: "interrompida", pedeToque: true });
    expect(g.gravacaoAtual().msg).toMatch(/Toque para continuar a gravar/);
    // o toque (o botão chama iniciarGravacao com continuar): o som volta, sem pedir outra vez o microfone
    som.resumeFunciona = true;
    await g.iniciarGravacao(A, true);
    expect(g.gravacaoAtual()).toMatchObject({ estado: "a_ouvir", pedeToque: false });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });
});
