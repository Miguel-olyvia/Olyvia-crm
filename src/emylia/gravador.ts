// 9/11 (Rúben, depois de acompanhar uma visita real: «a transcrição não corre enquanto estamos no Estúdio ou em background, e não
// ficou gravada»). Antes, a gravação vivia dentro do painel do negócio: ao sair dele (o Estúdio, outro separador, o telemóvel a cortar o
// microfone) parava, e as falas só estavam na memória do ecrã. Agora há um gravador só, da app inteira:
//  - continua enquanto se anda pela app (o Estúdio abre no mesmo separador), com um indicador em baixo (IndicadorGravacao);
//  - cada fala transcrita fica logo guardada neste browser: um recarregar ou um corte não perde nada, e pode-se continuar a gravar;
//  - quando o browser corta o microfone (o ecrã bloqueou, outra app), volta a ligá-lo sozinho ao voltar e conta a pausa;
//  - uma fala que falha a transcrever tenta outra vez (3 vezes) e, se continuar a falhar, fica para «Tentar outra vez»;
//  - na visita, as falas seguidas juntam-se em pedaços até ~15 s (com mais contexto o modelo erra muito menos) e vão com o fim do
//    que já se disse; nenhum pedaço passa dos 20 s (o servidor recusava as falas longas).
// O nível do microfone fica à vista, para se ver logo se ele está a apanhar as vozes.
//
// 11/11 (Rúben: «a transcrição falha muito»): duas passagens. As falas cortadas pelo VAD continuam a dar a pré-visualização em direto,
// mas o gravador guarda também o som CONTÍNUO (um AudioWorklet a 16 kHz, sem depender do VAD, que perdia a voz baixa do altifalante) e
// manda-o em blocos de 35 a 55 s, cortados no ponto mais calado. Cada bloco volta transcrito pelo modelo maior, com quem fala decidido por
// ele (ouve as duas vozes lado a lado) e com o fim do que já se reviu como contexto; as falas desse intervalo são substituídas pelas
// revistas. Sem captura contínua (um browser que não a deixe), fica tudo como antes.
import { useSyncExternalStore } from "react";
import type { Fala } from "./chamadaMotor";
import { ONNX_BASE, TAXA, VAD_ASSETS, carregarVad, contextoRevisto, ecraAceso, linhasDaFala, semWorkers, transcreverBloco, transcreverFala, vozGuardada, vozTextoGuardado } from "./chamadaNuvem";
import { BLOCO_MAX_S, BLOCO_MIN_S, jaRevisto, juntarBloco, juntarInt16, pontoCalado, rmsMaximo } from "./blocosAudio";

export type EstadoGravacao = "parado" | "a_ligar" | "a_ouvir" | "interrompida" | "a_terminar" | "terminada";
export interface Gravacao {
  negocio: number | null;
  nome: string;
  modo: "chamada" | "visita";
  /** Para onde volta o indicador (a página do negócio). */
  voltar: string;
  estado: EstadoGravacao;
  falas: Fala[];
  /** Quando começou (ms): os tempos das falas contam daqui, mesmo depois de uma pausa. */
  inicioEm: number | null;
  /** Quantas vezes o microfone foi cortado e voltou. */
  pausas: number;
  pendentes: number;
  falhadas: number;
  /** 11/11: blocos da segunda passagem à espera ou a ser revistos. */
  aRever: number;
  aFalar: boolean;
  /** 0 a 1. */
  nivel: number;
  microfone: string;
  msg: string;
}

const CHAVE = "olyvia.gravacao.v1";
const CHAVE_MIC = "olyvia.gravacao.microfone";
const VAZIA: Gravacao = { negocio: null, nome: "", modo: "visita", voltar: "/negocios", estado: "parado", falas: [], inicioEm: null, pausas: 0, pendentes: 0, falhadas: 0, aRever: 0, aFalar: false, nivel: 0, microfone: "", msg: "" };
/** Cada pedaço da visita junta falas até isto (s); nenhum passa de MAX_S. */
const JUNTAR_S = 15, MAX_S = 20, SILENCIO_FECHA_MS = 2500;
const ESPERAS = [3000, 8000, 20000];

function lerGuardada(): Gravacao {
  try {
    const t = localStorage.getItem(CHAVE);
    if (!t) return VAZIA;
    const g = JSON.parse(t) as Partial<Gravacao>;
    if (typeof g.negocio !== "number" || !Array.isArray(g.falas)) return VAZIA;
    // a página recarregou a meio: as falas ficam e pode-se continuar
    const estado: EstadoGravacao = g.estado === "terminada" ? "terminada" : g.estado === "parado" ? "parado" : "interrompida";
    return { ...VAZIA, ...g, estado, pendentes: 0, falhadas: 0, aRever: 0, aFalar: false, nivel: 0,
      msg: estado === "interrompida" ? "A gravação parou (a página recarregou ou o browser fechou-a). As falas estão guardadas." : "" } as Gravacao;
  } catch { return VAZIA; }
}

let g: Gravacao = typeof localStorage === "undefined" ? VAZIA : lerGuardada();
const quemOuve = new Set<() => void>();

function mudar(parcial: Partial<Gravacao>, guardar = false) {
  g = { ...g, ...parcial };
  if (guardar) {
    try {
      const { negocio, nome, modo, voltar, estado, falas, inicioEm, pausas } = g;
      if (negocio === null) localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, JSON.stringify({ negocio, nome, modo, voltar, estado, falas, inicioEm, pausas }));
    } catch { /* sem espaço: fica na memória */ }
  }
  quemOuve.forEach((f) => f());
}

export const gravacaoAtual = () => g;
export function useGravacao(): Gravacao {
  return useSyncExternalStore((f) => { quemOuve.add(f); return () => { quemOuve.delete(f); }; }, () => g, () => g);
}

// ---- o microfone escolhido -----------------------------------------------------------------------
export function microfoneEscolhido(): string { try { return localStorage.getItem(CHAVE_MIC) ?? ""; } catch { return ""; } }
export function escolherMicrofone(id: string) { try { if (id) localStorage.setItem(CHAVE_MIC, id); else localStorage.removeItem(CHAVE_MIC); } catch { /* */ } }
/** Os microfones do aparelho (os nomes só aparecem depois de dar acesso ao microfone uma vez). */
export async function microfones(): Promise<{ id: string; nome: string }[]> {
  try {
    const ds = await navigator.mediaDevices.enumerateDevices();
    return ds.filter((d) => d.kind === "audioinput" && d.deviceId).map((d, i) => ({ id: d.deviceId, nome: d.label || `Microfone ${i + 1}` }));
  } catch { return []; }
}

// ---- o que está ligado (só na memória) ------------------------------------------------------------
type Vad = { start: () => Promise<void> | void; pause: () => Promise<void> | void; destroy: () => Promise<void> | void };
let vad: Vad | null = null;
let stream: MediaStream | null = null;
let ctxAudio: AudioContext | null = null;
let relogioNivel: number | null = null;
let soltarEcra: (() => void) | null = null;
let fila: Promise<void> = Promise.resolve();
let agendadas = 0;
let porRepetir: { pcm: Float32Array; inicio: number }[] = [];
let pedaco: { pcm: Float32Array; inicio: number }[] = [];
let fechaPedaco: number | null = null;
let cortadoEm: number | null = null;
let aReligar = false;

const contexto = () => g.falas.map((f) => f.texto).join(" ").slice(-600);

function juntar(novas: Fala[]) {
  // uma fala provisória cujo intervalo já foi revisto (chegou atrasada) não entra
  const entram = novas.filter((f) => !jaRevisto(f.inicio, revistos));
  if (!entram.length) return;
  mudar({ falas: [...g.falas, ...entram].sort((a, b) => a.inicio - b.inicio) }, true);
}

// ---- 11/11: a segunda passagem (o som contínuo, em blocos) -------------------------------------------
let ctxCaptura: AudioContext | null = null;
let noCaptura: AudioWorkletNode | null = null;
/** O bloco que se está a encher: as partes int16 que o worklet mandou e o segundo da gravação em que começa. */
let bloco: { partes: Int16Array[]; n: number; inicio: number } | null = null;
/** Quando o VAD ouviu fala (segundos da gravação): um bloco sem fala nenhuma e sem som não se manda. */
let falasVad: [number, number][] = [];
/** Os intervalos já revistos (as falas provisórias que chegam depois para eles não entram). */
let revistos: [number, number][] = [];
let filaBlocos: Promise<void> = Promise.resolve();
let blocosAgendados = 0;
let blocosPorRepetir: { pcm: Float32Array; inicio: number }[] = [];
/** A função publicada ainda não tem o modo bloco: fica só a transcrição fala a fala até recarregar. */
let semBlocos = false;

/** Segundos desde o início da gravação. */
const agoraS = () => (Date.now() - (g.inicioEm ?? Date.now())) / 1000;
const falhadasAgora = () => porRepetir.length + blocosPorRepetir.length;

function paraInt16(x: Float32Array): Int16Array {
  const out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32768)));
  return out;
}

function chegouAudio(i16: Int16Array) {
  if (!bloco) return;
  // o som parou de chegar (o ecrã bloqueou, o browser suspendeu o áudio): o que havia fecha-se e o bloco novo começa na hora certa
  const esperado = bloco.inicio + bloco.n / TAXA, agora = agoraS() - i16.length / TAXA;
  if (agora - esperado > 3) { fecharBloco(); bloco = { partes: [], n: 0, inicio: Math.max(0, agora) }; }
  bloco.partes.push(i16); bloco.n += i16.length;
  if (bloco.n >= BLOCO_MAX_S * TAXA) cortarBloco();
}

/** O bloco chegou ao máximo: corta-se no ponto mais calado entre o mínimo e o máximo, e o resto começa o bloco seguinte. */
function cortarBloco() {
  if (!bloco) return;
  const pcm = juntarInt16(bloco.partes);
  const corte = pontoCalado(pcm, BLOCO_MIN_S * TAXA, Math.min(pcm.length, BLOCO_MAX_S * TAXA), TAXA);
  const inicio = bloco.inicio;
  const resto = paraInt16(pcm.subarray(corte));
  bloco = { partes: [resto], n: resto.length, inicio: inicio + corte / TAXA };
  mandarBloco(pcm.slice(0, corte), inicio);
}

/** O microfone parou (ou o som deixou de chegar): o que há no bloco vai já. */
function fecharBloco() {
  const b = bloco; bloco = null;
  if (!b || b.n < TAXA) return;
  mandarBloco(juntarInt16(b.partes), b.inicio);
}

function mandarBloco(pcm: Float32Array, inicio: number, tentativa = 0) {
  if (semBlocos) return;
  const fim = inicio + pcm.length / TAXA;
  if (tentativa === 0 && !falasVad.some(([a, b]) => b >= inicio - 1 && a <= fim + 1) && rmsMaximo(pcm, TAXA) < 0.02) return; // só silêncio
  mudar({ aRever: g.aRever + 1 });
  filaBlocos = filaBlocos.then(async () => {
    try {
      const novas = await transcreverBloco(pcm, inicio, g.modo, contextoRevisto(g.falas));
      // vazio: o modelo não ouviu fala nenhuma; ficam as falas provisórias desse intervalo (perder texto é pior do que rever)
      if (novas.length && novas.every((f) => f.revista)) {
        revistos.push([inicio, fim]);
        mudar({ falas: juntarBloco(g.falas, novas, inicio, fim) }, true);
      } else if (novas.length) semBlocos = true; // a função publicada é a antiga
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (/longa demais|Pedido inválido/i.test(m)) { semBlocos = true; return; } // a função publicada é a antiga: fica a pré-visualização
      if (tentativa < ESPERAS.length) {
        blocosAgendados++;
        window.setTimeout(() => { blocosAgendados--; mandarBloco(pcm, inicio, tentativa + 1); }, ESPERAS[tentativa]);
      } else {
        blocosPorRepetir.push({ pcm, inicio });
        mudar({ falhadas: falhadasAgora(), msg: "Há partes da conversa por rever (sem rede?): toque em «Tentar outra vez». " + m });
      }
    } finally {
      mudar({ aRever: Math.max(0, g.aRever - 1) });
    }
  });
}

/** O som contínuo, a 16 kHz, por um AudioWorklet (o mesmo do registo da voz). Se o browser não deixar, fica só o VAD. */
async function ligarCaptura(s: MediaStream) {
  if (semBlocos || typeof AudioWorkletNode === "undefined") return;
  let c: AudioContext | null = null;
  try {
    c = new AudioContext({ sampleRate: TAXA });
    if (c.sampleRate !== TAXA) throw new Error(`taxa ${c.sampleRate}`);
    await c.audioWorklet.addModule("/chamadas/captura.worklet.js");
    const fonte = c.createMediaStreamSource(s);
    const no = new AudioWorkletNode(c, "captura");
    const mudo = c.createGain();
    mudo.gain.value = 0;
    fonte.connect(no); no.connect(mudo); mudo.connect(c.destination);
    no.port.onmessage = (e) => chegouAudio(new Int16Array(e.data as ArrayBuffer));
    if (c.state !== "running") await c.resume().catch(() => undefined);
    ctxCaptura = c; noCaptura = no;
    bloco = { partes: [], n: 0, inicio: agoraS() };
  } catch (e) {
    console.warn("[gravador] sem captura contínua: fica só a transcrição fala a fala", e);
    void c?.close().catch(() => undefined);
  }
}

async function desligarCaptura(entregar: boolean) {
  if (noCaptura) { noCaptura.port.onmessage = null; try { noCaptura.disconnect(); } catch { /* */ } }
  noCaptura = null;
  if (entregar) fecharBloco(); else bloco = null;
  try { await ctxCaptura?.close(); } catch { /* */ }
  ctxCaptura = null;
}

/** Corta um áudio longo em pedaços de até MAX_S, no ponto mais calado perto de cada corte. */
export function cortarLongo(pcm: Float32Array, alvoS = JUNTAR_S, maxS = MAX_S): { pcm: Float32Array; desvioS: number }[] {
  const out: { pcm: Float32Array; desvioS: number }[] = [];
  let ini = 0;
  const jan = Math.round(TAXA * 0.02);
  while (pcm.length - ini > maxS * TAXA) {
    const de = ini + Math.round((alvoS - 2) * TAXA), ate = Math.min(pcm.length - jan, ini + Math.round((alvoS + 2) * TAXA));
    let melhor = ini + alvoS * TAXA, menor = Infinity;
    for (let i = de; i < ate; i += jan) {
      let e = 0;
      for (let k = 0; k < jan; k++) e += pcm[i + k] * pcm[i + k];
      if (e < menor) { menor = e; melhor = i; }
    }
    out.push({ pcm: pcm.subarray(ini, melhor), desvioS: ini / TAXA });
    ini = melhor;
  }
  out.push({ pcm: pcm.subarray(ini), desvioS: ini / TAXA });
  return out;
}

function transcrever(pcm: Float32Array, inicio: number, tentativa = 0) {
  for (const parte of tentativa === 0 ? cortarLongo(pcm) : [{ pcm, desvioS: 0 }]) {
    const ini = inicio + parte.desvioS;
    mudar({ pendentes: g.pendentes + 1 });
    fila = fila.then(async () => {
      try {
        const voz = vozGuardada();
        const frases = await transcreverFala(parte.pcm, ini, voz, voz ? vozTextoGuardado() : "", { tipo: g.modo, contexto: contexto() });
        juntar(linhasDaFala(frases, "cliente"));
      } catch (e) {
        if (tentativa < ESPERAS.length) {
          agendadas++;
          window.setTimeout(() => { agendadas--; transcrever(parte.pcm, ini, tentativa + 1); }, ESPERAS[tentativa]);
        } else {
          porRepetir.push({ pcm: parte.pcm, inicio: ini });
          mudar({ falhadas: falhadasAgora(), msg: "Há falas por transcrever (sem rede?): toque em «Tentar outra vez». " + (e as Error).message });
        }
      } finally {
        mudar({ pendentes: Math.max(0, g.pendentes - 1) });
      }
    });
  }
}

function fecharPedaco() {
  if (fechaPedaco) { window.clearTimeout(fechaPedaco); fechaPedaco = null; }
  if (!pedaco.length) return;
  const partes = pedaco; pedaco = [];
  const pausa = new Float32Array(Math.round(TAXA * 0.25));
  const total = partes.reduce((s, p) => s + p.pcm.length, 0) + pausa.length * (partes.length - 1);
  const out = new Float32Array(total);
  let k = 0;
  partes.forEach((p, i) => { if (i) { out.set(pausa, k); k += pausa.length; } out.set(p.pcm, k); k += p.pcm.length; });
  transcrever(out, partes[0].inicio);
}

function chegouFala(pcm: Float32Array, inicio: number) {
  if (g.modo !== "visita") { transcrever(pcm, inicio); return; }
  pedaco.push({ pcm, inicio });
  const dur = pedaco.reduce((s, p) => s + p.pcm.length, 0) / TAXA;
  if (dur >= JUNTAR_S) fecharPedaco();
  else { if (fechaPedaco) window.clearTimeout(fechaPedaco); fechaPedaco = window.setTimeout(fecharPedaco, SILENCIO_FECHA_MS); }
}

async function ligarMicrofone() {
  const { MicVAD } = await carregarVad();
  await semWorkers();
  const visita = g.modo === "visita";
  // na visita (pessoas na sala, a alguma distância): sem supressão de ruído nem de eco, que cortam as vozes afastadas; com ganho
  // automático, que as sobe. Na chamada fica como estava (o telemóvel em alta voz).
  const restricoes: MediaTrackConstraints = visita
    ? { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true }
    : { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const mic = microfoneEscolhido();
  let s: MediaStream;
  try { s = await navigator.mediaDevices.getUserMedia({ audio: mic ? { ...restricoes, deviceId: { exact: mic } } : restricoes }); }
  catch (e) { if (!mic) throw e; s = await navigator.mediaDevices.getUserMedia({ audio: restricoes }); } // o escolhido já não está ligado
  stream = s;
  const pista = s.getAudioTracks()[0];
  pista?.addEventListener("ended", aoCortar);
  pista?.addEventListener("mute", () => { if (g.estado === "a_ouvir") cortadoEm ??= Date.now(); });
  pista?.addEventListener("unmute", () => { if (cortadoEm) contarPausa(); });
  ctxAudio = new AudioContext();
  const analisador = ctxAudio.createAnalyser();
  analisador.fftSize = 1024;
  ctxAudio.createMediaStreamSource(s).connect(analisador);
  const amostra = new Float32Array(analisador.fftSize);
  relogioNivel = window.setInterval(() => {
    analisador.getFloatTimeDomainData(amostra);
    let e = 0;
    for (let i = 0; i < amostra.length; i++) e += amostra[i] * amostra[i];
    const nivel = Math.min(1, Math.sqrt(e / amostra.length) * 6);
    if (Math.abs(nivel - g.nivel) > 0.04) mudar({ nivel });
  }, 200);
  const base = (Date.now() - (g.inicioEm ?? Date.now())) / 1000, t0 = performance.now();
  let inicioFala = base;
  vad = await MicVAD.new({
    baseAssetPath: VAD_ASSETS, onnxWASMBasePath: ONNX_BASE, model: "v5", audioContext: ctxAudio,
    getStream: async () => s, pauseStream: async () => undefined, resumeStream: async () => s,
    positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35,
    // na visita, 0,9 s de silêncio fecha a fala (na chamada responde-se depressa: 0,4 s)
    redemptionMs: visita ? 900 : 400, preSpeechPadMs: visita ? 400 : 300, minSpeechMs: visita ? 300 : 350,
    submitUserSpeechOnPause: true,
    onSpeechStart: () => { inicioFala = base + (performance.now() - t0) / 1000; if (fechaPedaco) { window.clearTimeout(fechaPedaco); fechaPedaco = null; } mudar({ aFalar: true }); },
    onSpeechEnd: (audio: Float32Array) => {
      mudar({ aFalar: false });
      falasVad.push([inicioFala, base + (performance.now() - t0) / 1000]);
      if (falasVad.length > 400) falasVad = falasVad.slice(-200);
      chegouFala(audio, inicioFala);
    },
    onVADMisfire: () => { mudar({ aFalar: false }); if (pedaco.length && !fechaPedaco) fechaPedaco = window.setTimeout(fecharPedaco, SILENCIO_FECHA_MS); },
  } as Parameters<typeof MicVAD.new>[0]) as unknown as Vad;
  await vad.start();
  await ligarCaptura(s);
  mudar({ microfone: pista?.label || "Microfone do aparelho" });
}

async function desligarMicrofone(entregar: boolean) {
  const v = vad; vad = null;
  try { if (v) { if (entregar) await v.pause(); await v.destroy(); } } catch { /* já parado */ }
  await desligarCaptura(entregar);
  if (relogioNivel) { window.clearInterval(relogioNivel); relogioNivel = null; }
  stream?.getTracks().forEach((t) => { t.removeEventListener("ended", aoCortar); t.stop(); });
  stream = null;
  try { await ctxAudio?.close(); } catch { /* */ }
  ctxAudio = null;
  if (entregar) fecharPedaco();
}

function contarPausa() {
  const seg = cortadoEm ? Math.round((Date.now() - cortadoEm) / 1000) : 0;
  cortadoEm = null;
  if (seg >= 2) mudar({ pausas: g.pausas + 1, msg: `O microfone esteve cortado ${seg >= 60 ? `${Math.floor(seg / 60)} min ${seg % 60} s` : `${seg} s`} (o ecrã bloqueou ou outra app usou-o). Já está a gravar outra vez.` }, true);
}

/** O browser cortou o microfone (o ecrã bloqueou, outra app pegou nele): à vista, liga-se outra vez; senão, quando voltar. */
function aoCortar() {
  if (g.estado !== "a_ouvir") return;
  cortadoEm ??= Date.now();
  if (document.visibilityState === "visible") void religar();
}

async function religar() {
  if (aReligar || g.estado !== "a_ouvir") return;
  aReligar = true;
  try {
    await desligarMicrofone(true);
    await ligarMicrofone();
    contarPausa();
  } catch (e) {
    mudar({ estado: "interrompida", aFalar: false, nivel: 0, msg: "O microfone foi cortado e não voltou: toque em «Continuar a gravar». " + (e as Error).message }, true);
  } finally { aReligar = false; }
}

function aoMudarVisibilidade() {
  if (document.visibilityState !== "visible") { if (g.estado === "a_ouvir") cortadoEm ??= Date.now(); return; }
  if (g.estado !== "a_ouvir") return;
  const pista = stream?.getAudioTracks()[0];
  if (!pista || pista.readyState === "ended") { void religar(); return; }
  if (ctxAudio && ctxAudio.state !== "running") void ctxAudio.resume().catch(() => undefined);
  // o browser deixou-o ligado: não houve pausa
  window.setTimeout(() => { if (!pista.muted) cortadoEm = null; }, 500);
}

// ---- o que os ecrãs chamam ------------------------------------------------------------------------
export interface Abrir { negocio: number; nome: string; modo: "chamada" | "visita"; voltar: string }

/** Começar a gravar (ou continuar a mesma gravação, depois de um corte ou de recarregar). */
export async function iniciarGravacao(a: Abrir, continuar = false): Promise<void> {
  if (g.negocio !== null && g.negocio !== a.negocio && (g.estado === "a_ouvir" || g.estado === "a_ligar")) {
    throw new Error(`Já está a gravar outro negócio (${g.nome}). Termine essa gravação primeiro.`);
  }
  const mesma = continuar && g.negocio === a.negocio;
  porRepetir = []; pedaco = []; cortadoEm = null; blocosPorRepetir = [];
  if (!mesma) { revistos = []; falasVad = []; }
  mudar({ ...a, estado: "a_ligar", msg: "A pedir o microfone...", falhadas: 0, pendentes: 0,
    ...(mesma ? { pausas: g.pausas + 1, inicioEm: g.inicioEm ?? Date.now() } : { falas: [], inicioEm: Date.now(), pausas: 0 }) }, true);
  try {
    await ligarMicrofone();
    soltarEcra = await ecraAceso();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    mudar({ estado: "a_ouvir", msg: "" }, true);
  } catch (e) {
    await desligarMicrofone(false);
    mudar({ estado: mesma || g.falas.length ? "interrompida" : "parado", msg: "Sem acesso ao microfone: " + (e as Error).message }, true);
    throw e;
  }
}

/** Parar o microfone, esperar pelas últimas transcrições e devolver as falas. A gravação fica «terminada» até se descartar. */
export async function terminarGravacao(): Promise<Fala[]> {
  mudar({ estado: "a_terminar", msg: "A acabar de transcrever...", aFalar: false });
  document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  soltarEcra?.(); soltarEcra = null;
  await desligarMicrofone(true);
  // as que estão na fila e as que esperam para tentar outra vez; 11/11: e os blocos da segunda passagem (o último demora ~20 s)
  mudar({ msg: g.aRever ? "A rever o fim da conversa..." : "A acabar de transcrever..." });
  const limite = Date.now() + 120_000;
  for (;;) {
    await fila;
    await filaBlocos;
    if ((agendadas === 0 && blocosAgendados === 0) || Date.now() > limite) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await fila;
  await filaBlocos;
  mudar({ estado: "terminada", nivel: 0, msg: "" }, true);
  return g.falas;
}

/** As falas que falharam (sem rede): mandar outra vez. */
export function repetirFalhadas() {
  const lista = porRepetir; porRepetir = [];
  const blocos = blocosPorRepetir; blocosPorRepetir = [];
  mudar({ falhadas: 0, msg: "" });
  for (const x of lista) transcrever(x.pcm, x.inicio, ESPERAS.length - 1);
  for (const x of blocos) mandarBloco(x.pcm, x.inicio, ESPERAS.length);
}

/** Esquecer a gravação (depois de guardada no negócio). */
export function descartarGravacao() {
  porRepetir = []; pedaco = []; blocosPorRepetir = []; revistos = []; falasVad = []; bloco = null;
  g = { ...VAZIA };
  try { localStorage.removeItem(CHAVE); } catch { /* */ }
  quemOuve.forEach((f) => f());
}

/** Quantos painéis da gravação estão à vista (o indicador só aparece quando nenhum está). */
let paineis = 0;
const quemOuvePaineis = new Set<() => void>();
export function painelAberto(): () => void {
  paineis++; quemOuvePaineis.forEach((f) => f());
  return () => { paineis--; quemOuvePaineis.forEach((f) => f()); };
}
export function usePainelAberto(): boolean {
  return useSyncExternalStore((f) => { quemOuvePaineis.add(f); return () => { quemOuvePaineis.delete(f); }; }, () => paineis > 0, () => false);
}

/** Só para os testes: o estado do zero. */
export function _repor() { descartarGravacao(); fila = Promise.resolve(); agendadas = 0; filaBlocos = Promise.resolve(); blocosAgendados = 0; semBlocos = false; }
/** Só para os testes: o som contínuo a chegar, como o worklet o manda. */
export const _chegouAudio = (i16: Int16Array) => chegouAudio(i16);
export const _ligarBlocos = (inicio = 0) => { bloco = { partes: [], n: 0, inicio }; };
export const _fecharBloco = () => fecharBloco();
