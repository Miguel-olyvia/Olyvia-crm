// O estado do assistente de passos: qual é o passo atual, avançar, recuar e saltar, por onde se passou e quando o foco vai para o título. O passo
// segue-se pelo id (a lista pode mudar a meio: o questionário muda de versão); começa no primeiro que ainda falta. Enquanto a lista ainda não está
// pronta (o questionário a carregar) o passo inicial não se fixa: quando ela chega abre-se no primeiro que falta, e só depois disso, ou se o
// utilizador escolher um passo, é que o passo fica fixo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { completo } from "./modeloAssistente";
import type { PassoAssistente } from "./tiposAssistente";

interface Opcoes {
  /** O passo com que abre; sem isto, o primeiro que ainda falta (ou o primeiro). */
  inicial?: number;
  /** A lista de passos está completa (o questionário já chegou). Sem isto vale sempre. */
  pronto?: boolean;
}

export interface Assistente {
  indice: number;
  passo: PassoAssistente | null;
  /** Os passos por onde já se passou (o atual incluído). */
  visitados: ReadonlySet<string>;
  irPara: (indice: number) => void;
  avancar: () => void;
  recuar: () => void;
  /**
   * Avança a partir do passo com este id, na lista de AGORA: quem espera por uma gravação não pode usar o índice do render do clique (a lista pode ter
   * mudado entretanto). Se o passo já não existe, fica onde está.
   */
  avancarDe: (id: string) => void;
  /** Cresce de cada vez que o passo muda: o título pede o foco. */
  pedidoFoco: number;
}

const primeiroEmFalta = (passos: readonly PassoAssistente[]): number => {
  const i = passos.findIndex((p) => !completo(p));
  return i === -1 ? 0 : i;
};

export function useAssistente(passos: readonly PassoAssistente[], { inicial, pronto = true }: Opcoes = {}): Assistente {
  // `id: null`: ainda ninguém escolheu nem se fixou o passo inicial.
  const [escolha, setEscolha] = useState<{ id: string | null; indice: number }>({ id: null, indice: 0 });
  const [visitadosIds, setVisitadosIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pedidoFoco, setPedidoFoco] = useState(0);
  // A lista de agora, para as funções que correm depois de um await.
  const passosAgora = useRef(passos);
  passosAgora.current = passos;

  const inicialAgora = inicial ?? primeiroEmFalta(passos);
  // O índice de agora: o do passo escolhido pelo id (a lista pode ter ganho ou perdido passos); se o id desapareceu, o índice antigo, num sítio válido;
  // sem escolha, o inicial.
  const porId = escolha.id === null ? -1 : passos.findIndex((p) => p.id === escolha.id);
  const base = escolha.id === null ? inicialAgora : escolha.indice;
  const indice = passos.length === 0 ? 0 : porId !== -1 ? porId : Math.min(base, passos.length - 1);
  const passo = passos[indice] ?? null;
  // O passo de onde se sai, para ficar visitado (o «!» de um passo que ficou com falta).
  const idAtual = useRef<string | null>(null);
  idAtual.current = passo?.id ?? null;

  // Fixa o passo inicial só quando a lista está pronta: antes disso acompanha o primeiro que falta.
  useEffect(() => {
    if (!pronto || escolha.id !== null || !passo) return;
    setEscolha({ id: passo.id, indice });
  }, [pronto, escolha.id, passo, indice]);

  const irPara = useCallback((destino: number): void => {
    const lista = passosAgora.current;
    if (!Number.isInteger(destino) || destino < 0 || destino >= lista.length) return;
    const id = lista[destino].id;
    setEscolha({ id, indice: destino });
    const saida = idAtual.current;
    setVisitadosIds((antes) => {
      const novos = [id, ...(saida ? [saida] : [])].filter((i) => !antes.has(i));
      return novos.length === 0 ? antes : new Set([...antes, ...novos]);
    });
    setPedidoFoco((n) => n + 1);
  }, []);

  const avancar = useCallback(() => irPara(Math.min(indice + 1, passos.length - 1)), [irPara, indice, passos.length]);
  const recuar = useCallback(() => irPara(Math.max(indice - 1, 0)), [irPara, indice]);
  const avancarDe = useCallback((id: string): void => {
    const lista = passosAgora.current;
    const i = lista.findIndex((p) => p.id === id);
    if (i === -1) return;
    irPara(Math.min(i + 1, lista.length - 1));
  }, [irPara]);
  const visitados = useMemo(() => new Set([...visitadosIds, ...(passo ? [passo.id] : [])]), [visitadosIds, passo]);
  return { indice, passo, visitados, irPara, avancar, recuar, avancarDe, pedidoFoco };
}
