// O estado de uma ação da ficha que pode demorar (a base): a guardar, ou a falhar com uma chave de erro para traduzir. Uma ação
// síncrona (o exemplo) chama `aoOk` de imediato e nunca passa por «a guardar».
import { useCallback, useEffect, useRef, useState } from "react";
import { useAnunciar, type Anunciar } from "@/components/ficha-comum/anuncioFicha";
import { useTranslation } from "@/hooks/useTranslation";
import { chaveDoErroAcao, chaveExtraDoErroAcao, ehAcaoAssincrona, seguirAcao } from "./seguirAcao";

const CHAVE_A_GUARDAR = "pessoasPagina.real.ficha.saving";

export interface ExecutarAcao {
  /** Há uma ação à espera da base: o botão fica `aria-busy` e ignora novos cliques. */
  aGuardar: boolean;
  /** A chave do erro da última tentativa (traduz-se com `t`); `null` sem erro. */
  erro: string | null;
  /** A segunda chave do erro (a mensagem do código, numa falha parcial); `null` se não houver. */
  erroExtra: string | null;
  /**
   * Corre a ação; `aoOk` só corre quando ela termina bem (e o componente ainda existe). Ignora o pedido se já há uma a guardar.
   * Se o componente já saiu quando a ação termina, o resultado anuncia-se na região da ficha: `mensagemSucesso` (se houver) ou o erro.
   */
  executar: (acao: () => void | Promise<void>, aoOk: () => void, mensagemSucesso?: string) => void;
}

/** `anunciarDireto`: para quem vive FORA do contexto de anúncios da ficha (o próprio interior da ficha, que o cria). */
export function useExecutarAcao(anunciarDireto?: Anunciar): ExecutarAcao {
  const { t } = useTranslation();
  const doContexto = useAnunciar();
  const anunciar = anunciarDireto ?? doContexto;
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<{ chave: string; extra: string | null } | null>(null);
  const ocupado = useRef(false);
  const montado = useRef(true);
  // As últimas versões de `t` e `anunciar`, para a ação que termina depois de o componente sair.
  const maisRecentes = useRef({ t, anunciar });
  useEffect(() => {
    maisRecentes.current = { t, anunciar };
  });
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const executar = useCallback((acao: () => void | Promise<void>, aoOk: () => void, mensagemSucesso?: string) => {
    if (ocupado.current) return;
    setErro(null);
    const falhou = (falha: unknown) => setErro({ chave: chaveDoErroAcao(falha), extra: chaveExtraDoErroAcao(falha) });
    let resultado: void | Promise<void>;
    try {
      resultado = acao();
    } catch (falha) {
      falhou(falha);
      return;
    }
    if (!ehAcaoAssincrona(resultado)) {
      aoOk();
      return;
    }
    ocupado.current = true;
    setAGuardar(true);
    maisRecentes.current.anunciar(maisRecentes.current.t(CHAVE_A_GUARDAR));
    const terminar = (): boolean => {
      ocupado.current = false;
      if (!montado.current) return false;
      setAGuardar(false);
      return true;
    };
    seguirAcao(
      resultado,
      () => {
        if (terminar()) aoOk();
        else if (mensagemSucesso) maisRecentes.current.anunciar(mensagemSucesso);
      },
      (falha) => {
        if (terminar()) { falhou(falha); return; }
        // O painel já saiu: o erro não pode perder-se. Diz-se na região da ficha.
        const { t: traduzir, anunciar: dizer } = maisRecentes.current;
        const extra = chaveExtraDoErroAcao(falha);
        const principal = traduzir(chaveDoErroAcao(falha));
        dizer(extra ? `${principal} ${traduzir(extra)}` : principal);
      },
    );
  }, []);

  return { aGuardar, erro: erro?.chave ?? null, erroExtra: erro?.extra ?? null, executar };
}
