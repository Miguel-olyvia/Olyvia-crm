/** Ver um anexo sensivel, na apresentacao: a "folha" de exemplo aparece logo, sem pedir nada a ninguem. */
import { useEffect, useState } from "react";
import type { UrlAnexo } from "@/components/rh-exemplo/lib/anexoUrl";

export const DURACAO_VISUALIZACAO_MS = 120_000;

export type EstadoVisualizacao =
  | { fase: "inactivo" }
  | { fase: "a_carregar" }
  | { fase: "erro" }
  | { fase: "pronto"; url: string; mime: string };

interface Opcoes {
  /** O anexo a ver; `null` = nada aberto. */
  anexoId: string | null;
  obterUrl: (anexoId: string) => Promise<UrlAnexo>;
  aoExpirar: () => void;
}

export function useVisualizacaoAnexo({ anexoId, obterUrl, aoExpirar }: Opcoes): EstadoVisualizacao {
  const [estado, setEstado] = useState<EstadoVisualizacao>({ fase: "inactivo" });

  useEffect(() => {
    if (!anexoId) {
      setEstado({ fase: "inactivo" });
      return;
    }
    let cancelado = false;
    setEstado({ fase: "a_carregar" });
    obterUrl(anexoId)
      .then((resposta) => {
        if (!cancelado) setEstado({ fase: "pronto", url: resposta.url, mime: resposta.mime_type ?? "image/svg+xml" });
      })
      .catch(() => {
        if (!cancelado) setEstado({ fase: "erro" });
      });
    const temporizador = setTimeout(aoExpirar, DURACAO_VISUALIZACAO_MS);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [anexoId, obterUrl, aoExpirar]);

  return estado;
}
