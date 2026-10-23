// O estado de ligar e desligar registos na ficha real: que linhas estão à espera da base (cada linha tem a sua, as outras continuam livres)
// e o erro da última tentativa, como chave para traduzir (nunca a mensagem). Uma linha que já está a guardar ignora novos cliques.
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAVE_ERRO_ENVIO_GENERICO, chaveDoErroDeEnvio } from "@/components/negocio-metas/useEnvioAssincrono";

export interface Ligacoes {
  /** As chaves das linhas à espera da base. */
  ocupadas: ReadonlySet<string>;
  /** A chave do erro da última tentativa; `null` sem erro. */
  erro: string | null;
  /** Corre a ação da linha `chave`; `aoOk` só corre se ela terminar bem. */
  correr: (chave: string, acao: () => Promise<unknown>, aoOk: () => void) => void;
}

export function useLigacoes(): Ligacoes {
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const emCurso = useRef(new Set<string>());
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const correr = useCallback((chave: string, acao: () => Promise<unknown>, aoOk: () => void) => {
    if (emCurso.current.has(chave)) return;
    emCurso.current.add(chave);
    setOcupadas(new Set(emCurso.current));
    setErro(null);
    const acabar = (): void => {
      emCurso.current.delete(chave);
      if (montado.current) setOcupadas(new Set(emCurso.current));
    };
    acao().then(
      () => {
        acabar();
        // O que corre depois de ligar pode lançar: diz-se que falhou algo (a ligação já aconteceu), sem rejeição por tratar.
        try {
          aoOk();
        } catch {
          if (montado.current) setErro(CHAVE_ERRO_ENVIO_GENERICO);
        }
      },
      (falha: unknown) => { acabar(); if (montado.current) setErro(chaveDoErroDeEnvio(falha)); },
    );
  }, []);

  return { ocupadas, erro, correr };
}
