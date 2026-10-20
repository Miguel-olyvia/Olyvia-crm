// O levantamento livre da ficha (o que o painel «Visita e levantamento» edita), no formato que o plano de gravação compara.
import { adaptarRegistos } from "./adaptarRegistos";
import type { FichaDb } from "./fichaTipos";
import type { LevantamentoLivre } from "./planoLevantamento";

/**
 * O levantamento mais recente (por data; a igual data, a ordem da base) que não está ligado a nenhum negócio, como o `valoresIniciaisDosRegistos` o
 * escolhe para abrir o painel. Um ligado a um negócio nunca se altera. `null` sem nenhum.
 */
export function levantamentoLivreDaFicha(ficha: FichaDb): LevantamentoLivre | null {
  const livre = [...adaptarRegistos(ficha).levantamentos].filter((l) => l.negocioId === null).sort((a, b) => b.data.localeCompare(a.data))[0];
  if (!livre) return null;
  const bruto = ficha.levantamentos?.itens.find((l) => l.id === livre.id);
  const m = bruto?.morada;
  return {
    id: livre.id, rascunho: livre.rascunho, visitaId: livre.visitaId, data: livre.data, estado: bruto?.estado ?? null,
    morada: m ? { rua: m.rua ?? "", codigoPostal: m.codigo_postal ?? "", localidade: m.localidade ?? "", andar: m.andar ?? "" } : null,
  };
}
