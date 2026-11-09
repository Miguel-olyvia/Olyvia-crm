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
import { useSyncExternalStore } from "react";
import type { Fala } from "./chamadaMotor";
import { ONNX_BASE, TAXA, VAD_ASSETS, carregarVad, ecraAceso, linhasDaFala, semWorkers, transcreverFala, vozGuardada, vozTextoGuardado } from "./chamadaNuvem";

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
  aFalar: boolean;
  /** 0 a 1. */
  nivel: number;
  microfone: string;
  msg: string;
}

const CHAVE = "olyvia.gravacao.v1";
const CHAVE_MIC = "olyvia.gravacao.microfone";
const VAZIA: Gravacao = { negocio: null, nome: "", modo: "visita", voltar: "/negocios", estado: "parado", falas: [], inicioEm: null, pausas: 0, pendentes: 0, falhadas: 0, aFalar: false, nivel: 0, microfone: "", msg: "" };
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
    return { ...VAZIA, ...g, estado, pendentes: 0, falhadas: 0, aFalar: false, nivel: 0,
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
  if (!novas.length) return;
  mudar({ falas: [...g.falas, ...novas].sort((a, b) => a.inicio - b.inicio) }, true);
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
          mudar({ falhadas: porRepetir.length, msg: "Há falas por transcrever (sem rede?): toque em «Tentar outra vez». " + (e as Error).message });
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
    onSpeechEnd: (audio: Float32Array) => { mudar({ aFalar: false }); chegouFala(audio, inicioFala); },
    onVADMisfire: () => { mudar({ aFalar: false }); if (pedaco.length && !fechaPedaco) fechaPedaco = window.setTimeout(fecharPedaco, SILENCIO_FECHA_MS); },
  } as Parameters<typeof MicVAD.new>[0]) as unknown as Vad;
  await vad.start();
  mudar({ microfone: pista?.label || "Microfone do aparelho" });
}

async function desligarMicrofone(entregar: boolean) {
  const v = vad; vad = null;
  try { if (v) { if (entregar) await v.pause(); await v.destroy(); } } catch { /* já parado */ }
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
  porRepetir = []; pedaco = []; cortadoEm = null;
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
  // as que estão na fila e as que esperam para tentar outra vez (no máximo 40 s)
  const limite = Date.now() + 40_000;
  for (;;) {
    await fila;
    if (agendadas === 0 || Date.now() > limite) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await fila;
  mudar({ estado: "terminada", nivel: 0, msg: "" }, true);
  return g.falas;
}

/** As falas que falharam (sem rede): mandar outra vez. */
export function repetirFalhadas() {
  const lista = porRepetir; porRepetir = [];
  mudar({ falhadas: 0, msg: "" });
  for (const x of lista) transcrever(x.pcm, x.inicio, ESPERAS.length - 1);
}

/** Esquecer a gravação (depois de guardada no negócio). */
export function descartarGravacao() {
  porRepetir = []; pedaco = [];
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
export function _repor() { descartarGravacao(); fila = Promise.resolve(); agendadas = 0; }
