// O estado do assistente de passos: qual é o passo atual, avançar, recuar e saltar, por onde se passou e quando o foco vai para o título. O passo
// segue-se pelo id (a lista pode mudar a meio: o questionário muda de versão); começa no primeiro que ainda falta.
import { useCallback, useMemo, useState } from "react";
import { completo } from "./modeloAssistente";
import type { PassoAssistente } from "./tiposAssistente";

interface Opcoes {
  /** O passo com que abre; sem isto, o primeiro que ainda falta (ou o primeiro). */
  inicial?: number;
}

export interface Assistente {
  indice: number;
  passo: PassoAssistente | null;
  /** Os passos por onde já se passou (o atual incluído). */
  visitados: ReadonlySet<string>;
  irPara: (indice: number) => void;
  avancar: () => void;
  recuar: () => void;
  /** Cresce de cada vez que o passo muda: o título pede o foco. */
  pedidoFoco: number;
}

const primeiroEmFalta = (passos: readonly PassoAssistente[]): number => {
  const i = passos.findIndex((p) => !completo(p));
  return i === -1 ? 0 : i;
};

export function useAssistente(passos: readonly PassoAssistente[], { inicial }: Opcoes = {}): Assistente {
  const [escolha, setEscolha] = useState<{ id: string | null; indice: number }>(() => {
    const i = inicial ?? primeiroEmFalta(passos);
    return { id: passos[i]?.id ?? null, indice: i };
  });
  const [visitadosIds, setVisitadosIds] = useState<ReadonlySet<string>>(() => new Set([passos[inicial ?? primeiroEmFalta(passos)]?.id ?? ""]));
  const [pedidoFoco, setPedidoFoco] = useState(0);
  // O índice de agora: o do passo com o id escolhido (a lista pode ter ganho ou perdido passos); se o id desapareceu, o índice antigo, num sítio válido.
  const porId = escolha.id === null ? -1 : passos.findIndex((p) => p.id === escolha.id);
  const indice = passos.length === 0 ? 0 : porId !== -1 ? porId : Math.min(escolha.indice, passos.length - 1);
  const passo = passos[indice] ?? null;

  const irPara = useCallback((destino: number): void => {
    if (!Number.isInteger(destino) || destino < 0 || destino >= passos.length) return;
    const id = passos[destino].id;
    setEscolha({ id, indice: destino });
    setVisitadosIds((antes) => (antes.has(id) ? antes : new Set([...antes, id])));
    setPedidoFoco((n) => n + 1);
  }, [passos]);

  const avancar = useCallback(() => irPara(Math.min(indice + 1, passos.length - 1)), [irPara, indice, passos.length]);
  const recuar = useCallback(() => irPara(Math.max(indice - 1, 0)), [irPara, indice]);
  const visitados = useMemo(() => new Set([...visitadosIds, ...(passo ? [passo.id] : [])]), [visitadosIds, passo]);
  return { indice, passo, visitados, irPara, avancar, recuar, pedidoFoco };
}
