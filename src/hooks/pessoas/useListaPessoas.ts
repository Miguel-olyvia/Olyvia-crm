import { useCallback, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { useFontePessoas } from "./useFontePessoas";
import { adaptarResumo, hojeLisboa } from "./adaptarResumoPessoa";
import {
  MIN_PESQUISA,
  PAGINA_LISTA,
  type CursorLista,
  type FiltrosLista,
  type LinhaResumoDb,
  type PessoaDaLista,
} from "./listaPessoasTipos";

const STALE_TIME_MS = 30_000;
const MAX_PESQUISA = 200;
const MAX_REPETICOES = 2;

/** A pesquisa que se envia: aparada e com 2 ou mais caracteres, senão nenhuma. */
export function pesquisaEfetiva(pesquisa: string): string | null {
  const aparada = pesquisa.trim().slice(0, MAX_PESQUISA);
  return aparada.length >= MIN_PESQUISA ? aparada : null;
}

// Só o que conta para a base: assim "", "a" e " Ana " vs "Ana" não duplicam pedidos nem cache.
function normalizar(filtros: FiltrosLista) {
  return {
    papel: filtros.papel,
    etapa: filtros.etapa,
    ordem: filtros.ordem,
    pesquisa: pesquisaEfetiva(filtros.pesquisa),
  };
}
type FiltrosNormalizados = ReturnType<typeof normalizar>;

/** Sem filtros devolve o prefixo, para invalidar depois das escritas. */
export function listaPessoasQueryKey(organizationId: string | null | undefined, filtros?: FiltrosLista) {
  const base = ["neg-resumo-pessoas", organizationId ?? null] as const;
  return filtros ? ([...base, normalizar(filtros)] as const) : base;
}

// Os 8 parâmetros vão sempre, com null explícito (evita a ambiguidade de overloads).
async function pedirPagina(
  organizationId: string,
  filtros: FiltrosNormalizados,
  depois: CursorLista | null,
): Promise<LinhaResumoDb[]> {
  const pagina = await chamarNeg<LinhaResumoDb[] | null>("neg_resumo_pessoas", {
    p_organization_id: organizationId,
    p_papel: filtros.papel,
    p_etapa: filtros.etapa,
    p_pesquisa: filtros.pesquisa,
    p_ordem: filtros.ordem,
    p_depois_de_chave: depois?.chave ?? null,
    p_depois_de_id: depois?.id ?? null,
    p_limite: PAGINA_LISTA,
  });
  return pagina ?? [];
}

const TIMEOUT_BASE = "57014";

// Não repete o que não muda (NG008, NG009, 42501) nem o timeout da base: cada tentativa
// gastaria até 5 s na base partilhada. O resto repete no máximo 2 vezes; o chamarNeg
// reporta cada tentativa ao Sentry (aceite).
export function repetir(tentativas: number, erro: unknown): boolean {
  if (erro instanceof ErroNeg) {
    if (erro.codigo) return false;
    if ((erro.causa as { code?: unknown } | null)?.code === TIMEOUT_BASE) return false;
  }
  return tentativas < MAX_REPETICOES;
}

export function comoErroNeg(erro: unknown): ErroNeg | null {
  if (!erro) return null;
  return erro instanceof ErroNeg ? erro : new ErroNeg(erro, null, CHAVE_ERRO_GENERICO);
}

export interface ListaPessoas {
  linhas: PessoaDaLista[];
  isLoading: boolean;
  isFetching: boolean;
  isFetchingMore: boolean;
  /** true: as linhas visíveis são as de um filtro anterior (o novo ainda carrega). */
  aMostrarAnterior: boolean;
  /** Falha da primeira carga ou de uma recarga; pode haver linhas retidas. */
  isError: boolean;
  /** isError sem nenhuma linha para mostrar: o único caso em que o erro bloqueia o ecrã. */
  erroSemDados: boolean;
  erro: ErroNeg | null;
  erroAoCarregarMais: ErroNeg | null;
  haMais: boolean;
  carregarMais: () => void;
  /** Refaz TODAS as páginas já carregadas, por ordem. Sem organização ativa não faz nada. */
  recarregar: () => void;
}

/**
 * A Lista das Pessoas, página a página. O debounce da pesquisa fica na UI.
 * Só consulta em modo "real" e com a organização do contexto da fonte.
 *
 * Estados (isLoading / isFetching / aMostrarAnterior / isError):
 * - primeira carga: true / true / false / false, sem linhas;
 * - filtro mudou: false / true / true / false, com as linhas do filtro anterior;
 * - carregar mais: isFetchingMore true, as linhas ficam;
 * - recarga: isFetching true, as linhas ficam;
 * - erro: isError true; se também há linhas, o aviso deve ser não-bloqueante
 *   (erroSemDados distingue); um erro ao carregar mais vai para erroAoCarregarMais.
 */
export function useListaPessoas(filtros: FiltrosLista): ListaPessoas {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const normalizados = normalizar(filtros);
  const consulta = useInfiniteQuery({
    queryKey: listaPessoasQueryKey(organizationId, filtros),
    queryFn: ({ pageParam }) => pedirPagina(organizationId as string, normalizados, pageParam),
    initialPageParam: null as CursorLista | null,
    getNextPageParam: (pagina): CursorLista | undefined => {
      const ultima = pagina[pagina.length - 1];
      // Sem chave não há cursor (a base daria NG009): é o fim da lista.
      return ultima?.ha_mais && ultima.chave_ordem !== null
        ? { chave: ultima.chave_ordem, id: ultima.entity_id }
        : undefined;
    },
    enabled: !!organizationId,
    // Mantém a lista anterior ao mudar de filtro, nunca ao mudar de organização.
    placeholderData: (anterior, consultaAnterior) =>
      consultaAnterior?.queryKey[1] === organizationId ? anterior : undefined,
    staleTime: STALE_TIME_MS,
    retry: repetir,
  });

  const { data, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = consulta;
  const linhas = useMemo(() => {
    const hoje = hojeLisboa();
    const vistos = new Set<string>();
    const juntas: PessoaDaLista[] = [];
    for (const linha of (data?.pages ?? []).flat()) {
      if (vistos.has(linha.entity_id)) continue;
      vistos.add(linha.entity_id);
      juntas.push(adaptarResumo(linha, hoje));
    }
    return juntas;
  }, [data]);

  const carregarMais = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage({ cancelRefetch: false });
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const recarregar = useCallback(() => {
    if (!organizationId) return;
    void refetch();
  }, [organizationId, refetch]);

  const falhouMais = consulta.isFetchNextPageError && !isFetchingNextPage;
  const erroPrimeiro = consulta.isError && !consulta.isFetchNextPageError;
  return {
    linhas,
    isLoading: consulta.isLoading,
    isFetching: consulta.isFetching,
    isFetchingMore: isFetchingNextPage,
    aMostrarAnterior: consulta.isPlaceholderData,
    isError: erroPrimeiro,
    erroSemDados: erroPrimeiro && linhas.length === 0,
    erro: erroPrimeiro ? comoErroNeg(consulta.error) : null,
    erroAoCarregarMais: falhouMais ? comoErroNeg(consulta.error) : null,
    haMais: !!hasNextPage,
    carregarMais,
    recarregar,
  };
}
