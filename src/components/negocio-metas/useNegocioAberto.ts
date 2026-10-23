// O negócio aberto no painel lateral. O endereço (?open=<id>) é a única fonte: o negócio deriva
// dele, abrir escreve-o e o "Voltar" fecha o painel. Um id que não existe limpa-se do endereço.
import { useEffect, useMemo } from "react";
import type { NegocioMes } from "./negocioMetas";
import { useParametroOpen } from "./useParametroOpen";

export function useNegocioAberto(negocios: NegocioMes[]) {
  const { id, abrir, fechar, limpar } = useParametroOpen();
  const aberto = useMemo(() => (id ? negocios.find((n) => n.id === id) ?? null : null), [id, negocios]);

  useEffect(() => {
    if (id && !aberto) limpar();
  }, [id, aberto, limpar]);

  return { aberto, abrir: (n: NegocioMes) => abrir(n.id), fechar };
}
