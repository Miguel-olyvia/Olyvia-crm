/**
 * Miniaturas de imagens de anexos.
 *
 * - `MiniaturaFotografia`: a fotografia GUARDADA, por URL assinado (o mesmo
 *   caminho do avatar da ficha: `usePessoaFotografia`, sem registo especial).
 *   Sem URL (a carregar, sem permissao, falha) nao desenha nada.
 * - `MiniaturaLocal`: a pre-visualizacao LOCAL de um ficheiro escolhido e ainda
 *   por enviar (URL de objecto, revogado ao desmontar). So imagens.
 */
import { usePessoaFotografia } from "@/hooks/usePessoaFotografia";
import { usePreviewLocal } from "@/hooks/usePreviewLocal";

const CLASSE = "h-10 w-10 shrink-0 rounded-md border object-cover";

export function MiniaturaFotografia({ anexoId, alt }: { anexoId: string; alt: string }) {
  const url = usePessoaFotografia(anexoId);
  if (!url) return null;
  return <img src={url} alt={alt} data-testid="miniatura-fotografia" className={CLASSE} />;
}

export function MiniaturaLocal({ file, alt }: { file: File | null; alt: string }) {
  const url = usePreviewLocal(file);
  if (!url) return null;
  return <img src={url} alt={alt} data-testid="preview-local" className={CLASSE} />;
}
