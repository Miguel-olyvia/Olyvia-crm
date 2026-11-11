// 4/11 (Rúben): a chamada em direto sem motor próprio. O browser capta o microfone, o VAD Silero (em WebAssembly,
// no próprio browser) corta o som em falas, e cada fala vai à função Supabase chamada-transcrever, que a dá ao
// Gemini. No fim, a transcrição e os campos vão à função chamada-campos. Nada corre no PC de ninguém.
import { supabase } from "@/integrations/supabase/client";
import type { Def, Grupo } from "./campos";
import { nomeFalante, type CampoExtraido, type Extracao, type Fala, type Insights } from "./chamadaMotor";
import { correrEmParalelo, cortarEmBlocos, normalizar, rmsMaximo } from "./blocosAudio";
import type { GuiaConversa, TemaGuia } from "./guiaConversa";
import type { PlantaLida } from "./planta";

export const TAXA = 16000;
export const VAD_ASSETS = "/chamadas/vad/";
const CHAVE_VOZ = "olyvia.chamadas.voz";  // a amostra da voz da comercial, WAV em base64, neste browser
const CHAVE_VOZ_TEXTO = "olyvia.chamadas.voz_texto";  // o que a amostra diz, para apanhar decalques

/** Os campos da visita combinada na chamada: não estão na Lead nem no Contacto (a marcação é na agenda,
 *  no passo «Marcar a visita»), mas o que se combinou ao telefone fica no negócio e à vista. */
export const GRUPO_VISITA: Grupo = { titulo: "Da chamada", campos: [
  { k: "visita_dia", l: "Visita: dia combinado", t: "data", ajuda: "Só se ficou combinado um dia para a visita." },
  { k: "visita_hora", l: "Visita: hora combinada", t: "texto", ajuda: "Ex.: 11:00. Se só se combinou a parte do dia, «manhã» ou «tarde». Vazio se não se falou da hora." },
  { k: "notas_chamada", l: "Notas da chamada", t: "texto_longo",
    ajuda: "Tudo o que é útil para a visita e não cabe nos outros campos: dúvidas, o que o cliente já fez, exemplos que pediu, restrições, o que ficou por perguntar. Com detalhe." },
] };

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
export function guardarVoz(b64: string | null, texto = ""): void {
  try {
    if (b64) { localStorage.setItem(CHAVE_VOZ, b64); localStorage.setItem(CHAVE_VOZ_TEXTO, texto); }
    else { localStorage.removeItem(CHAVE_VOZ); localStorage.removeItem(CHAVE_VOZ_TEXTO); }
  } catch { /* sem localStorage */ }
}
export function vozTextoGuardado(): string { try { return localStorage.getItem(CHAVE_VOZ_TEXTO) ?? ""; } catch { return ""; } }

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
export async function semWorkers(): Promise<void> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = ORT_FICHEIROS;
}
// o vad-web copia esta opção para ort.env.wasm.wasmPaths tal como está; o objeto diz os dois ficheiros exatos
export const ONNX_BASE = ORT_FICHEIROS as unknown as string;

/** O vad-web vem num pedaço à parte. Numa aba aberta antes de um deploy novo, esse pedaço já não existe
 *  no servidor («Failed to fetch dynamically imported module»): a solução é recarregar a página. */
export async function carregarVad(): Promise<typeof import("@ricky0123/vad-web")> {
  try {
    return await import("@ricky0123/vad-web");
  } catch (e) {
    const m = (e as Error).message ?? "";
    if (/dynamically imported module|Loading chunk|Importing a module script failed/i.test(m)) {
      throw new Error("A app foi atualizada entretanto. Recarregue a página (F5) e tente outra vez.");
    }
    throw e;
  }
}
// 11/11: o microfone é do gravador (gravador.ts) e os ficheiros transcrevem-se por blocos (transcreverAudio, em baixo); as funções
// antigas daqui (ouvirMicrofone, falasDeFicheiro) saíram.

// ---- as duas funções Supabase -------------------------------------------------------------------
/** A mensagem útil de um erro do functions.invoke: o corpo {error} que a função devolveu, se houver. */
async function mensagemDoErro(error: { message?: string; context?: unknown }, funcao: string): Promise<string> {
  const ctx = error.context as { json?: () => Promise<{ error?: string }>; status?: number } | undefined;
  try {
    const corpo = ctx?.json ? await ctx.json() : null;
    if (corpo?.error) return `${funcao}: ${corpo.error}`;
  } catch { /* sem corpo JSON */ }
  return `${funcao}: ${error.message ?? "falhou"}${ctx?.status ? ` (HTTP ${ctx.status})` : ""}`;
}

export interface Frase { inicio: number; fim: number; texto: string; confianca: number; falante?: "comercial" | "cliente" }

/** 9/11: `tipo` «visita» usa as instruções e o modelo da visita; `contexto` é o fim do que já se transcreveu (só para o assunto). */
export async function transcreverFala(pcm: Float32Array, inicioS: number, referenciaB64: string | null, referenciaTexto = "",
  opcoes: { tipo?: "chamada" | "visita"; contexto?: string } = {}): Promise<Frase[]> {
  const { data, error } = await supabase.functions.invoke("chamada-transcrever", {
    body: { audio_b64: wavBase64(pcm), deslocamento_s: inicioS, ...(opcoes.tipo ? { tipo: opcoes.tipo } : {}), ...(opcoes.contexto ? { contexto: opcoes.contexto.slice(-1400) } : {}),
      ...(referenciaB64 ? { referencia_b64: referenciaB64, referencia_texto: referenciaTexto } : {}) },
  });
  if (error) throw new Error(await mensagemDoErro(error, "chamada-transcrever"));
  return (data?.frases ?? []) as Frase[];
}

/** 11/11: a segunda passagem. Um bloco contínuo (~50 s) volta transcrito pelo modelo maior, com quem fala em cada frase; `contexto` é o fim
 *  do que já se reviu (com quem fala), só para o assunto e para manter as mesmas pessoas. As falas voltam marcadas como revistas. */
export async function transcreverBloco(pcm: Float32Array, inicioS: number, tipo: "chamada" | "visita", contexto = ""): Promise<Fala[]> {
  const { data, error } = await supabase.functions.invoke("chamada-transcrever", {
    body: { modo: "bloco", audio_b64: wavBase64(normalizar(pcm)), deslocamento_s: inicioS, tipo, ...(contexto ? { contexto: contexto.slice(-1400) } : {}) },
  });
  if (error) throw new Error(await mensagemDoErro(error, "chamada-transcrever"));
  // uma função antiga (sem o modo bloco) devolve frases sem quem fala: aí não se marcam como revistas
  const frases = (data?.frases ?? []) as (Frase & { falante?: Fala["falante"] })[];
  const revista = data?.modo === "bloco";
  return frases.map((f) => ({ inicio: f.inicio, fim: f.fim, texto: f.texto, falante: f.falante ?? "cliente", confianca_falante: revista ? 1 : 0.3,
    confianca: f.confianca, ...(revista ? { revista: true } : {}) }));
}

/** O fim do que já está revisto, com quem fala, para dar contexto ao bloco seguinte. */
export const contextoRevisto = (falas: readonly Fala[]) =>
  falas.filter((f) => f.revista).slice(-14).map((f) => `${nomeFalante(f.falante)}: ${f.texto}`).join("\n").slice(-1400);

/** Um ficheiro de áudio (a gravação do telemóvel, m4a, mp3, wav, ogg) em PCM mono a 16 kHz. */
export async function audioDeFicheiro(origem: Blob | string): Promise<Float32Array> {
  const bytes = typeof origem === "string" ? await (await fetch(origem)).arrayBuffer() : await origem.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: TAXA });
  try {
    const dec = await ctx.decodeAudioData(bytes);
    if (dec.numberOfChannels === 1) return dec.getChannelData(0).slice();
    // estéreo (ou mais): a média dos canais, para não perder quem só ficou num deles
    const out = new Float32Array(dec.length);
    for (let c = 0; c < dec.numberOfChannels; c++) { const x = dec.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += x[i] / dec.numberOfChannels; }
    return out;
  } catch {
    throw new Error("Este ficheiro de áudio não abre neste browser. Experimente m4a, mp3 ou wav.");
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** Um áudio inteiro (um ficheiro, a chamada de exemplo) transcrito por blocos, cada um com o fim do anterior como contexto quando já chegou.
 *  11/11: até 4 blocos ao mesmo tempo (correrEmParalelo): uma visita de 35 min passa de ~10 min para ~2 a 3 min. */
export const BLOCOS_EM_PARALELO = 4;
export async function transcreverAudio(pcm: Float32Array, tipo: "chamada" | "visita", aoProgredir?: (feitos: number, total: number, falas: Fala[]) => void): Promise<Fala[]> {
  const blocos = cortarEmBlocos(pcm, TAXA);
  const porBloco: (Fala[] | undefined)[] = new Array(blocos.length);
  let feitos = 0;
  const juntas = () => porBloco.flatMap((x) => x ?? []).sort((a, z) => a.inicio - z.inicio);
  await correrEmParalelo(blocos.length, BLOCOS_EM_PARALELO, async (i) => {
    const b = blocos[i];
    const parte = pcm.subarray(b.ini, b.fim);
    let novas: Fala[] = [];
    if (rmsMaximo(parte) >= 0.004) { // silêncio: não se manda
      // o contexto: o que já se sabe de antes deste bloco (o anterior, se já chegou)
      const antes = juntas().filter((f) => f.inicio < b.ini / TAXA);
      for (let tentativa = 0; ; tentativa++) {
        try { novas = await transcreverBloco(parte, b.ini / TAXA, tipo, contextoRevisto(antes)); break; }
        catch (e) { if (tentativa >= 2) throw e; await new Promise((r) => setTimeout(r, 3000 * (tentativa + 1))); }
      }
    }
    porBloco[i] = novas;
    feitos++;
    aoProgredir?.(feitos, blocos.length, juntas());
  });
  return juntas();
}

/** 11/11: o guia ao vivo (a função chamada-campos com pedir «guia»): o estado de cada tema e a próxima pergunta. */
export async function pedirGuia(segmentos: Fala[], tipo: "chamada" | "visita", temas: TemaGuia[]): Promise<GuiaConversa> {
  const { data, error } = await supabase.functions.invoke("chamada-campos", {
    body: { segmentos: segmentos.map((s) => ({ inicio: s.inicio, texto: s.texto, falante: s.falante })), tipo, pedir: ["guia"], temas, hoje: hojeLocal() },
  });
  if (error) throw new Error(await mensagemDoErro(error, "chamada-campos"));
  const g = (data as { guia?: GuiaConversa } | null)?.guia;
  if (!g || !Array.isArray(g.temas)) throw new Error("O guia veio vazio.");
  return g;
}

const hojeLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** No fim da conversa: os campos propostos e (11/11) a análise da conversa, num só pedido (a função faz os dois em paralelo). */
export async function preencherCampos(segmentos: Fala[], grupos: Grupo[], tipo: "chamada" | "visita" = "chamada", comInsights = false): Promise<Extracao> {
  const campos = grupos.filter((g) => !g.oculto).flatMap((g) => g.campos.map(({ k, l, t, op, ajuda, un }: Def) => ({ k, l, t, op, ajuda, un })));
  const { data, error } = await supabase.functions.invoke("chamada-campos", {
    body: { segmentos: segmentos.map((s) => ({ inicio: s.inicio, texto: s.texto, falante: s.falante })), campos, hoje: hojeLocal(), tipo,
      ...(comInsights ? { pedir: ["campos", "insights"] } : {}) },
  });
  if (error) throw new Error(await mensagemDoErro(error, "chamada-campos"));
  return data as Extracao & { fichas: { campos: CampoExtraido[] }[] };
}

/** 11/11: só a análise de uma conversa já guardada (sem propor campos). */
export async function analisarConversa(segmentos: Fala[], tipo: "chamada" | "visita"): Promise<Insights> {
  const { data, error } = await supabase.functions.invoke("chamada-campos", {
    body: { segmentos: segmentos.map((s) => ({ inicio: s.inicio, texto: s.texto, falante: s.falante })), hoje: hojeLocal(), tipo, pedir: ["insights"] },
  });
  if (error) throw new Error(await mensagemDoErro(error, "chamada-campos"));
  if (!data?.insights) throw new Error("A análise não veio. A função chamada-campos pode ainda não ter a versão nova.");
  return data.insights as Insights;
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

// 5/11 (a visita real tem 35 min): o telemóvel não pode apagar o ecrã a meio, senão o browser corta o microfone. Sem Wake Lock
// (browsers antigos) grava-se na mesma; volta a pedir-se quando a página volta a estar à vista.
export async function ecraAceso(): Promise<() => void> {
  type Trinco = { release: () => Promise<void> };
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Trinco> } };
  if (!nav.wakeLock) return () => undefined;
  let trinco: Trinco | null = null;
  const pedir = async () => { try { trinco = await nav.wakeLock!.request("screen"); } catch { trinco = null; } };
  const aoVoltar = () => { if (document.visibilityState === "visible") void pedir(); };
  await pedir();
  document.addEventListener("visibilitychange", aoVoltar);
  return () => { document.removeEventListener("visibilitychange", aoVoltar); void trinco?.release().catch(() => undefined); };
}

/** 5/11: a foto reduzida a 2000 px no lado maior, em JPEG (uma foto de telemóvel tem 4000 px e vários MB). */
async function fotoReduzida(ficheiro: Blob, lado = 2000): Promise<string> {
  const url = URL.createObjectURL(ficheiro);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error("A imagem não abriu.")); i.src = url; });
    const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 5/11 (Rúben: «ler a foto da folha»): a folha em papel da visita, lida pelo Gemini (função visita-folha). Volta os campos propostos,
 *  como na conversa, e a planta lida do croqui (ou null). */
export async function lerFolha(ficheiro: Blob, grupos: Grupo[], divisao?: string): Promise<Extracao & { planta: PlantaLida | null }> {
  const campos = grupos.filter((g) => !g.oculto).flatMap((g) => g.campos.map(({ k, l, t, op, ajuda, un, bloco }: Def) => ({ k, l, t, op, ajuda, un, bloco })));
  const imagem_b64 = await fotoReduzida(ficheiro);
  const { data, error } = await supabase.functions.invoke("visita-folha", { body: { imagem_b64, mime: "image/jpeg", campos, divisao } });
  if (error) throw new Error(await mensagemDoErro(error, "visita-folha"));
  return data as Extracao & { planta: PlantaLida | null };
}
