// O estado de uma gravação que espera pela base num diálogo: a guardar (o botão fica aria-busy e ignora novos cliques) ou a falhar com uma
// chave de erro para traduzir. Os erros chegam com a `chave` do código (`ErroNeg`); aqui só se lê essa chave (nunca a mensagem) e uma falha
// sem chave dá a mensagem genérica. Duplicado de propósito de `pessoas/seguirAcao.ts`: `negocio-metas` não importa de `pessoas`.
import { useCallback, useEffect, useRef, useState } from "react";

export const CHAVE_ERRO_ENVIO_GENERICO = "pessoasPagina.erroNeg.generico";

/** A chave de tradução do erro: a que ele traz, senão a genérica. Nunca o texto cru do erro. */
export function chaveDoErroDeEnvio(erro: unknown): string {
  const chave = typeof erro === "object" && erro !== null ? (erro as { chave?: unknown }).chave : null;
  return typeof chave === "string" && chave !== "" ? chave : CHAVE_ERRO_ENVIO_GENERICO;
}

/** O código que a base devolve quando o negócio já não existe para quem o vê (a chave de tradução de NG001). */
export const CHAVE_NEGOCIO_INDISPONIVEL = "pessoasPagina.erroNeg.ng001";

export interface EnvioAssincrono {
  /** Há uma gravação à espera da base. */
  aGuardar: boolean;
  /** A chave do erro da última tentativa; `null` sem erro. */
  erro: string | null;
  /** Corre a gravação; `aoOk` só corre se ela terminar bem. Ignora o pedido se já há uma a guardar. */
  enviar: (acao: () => Promise<unknown>, aoOk: () => void) => void;
}

/** `aoFalhar` corre (com a chave do erro) quando a gravação falha: quem monta pode, por exemplo, fechar o diálogo se o negócio já não existe. */
export function useEnvioAssincrono(aoFalhar?: (chave: string) => void): EnvioAssincrono {
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ocupado = useRef(false);
  const montado = useRef(true);
  const falhar = useRef(aoFalhar);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  useEffect(() => {
    falhar.current = aoFalhar;
  });

  const enviar = useCallback((acao: () => Promise<unknown>, aoOk: () => void) => {
    if (ocupado.current) return;
    ocupado.current = true;
    setErro(null);
    setAGuardar(true);
    const aoFalhou = (falha: unknown): void => {
      ocupado.current = false;
      const chave = chaveDoErroDeEnvio(falha);
      if (!montado.current) return;
      setAGuardar(false);
      setErro(chave);
      falhar.current?.(chave);
    };
    // Uma gravação que lança antes de devolver a promessa conta como falha, tratada logo: sem isto ficavam `ocupado` e `aGuardar` presos.
    let promessa: Promise<unknown>;
    try {
      promessa = acao();
    } catch (falha) {
      aoFalhou(falha);
      return;
    }
    promessa.then(
      () => {
        ocupado.current = false;
        if (montado.current) setAGuardar(false);
        // O que corre depois de gravar (fechar, avisar, abrir o negócio) pode lançar: a gravação já aconteceu, por isso diz-se que falhou algo
        // a seguir, em vez de deixar uma rejeição por tratar e o diálogo aberto sem erro.
        try {
          aoOk();
        } catch {
          if (montado.current) setErro(CHAVE_ERRO_ENVIO_GENERICO);
        }
      },
      aoFalhou,
    );
  }, []);

  return { aGuardar, erro, enviar };
}
