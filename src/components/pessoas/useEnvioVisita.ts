// O envio de um diálogo de visita à base: uma só gravação de cada vez (duplo clique não grava duas), o estado «a guardar» (que o diálogo usa para
// não se deixar fechar), o erro traduzido que fica dentro do diálogo e, na recusa de conflito (NG010), o recurso ocupado para o diálogo o marcar.
import { useCallback, useEffect, useRef } from "react";
import { recursoEmConflito } from "@/hooks/pessoas/errosVisita";
import { useExecutarAcao, type ExecutarAcao } from "./useExecutarAcao";

interface Opcoes {
  /** Avisa o diálogo de que começou (`true`) e acabou (`false`) de gravar; acontece no mesmo instante do clique, antes de qualquer render. */
  aoOcupado: (ocupado: boolean) => void;
  /** A base recusou o horário (NG010): o recurso em conflito, se o erro o disse. */
  aoConflito: (recursoId: string | null) => void;
}

export interface EnvioVisita {
  aGuardar: boolean;
  erro: ExecutarAcao["erro"];
  erroExtra: ExecutarAcao["erroExtra"];
  /** Grava; `aoSucesso` corre com a resposta só se a gravação correu bem (e o diálogo ainda existe). */
  enviar: <R>(gravar: () => Promise<R>, aoSucesso: (resposta: R) => void) => void;
}

export function useEnvioVisita({ aoOcupado, aoConflito }: Opcoes): EnvioVisita {
  const acao = useExecutarAcao();
  const { executar } = acao;
  // As últimas versões dos avisos: a gravação acaba depois do render em que começou.
  const avisos = useRef({ aoOcupado, aoConflito });
  useEffect(() => {
    avisos.current = { aoOcupado, aoConflito };
  });

  const enviar = useCallback(<R,>(gravar: () => Promise<R>, aoSucesso: (resposta: R) => void): void => {
    let resposta: R;
    executar(async () => {
      avisos.current.aoOcupado(true);
      try {
        resposta = await gravar();
      } catch (erro) {
        const recurso = recursoEmConflito(erro);
        if (recurso !== null || (erro as { codigo?: unknown } | null)?.codigo === "NG010") avisos.current.aoConflito(recurso);
        throw erro;
      } finally {
        avisos.current.aoOcupado(false);
      }
    }, () => aoSucesso(resposta));
  }, [executar]);

  return { aGuardar: acao.aGuardar, erro: acao.erro, erroExtra: acao.erroExtra, enviar };
}
