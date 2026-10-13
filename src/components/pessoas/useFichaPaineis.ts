// Os dois estados da ficha que não são desenho: a região de anúncios para o leitor de ecrã e os painéis de ação em linha
// (qual está aberto, quais já foram abertos e o que fazer no Esc).
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { AcaoFicha } from "./PainelBase";

/** Quanto tempo o anúncio fica na região antes de ser limpo. */
const MS_ANUNCIO = 5000;

/** A região de anúncios: o mesmo texto duas vezes seguidas volta a ser lido (alterna um espaço) e limpa-se ao fim de uns segundos. */
export function useAnuncios(externo: string | undefined) {
  const [anuncio, setAnuncio] = useState({ texto: "", n: 0 });
  const anunciar = useCallback((texto: string) => setAnuncio((a) => ({ texto, n: a.n + 1 })), []);
  useEffect(() => {
    if (!anuncio.texto) return undefined;
    const id = setTimeout(() => setAnuncio((a) => ({ ...a, texto: "" })), MS_ANUNCIO);
    return () => clearTimeout(id);
  }, [anuncio]);
  useEffect(() => { if (externo) anunciar(externo); }, [externo, anunciar]);
  return { texto: anuncio.texto + (anuncio.n % 2 ? " " : ""), anunciar };
}

/** Qual painel está aberto, quais já foram abertos (ficam montados, escondidos) e o que fazer no Esc. */
export function usePaineis(fecharPainel: MutableRefObject<(() => boolean) | null>, anunciar: (m: string) => void) {
  const { t } = useTranslation();
  const [acao, setAcao] = useState<AcaoFicha | null>(null);
  const [visitados, setVisitados] = useState<AcaoFicha[]>([]);
  const origem = useRef<HTMLElement | null>(null);
  const conteudo = useRef<Partial<Record<AcaoFicha, boolean>>>({});
  const avisado = useRef(false);

  const fechar = useCallback((descartar: boolean) => {
    if (descartar && acao) setVisitados((v) => v.filter((x) => x !== acao));
    setAcao(null);
    if (origem.current?.isConnected) origem.current.focus();
  }, [acao]);
  // Abrir o painel que já está aberto fecha-o (sem descartar); abrir outro esconde o atual e guarda o que lá está.
  const abrir = (a: AcaoFicha, o: HTMLElement | null) => {
    origem.current = o;
    avisado.current = false;
    if (a === acao) { setAcao(null); return; }
    setVisitados((v) => (v.includes(a) ? v : [...v, a]));
    setAcao(a);
  };
  // O Esc fecha só o painel; com algo escrito, o primeiro Esc avisa e só o segundo descarta.
  useEffect(() => {
    fecharPainel.current = () => {
      if (acao === null) return false;
      if (conteudo.current[acao] && !avisado.current) {
        avisado.current = true;
        anunciar(t("pessoasPagina.panel.discardHint"));
      } else {
        fechar(true);
      }
      return true;
    };
    return () => { fecharPainel.current = null; };
  }, [acao, fechar, fecharPainel, anunciar, t]);
  const mudarConteudo = (a: AcaoFicha) => (c: boolean) => { conteudo.current[a] = c; avisado.current = false; };
  return { acao, visitados, abrir, fechar, mudarConteudo };
}
