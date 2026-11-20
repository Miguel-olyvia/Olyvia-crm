// «Ir para o campo»: leva a pessoa, a partir de um item de «O que falta traduzir», ao sítio onde esse texto se
// edita. Muda para o separador certo, faz scroll até ao campo, dá-lhe o foco (num editor rico, ao editável) e
// destaca-o por instantes. Serve os editores de propostas e de minutas de contrato.
//
// Os campos registam-se por chave (`registar(chave)` devolve um ref estável) ou, quando o componente não é
// nosso, encontram-se por um id estável do DOM (`localizar`). Nunca por texto.

import { useCallback, useEffect, useRef, useState, type RefCallback } from "react";

/** O destaque do campo: anel e fundo suaves, sem animação (por isso também serve com prefers-reduced-motion). */
export const CLASSES_DESTAQUE = ["rounded-md", "ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "bg-primary/10"] as const;
export const DURACAO_DESTAQUE_MS = 2000;

const TENTATIVAS = 10;
const INTERVALO_MS = 16;
const SELETOR_FOCAVEL = '[contenteditable="true"], input:not([type="hidden"]), textarea, select';

export interface OpcoesIrParaCampo<K extends string> {
  /** Muda para o separador onde o campo vive (e abre o que for preciso para ele aparecer). */
  abrirSeparador: (chave: K) => void;
  /** Para campos que não se registam: o elemento, por um id estável. */
  localizar?: (chave: K) => HTMLElement | null;
}

function ehCampoDeTexto(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable;
}

function movimentoReduzido(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function focoDe(el: HTMLElement): HTMLElement {
  if (ehCampoDeTexto(el)) return el;
  const dentro = el.querySelector<HTMLElement>(SELETOR_FOCAVEL);
  if (dentro) return dentro;
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  return el;
}

function limparDestaque(el: HTMLElement) {
  el.removeAttribute("data-destacado");
  el.classList.remove(...CLASSES_DESTAQUE);
}

export function useIrParaCampo<K extends string = string>(opcoes: OpcoesIrParaCampo<K>) {
  const registo = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, RefCallback<HTMLElement>>());
  const destaque = useRef<{ el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);
  const opcoesAtuais = useRef(opcoes);
  opcoesAtuais.current = opcoes;
  const [pedido, setPedido] = useState<{ chave: K; n: number } | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState<K | null>(null);

  const registar = useCallback((chave: string): RefCallback<HTMLElement> => {
    let ref = refs.current.get(chave);
    if (!ref) {
      ref = (el) => {
        if (el) registo.current.set(chave, el);
        else registo.current.delete(chave);
      };
      refs.current.set(chave, ref);
    }
    return ref;
  }, []);

  const irPara = useCallback((chave: K) => {
    setNaoEncontrado(null);
    opcoesAtuais.current.abrirSeparador(chave);
    setPedido((anterior) => ({ chave, n: (anterior?.n ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!pedido) return;
    let tentativas = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const destacar = (el: HTMLElement) => {
      if (destaque.current) {
        clearTimeout(destaque.current.timer);
        limparDestaque(destaque.current.el);
      }
      el.setAttribute("data-destacado", "true");
      el.classList.add(...CLASSES_DESTAQUE);
      destaque.current = { el, timer: setTimeout(() => { limparDestaque(el); destaque.current = null; }, DURACAO_DESTAQUE_MS) };
    };

    const tentar = () => {
      const el = registo.current.get(pedido.chave) ?? opcoesAtuais.current.localizar?.(pedido.chave) ?? null;
      if (el && el.isConnected) {
        if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: movimentoReduzido() ? "auto" : "smooth" });
        focoDe(el).focus({ preventScroll: true });
        destacar(el);
        return;
      }
      if (tentativas < TENTATIVAS) {
        tentativas += 1;
        timer = setTimeout(tentar, INTERVALO_MS);
      } else {
        setNaoEncontrado(pedido.chave);
      }
    };

    tentar();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [pedido]);

  // Ao desmontar, não deixar o destaque nem o seu timer para trás.
  useEffect(
    () => () => {
      if (destaque.current) {
        clearTimeout(destaque.current.timer);
        limparDestaque(destaque.current.el);
        destaque.current = null;
      }
    },
    [],
  );

  return { registar, irPara, naoEncontrado };
}
