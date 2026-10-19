import { useCallback, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { MIN_PESQUISA, type FiltrosLista, type OrdemLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { EtapaPessoa, PapelPessoa } from "@/components/pessoas/pessoasTipos";

const ATRASO_PESQUISA_MS = 300;

/**
 * Os filtros da Lista real: estado local, sem persistência. A pesquisa que o campo mostra (`pesquisa`)
 * é imediata; a que vai para a base (`filtros.pesquisa`) espera 300 ms e só conta com 2 ou mais letras.
 */
export function useFiltrosLista() {
  const [papel, mudarPapel] = useState<PapelPessoa | null>(null);
  const [etapa, mudarEtapa] = useState<EtapaPessoa | null>(null);
  const [ordem, mudarOrdem] = useState<OrdemLista>("recentes");
  const [pesquisa, mudarPesquisa] = useState("");
  const atrasada = useDebounce(pesquisa, ATRASO_PESQUISA_MS);
  const enviada = atrasada.trim().length >= MIN_PESQUISA ? atrasada : "";
  const limpar = useCallback(() => {
    mudarPapel(null);
    mudarEtapa(null);
    mudarPesquisa("");
  }, []);
  const filtros = useMemo<FiltrosLista>(
    () => ({ papel, etapa, pesquisa: enviada, ordem }),
    [papel, etapa, enviada, ordem],
  );
  return { filtros, pesquisa, mudarPesquisa, mudarPapel, mudarEtapa, mudarOrdem, limpar };
}
