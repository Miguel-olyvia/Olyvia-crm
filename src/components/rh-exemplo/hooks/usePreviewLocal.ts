/**
 * Pré-visualização LOCAL de uma imagem escolhida, delegando ao hook real.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { usePreviewLocal as usePreviewLocalReal } from "@/hooks/usePreviewLocal";

export function usePreviewLocal(file: File | null): string | null {
  return usePreviewLocalReal(file);
}
