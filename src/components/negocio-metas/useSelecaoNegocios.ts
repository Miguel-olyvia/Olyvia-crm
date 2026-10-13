// A seleção de negócios para comparar: pela ordem em que foram escolhidos, no
// máximo 3. O 4.º é recusado: `recusado` fica ligado até a seleção mudar e
// `tentativas` conta as recusas, para a mensagem ser anunciada de cada vez.
import { useCallback, useState } from "react";
import { MAXIMO_COMPARACAO } from "./compararNegocios";

/** O id da barra de seleção (o link "Ir para a seleção" leva o foco até ela). */
export const ID_BARRA_SELECAO = "barra-selecao";

export interface SelecaoNegocios {
  ids: readonly string[];
  /** O último pedido de selecionar mais um negócio foi recusado por já haver 3. */
  recusado: boolean;
  /** Quantas vezes se recusou um 4.º negócio (serve de `key` da mensagem). */
  tentativas: number;
  alternar: (id: string) => void;
  limpar: () => void;
}

interface Estado { ids: readonly string[]; recusado: boolean; tentativas: number }

/** O estado seguinte ao pedido de alternar `id` (pura, para se poder testar sozinha). */
export function alternarSelecao(atual: Estado, id: string): Estado {
  if (atual.ids.includes(id)) return { ...atual, ids: atual.ids.filter((x) => x !== id), recusado: false };
  if (atual.ids.length >= MAXIMO_COMPARACAO) return { ...atual, recusado: true, tentativas: atual.tentativas + 1 };
  return { ...atual, ids: [...atual.ids, id], recusado: false };
}

export function useSelecaoNegocios(): SelecaoNegocios {
  const [estado, setEstado] = useState<Estado>({ ids: [], recusado: false, tentativas: 0 });
  const alternar = useCallback((id: string) => setEstado((e) => alternarSelecao(e, id)), []);
  const limpar = useCallback(() => setEstado((e) => ({ ...e, ids: [], recusado: false })), []);
  return { ...estado, alternar, limpar };
}
