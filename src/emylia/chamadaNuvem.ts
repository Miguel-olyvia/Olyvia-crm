// 4/11 (Rúben): a chamada em direto sem motor próprio. O browser capta o microfone, o VAD Silero (em WebAssembly,
// no próprio browser) corta o som em falas, e cada fala vai à função Supabase chamada-transcrever, que a dá ao
// Gemini. No fim, a transcrição e os campos vão à função chamada-campos. Nada corre no PC de ninguém.
import { supabase } from "@/integrations/supabase/client";
import type { Def, Grupo } from "./campos";
import type { CampoExtraido, Extracao, Fala } from "./chamadaMotor";

export const TAXA = 16000;
const VAD_ASSETS = "/chamadas/vad/";
const CHAVE_VOZ = "olyvia.chamadas.voz";  // a amostra da voz da comercial, WAV em base64, neste browser

/** Float32 a 16 kHz → WAV (int16, mono) em base64. */
export function wavBase64(pcm: Float32Array): string {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, TAXA, true); v.setUint32(28, TAXA * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

// ---- voz da comercial (gravada uma vez neste browser) ------------------------------------------
export function vozGuardada(): string | null { try { return localStorage.getItem(CHAVE_VOZ); } catch { return null; } }
export function guardarVoz(b64: string | null): void {
  try { if (b64) localStorage.setItem(CHAVE_VOZ, b64); else localStorage.removeItem(CHAVE_VOZ); } catch { /* sem localStorage */ }
}

/** Grava `segundos` do microfone a 16 kHz e devolve o PCM (para registar a voz). */
export async function gravarMicrofone(segundos: number, aoProgredir?: (s: number) => void): Promise<Float32Array> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  const ctx = new AudioContext({ sampleRate: TAXA });
  await ctx.audioWorklet.addModule("/chamadas/captura.worklet.js");
  const fonte = ctx.createMediaStreamSource(stream);
  const nodo = new AudioWorkletNode(ctx, "captura");
  const partes: Float32Array[] = [];
  let total = 0;
  nodo.port.onmessage = (e) => {
    const i16 = new Int16Array(e.data as ArrayBuffer);
    const f = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
    partes.push(f); total += f.length;
    aoProgredir?.(total / TAXA);
  };
  fonte.connect(nodo); nodo.connect(ctx.destination);
  await new Promise((r) => setTimeout(r, segundos * 1000));
  try { nodo.disconnect(); fonte.disconnect(); stream.getTracks().forEach((t) => t.stop()); await ctx.close(); } catch { /* já fechado */ }
  const out = new Float32Array(total); let k = 0;
  for (const p of partes) { out.set(p, k); k += p.length; }
  return out;
}

// ---- VAD no browser -----------------------------------------------------------------------------
/** O onnxruntime (a versão só WebAssembly, a mesma que o vad-web usa) com uma thread: sem workers criados de
 *  blobs, que a Content-Security-Policy da app não deixa. Os ficheiros do runtime vêm de public/chamadas/vad. */
// Em desenvolvimento o Vite não deixa importar módulos da pasta public (dá 500 em «.mjs?import»), por isso
// aí o runtime vem de node_modules; na build são os ficheiros estáticos de public/chamadas/vad.
const ORT_PASTA = import.meta.env.DEV ? "/node_modules/onnxruntime-web/dist/" : VAD_ASSETS;
const ORT_FICHEIROS = { mjs: ORT_PASTA + "ort-wasm-simd-threaded.mjs", wasm: ORT_PASTA + "ort-wasm-simd-threaded.wasm" };
async function semWorkers(): Promise<void> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = ORT_FICHEIROS;
}
// o vad-web copia esta opção para ort.env.wasm.wasmPaths tal como está; o objeto diz os dois ficheiros exatos
const ONNX_BASE = ORT_FICHEIROS as unknown as string;
export interface Ouvinte { parar: () => Promise<void> }

/** Liga o microfone com o VAD Silero; chama `aoTerminarFala` com cada fala (float32 a 16 kHz) e o seu início em segundos. */
export async function ouvirMicrofone(aoTerminarFala: (pcm: Float32Array, inicioS: number) => void, aoNivel?: (aFalar: boolean) => void): Promise<Ouvinte> {
  const { MicVAD } = await import("@ricky0123/vad-web");
  await semWorkers();
  const t0 = performance.now();
  let inicioFala = 0;
  const vad = await MicVAD.new({
    baseAssetPath: VAD_ASSETS,
    onnxWASMBasePath: ONNX_BASE,
    model: "v5",
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: 400,       // ao telefone responde-se depressa: 0,4 s de silêncio fecha a fala
    preSpeechPadMs: 300,
    minSpeechMs: 350,
    onSpeechStart: () => { inicioFala = (performance.now() - t0) / 1000; aoNivel?.(true); },
    onSpeechEnd: (audio) => { aoNivel?.(false); aoTerminarFala(audio, inicioFala); },
    onVADMisfire: () => aoNivel?.(false),
  });
  vad.start();
  return { parar: async () => { try { vad.pause(); vad.destroy(); } catch { /* já parado */ } } };
}

/** O mesmo VAD sobre um ficheiro (a chamada de exemplo), para testar sem microfone. */
export async function falasDeFicheiro(url: string): Promise<{ pcm: Float32Array; inicioS: number }[]> {
  const { NonRealTimeVAD } = await import("@ricky0123/vad-web");
  await semWorkers();
  const resposta = await fetch(url);
  const ctx = new AudioContext({ sampleRate: TAXA });
  const dec = await ctx.decodeAudioData(await resposta.arrayBuffer());
  const pcm = dec.getChannelData(0);
  await ctx.close();
  // o VAD de ficheiro tem opções próprias: só o modelo «legacy» e o runtime configurado por ortConfig
  const vad = await NonRealTimeVAD.new({
    modelURL: VAD_ASSETS + "silero_vad_legacy.onnx",
    ortConfig: (ort: { env: { wasm: { numThreads: number; wasmPaths: unknown } } }) => { ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = ORT_FICHEIROS; },
    positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35, redemptionMs: 400, preSpeechPadMs: 300, minSpeechMs: 350,
  });
  const falas: { pcm: Float32Array; inicioS: number }[] = [];
  for await (const { audio, start } of vad.run(pcm, TAXA)) falas.push({ pcm: audio, inicioS: start / 1000 });
  return falas;
}

// ---- as duas funções Supabase -------------------------------------------------------------------
export interface Frase { inicio: number; fim: number; texto: string; confianca: number; falante?: "comercial" | "cliente" }

export async function transcreverFala(pcm: Float32Array, inicioS: number, referenciaB64: string | null): Promise<Frase[]> {
  const { data, error } = await supabase.functions.invoke("chamada-transcrever", {
    body: { audio_b64: wavBase64(pcm), deslocamento_s: inicioS, ...(referenciaB64 ? { referencia_b64: referenciaB64 } : {}) },
  });
  if (error) throw new Error(error.message ?? "chamada-transcrever falhou");
  return (data?.frases ?? []) as Frase[];
}

export async function preencherCampos(segmentos: Fala[], grupos: Grupo[]): Promise<Extracao> {
  const campos = grupos.filter((g) => !g.oculto).flatMap((g) => g.campos.map(({ k, l, t, op, ajuda, un }: Def) => ({ k, l, t, op, ajuda, un })));
  const { data, error } = await supabase.functions.invoke("chamada-campos", {
    body: { segmentos: segmentos.map((s) => ({ inicio: s.inicio, texto: s.texto, falante: s.falante })), campos },
  });
  if (error) throw new Error(error.message ?? "chamada-campos falhou");
  return data as Extracao & { fichas: { campos: CampoExtraido[] }[] };
}

/** Junta as frases de uma fala em linhas por falante (uma linha por mudança de quem fala). */
export function linhasDaFala(frases: Frase[], semReferencia: "cliente" | "comercial"): Fala[] {
  const linhas: Fala[] = [];
  for (const f of frases) {
    const quem = f.falante ?? semReferencia;
    const ultima = linhas[linhas.length - 1];
    if (ultima && ultima.falante === quem) { ultima.texto += " " + f.texto; ultima.fim = f.fim; ultima.confianca_falante = Math.min(ultima.confianca_falante, f.confianca); }
    else linhas.push({ inicio: f.inicio, fim: f.fim, texto: f.texto, falante: quem, confianca_falante: f.falante ? 1 : 0.3 });
  }
  return linhas;
}
