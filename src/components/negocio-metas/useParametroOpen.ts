// O ?open=<id> do endereço, que é a única fonte de "o que está aberto" (painel de um negócio ou ficha
// de uma pessoa). Abrir acrescenta uma entrada ao histórico (o "Voltar" fecha); trocar para outro
// item com um já aberto substitui-a. Fechar volta atrás só se a entrada foi criada por esta página;
// se o ?open= veio de fora (uma ligação), limpa-o com replace.
import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function useParametroOpen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get("open");
  const criada = useRef(false);

  useEffect(() => {
    if (id === null) criada.current = false;
  }, [id]);

  /** `extra` muda outros parâmetros na MESMA alteração de endereço (`null` apaga): duas chamadas seguidas ao `setParams` não se acumulam. */
  const abrir = useCallback((novo: string, extra?: Readonly<Record<string, string | null>>) => {
    const jaAberto = id !== null;
    if (!jaAberto) criada.current = true;
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      p.set("open", novo);
      for (const [chave, valor] of Object.entries(extra ?? {})) {
        if (valor === null) p.delete(chave);
        else p.set(chave, valor);
      }
      return p;
    }, { replace: jaAberto });
  }, [id, setParams]);

  /** Tira o ?open= do endereço sem deixar entrada no histórico. */
  const limpar = useCallback(() => {
    criada.current = false;
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      p.delete("open");
      p.delete("negocio");
      return p;
    }, { replace: true });
  }, [setParams]);

  const fechar = useCallback(() => {
    if (criada.current) {
      criada.current = false;
      navigate(-1);
    } else limpar();
  }, [navigate, limpar]);

  return { id, abrir, fechar, limpar };
}
