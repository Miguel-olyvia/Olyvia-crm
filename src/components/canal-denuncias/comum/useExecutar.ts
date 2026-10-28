// Executar uma ação assíncrona da fonte: diz se está pendente (para desativar o botão e não repetir o clique) e nunca deixa
// uma falha inesperada sem resposta (vira «indisponivel», que o ecrã mostra). Não faz setState depois de desmontar.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ErroAcao } from "../lib/acoes";

type ComOk = { ok: boolean };
export type Falha = { ok: false; erro: ErroAcao };

/** O código do erro de um resultado, ou null se correu bem. */
export const erroDoResultado = (r: ComOk): ErroAcao | null => ("erro" in r ? (r as Falha).erro : null);

export function useExecutar(): {
  pendente: boolean;
  executar: <R extends ComOk>(fazer: () => Promise<R>) => Promise<R | Falha>;
} {
  const [pendente, setPendente] = useState(false);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const executar = useCallback(async <R extends ComOk>(fazer: () => Promise<R>): Promise<R | Falha> => {
    setPendente(true);
    try {
      return await fazer();
    } catch {
      return { ok: false, erro: "indisponivel" };
    } finally {
      if (vivo.current) setPendente(false);
    }
  }, []);

  return { pendente, executar };
}
