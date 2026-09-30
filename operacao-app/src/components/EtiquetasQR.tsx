import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button, Modal } from "./ui";
import { AlertTriangle, Copiar } from "./icons";
import { enderecoDaEtiqueta, serveParaImprimir } from "../domain/etiqueta";
import type { AtivoRow, LocalRow } from "../lib/dados";

/**
 * As etiquetas de um sítio, prontas a imprimir.
 *
 * Cada uma leva o QR, o código e o nome. O QR aponta para a ficha do
 * equipamento — e quem aponta a câmara do telemóvel chega lá sem instalar
 * nada. Ver `domain/etiqueta.ts` para a razão de não haver leitor cá dentro.
 *
 * A folha imprime-se pelo browser, como o relatório. Não vale um gerador de
 * PDF só para pôr quadrados numa grelha.
 */

interface Etiqueta {
  codigo: string;
  nome: string;
  url: string;
  imagem: string;
}

export default function EtiquetasQR({
  local,
  ativos,
  aoFechar,
}: {
  local: LocalRow;
  ativos: readonly AtivoRow[];
  aoFechar: () => void;
}) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const origem = typeof window === "undefined" ? "" : window.location.origin;
  // `import.meta.env` só existe quando é o Vite a construir. Ler à bruta
  // rebenta o componente inteiro fora dele — e a base é só um prefixo.
  const base = (import.meta.env as { BASE_URL?: string } | undefined)?.BASE_URL ?? "/";
  const podeImprimir = serveParaImprimir(origem);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const fora: Etiqueta[] = [];
        for (const a of ativos) {
          const url = enderecoDaEtiqueta(origem, base, a.codigo);
          // `M` corrige até 15% de sujidade ou riscos — uma etiqueta colada
          // numa casa das máquinas apanha as duas coisas.
          const imagem = await QRCode.toDataURL(url, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 320,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
          fora.push({ codigo: a.codigo, nome: a.nome, url, imagem });
        }
        if (vivo) setEtiquetas(fora);
      } catch (e) {
        if (vivo) {
          setErro(e instanceof Error ? e.message : "Não foi possível desenhar as etiquetas.");
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ativos, origem, base]);

  return (
    <Modal
      title={`Etiquetas de ${local.nome}`}
      onClose={aoFechar}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Fechar
          </Button>
          <Button onClick={() => window.print()} disabled={!etiquetas || !podeImprimir}>
            Imprimir
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Um erro caro: descobre-se depois de colar trezentos autocolantes. */}
        {!podeImprimir && (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-800 print:hidden">
            <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
            <span>
              Estás a ver isto em <strong>{origem}</strong>. As etiquetas ficariam a apontar para
              esse endereço, e no telemóvel do técnico não abririam nada. Imprime a partir do
              endereço a sério da aplicação.
            </span>
          </p>
        )}

        <p className="text-xs leading-relaxed text-slate-500 print:hidden">
          Cola uma em cada equipamento. Quem apontar a câmara do telemóvel — Android ou iPhone —
          abre a ficha dele, com o histórico e o botão para abrir uma ordem. Não é preciso
          instalar nada.
        </p>

        {erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
        )}

        {etiquetas === null ? (
          <p className="py-8 text-center text-sm text-slate-400">A desenhar as etiquetas…</p>
        ) : etiquetas.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Este local ainda não tem equipamentos.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-4 print:gap-2">
            {etiquetas.map((e) => (
              <figure
                key={e.codigo}
                className="flex break-inside-avoid flex-col items-center rounded-lg border border-slate-200 p-2 text-center"
              >
                <img src={e.imagem} alt="" className="h-24 w-24" />
                <figcaption className="mt-1 w-full">
                  <span className="block truncate font-mono text-[10px] text-slate-500">
                    {e.codigo}
                  </span>
                  <span className="block truncate text-[11px] font-medium text-slate-800">
                    {e.nome}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {etiquetas && etiquetas.length > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400 print:hidden">
            <Copiar width={12} height={12} />
            {etiquetas.length === 1
              ? "1 etiqueta"
              : `${etiquetas.length} etiquetas`}{" "}
            · imprime em folha de autocolantes A4
          </p>
        )}
      </div>
    </Modal>
  );
}
