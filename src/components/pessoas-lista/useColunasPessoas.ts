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

  // Atualização funcional: parte sempre da escolha MAIS RECENTE, e não da do último render. Dois eventos antes do re-render (um duplo clique,
  // teclas em rajada) somam-se em vez de o segundo desfazer o primeiro. Guardar é idempotente (escreve o mesmo valor se o React repetir a função).
  const aplicar = useCallback((mudar: (escolha: readonly EscolhaColuna[]) => EscolhaColuna[]) => {
    setEstado((antes) => {
      const base = antes.org === organizationId ? antes.escolha : lerColunas(organizationId);
      const nova = mudar(base);
      guardarColunas(organizationId, nova);
      return { org: organizationId, escolha: nova };
    });
  }, [organizationId]);

  const alternar = useCallback((id: IdColuna) => aplicar((e) => alternarColuna(e, id)), [aplicar]);
  const mover = useCallback((id: IdColuna, delta: number) => aplicar((e) => moverColuna(e, id, delta)), [aplicar]);
  const moverPara = useCallback((id: IdColuna, indice: number) => aplicar((e) => moverParaIndice(e, id, indice)), [aplicar]);
  const repor = useCallback(() => setEstado({ org: organizationId, escolha: reporColunas(organizationId) }), [organizationId]);
  const visiveis = useMemo(() => colunasVisiveis(escolha), [escolha]);

  return { escolha, visiveis, alternar, mover, moverPara, repor };
}
