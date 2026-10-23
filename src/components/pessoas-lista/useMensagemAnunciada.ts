import { useCallback, useEffect, useRef, useState } from "react";

/** Quanto tempo a mensagem fica na região viva antes de ser retirada (já foi lida; não deve voltar a ser lida com outras mudanças). */
export const ATRASO_LIMPAR_MS = 4000;
// Um espaço que não se vê: duas mensagens iguais seguidas passam a ter texto diferente, e o leitor de ecrã lê as duas.
const ALTERNAR = " ";

/**
 * A mensagem de uma ação (lead criada, dados atualizados) para o contentor live de uma página. Retira-se sozinha passado
 * `ATRASO_LIMPAR_MS`, e duas mensagens iguais seguidas anunciam-se as duas. `anunciar` é estável.
 */
export function useMensagemAnunciada(): { mensagem: string; anunciar: (texto: string) => void } {
  const [mensagem, setMensagem] = useState("");
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alternou = useRef(false);

  const parar = useCallback(() => {
    if (relogio.current !== null) clearTimeout(relogio.current);
    relogio.current = null;
  }, []);

  const anunciar = useCallback((texto: string) => {
    parar();
    if (!texto) {
      setMensagem("");
      return;
    }
    alternou.current = !alternou.current;
    setMensagem(alternou.current ? `${texto}${ALTERNAR}` : texto);
    relogio.current = setTimeout(() => {
      relogio.current = null;
      setMensagem("");
    }, ATRASO_LIMPAR_MS);
  }, [parar]);

  useEffect(() => parar, [parar]);
  return { mensagem, anunciar };
}
