/**
 * Leitor de códigos pela câmara (partilhado).
 *
 * Folha em ecrã inteiro no telemóvel (diálogo centrado em ecrãs maiores) que
 * abre a câmara traseira e entrega cada código lido a `onScan`. Fica aberta
 * para ler vários códigos seguidos (modo contínuo) até o utilizador fechar.
 *
 * Motor de leitura: `BarcodeDetector` nativo quando o browser o tem e suporta
 * os formatos principais (Chrome Android) — rápido e sem descarregar nada; em
 * qualquer outro caso, ou se o nativo falhar repetidamente, @zxing/browser
 * (carregado só quando é preciso).
 *
 * Garantias:
 * - A stream é SEMPRE parada ao fechar, ao desmontar e quando o separador fica
 *   escondido (visibilitychange/pagehide); retoma sozinha ao voltar.
 * - A permissão só é pedida depois de o utilizador abrir o leitor (clique).
 * - Contexto inseguro (http por IP) é detetado antes de pedir a câmara.
 * - O mesmo código não é entregue duas vezes seguidas: é ignorado durante
 *   `repeatCooldownMs` depois de aceite e enquanto continuar à vista da câmara
 *   (tem de sair do enquadramento pelo menos `repeatGapMs`). Sem isto, um
 *   código parado à frente da câmara somava uma leitura a cada segundo e meio.
 * - Só conta o código cujo centro está dentro da mira desenhada (convertida para
 *   coordenadas do frame, com object-fit: cover). Com dois códigos diferentes
 *   dentro da mira (ex.: EAN-13 + Code128 da ref. do fornecedor na mesma caixa)
 *   nenhum conta e aparece "Aponta só a um código" — antes somava 2.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { IScannerControls } from "@zxing/browser";
import { CameraOff, Flashlight, FlashlightOff, Loader2, RefreshCw, SwitchCamera, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface CameraScannerLabels {
  title: string;
  description: string;
  hint: string;
  /** Legenda por baixo da mira. */
  aimCaption: string;
  /** Mais do que um código diferente dentro da mira — nenhum é aceite. */
  multipleCodes: string;
  close: string;
  retry: string;
  starting: string;
  paused: string;
  lastRead: string;
  readCount: (n: number) => string;
  torchOn: string;
  torchOff: string;
  switchCamera: string;
  soundOn: string;
  soundOff: string;
  errorInsecure: string;
  errorUnsupported: string;
  errorPermission: string;
  errorNotFound: string;
  errorBusy: string;
  errorInterrupted: string;
  errorGeneric: string;
}

const DEFAULT_LABELS: CameraScannerLabels = {
  title: "Ler com a câmara",
  description: "Aponta a câmara traseira ao código de barras ou QR. Cada código lido é enviado de imediato.",
  hint: "Põe um só código dentro do retângulo — o que fica fora não é lido.",
  aimCaption: "Só é lido o código dentro do retângulo",
  multipleCodes: "Aponta só a um código — há mais do que um dentro do retângulo.",
  close: "Fechar",
  retry: "Tentar de novo",
  starting: "A abrir a câmara…",
  paused: "Câmara em pausa enquanto a página está escondida.",
  lastRead: "Lido:",
  readCount: (n) => `${n} ${n === 1 ? "leitura" : "leituras"} nesta sessão`,
  torchOn: "Ligar a lanterna",
  torchOff: "Desligar a lanterna",
  switchCamera: "Trocar de câmara",
  soundOn: "Ligar o som de leitura",
  soundOff: "Desligar o som de leitura",
  errorInsecure:
    "A câmara só funciona em https. Abre a aplicação pelo endereço https (o site publicado) em vez de http ou de um endereço IP.",
  errorUnsupported: "Este browser não permite usar a câmara. Experimenta o Chrome (Android) ou o Safari (iPhone).",
  errorPermission: "Sem acesso à câmara. Permite o acesso à câmara nas definições do browser e tenta de novo.",
  errorNotFound: "Não foi encontrada nenhuma câmara neste dispositivo.",
  errorBusy: "A câmara está a ser usada por outra aplicação. Fecha essa aplicação e tenta de novo.",
  errorInterrupted: "A câmara foi interrompida.",
  errorGeneric: "Não foi possível iniciar a câmara.",
};

export interface CameraScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe cada código lido (já sem espaços nas pontas e sem repetições seguidas). */
  onScan: (code: string) => void;
  /** Contínuo (por omissão): fica aberto para ler vários. Falso: fecha à primeira leitura. */
  continuous?: boolean;
  /** Mesmo código aceite há menos do que isto é ignorado. */
  repeatCooldownMs?: number;
  /** O mesmo código só volta a contar depois de sair da vista da câmara durante isto. */
  repeatGapMs?: number;
  /** Feedback adicional do ecrã que usa o leitor (ex.: estado da fila, último resultado). */
  status?: ReactNode;
  labels?: Partial<CameraScannerLabels>;
  /** Passado ao diálogo — ex.: devolver o foco a um campo ao fechar. */
  onCloseAutoFocus?: (event: Event) => void;
}

type ErrorKind = "insecure" | "unsupported" | "permission" | "notfound" | "busy" | "interrupted" | "generic";

/**
 * Dois códigos diferentes dentro da mira com menos do que isto entre eles contam
 * como "vários códigos" (o zxing só devolve um por frame e pode alternar). A
 * leitura fica bloqueada até a mira ficar vazia durante este tempo.
 */
const AIM_CONFLICT_MS = 400;

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "data_matrix", "itf"];
const NATIVE_INTERVAL_MS = 120;
const NATIVE_MAX_CONSECUTIVE_ERRORS = 3;
const SEEN_PRUNE_MS = 10_000;
const DEVICE_STORAGE_KEY = "olyvia.cameraScanner.deviceId";
const SOUND_STORAGE_KEY = "olyvia.cameraScanner.sound";

// ── BarcodeDetector nativo (tipos mínimos: não está no lib.dom do TS) ──
interface DetectedBarcodeLike {
  rawValue: string;
  boundingBox?: DOMRectReadOnly;
  cornerPoints?: ReadonlyArray<{ x: number; y: number }>;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcodeLike[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

let nativeDetectorPromise: Promise<BarcodeDetectorLike | null> | null = null;
/** Passa a verdadeiro se o nativo falhar em uso — a partir daí só zxing. */
let nativeBroken = false;

function getNativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (nativeBroken) return Promise.resolve(null);
  if (!nativeDetectorPromise) {
    nativeDetectorPromise = (async () => {
      const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (typeof Ctor !== "function" || typeof Ctor.getSupportedFormats !== "function") return null;
      try {
        const supported = await Ctor.getSupportedFormats();
        // Sem os formatos principais (ex.: Chrome no Windows devolve []) não vale a pena.
        if (!supported.includes("ean_13") || !supported.includes("code_128")) return null;
        return new Ctor({ formats: NATIVE_FORMATS.filter((f) => supported.includes(f)) });
      } catch {
        return null;
      }
    })();
  }
  return nativeDetectorPromise.then((d) => (nativeBroken ? null : d));
}

/** Retângulo em píxeis do frame do vídeo (videoWidth × videoHeight). */
interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Point {
  x: number;
  y: number;
}
/** Um código lido num frame e o seu centro em píxeis do frame (null = motor não deu geometria). */
interface FrameHit {
  code: string;
  center: Point | null;
}

/** Proporções e limites da mira desenhada (h-[38%] max-h-56 w-[82%] max-w-sm) — só para o recurso sem medição. */
const AIM_W_FRACTION = 0.82;
const AIM_H_FRACTION = 0.38;
const AIM_MAX_W_PX = 384;
const AIM_MAX_H_PX = 224;

/**
 * Converte a mira desenhada no ecrã para coordenadas do frame do vídeo.
 *
 * O <video> usa object-fit: cover — o frame (vw × vh) é escalado por
 * s = max(W / vw, H / vh) para cobrir a caixa W × H do elemento e centrado, por
 * isso sobra (W − vw·s)/2 ≤ 0 à esquerda e (H − vh·s)/2 ≤ 0 em cima (partes do
 * frame cortadas fora do ecrã). Um ponto (ex, ey) do elemento corresponde ao
 * ponto ((ex − ox)/s, (ey − oy)/s) do frame. Usa o retângulo real da mira
 * (getBoundingClientRect) para bater certo com o que o operador vê; sem ele,
 * recalcula-o com as mesmas regras do CSS.
 */
function computeAimRect(video: HTMLVideoElement, aimEl: HTMLElement | null): FrameRect | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const el = video.getBoundingClientRect();
  if (el.width <= 0 || el.height <= 0) {
    // Elemento sem caixa (a abrir/escondido): mira central nas mesmas proporções do frame.
    const w = vw * AIM_W_FRACTION;
    const h = vh * AIM_H_FRACTION;
    return { x: (vw - w) / 2, y: (vh - h) / 2, width: w, height: h };
  }
  let left: number;
  let top: number;
  let width: number;
  let height: number;
  const measured = aimEl?.getBoundingClientRect();
  if (measured && measured.width > 0 && measured.height > 0) {
    left = measured.left - el.left;
    top = measured.top - el.top;
    width = measured.width;
    height = measured.height;
  } else {
    width = Math.min(el.width * AIM_W_FRACTION, AIM_MAX_W_PX);
    height = Math.min(el.height * AIM_H_FRACTION, AIM_MAX_H_PX);
    left = (el.width - width) / 2;
    top = (el.height - height) / 2;
  }
  const s = Math.max(el.width / vw, el.height / vh);
  const ox = (el.width - vw * s) / 2;
  const oy = (el.height - vh * s) / 2;
  const x0 = Math.max(0, (left - ox) / s);
  const y0 = Math.max(0, (top - oy) / s);
  const x1 = Math.min(vw, (left + width - ox) / s);
  const y1 = Math.min(vh, (top + height - oy) / s);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Códigos (distintos) com o centro dentro da mira. Sem geometria do motor só se
 * aceita se for o único código do frame (não há como ver onde está).
 */
function codesInAim(hits: FrameHit[], aim: FrameRect | null): string[] {
  const valid = hits.filter((h) => h.code.trim());
  const out = new Set<string>();
  for (const h of valid) {
    const c = h.center;
    const inside = c
      ? !!aim && c.x >= aim.x && c.x <= aim.x + aim.width && c.y >= aim.y && c.y <= aim.y + aim.height
      : valid.length === 1;
    if (inside) out.add(h.code.trim());
  }
  return [...out];
}

function nativeCenter(b: DetectedBarcodeLike): Point | null {
  const box = b.boundingBox;
  if (box && box.width > 0 && box.height > 0) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pts = b.cornerPoints;
  if (pts && pts.length > 0) {
    return {
      x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
      y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
    };
  }
  return null;
}

type StopFn = () => void;
type FrameFn = (codesInsideAim: string[]) => void;
type AimFn = () => FrameRect | null;

/** Reinícios do zxing seguidos (sem nenhum frame são pelo meio) antes de desistir. */
const ZXING_MAX_RESTARTS = 3;
const ZXING_RESTART_DELAY_MS = 250;
const ORIENTATION_CHECK_MS = 600;

/**
 * zxing sobre o <video>. A biblioteca cria o canvas com o tamanho do vídeo no
 * arranque e desenha o frame 1:1 — ao rodar o telemóvel (videoWidth/Height
 * trocam) passa a ler um frame cortado, por isso reinicia a leitura quando as
 * dimensões mudam. Erros que param o ciclo interno (tudo o que não seja
 * NotFound/Checksum/Format) também reiniciam, até ZXING_MAX_RESTARTS.
 */
async function startZxing(
  video: HTMLVideoElement,
  onFrame: FrameFn,
  getAim: AimFn,
  isCancelled: () => boolean,
  onFatal: (err: unknown) => void,
): Promise<StopFn> {
  const [{ BrowserMultiFormatReader }, lib] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const F = lib.BarcodeFormat;
  const hints = new Map<import("@zxing/library").DecodeHintType, unknown>([
    [
      lib.DecodeHintType.POSSIBLE_FORMATS,
      [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE, F.DATA_MATRIX, F.ITF],
    ],
  ]);
  // delayBetweenScanSuccess curto (omissão: 500 ms): um código parado à frente
  // da câmara continua a ser "visto" a cada ~100 ms, por isso o filtro de
  // repetição (repeatGapMs) reconhece-o como o mesmo e não o volta a contar.
  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 100 });

  let stopped = false;
  let controls: IScannerControls | null = null;
  let generation = 0;
  let failures = 0;
  let startedW = 0;
  let startedH = 0;
  let restartTimer: number | undefined;
  let orientationTimer: number | undefined;
  const dead = () => stopped || isCancelled();

  const scheduleRestart = () => {
    if (restartTimer !== undefined) window.clearTimeout(restartTimer);
    restartTimer = window.setTimeout(() => {
      restartTimer = undefined;
      if (!dead()) void run();
    }, ZXING_RESTART_DELAY_MS);
  };

  const run = async () => {
    const myGen = ++generation;
    controls?.stop();
    controls = null;
    if (dead()) return;
    startedW = video.videoWidth;
    startedH = video.videoHeight;
    const fail = (err: unknown) => {
      if (dead() || myGen !== generation) return;
      failures += 1;
      if (failures > ZXING_MAX_RESTARTS) {
        generation += 1; // invalida este ciclo
        onFatal(err);
        return;
      }
      console.debug(`[CameraScanner] zxing parou — a reiniciar (${failures}/${ZXING_MAX_RESTARTS})`, err);
      scheduleRestart();
    };
    try {
      const c = await reader.decodeFromVideoElement(video, (result, error) => {
        if (dead() || myGen !== generation) return;
        if (result) {
          failures = 0;
          const pts = (result.getResultPoints() ?? []).filter((p) => p != null);
          const center =
            pts.length > 0
              ? {
                  x: pts.reduce((sum, p) => sum + p.getX(), 0) / pts.length,
                  y: pts.reduce((sum, p) => sum + p.getY(), 0) / pts.length,
                }
              : null;
          onFrame(codesInAim([{ code: result.getText(), center }], getAim()));
          return;
        }
        // NotFoundException acontece em quase todos os frames sem código — normal.
        if (!error || error instanceof lib.NotFoundException) {
          failures = 0;
          onFrame([]);
          return;
        }
        // Frame ilegível / checksum: transitórios, o ciclo continua sozinho.
        if (error instanceof lib.ChecksumException || error instanceof lib.FormatException) return;
        // Qualquer outro erro pára o ciclo interno do zxing.
        fail(error);
      });
      if (dead() || myGen !== generation) {
        c.stop();
        return;
      }
      controls = c;
    } catch (err) {
      fail(err);
    }
  };

  const onResize = () => {
    if (dead() || !video.videoWidth || !video.videoHeight) return;
    if (video.videoWidth !== startedW || video.videoHeight !== startedH) scheduleRestart();
  };
  // Recurso: alguns browsers não disparam "resize" no <video> ao rodar.
  const onOrientation = () => {
    if (orientationTimer !== undefined) window.clearTimeout(orientationTimer);
    orientationTimer = window.setTimeout(onResize, ORIENTATION_CHECK_MS);
  };
  video.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onOrientation);

  await run();

  return () => {
    stopped = true;
    generation += 1;
    video.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onOrientation);
    if (restartTimer !== undefined) window.clearTimeout(restartTimer);
    if (orientationTimer !== undefined) window.clearTimeout(orientationTimer);
    controls?.stop();
    controls = null;
  };
}

/**
 * Arranca a descodificação sobre um <video> já a reproduzir. Devolve a função
 * que a pára. `onFrame` recebe, por frame analisado, os códigos com o centro
 * dentro da mira. `onFatal` é chamado se não houver motor de leitura possível.
 */
async function startDecoder(
  video: HTMLVideoElement,
  onFrame: FrameFn,
  getAim: AimFn,
  isCancelled: () => boolean,
  onFatal: (err: unknown) => void,
): Promise<StopFn> {
  const native = await getNativeDetector();
  if (!native) return startZxing(video, onFrame, getAim, isCancelled, onFatal);

  let stopped = false;
  let timer: number | undefined;
  let fallbackStop: StopFn | null = null;
  let consecutiveErrors = 0;
  const dead = () => stopped || isCancelled();

  const tick = async () => {
    if (dead()) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const found = await native.detect(video);
        if (dead()) return;
        consecutiveErrors = 0;
        onFrame(
          codesInAim(
            found.map((b) => ({ code: b.rawValue ?? "", center: nativeCenter(b) })),
            getAim(),
          ),
        );
      } catch (err) {
        if (dead()) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= NATIVE_MAX_CONSECUTIVE_ERRORS) {
          console.debug("[CameraScanner] BarcodeDetector falhou — a passar para zxing", err);
          nativeBroken = true;
          try {
            const stop = await startZxing(video, onFrame, getAim, isCancelled, onFatal);
            if (dead()) stop();
            else fallbackStop = stop;
          } catch (zxErr) {
            if (!dead()) onFatal(zxErr);
          }
          return;
        }
      }
    }
    timer = window.setTimeout(() => void tick(), NATIVE_INTERVAL_MS);
  };
  void tick();

  return () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
    fallbackStop?.();
    fallbackStop = null;
  };
}

function classifyError(err: unknown): ErrorKind {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "permission";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "notfound";
  if (name === "NotReadableError" || name === "TrackStartError") return "busy";
  return "generic";
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // já parada
    }
  });
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // modo privado / quota — não crítico
  }
}

export function CameraScanner({
  open,
  onOpenChange,
  onScan,
  continuous = true,
  repeatCooldownMs = 1500,
  repeatGapMs = 800,
  status,
  labels: labelsOverride,
  onCloseAutoFocus,
}: CameraScannerProps) {
  const labels: CameraScannerLabels = { ...DEFAULT_LABELS, ...labelsOverride };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Retângulo da mira desenhado — medido a cada frame para filtrar os códigos. */
  const aimRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<ErrorKind | null>(null);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [deviceId, setDeviceId] = useState<string | undefined>(() => readStorage(DEVICE_STORAGE_KEY) ?? undefined);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readStorage(SOUND_STORAGE_KEY) !== "0");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [readCount, setReadCount] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const [multipleInAim, setMultipleInAim] = useState(false);

  // Callbacks em refs: a stream não reinicia quando o pai volta a renderizar.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const optsRef = useRef({ continuous, repeatCooldownMs, repeatGapMs, soundOn });
  optsRef.current = { continuous, repeatCooldownMs, repeatGapMs, soundOn };

  const seenRef = useRef(new Map<string, { acceptedAt: number; seenAt: number }>());
  /** Estado da mira entre frames: bloqueio por vários códigos e último código visto dentro dela. */
  const aimStateRef = useRef({ locked: false, lastInAimAt: 0, lastCode: null as string | null, lastCodeAt: 0 });
  const multipleInAimRef = useRef(false);
  const flashTimerRef = useRef<number | undefined>(undefined);
  const audioRef = useRef<AudioContext | null>(null);

  /**
   * Cria/retoma o AudioContext dentro de um gesto do utilizador — o iOS Safari
   * só deixa tocar som depois disso. Chamado em qualquer toque no leitor.
   */
  const ensureAudio = useCallback(() => {
    if (!optsRef.current.soundOn) return;
    try {
      if (!audioRef.current) {
        const Ctx =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        audioRef.current = new Ctx();
      }
      if (audioRef.current.state === "suspended") void audioRef.current.resume().catch(() => {});
    } catch {
      // sem áudio — não crítico
    }
  }, []);

  const beep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1760;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // ignorar
    }
  }, []);

  const handleDetected = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const { continuous: cont, repeatCooldownMs: cooldown, repeatGapMs: gap, soundOn: sound } = optsRef.current;
      const now = performance.now();
      const seen = seenRef.current;
      for (const [k, v] of seen) if (now - v.seenAt > SEEN_PRUNE_MS) seen.delete(k);
      const prev = seen.get(code);
      if (prev) {
        const sinceSeen = now - prev.seenAt;
        prev.seenAt = now;
        if (now - prev.acceptedAt < cooldown || sinceSeen < gap) return;
        prev.acceptedAt = now;
      } else {
        seen.set(code, { acceptedAt: now, seenAt: now });
      }

      try {
        navigator.vibrate?.(60);
      } catch {
        // sem vibração (iOS) — ignorar
      }
      if (sound) beep();
      setLastCode(code);
      setReadCount((n) => n + 1);
      setFlashing(true);
      if (flashTimerRef.current !== undefined) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setFlashing(false), 300);

      onScanRef.current(code);
      if (!cont) onOpenChangeRef.current(false);
    },
    [beep],
  );

  const showMultiple = useCallback((value: boolean) => {
    if (multipleInAimRef.current === value) return;
    multipleInAimRef.current = value;
    setMultipleInAim(value);
  }, []);

  /**
   * Um frame analisado: `inAim` são os códigos (distintos) com o centro dentro da
   * mira. Vários → nenhum conta e a leitura fica bloqueada até a mira ficar vazia
   * (AIM_CONFLICT_MS); um → segue para o filtro de repetição.
   */
  const handleFrame = useCallback(
    (inAim: string[]) => {
      const codes = [...new Set(inAim.map((c) => c.trim()).filter(Boolean))];
      const now = performance.now();
      const st = aimStateRef.current;
      if (codes.length === 0) {
        if (st.locked && now - st.lastInAimAt >= AIM_CONFLICT_MS) {
          st.locked = false;
          st.lastCode = null;
          showMultiple(false);
        }
        return;
      }
      st.lastInAimAt = now;
      const single = codes.length === 1 ? codes[0] : null;
      // zxing só devolve um código por frame: dois diferentes muito seguidos = vários à vista.
      const conflict =
        single === null || (st.lastCode !== null && st.lastCode !== single && now - st.lastCodeAt < AIM_CONFLICT_MS);
      if (single !== null) {
        st.lastCode = single;
        st.lastCodeAt = now;
      }
      if (conflict) {
        st.locked = true;
        showMultiple(true);
      }
      if (st.locked || single === null) {
        // Continuam "à vista": não podem contar como nova leitura logo a seguir.
        for (const c of codes) {
          const prev = seenRef.current.get(c);
          if (prev) prev.seenAt = now;
        }
        return;
      }
      handleDetected(single);
    },
    [handleDetected, showMultiple],
  );

  // Nova sessão a cada abertura.
  useEffect(() => {
    if (!open) return;
    seenRef.current.clear();
    aimStateRef.current = { locked: false, lastInAimAt: 0, lastCode: null, lastCodeAt: 0 };
    showMultiple(false);
    setLastCode(null);
    setReadCount(0);
    setFlashing(false);
    // Android Chrome aceita criar o áudio logo (o clique que abriu o leitor conta
    // como ativação); no iOS fica suspenso até ao primeiro toque no leitor.
    ensureAudio();
  }, [open, ensureAudio, showMultiple]);

  // Separador escondido / página a sair → pausa (pára a stream); visível → retoma.
  useEffect(() => {
    if (!open) {
      setPaused(false);
      return;
    }
    const sync = () => setPaused(document.visibilityState === "hidden");
    const onPageHide = () => setPaused(true);
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", sync);
    };
  }, [open]);

  // Câmara: só corre com o leitor aberto e a página visível.
  useEffect(() => {
    if (!open || paused) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let stopDecoder: StopFn | null = null;
    /** <video> a que a stream foi ligada (a ref pode já estar a null na limpeza). */
    let attachedEl: HTMLVideoElement | null = null;
    let endedTrack: MediaStreamTrack | null = null;
    let interrupted = false;
    const isCancelled = () => cancelled;
    /** A câmara parou sem sermos nós (outra app, cabo/driver, o sistema): erro com "Tentar de novo". */
    const onTrackEnded = () => {
      if (cancelled) return;
      interrupted = true;
      console.warn("[CameraScanner] a câmara foi interrompida");
      stopDecoder?.();
      stopDecoder = null;
      setStarting(false);
      setError("interrupted");
    };
    setTorchSupported(false);
    setTorchOn(false);

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setError("insecure");
      setStarting(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      setStarting(false);
      return;
    }

    setError(null);
    setStarting(true);

    const start = async () => {
      try {
        const video: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } };
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        if (cancelled) {
          stopTracks(stream);
          stream = null;
          return;
        }
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        if (track) {
          track.addEventListener("ended", onTrackEnded);
          endedTrack = track;
        }

        const el = videoRef.current;
        if (!el) throw new Error("video element missing");
        // iOS Safari: sem playsinline o vídeo abre em ecrã inteiro nativo; muted
        // permite o play() sem gesto. Ligamos e esperamos o play() nós próprios
        // (verificado na contagem: deixar a biblioteca fazê-lo dava ecrã preto
        // em alguns browsers/drivers).
        el.muted = true;
        el.setAttribute("playsinline", "true");
        el.setAttribute("webkit-playsinline", "true");
        el.srcObject = stream;
        attachedEl = el;
        await el.play();
        if (cancelled) return;

        if (track) {
          try {
            const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
            setTorchSupported(!!caps.torch);
          } catch {
            setTorchSupported(false);
          }
          setActiveDeviceId(track.getSettings?.().deviceId);
        }

        // Os "label" das câmaras só vêm preenchidos depois de a permissão ser dada.
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setDevices(all.filter((d) => d.kind === "videoinput" && d.deviceId));
        } catch {
          // sem lista: só não aparece o botão de trocar
        }
        if (cancelled) return;

        const stop = await startDecoder(
          el,
          handleFrame,
          () => computeAimRect(el, aimRef.current),
          isCancelled,
          (fatal) => {
            console.warn("[CameraScanner] sem motor de leitura", fatal);
            if (cancelled) return;
            setStarting(false);
            setError("generic");
          },
        );
        if (cancelled || interrupted) {
          stop();
          return;
        }
        stopDecoder = stop;
        setStarting(false);
      } catch (err) {
        if (cancelled || interrupted) return;
        console.warn("[CameraScanner] falha ao iniciar a câmara", err);
        stopTracks(stream);
        stream = null;
        const kind = classifyError(err);
        // A câmara escolhida antes deixou de existir: volta à traseira por omissão.
        if (deviceId && kind === "notfound") {
          writeStorage(DEVICE_STORAGE_KEY, null);
          setDeviceId(undefined);
          return;
        }
        setStarting(false);
        setError(kind);
      }
    };

    void start();

    return () => {
      cancelled = true;
      endedTrack?.removeEventListener("ended", onTrackEnded);
      endedTrack = null;
      stopDecoder?.();
      stopDecoder = null;
      stopTracks(stream);
      stream = null;
      trackRef.current = null;
      const el = attachedEl;
      attachedEl = null;
      if (el) {
        try {
          el.pause();
        } catch {
          // ignorar
        }
        el.srcObject = null;
      }
    };
  }, [open, paused, deviceId, retryKey, handleFrame]);

  // Limpeza final (desmontar): temporizador e áudio.
  useEffect(
    () => () => {
      if (flashTimerRef.current !== undefined) window.clearTimeout(flashTimerRef.current);
      void audioRef.current?.close().catch(() => {});
      audioRef.current = null;
    },
    [],
  );

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
      setTorchOn(false);
    }
  };

  const switchCamera = () => {
    if (devices.length < 2) return;
    const current = activeDeviceId ?? deviceId;
    const idx = devices.findIndex((d) => d.deviceId === current);
    const next = devices[(idx + 1) % devices.length];
    if (!next) return;
    writeStorage(DEVICE_STORAGE_KEY, next.deviceId);
    setDeviceId(next.deviceId);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    writeStorage(SOUND_STORAGE_KEY, next ? "1" : "0");
    if (next) {
      optsRef.current.soundOn = true;
      ensureAudio();
    }
  };

  const errorText =
    error === "insecure"
      ? labels.errorInsecure
      : error === "unsupported"
        ? labels.errorUnsupported
        : error === "permission"
          ? labels.errorPermission
          : error === "notfound"
            ? labels.errorNotFound
            : error === "busy"
              ? labels.errorBusy
              : error === "interrupted"
                ? labels.errorInterrupted
                : error === "generic"
                  ? labels.errorGeneric
                  : null;
  const canRetry = error !== null && error !== "insecure" && error !== "unsupported";
  const live = !error && !starting && !paused;

  const overlayButton =
    "h-11 w-11 rounded-full bg-black/55 p-0 text-white hover:bg-black/75 hover:text-white focus-visible:ring-2 focus-visible:ring-white [&_svg]:size-5";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownCapture={ensureAudio}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-lg sm:border"
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <DialogTitle className="text-base">{labels.title}</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0 [&_svg]:size-5"
            onClick={() => onOpenChange(false)}
            aria-label={labels.close}
          >
            <X />
          </Button>
        </div>
        <DialogDescription className="sr-only">{labels.description}</DialogDescription>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-black sm:aspect-[4/3] sm:flex-none">
          <video
            ref={videoRef}
            className={cn("absolute inset-0 h-full w-full object-cover", !live && "opacity-40")}
            muted
            playsInline
            autoPlay
            aria-hidden
          />

          {/* Mira */}
          {!error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              {/* Medido em computeAimRect: só os códigos com o centro aqui dentro contam. */}
              <div
                ref={aimRef}
                className={cn(
                  "relative h-[38%] max-h-56 w-[82%] max-w-sm rounded-lg border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors duration-150",
                  flashing
                    ? "border-green-400 bg-green-400/15"
                    : multipleInAim
                      ? "border-amber-400"
                      : "border-white/80",
                )}
              >
                {/* Legenda fora do fluxo: não desloca a mira do centro. */}
                <p
                  className={cn(
                    "absolute left-1/2 top-full mt-2 w-max max-w-[min(20rem,90vw)] -translate-x-1/2 rounded-md px-2 py-1 text-center text-xs font-medium",
                    multipleInAim ? "bg-amber-400 text-black" : "bg-black/60 text-white",
                  )}
                >
                  {multipleInAim ? labels.multipleCodes : labels.aimCaption}
                </p>
              </div>
            </div>
          )}

          {/* Estados */}
          {(starting || paused) && !error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="flex items-center gap-2 rounded-md bg-black/70 px-4 py-2 text-sm text-white">
                {!paused && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {paused ? labels.paused : labels.starting}
              </p>
            </div>
          )}
          {errorText && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
              <CameraOff className="h-10 w-10 opacity-80" aria-hidden />
              <p role="alert" className="max-w-sm text-base">
                {errorText}
              </p>
              {canRetry && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 gap-2 px-5"
                  onClick={() => setRetryKey((k) => k + 1)}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  {labels.retry}
                </Button>
              )}
            </div>
          )}

          {/* Controlos sobre o vídeo */}
          {!error && (
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              {torchSupported && (
                <Button
                  type="button"
                  variant="ghost"
                  className={overlayButton}
                  onClick={() => void toggleTorch()}
                  aria-pressed={torchOn}
                  aria-label={torchOn ? labels.torchOff : labels.torchOn}
                  title={torchOn ? labels.torchOff : labels.torchOn}
                >
                  {torchOn ? <FlashlightOff /> : <Flashlight />}
                </Button>
              )}
              {devices.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  className={overlayButton}
                  onClick={switchCamera}
                  aria-label={labels.switchCamera}
                  title={labels.switchCamera}
                >
                  <SwitchCamera />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className={overlayButton}
                onClick={toggleSound}
                aria-pressed={soundOn}
                aria-label={soundOn ? labels.soundOff : labels.soundOn}
                title={soundOn ? labels.soundOff : labels.soundOn}
              >
                {soundOn ? <Volume2 /> : <VolumeX />}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div aria-live="polite" aria-atomic="true" className="min-h-[1.75rem]">
            {lastCode ? (
              <p className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 text-sm text-muted-foreground">{labels.lastRead}</span>
                <span className="min-w-0 break-all font-mono text-lg font-semibold">{lastCode}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{labels.hint}</p>
            )}
            {multipleInAim && live && (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{labels.multipleCodes}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{labels.readCount(readCount)}</p>
          {status && <div className="space-y-1 text-sm">{status}</div>}
          <Button type="button" variant="outline" className="h-11 w-full text-base" onClick={() => onOpenChange(false)}>
            {labels.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CameraScanner;
