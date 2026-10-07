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
  errorGeneric: string;
}

const DEFAULT_LABELS: CameraScannerLabels = {
  title: "Ler com a câmara",
  description: "Aponta a câmara traseira ao código de barras ou QR. Cada código lido é enviado de imediato.",
  hint: "Aponta ao código de barras — um de cada vez.",
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

type ErrorKind = "insecure" | "unsupported" | "permission" | "notfound" | "busy" | "generic";

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

/** Com vários códigos à vista, fica o mais perto do centro (onde está a mira). */
function pickCentered(found: DetectedBarcodeLike[], video: HTMLVideoElement): string | null {
  const valid = found.filter((b) => b.rawValue);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0].rawValue;
  const cx = video.videoWidth / 2;
  const cy = video.videoHeight / 2;
  let best = valid[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const b of valid) {
    const box = b.boundingBox;
    if (!box) continue;
    const d = (box.x + box.width / 2 - cx) ** 2 + (box.y + box.height / 2 - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best.rawValue;
}

type StopFn = () => void;

async function startZxing(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
  isCancelled: () => boolean,
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
  const controls: IScannerControls = await reader.decodeFromVideoElement(video, (result, error) => {
    if (isCancelled()) return;
    if (result) {
      onCode(result.getText());
      return;
    }
    // NotFoundException acontece em quase todos os frames sem código — normal.
    // Outros erros (frame ilegível, checksum) são transitórios: ignorar.
    if (error && !(error instanceof lib.NotFoundException)) {
      console.debug("[CameraScanner] zxing decode error", error);
    }
  });
  return () => controls.stop();
}

/**
 * Arranca a descodificação sobre um <video> já a reproduzir. Devolve a função
 * que a pára. `onFatal` é chamado se não houver motor de leitura possível.
 */
async function startDecoder(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
  isCancelled: () => boolean,
  onFatal: (err: unknown) => void,
): Promise<StopFn> {
  const native = await getNativeDetector();
  if (!native) return startZxing(video, onCode, isCancelled);

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
        const code = pickCentered(found, video);
        if (code) onCode(code);
      } catch (err) {
        if (dead()) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= NATIVE_MAX_CONSECUTIVE_ERRORS) {
          console.debug("[CameraScanner] BarcodeDetector falhou — a passar para zxing", err);
          nativeBroken = true;
          try {
            const stop = await startZxing(video, onCode, isCancelled);
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

  // Callbacks em refs: a stream não reinicia quando o pai volta a renderizar.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const optsRef = useRef({ continuous, repeatCooldownMs, repeatGapMs, soundOn });
  optsRef.current = { continuous, repeatCooldownMs, repeatGapMs, soundOn };

  const seenRef = useRef(new Map<string, { acceptedAt: number; seenAt: number }>());
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

  // Nova sessão a cada abertura.
  useEffect(() => {
    if (!open) return;
    seenRef.current.clear();
    setLastCode(null);
    setReadCount(0);
    setFlashing(false);
    // Android Chrome aceita criar o áudio logo (o clique que abriu o leitor conta
    // como ativação); no iOS fica suspenso até ao primeiro toque no leitor.
    ensureAudio();
  }, [open, ensureAudio]);

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
    const isCancelled = () => cancelled;
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

        const stop = await startDecoder(el, handleDetected, isCancelled, (fatal) => {
          console.warn("[CameraScanner] sem motor de leitura", fatal);
          if (!cancelled) setError("generic");
        });
        if (cancelled) {
          stop();
          return;
        }
        stopDecoder = stop;
        setStarting(false);
      } catch (err) {
        if (cancelled) return;
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
  }, [open, paused, deviceId, retryKey, handleDetected]);

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
              <div
                className={cn(
                  "h-[38%] max-h-56 w-[82%] max-w-sm rounded-lg border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors duration-150",
                  flashing ? "border-green-400 bg-green-400/15" : "border-white/80",
                )}
              />
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
