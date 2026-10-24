import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { usePessoasUrl } from "@/components/pessoas/usePessoasUrl";
import { useMensagemAnunciada } from "./useMensagemAnunciada";

export interface PessoaAberta {
  abertaId: string | null;
  negocioId: string | null;
  fechar: () => void;
  limpar: () => void;
  /** O botão que abriu a ficha: o foco volta para ele ao fechar. Guardado no clique (a ficha só abre quando os dados chegam). */
  origemFoco: MutableRefObject<HTMLElement | null>;
  aoAbrir: (id: string, origem?: HTMLElement) => void;
  aoIrPara: (id: string) => void;
  /** No Quadro o foco volta ao botão que abriu a ficha (o do nome ou o do passo). */
  aoAbrirQuadro: (pessoaId: string, negocioId?: string) => void;
  /** Depois de criar um negócio na ficha: só se a pessoa aberta ainda é a do negócio. */
  aoAbrirNegocio: (negocioId: string, pessoaId: string) => void;
  /** O que a «Nova lead» anuncia, para o contentor live da página (retira-se sozinha). */
  mensagemAcao: string;
  anunciar: (texto: string) => void;
}

/**
 * A ficha aberta por `?open=` e tudo o que a Lista (/pessoas) e o Pipeline (/pipeline) partilham à volta dela: o foco que volta ao botão,
 * as funções estáveis (as linhas e a tabela estão em memória e só valem se o que lhes damos não mudar) e a mensagem anunciada.
 */
export function usePessoaAberta(): PessoaAberta {
  const url = usePessoasUrl(false);
  const { abrir, abertaId } = url;
  // `abrir` muda sempre que o ?open= muda: guarda-se depois de cada render, nunca durante, e passa-se uma função estável.
  const abrirRef = useRef(abrir);
  const abertaRef = useRef(abertaId);
  useEffect(() => {
    abrirRef.current = abrir;
    abertaRef.current = abertaId;
  });
  const origemFoco = useRef<HTMLElement | null>(null);
  const aoAbrir = useCallback((id: string, origem?: HTMLElement) => {
    origemFoco.current = origem ?? null;
    abrirRef.current(id);
  }, []);
  const aoIrPara = useCallback((id: string) => abrirRef.current(id), []);
  const aoAbrirQuadro = useCallback((pessoaId: string, negocioId?: string) => {
    origemFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    abrirRef.current(pessoaId, negocioId);
  }, []);
  const aoAbrirNegocio = useCallback((negocioId: string, pessoaId: string) => {
    if (abertaRef.current === pessoaId) abrirRef.current(pessoaId, negocioId);
  }, []);
  const { mensagem: mensagemAcao, anunciar } = useMensagemAnunciada();
  return {
    abertaId, negocioId: url.negocioId, fechar: url.fechar, limpar: url.limpar, origemFoco,
    aoAbrir, aoIrPara, aoAbrirQuadro, aoAbrirNegocio, mensagemAcao, anunciar,
  };
}
