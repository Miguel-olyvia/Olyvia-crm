/**
 * A visualização de um anexo sensível dentro da página, delegando ao hook real
 * que carrega via URL assinado do Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useVisualizacaoAnexo as useVisualizacaoAnexoReal } from "@/hooks/useVisualizacaoAnexo";

export type { EstadoVisualizacao } from "@/hooks/useVisualizacaoAnexo";
export { DURACAO_VISUALIZACAO_MS } from "@/hooks/useVisualizacaoAnexo";

import type { UrlAnexo } from "@/lib/hr/anexoUrl";

interface Opcoes {
  anexoId: string | null;
  obterUrl: (anexoId: string) => Promise<UrlAnexo>;
  aoExpirar: () => void;
}

export function useVisualizacaoAnexo(opcoes: Opcoes) {
  return useVisualizacaoAnexoReal(opcoes);
}
