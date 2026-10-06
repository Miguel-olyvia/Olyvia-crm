import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Assinatura desenhada com o dedo (ou o rato). Ponteiro único, sem
 * bibliotecas; `touch-action: none` para o dedo não fazer scroll à página.
 *
 * Exporta JPEG com fundo branco: é o que o PDF do auto embebe tal e qual
 * (DCTDecode), sem converter nada.
 */
export interface AssinaturaHandle {
  vazia: () => boolean;
  limpar: () => void;
  /** JPEG da assinatura, com as dimensões em píxeis. */
  exportar: () => Promise<{ blob: Blob; bytes: Uint8Array; largura: number; altura: number } | null>;
}

const AssinaturaCanvas = forwardRef<AssinaturaHandle, { aoMudar?: (vazia: boolean) => void }>(function AssinaturaCanvas(
  { aoMudar },
  ref
) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const aDesenhar = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vazia, setVazia] = useState(true);

  const preparar = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const escala = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    c.width = Math.max(1, Math.round(r.width * escala));
    c.height = Math.max(1, Math.round(r.height * escala));
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(escala, 0, 0, escala, 0, 0);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, r.width, r.height);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#0f172a";
  }, []);

  useEffect(() => {
    preparar();
  }, [preparar]);

  const marcar = (v: boolean) => {
    setVazia(v);
    aoMudar?.(v);
  };

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useImperativeHandle(ref, () => ({
    vazia: () => vazia,
    limpar: () => {
      preparar();
      marcar(true);
    },
    exportar: async () => {
      const c = canvas.current;
      if (!c || vazia) return null;
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.9));
      if (!blob) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { blob, bytes, largura: c.width, altura: c.height };
    },
  }));

  return (
    <canvas
      ref={canvas}
      aria-label="Área para a assinatura do cliente"
      className="h-44 w-full cursor-crosshair rounded-lg border-2 border-dashed border-slate-300 bg-white sm:h-52"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        aDesenhar.current = true;
        ultimo.current = ponto(e);
      }}
      onPointerMove={(e) => {
        if (!aDesenhar.current) return;
        const g = e.currentTarget.getContext("2d");
        const p = ponto(e);
        if (g && ultimo.current) {
          g.beginPath();
          g.moveTo(ultimo.current.x, ultimo.current.y);
          g.lineTo(p.x, p.y);
          g.stroke();
          if (vazia) marcar(false);
        }
        ultimo.current = p;
      }}
      onPointerUp={() => {
        aDesenhar.current = false;
        ultimo.current = null;
      }}
      onPointerLeave={() => {
        aDesenhar.current = false;
        ultimo.current = null;
      }}
    />
  );
});

export default AssinaturaCanvas;
