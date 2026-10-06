import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import qrcode from "qrcode-generator";
import { Button, Modal } from "./ui";
import { OperacaoMark } from "./icons";
import { urlChegada } from "../lib/chegadas";

/**
 * O QR da porta da obra: aponta-se a câmara do telemóvel, abre a obra e
 * oferece "Registar chegada". O QR é gerado aqui no browser (nada sai para
 * fora) e desenhado em SVG — imprime nítido em qualquer tamanho.
 */

/** O QR como SVG (quadrados escuros num só path), com margem de 4 módulos. */
export function QrSvg({ texto, className, titulo }: { texto: string; className?: string; titulo?: string }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(texto, "Byte");
    qr.make();
    const k = qr.getModuleCount();
    let p = "";
    for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) if (qr.isDark(y, x)) p += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { n: k + 8, d: p };
  }, [texto]);
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      className={className}
      role="img"
      aria-label={titulo ?? `Código QR: ${texto}`}
      shapeRendering="crispEdges"
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#0f172a" />
    </svg>
  );
}

export interface ObraParaQr {
  codigo: string;
  titulo: string;
  morada: string | null;
}

/** A folha (A6) que se cola na porta. Também é a pré-visualização. */
export function CartaoQr({ obra, url }: { obra: ObraParaQr; url: string }) {
  return (
    <div className="cartao-qr flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-center text-slate-900">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand">
        <OperacaoMark width={20} height={20} /> Olyvia · Operações
      </div>
      <div>
        <p className="font-mono text-2xl font-bold tracking-tight">{obra.codigo}</p>
        <p className="mt-0.5 text-sm font-medium">{obra.titulo}</p>
        {obra.morada && <p className="mt-0.5 text-xs text-slate-500">{obra.morada}</p>}
      </div>
      <QrSvg texto={url} className="h-48 w-48" titulo={`QR da obra ${obra.codigo}`} />
      <p className="max-w-[16rem] text-xs leading-snug text-slate-600">
        <b>Equipa:</b> aponta a câmara do telemóvel a este código. Abre a obra e regista a tua chegada.
      </p>
      <p className="text-[10px] text-slate-400">Não retirar até ao fim da obra.</p>
    </div>
  );
}

export default function ObraQr({ obra, aoFechar }: { obra: ObraParaQr; aoFechar: () => void }) {
  const url = urlChegada(obra.codigo);
  const [copiado, setCopiado] = useState(false);
  const [aImprimir, setAImprimir] = useState(false);

  // Imprimir só a folha: o resto da app esconde-se enquanto o diálogo de
  // impressão está aberto (ver .qr-impressao em index.css).
  useEffect(() => {
    if (!aImprimir) return;
    document.body.classList.add("imprimir-qr");
    const fim = () => {
      document.body.classList.remove("imprimir-qr");
      setAImprimir(false);
    };
    window.addEventListener("afterprint", fim);
    const id = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("afterprint", fim);
      document.body.classList.remove("imprimir-qr");
    };
  }, [aImprimir]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <>
      <Modal
        title={`QR da obra — ${obra.codigo}`}
        onClose={aoFechar}
        footer={
          <>
            <Button variant="secondary" onClick={() => void copiar()}>
              {copiado ? "Link copiado" : "Copiar link"}
            </Button>
            <Button onClick={() => setAImprimir(true)}>Imprimir</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Imprime e cola na porta (ou na entrada) da obra. Quem está numa tarefa desta obra lê o código, abre as suas
            tarefas e regista a chegada — o relógio da primeira tarefa do dia começa sozinho.
          </p>
          <div className="flex justify-center">
            <CartaoQr obra={obra} url={url} />
          </div>
          <p className="break-all text-center font-mono text-[11px] text-slate-400">{url}</p>
        </div>
      </Modal>
      {createPortal(
        <div className="qr-impressao" aria-hidden="true">
          <CartaoQr obra={obra} url={url} />
        </div>,
        document.body
      )}
    </>
  );
}
