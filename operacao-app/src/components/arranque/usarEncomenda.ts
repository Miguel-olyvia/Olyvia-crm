import { useCallback, useEffect, useRef, useState } from "react";
import { EncomendasPorInstalar, mensagemDeErro, obterEncomenda, type EncomendaCliente } from "../../lib/encomendas";

/**
 * A Encomenda Cliente de um contrato, para os dois cartões do Arranque.
 * `agir` corre uma ação (gerar, validar, aprovar…), volta a ler e avisa o pai
 * (`aoMudar`) — o checklist de arranque da Frente B depende deste estado.
 */
export function usarEncomenda(contratoId: string, aoMudar?: () => void) {
  const [dados, setDados] = useState<EncomendaCliente | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [porInstalar, setPorInstalar] = useState(false);
  const [aOcupar, setAOcupar] = useState<string | null>(null);
  const montado = useRef(true);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const recarregar = useCallback(async () => {
    setACarregar(true);
    try {
      const d = await obterEncomenda(contratoId);
      if (!montado.current) return;
      setDados(d);
      setErro(null);
      setPorInstalar(false);
    } catch (e) {
      if (!montado.current) return;
      if (e instanceof EncomendasPorInstalar) setPorInstalar(true);
      else setErro(mensagemDeErro(e));
    } finally {
      if (montado.current) setACarregar(false);
    }
  }, [contratoId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  /** Corre uma ação; devolve true se correu bem. O erro fica em `erro`. */
  const agir = useCallback(
    async (nome: string, f: () => Promise<unknown>): Promise<boolean> => {
      setAOcupar(nome);
      setErro(null);
      try {
        await f();
        await recarregar();
        aoMudarRef.current?.();
        return true;
      } catch (e) {
        if (montado.current) setErro(mensagemDeErro(e));
        return false;
      } finally {
        if (montado.current) setAOcupar(null);
      }
    },
    [recarregar]
  );

  return { dados, aCarregar, erro, porInstalar, aOcupar, agir, recarregar, setErro };
}
