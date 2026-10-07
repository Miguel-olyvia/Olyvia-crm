/**
 * Pre-visualizacao LOCAL de uma imagem escolhida, antes de ela ser enviada.
 *
 * O ficheiro nunca sai do browser aqui: o URL de objecto e so para um `<img>`.
 * Revoga-se ao trocar de ficheiro e ao desmontar, para a memoria nao ficar presa.
 * So PNG e JPEG (os tipos que os anexos aceitam); um PDF, ou qualquer outro tipo
 * (SVG incluido), nao tem pre-visualizacao.
 */
import { useEffect, useState } from "react";

const MIMES_COM_PREVIEW: readonly string[] = ["image/png", "image/jpeg"];

export function usePreviewLocal(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !MIMES_COM_PREVIEW.includes(file.type) || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    const criado = URL.createObjectURL(file);
    setUrl(criado);
    return () => {
      URL.revokeObjectURL(criado);
      setUrl(null);
    };
  }, [file]);

  return url;
}
