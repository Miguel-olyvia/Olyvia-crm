import { useCallback, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { MIN_PESQUISA, type FiltrosLista, type OrdemLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { EtapaPessoa, PapelPessoa, ResultadoOuNenhum } from "@/components/pessoas/pessoasTipos";

const ATRASO_PESQUISA_MS = 300;

/**
 * Os filtros da Lista real: estado local, sem persistência. A pesquisa que o campo mostra (`pesquisa`)
 * é imediata; a que vai para a base (`filtros.pesquisa`) espera 300 ms e só conta com 2 ou mais letras.
 * `utilizadorId` é o `anew_users.id` de quem está na sessão: «Só as minhas» filtra por ele. Sem ele (ainda não se conhece) «Só as minhas»
 * não liga, para nunca mostrar toda a gente com o botão carregado.
 */
export function useFiltrosLista(utilizadorId: string | null = null) {
  const [papel, mudarPapel] = useState<PapelPessoa | null>(null);
  const [etapa, mudarEtapa] = useState<EtapaPessoa | null>(null);
  const [ordem, mudarOrdem] = useState<OrdemLista>("recentes");
  const [pesquisa, mudarPesquisa] = useState("");
  const [pediuMinhas, mudarSoMinhas] = useState(false);
  const [formularioId, mudarFormulario] = useState<string | null>(null);
  const [ultimoResultado, mudarResultado] = useState<ResultadoOuNenhum | null>(null);
  const [voltou, mudarVoltou] = useState(false);
  const [atrasada, mudarAtrasada] = useState(false);
  const atrasadaPesquisa = useDebounce(pesquisa, ATRASO_PESQUISA_MS);
  const enviada = atrasadaPesquisa.trim().length >= MIN_PESQUISA ? atrasadaPesquisa : "";
  const soMinhas = pediuMinhas && utilizadorId !== null;
  const atribuidoA = soMinhas ? utilizadorId : null;
  const limpar = useCallback(() => {
    mudarPapel(null);
    mudarEtapa(null);
    mudarPesquisa("");
    mudarSoMinhas(false);
    mudarFormulario(null);
    mudarResultado(null);
    mudarVoltou(false);
    mudarAtrasada(false);
  }, []);
  const filtros = useMemo<FiltrosLista>(
    () => ({ papel, etapa, pesquisa: enviada, ordem, atribuidoA, formularioId, ultimoResultado, voltou, atrasada }),
    [papel, etapa, enviada, ordem, atribuidoA, formularioId, ultimoResultado, voltou, atrasada],
  );
  return {
    filtros, pesquisa, soMinhas, mudarPesquisa, mudarPapel, mudarEtapa, mudarOrdem,
    mudarSoMinhas, mudarFormulario, mudarResultado, mudarVoltou, mudarAtrasada, limpar,
  };
}
