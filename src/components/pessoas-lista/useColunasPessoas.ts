import { useCallback, useMemo, useState } from "react";
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";
import {
  alternarColuna, colunasVisiveis, guardarColunas, lerColunas, moverColuna, moverParaIndice, reporColunas, type EscolhaColuna,
} from "./colunasPessoas";

/**
 * A escolha de colunas da Lista real, por organização: lida do localStorage, guardada a cada mudança e relida quando a
 * organização muda (a escolha de uma não passa para a outra). Sem organização vale só para esta visita.
 */
export function useColunasPessoas(organizationId: string | null) {
  const [estado, setEstado] = useState(() => ({ org: organizationId, escolha: lerColunas(organizationId) }));
  let atual = estado;
  if (estado.org !== organizationId) {
    atual = { org: organizationId, escolha: lerColunas(organizationId) };
    setEstado(atual);
  }
  const { escolha } = atual;

  const aplicar = useCallback((nova: EscolhaColuna[]) => {
    guardarColunas(organizationId, nova);
    setEstado({ org: organizationId, escolha: nova });
  }, [organizationId]);

  const alternar = useCallback((id: IdColuna) => aplicar(alternarColuna(escolha, id)), [aplicar, escolha]);
  const mover = useCallback((id: IdColuna, delta: number) => aplicar(moverColuna(escolha, id, delta)), [aplicar, escolha]);
  const moverPara = useCallback((id: IdColuna, indice: number) => aplicar(moverParaIndice(escolha, id, indice)), [aplicar, escolha]);
  const repor = useCallback(() => setEstado({ org: organizationId, escolha: reporColunas(organizationId) }), [organizationId]);
  const visiveis = useMemo(() => colunasVisiveis(escolha), [escolha]);

  return { escolha, visiveis, alternar, mover, moverPara, repor };
}
