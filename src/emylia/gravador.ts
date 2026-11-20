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
//
// 20/11 (auditoria de 19/11: «não se podem perder falas»): «Continuar a gravar» guarda e manda logo as falas por repetir; a gravação tem um
// separador dono, com batimento (os outros só vêem); antes de recarregar depois de um deploy entrega-se a fila; depois de recarregar, com o
// som em pausa (Safari), pede-se um toque.
import { useSyncExternalStore } from "react";
import type { Fala } from "./chamadaMotor";
import { AppAtualizada, ONNX_BASE, TAXA, VAD_ASSETS, carregarVad, contextoRevisto, ecraAceso, linhasDaFala, semWorkers, transcreverBloco, transcreverFala, vozGuardada, vozTextoGuardado } from "./chamadaNuvem";
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
  /** 20/11: a gravação é de outro separador deste browser, que ainda grava: aqui não se continua nem se termina. */
  noutroSeparador: boolean;
  /** 20/11: a página recarregou sozinha e o browser deixou o som em pausa (Safari, sem toque): falta um toque para continuar a gravar. */
  pedeToque: boolean;
}

const CHAVE = "olyvia.gravacao.v1";
const CHAVE_MIC = "olyvia.gravacao.microfone";
const VAZIA: Gravacao = { negocio: null, nome: "", modo: "visita", voltar: "/negocios", estado: "parado", falas: [], inicioEm: null, pausas: 0, pendentes: 0, falhadas: 0, aRever: 0, aFalar: false, nivel: 0, microfone: "", msg: "",
  noutroSeparador: false, pedeToque: false };

// ---- 20/11 (auditoria de 19/11): um separador de cada vez ------------------------------------------------
// A gravação vive numa só chave do localStorage. Antes, um segundo separador lia «interrompida» e oferecia «Continuar» enquanto o
// primeiro ainda gravava, e os dois escreviam por cima um do outro. Agora a gravação guarda o separador dono, e o dono bate a cada
// BATIMENTO_MS numa chave própria. Os outros separadores mostram «A gravar noutro separador», sem «Continuar». Se o batimento parar (o
// separador fechou, recarregou, o browser caiu), passados BATIMENTO_VELHO_MS os outros podem continuar a mesma gravação.
const CHAVE_BATIMENTO = "olyvia.gravacao.batimento";
const BATIMENTO_MS = 2000, BATIMENTO_VELHO_MS = 15_000;
const ATIVOS = new Set<EstadoGravacao>(["a_ligar", "a_ouvir", "a_terminar"]);
const ID_SEPARADOR = (() => {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
})();
export const MSG_NOUTRO_SEPARADOR = "A gravar noutro separador. Continue a gravação lá; aqui só se vê.";
const MSG_OUTRO_PAROU = "O outro separador deixou de gravar. As falas estão guardadas: pode continuar aqui.";
/** O dono e o estado da gravação guardada (os de qualquer separador). */
let guardadoDono: string | null = null, guardadoEstado: EstadoGravacao = "parado";

function lerBatimento(): { dono: string; em: number } | null {
  try { const b = JSON.parse(localStorage.getItem(CHAVE_BATIMENTO) ?? "null"); return b && typeof b.dono === "string" ? b : null; } catch { return null; }
}
/** Outro separador está a gravar (é o dono da gravação guardada, está ativo e o batimento é recente). */
function outroVivo(): boolean {
  if (!guardadoDono || guardadoDono === ID_SEPARADOR || !ATIVOS.has(guardadoEstado)) return false;
  const b = lerBatimento();
  return !!b && b.dono === guardadoDono && Date.now() - b.em < BATIMENTO_VELHO_MS;
}
// 13/11 (Rúben: «a transcrição tem um delay muito grande» → «tornar super reativa»): o provisório ao vivo tem de ser imediato. Antes
// juntava falas até 15 s e só fechava o pedaço 2,5 s depois de parar de falar. Agora fecha a cada pausa curta (0,3 s, ou 2 s de fala
// seguida), para cada frase aparecer ~1 s depois de a dizer. A passagem de blocos (~50 s, modelo maior) corrige por trás.
/** Cada pedaço da visita junta falas até isto (s); nenhum passa de MAX_S. */
const JUNTAR_S = 2, MAX_S = 20, SILENCIO_FECHA_MS = 300;
const ESPERAS = [3000, 8000, 20000];

function lerGuardada(): Gravacao {
  try {
    const t = localStorage.getItem(CHAVE);
    if (!t) return VAZIA;
    const g = JSON.parse(t) as Partial<Gravacao> & { dono?: string | null };
    guardadoDono = null; guardadoEstado = "parado";
    if (typeof g.negocio !== "number" || !Array.isArray(g.falas)) return VAZIA;
    guardadoDono = typeof g.dono === "string" ? g.dono : null;
    guardadoEstado = (g.estado ?? "parado") as EstadoGravacao;
    const resto = { ...g };
    delete resto.dono;
    // 20/11: outro separador ainda grava: vê-se aqui, sem continuar
    const noutro = outroVivo();
    // a página recarregou a meio: as falas ficam e pode-se continuar
    const estado: EstadoGravacao = g.estado === "terminada" ? "terminada" : g.estado === "parado" ? "parado" : "interrompida";
    return { ...VAZIA, ...resto, estado, pendentes: 0, falhadas: 0, aRever: 0, aFalar: false, nivel: 0, noutroSeparador: noutro, pedeToque: false,
      msg: noutro ? MSG_NOUTRO_SEPARADOR : estado === "interrompida" ? "A gravação parou (a página recarregou ou o browser fechou-a). As falas estão guardadas." : "" } as Gravacao;
  } catch { return VAZIA; }
}

let g: Gravacao = typeof localStorage === "undefined" ? VAZIA : lerGuardada();
/** O separador dono da gravação deste separador (o próprio, quando grava aqui). */
let donoAtual: string | null = guardadoDono;
const quemOuve = new Set<() => void>();

function mudar(parcial: Partial<Gravacao>, guardar = false) {
  g = { ...g, ...parcial };
  // 20/11: um separador que não é o dono nunca escreve por cima da gravação de outro que ainda grava
  if (guardar && (donoAtual === ID_SEPARADOR || !outroVivo())) {
    try {
      const { negocio, nome, modo, voltar, estado, falas, inicioEm, pausas } = g;
      if (negocio === null) { localStorage.removeItem(CHAVE); guardadoDono = null; guardadoEstado = "parado"; }
      else {
        localStorage.setItem(CHAVE, JSON.stringify({ negocio, nome, modo, voltar, estado, falas, inicioEm, pausas, dono: donoAtual }));
        guardadoDono = donoAtual; guardadoEstado = estado;
      }
    } catch { /* sem espaço: fica na memória */ }
  }
  quemOuve.forEach((f) => f());
}

// ---- 20/11: o batimento do dono e o que os outros separadores ouvem ------------------------------------------
let relogioBatimento: number | null = null, ultimoBatimento = 0;
/** O dono diz «ainda estou a gravar». `forcar`: já, sem esperar o intervalo (ao começar). */
function bater(forcar = false) {
  if (donoAtual !== ID_SEPARADOR) return;
  const agora = Date.now();
  if (!forcar && agora - ultimoBatimento < BATIMENTO_MS / 2) return;
  ultimoBatimento = agora;
  try { localStorage.setItem(CHAVE_BATIMENTO, JSON.stringify({ dono: ID_SEPARADOR, em: agora })); } catch { /* */ }
}
function ligarBatimento() {
  bater(true);
  // o som que chega (o worklet, o nível) também bate: um separador em fundo, com os relógios atrasados pelo browser, não perde o lugar
  if (relogioBatimento === null && typeof window !== "undefined") relogioBatimento = window.setInterval(() => bater(), BATIMENTO_MS);
}
function pararBatimento() {
  if (relogioBatimento !== null) { window.clearInterval(relogioBatimento); relogioBatimento = null; }
}
/** O dono larga o lugar já (fechou ou recarregou): os outros podem continuar sem esperar BATIMENTO_VELHO_MS. */
function largarBatimento() {
  if (donoAtual !== ID_SEPARADOR) return;
  try { localStorage.setItem(CHAVE_BATIMENTO, JSON.stringify({ dono: ID_SEPARADOR, em: 0 })); } catch { /* */ }
}

/** Num separador que só vê: de BATIMENTO_MS em BATIMENTO_MS, se o dono deixou de bater, passa a poder continuar. */
let relogioVigia: number | null = null;
function vigiarOutro() {
  if (g.noutroSeparador && relogioVigia === null && typeof window !== "undefined") {
    relogioVigia = window.setInterval(() => {
      if (outroVivo()) return;
      pararVigia();
      if (g.noutroSeparador) mudar({ noutroSeparador: false, msg: MSG_OUTRO_PAROU });
    }, BATIMENTO_MS);
  } else if (!g.noutroSeparador) pararVigia();
}
function pararVigia() { if (relogioVigia !== null) { window.clearInterval(relogioVigia); relogioVigia = null; } }

/** Outro separador mexeu na gravação (ou no batimento). */
function aoMudarNoutroSeparador(chave: string | null) {
  if (chave !== CHAVE && chave !== CHAVE_BATIMENTO && chave !== null) return;
  if (chave === CHAVE_BATIMENTO) {
    // só o batimento: não se relê a gravação toda (as falas), só se o outro ainda está vivo
    if (donoAtual === ID_SEPARADOR) return;
    const noutro = outroVivo();
    if (noutro !== g.noutroSeparador) { mudar({ noutroSeparador: noutro, msg: noutro ? MSG_NOUTRO_SEPARADOR : MSG_OUTRO_PAROU }); vigiarOutro(); }
    return;
  }
  const comMicro = donoAtual === ID_SEPARADOR && (vad !== null || ATIVOS.has(g.estado));
  const novo = lerGuardada();
  if (comMicro) {
    // outro separador tomou conta (este deixou de bater a tempo): este para, sem escrever por cima do que o outro já gravou
    if (guardadoDono && guardadoDono !== ID_SEPARADOR) void largarParaOutro();
    else { guardadoDono = ID_SEPARADOR; guardadoEstado = g.estado; }
    return;
  }
  donoAtual = guardadoDono;
  g = novo;
  quemOuve.forEach((f) => f());
  vigiarOutro();
}

async function largarParaOutro() {
  document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  soltarEcra?.(); soltarEcra = null;
  pararBatimento();
  donoAtual = guardadoDono;
  await desligarMicrofone(false);
  g = { ...lerGuardada(), msg: "A gravação passou para outro separador. Continue lá." };
  if (!g.noutroSeparador) g = { ...g, msg: MSG_OUTRO_PAROU };
  quemOuve.forEach((f) => f()); mudarNivel(0);
  vigiarOutro();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.storageArea === localStorage || e.storageArea === null) aoMudarNoutroSeparador(e.key); });
  window.addEventListener("pagehide", () => { if (ATIVOS.has(g.estado) || vad) largarBatimento(); });
  window.addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted && ATIVOS.has(g.estado)) bater(true); });
  if (g.noutroSeparador) setTimeout(vigiarOutro, 0);
}

export const gravacaoAtual = () => g;

// 19/11 (Rúben: «a gravação faz o browser deixar de funcionar passado 1-2 minutos»): o nível do micro mudava o estado da gravação 5×
// por segundo, e cada mudança redesenhava tudo o que a ouve (o ecrã da chamada inteiro, o Estúdio, a Olyvia). Agora o nível tem a sua
// loja: só a barrinha o ouve.
let nivelAgora = 0, ultimoSomEm = 0;
const quemOuveNivel = new Set<() => void>();
function mudarNivel(n: number) {
  if (n > 0.08) ultimoSomEm = Date.now();
  if (n) bater();
  if (Math.abs(n - nivelAgora) <= 0.04 && n !== 0) return;
  nivelAgora = n;
  quemOuveNivel.forEach((f) => f());
}
/** O nível do micro (0 a 1), só para a barrinha. */
export function useNivelMicrofone(): number {
  return useSyncExternalStore((f) => { quemOuveNivel.add(f); return () => { quemOuveNivel.delete(f); }; }, () => nivelAgora, () => nivelAgora);
}
/** Quando o micro ouviu som pela última vez (para o aviso «não ouço nada»). */
export const ultimoSomMicrofone = () => ultimoSomEm;
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
  bater();
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

/** Corta um áudio longo em pedaços de até MAX_S, no ponto mais calado perto de cada corte.
 *  20/11 (Rúben: «a gravação quebra passado 2 minutos»; perfil do Chrome: 75 s seguidos aqui): o alvo era JUNTAR_S (2 s) e a procura
 *  começava no próprio início do pedaço. Com o início em silêncio (o normal numa chamada com supressão de ruído), o «ponto mais calado»
 *  era o início: o corte não avançava e o ciclo nunca acabava, o browser congelava a 100% de CPU sempre que alguém falava mais de 20 s
 *  seguidos. Agora o alvo é perto dos 20 s (17 s, procura entre 15 e 19 s) e o corte avança sempre. */
export function cortarLongo(pcm: Float32Array, alvoS = MAX_S - 3, maxS = MAX_S): { pcm: Float32Array; desvioS: number }[] {
  const out: { pcm: Float32Array; desvioS: number }[] = [];
  let ini = 0;
  const jan = Math.round(TAXA * 0.02);
  while (pcm.length - ini > maxS * TAXA) {
    const alvo = ini + Math.round(alvoS * TAXA);
    const de = ini + Math.round(Math.max(1, alvoS - 2) * TAXA), ate = Math.min(pcm.length - jan, ini + Math.round(Math.min(maxS, alvoS + 2) * TAXA));
    let melhor = alvo, menor = Infinity;
    for (let i = de; i < ate; i += jan) {
      let e = 0;
      for (let k = 0; k < jan; k++) e += pcm[i + k] * pcm[i + k];
      if (e < menor) { menor = e; melhor = i; }
    }
    if (!(melhor > ini + TAXA)) melhor = alvo; // nunca fica no mesmo sítio
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
    mudarNivel(Math.min(1, Math.sqrt(e / amostra.length) * 6));
  }, 200);
  const base = (Date.now() - (g.inicioEm ?? Date.now())) / 1000, t0 = performance.now();
  let inicioFala = base;
  vad = await MicVAD.new({
    baseAssetPath: VAD_ASSETS, onnxWASMBasePath: ONNX_BASE, model: "v5", audioContext: ctxAudio,
    getStream: async () => s, pauseStream: async () => undefined, resumeStream: async () => s,
    positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35,
    // 13/11 («super reativa»): na visita 0,5 s de silêncio fecha a fala (antes 0,9 s), para cada frase aparecer logo; na chamada 0,4 s.
    // O pad de 0,4 s antes da fala segura o arranque das palavras (a voz ao longe na sala), mesmo com o fecho mais rápido.
    redemptionMs: visita ? 500 : 400, preSpeechPadMs: visita ? 400 : 300, minSpeechMs: visita ? 300 : 350,
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
    mudar({ estado: "interrompida", aFalar: false, msg: "O microfone foi cortado e não voltou: toque em «Continuar a gravar». " + (e as Error).message }, true); mudarNivel(0);
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
  // 20/11: a página recarregou e o som ficou em pausa: o toque (este) liga o som da mesma gravação, sem voltar a pedir o microfone
  if (g.pedeToque && vad && g.negocio === a.negocio) return continuarComToque();
  // 20/11: outro separador deste browser ainda grava: aqui não se começa nem se continua (escreviam os dois por cima um do outro)
  if (outroVivo()) {
    if (!g.noutroSeparador) { mudar({ noutroSeparador: true, msg: MSG_NOUTRO_SEPARADOR }); vigiarOutro(); }
    throw new Error("Já está a gravar noutro separador deste browser. Continue lá, ou feche esse separador para continuar aqui.");
  }
  if (g.negocio !== null && g.negocio !== a.negocio && (g.estado === "a_ouvir" || g.estado === "a_ligar")) {
    throw new Error(`Já está a gravar outro negócio (${g.nome}). Termine essa gravação primeiro.`);
  }
  const mesma = continuar && g.negocio === a.negocio;
  pedaco = []; cortadoEm = null;
  // 20/11 (auditoria): ao continuar a mesma gravação, as falas que esperavam por «Tentar outra vez» ficam e vão já (antes perdiam-se sem aviso)
  if (!mesma) { porRepetir = []; blocosPorRepetir = []; revistos = []; falasVad = []; }
  donoAtual = ID_SEPARADOR; pararVigia();
  mudar({ ...a, estado: "a_ligar", msg: "A pedir o microfone...", falhadas: falhadasAgora(), pendentes: mesma ? g.pendentes : 0, noutroSeparador: false, pedeToque: false,
    ...(mesma ? { pausas: g.pausas + 1, inicioEm: g.inicioEm ?? Date.now() } : { falas: [], inicioEm: Date.now(), pausas: 0 }) }, true);
  ligarBatimento();
  if (mesma && falhadasAgora()) reenviarFalhadas();
  try {
    await ligarMicrofone();
    soltarEcra = await ecraAceso();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    // 20/11 (auditoria): depois de recarregar sozinha, sem toque, o Safari pode deixar o som em pausa. Não se finge que grava: pede-se o toque.
    if (!(await somLigado())) {
      mudar({ estado: "interrompida", pedeToque: true, aFalar: false, msg: "A página recarregou e o browser pôs o som em pausa. Toque para continuar a gravar." }, true);
      mudarNivel(0);
      return;
    }
    mudar({ estado: "a_ouvir", msg: "" }, true);
  } catch (e) {
    // o que já se ouviu nesta tentativa (se o microfone chegou a ligar) entrega-se
    await desligarMicrofone(true);
    pararBatimento();
    const estado: EstadoGravacao = mesma || g.falas.length ? "interrompida" : "parado";
    // 18/11 (Rúben: «preciso de gravar a chamada… quando clico não faz nada»): o separador ficou aberto durante um deploy e o pedaço do
    // VAD já não existe no servidor. Em vez de pedir F5, recarrega sozinha e começa a gravar mal a página volte (uma vez só).
    if (e instanceof AppAtualizada) {
      // 20/11 (auditoria): o recarregar perdia o que ainda estava na fila (uma fala, o último bloco). Primeiro entrega-se tudo.
      mudar({ msg: "A app foi atualizada: a acabar de transcrever antes de recarregar a página..." });
      const entregue = await entregarPendentes(ENTREGAR_ANTES_DE_RECARREGAR_MS);
      if (entregue && recarregarParaGravar(a, continuar)) {
        mudar({ estado, msg: "A app foi atualizada: a recarregar a página para começar a gravar..." }, true);
        return;
      }
      if (!entregue) {
        const m = "A app foi atualizada, mas há partes da conversa por transcrever (sem rede?). Toque em «Tentar outra vez» e, depois, recarregue a página (F5).";
        mudar({ estado, falhadas: falhadasAgora(), msg: m }, true);
        throw new AppAtualizada(m);
      }
    }
    mudar({ estado, msg: (e instanceof AppAtualizada ? "" : "Sem acesso ao microfone: ") + (e as Error).message }, true);
    throw e;
  }
}

/** O som está a correr (os AudioContext do nível/VAD e da captura). Se não, tenta retomá-lo; sem toque, o Safari deixa o resume() pendurado. */
async function somLigado(): Promise<boolean> {
  const cs = [ctxAudio, ctxCaptura].filter((c): c is AudioContext => !!c);
  if (cs.every((c) => c.state === "running")) return true;
  await Promise.race([Promise.all(cs.map((c) => (c.state === "running" ? null : c.resume().catch(() => undefined)))), esperar(800)]);
  return cs.every((c) => c.state === "running");
}
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 20/11: o toque que liga o som depois de recarregar. Chama-se dentro do clique (o resume() vai antes de qualquer espera). */
export async function continuarComToque(): Promise<void> {
  if (!g.pedeToque) return;
  const cs = [ctxAudio, ctxCaptura].filter((c): c is AudioContext => !!c);
  const pedidos = cs.map((c) => c.resume().catch(() => undefined));
  await Promise.race([Promise.all(pedidos), esperar(1500)]);
  if (vad && cs.length && cs.every((c) => c.state === "running")) {
    mudar({ estado: "a_ouvir", pedeToque: false, msg: "" }, true);
    ligarBatimento();
    return;
  }
  // não voltou: liga-se tudo outra vez, com este toque
  await desligarMicrofone(true);
  mudar({ pedeToque: false });
  if (g.negocio !== null) await iniciarGravacao({ negocio: g.negocio, nome: g.nome, modo: g.modo, voltar: g.voltar }, true);
}

/** 20/11: antes de recarregar, espera pelas falas e pelos blocos na fila e manda outra vez os que falharam. true: não ficou nada por entregar. */
const ENTREGAR_ANTES_DE_RECARREGAR_MS = 60_000;
async function entregarPendentes(limiteMs: number): Promise<boolean> {
  if (falhadasAgora()) reenviarFalhadas();
  const limite = Date.now() + limiteMs;
  for (;;) {
    await fila;
    await filaBlocos;
    if ((agendadas === 0 && blocosAgendados === 0) || Date.now() > limite) break;
    await esperar(500);
  }
  await fila;
  await filaBlocos;
  return agendadas === 0 && blocosAgendados === 0 && falhadasAgora() === 0;
}

// ---- 18/11: depois de um deploy, recarregar e continuar ----------------------------------------------------
const CHAVE_RETOMAR = "olyvia-gravar-depois-de-recarregar";
const RETOMAR_MS = 60_000;
/** Guarda o pedido e recarrega a página. False se já se recarregou há pouco por isto (não entra em ciclo). */
export function recarregarParaGravar(a: Abrir, continuar: boolean, recarregar: () => void = () => window.location.reload()): boolean {
  try {
    const antes = JSON.parse(sessionStorage.getItem(CHAVE_RETOMAR) ?? "null") as { em?: number } | null;
    if (antes?.em && Date.now() - antes.em < RETOMAR_MS) { sessionStorage.removeItem(CHAVE_RETOMAR); return false; }
    sessionStorage.setItem(CHAVE_RETOMAR, JSON.stringify({ a, continuar, em: Date.now() }));
  } catch { return false; }
  recarregar();
  return true;
}
/** Na página nova: se ficou um pedido de gravar há menos de RETOMAR_MS, começa (com a autorização do micro já dada não precisa de toque). */
export function retomarDepoisDeRecarregar(): void {
  let p: { a: Abrir; continuar: boolean; em: number } | null = null;
  try { p = JSON.parse(sessionStorage.getItem(CHAVE_RETOMAR) ?? "null"); } catch { return; }
  if (!p?.a || Date.now() - p.em > RETOMAR_MS) { try { sessionStorage.removeItem(CHAVE_RETOMAR); } catch { /* */ } return; }
  // fica a marca até a gravação arrancar: se voltar a falhar logo, o recarregar seguinte vê-a e não entra em ciclo
  void iniciarGravacao(p.a, p.continuar).then(() => { try { sessionStorage.removeItem(CHAVE_RETOMAR); } catch { /* */ } }, () => undefined);
}
if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") setTimeout(retomarDepoisDeRecarregar, 0);

/** Parar o microfone, esperar pelas últimas transcrições e devolver as falas. A gravação fica «terminada» até se descartar. */
export async function terminarGravacao(): Promise<Fala[]> {
  donoAtual = ID_SEPARADOR; pararVigia();
  mudar({ estado: "a_terminar", msg: "A acabar de transcrever...", aFalar: false, pedeToque: false, noutroSeparador: false });
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
  mudar({ estado: "terminada", msg: "" }, true); mudarNivel(0);
  pararBatimento();
  return g.falas;
}

/** 12/11 (Rúben: «ter aqui o botão para iniciar gravação e o botão para parar»): parar o microfone sem terminar a gravação. As falas
 *  ficam, o que já se ouviu acaba de ser transcrito, e o «Continuar» retoma a mesma gravação. O «Terminar» continua no painel do negócio. */
export async function pausarGravacao(): Promise<void> {
  if (g.estado !== "a_ouvir" && g.estado !== "a_ligar") return;
  document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  soltarEcra?.(); soltarEcra = null;
  // o estado muda antes de desligar: o «ended» das pistas não volta a ligar o microfone
  mudar({ estado: "interrompida", aFalar: false, msg: "Gravação parada. As falas estão guardadas: carregue em Continuar para gravar mais." }, true); mudarNivel(0);
  pararBatimento();
  await desligarMicrofone(true);
}

/** As falas que falharam (sem rede): mandar outra vez. */
export function repetirFalhadas() {
  reenviarFalhadas();
  mudar({ msg: "" });
}
function reenviarFalhadas() {
  const lista = porRepetir; porRepetir = [];
  const blocos = blocosPorRepetir; blocosPorRepetir = [];
  mudar({ falhadas: 0 });
  for (const x of lista) transcrever(x.pcm, x.inicio, ESPERAS.length - 1);
  for (const x of blocos) mandarBloco(x.pcm, x.inicio, ESPERAS.length);
}

/** Esquecer a gravação (depois de guardada no negócio). */
export function descartarGravacao() {
  // 20/11: a gravação de outro separador que ainda grava não se apaga daqui
  if (outroVivo()) return;
  porRepetir = []; pedaco = []; blocosPorRepetir = []; revistos = []; falasVad = []; bloco = null;
  pararBatimento(); pararVigia();
  if (donoAtual === ID_SEPARADOR) { try { localStorage.removeItem(CHAVE_BATIMENTO); } catch { /* */ } }
  g = { ...VAZIA }; donoAtual = null; guardadoDono = null; guardadoEstado = "parado";
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
export function _repor() {
  // tudo desligado (relógios, ouvintes, microfone): sem isto um relógio real ficava a correr e o worker dos testes não acabava
  if (relogioNivel) { window.clearInterval(relogioNivel); relogioNivel = null; }
  void desligarMicrofone(false);
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  soltarEcra = null; aReligar = false; cortadoEm = null;
  if (fechaPedaco) { window.clearTimeout(fechaPedaco); fechaPedaco = null; }
  try { localStorage.removeItem(CHAVE_BATIMENTO); } catch { /* */ }
  descartarGravacao(); pararBatimento(); pararVigia();
  fila = Promise.resolve(); agendadas = 0; filaBlocos = Promise.resolve(); blocosAgendados = 0; semBlocos = false; ultimoBatimento = 0;
}
/** Só para os testes: o id deste separador e o aviso de que outro separador mexeu na gravação (o evento «storage»). */
export const _idSeparador = () => ID_SEPARADOR;
export const _outroSeparadorMudou = (chave: string | null) => aoMudarNoutroSeparador(chave);
/** Só para os testes: o som contínuo a chegar, como o worklet o manda. */
export const _chegouAudio = (i16: Int16Array) => chegouAudio(i16);
export const _ligarBlocos = (inicio = 0) => { bloco = { partes: [], n: 0, inicio }; };
export const _fecharBloco = () => fecharBloco();
