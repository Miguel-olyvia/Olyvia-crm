import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLUNAS_QUADRO, type CartaoQuadro, type ColunaQuadro } from "@/components/pessoas/quadro/cartoesQuadroPessoas";
import { adaptarLinhaQuadro, valorOuZero } from "./adaptarCartaoQuadro";
import { hojeLisboa } from "./adaptarResumoPessoa";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import {
  PAGINA_COLUNA, type ColunasQuadro, type CursorQuadro, type EstadoColuna, type FiltrosQuadro, type LinhaQuadroDb,
} from "./quadroPessoasTipos";
import { comoErroNeg, listaPessoasQueryKey, pesquisaEfetiva, repetir } from "./useListaPessoas";
import { useFontePessoas } from "./useFontePessoas";

const STALE_TIME_MS = 30_000;

// Só o que conta para a base. A etapa nem faz parte dos filtros do Quadro: Lista e Quadro mudam de etapa sem duplicar pedidos.
function normalizar(f: FiltrosQuadro) {
  return { papel: f.papel, pesquisa: pesquisaEfetiva(f.pesquisa), ordem: f.ordem };
}
type FiltrosNormalizados = ReturnType<typeof normalizar>;

/** A chave fica DEBAIXO do prefixo da Lista: qualquer invalidação da Lista (incluindo `invalidarPessoas`) invalida também o Quadro. */
export function quadroPessoasQueryKey(organizationId: string | null | undefined, filtros?: FiltrosQuadro) {
  const base = [...listaPessoasQueryKey(organizationId), "quadro"] as const;
  return filtros ? ([...base, normalizar(filtros)] as const) : base;
}

// Os 8 parâmetros vão sempre, com null explícito (evita a ambiguidade de overloads). Sem `coluna`: as 7; com ela, só essa e o cursor.
async function pedir(
  organizationId: string,
  filtros: FiltrosNormalizados,
  coluna: ColunaQuadro | null,
  depois: CursorQuadro | null,
): Promise<LinhaQuadroDb[]> {
  const linhas = await chamarNeg<LinhaQuadroDb[] | null>("neg_resumo_quadro", {
    p_organization_id: organizationId,
    p_colunas: coluna ? [coluna] : null,
    p_papel: filtros.papel,
    p_pesquisa: filtros.pesquisa,
    p_ordem: filtros.ordem,
    p_depois_de_chave: depois?.chave ?? null,
    p_depois_de_id: depois?.id ?? null,
    p_limite: PAGINA_COLUNA,
  });
  return linhas ?? [];
}

const colunaVazia = (): EstadoColuna => ({ cartoes: [], cursor: null, haMais: false, total: 0, valor: 0 });

function colunasVazias(): ColunasQuadro {
  return Object.fromEntries(COLUNAS_QUADRO.map((d) => [d.id, colunaVazia()])) as ColunasQuadro;
}
const SEM_COLUNAS: ColunasQuadro = colunasVazias();

/** Agrupa as linhas por coluna. Os totais são os da coluna INTEIRA (a base repete-os em cada linha, antes do cursor e do limite). */
function montarColunas(linhas: readonly LinhaQuadroDb[]): ColunasQuadro {
  const hoje = hojeLisboa();
  const colunas = colunasVazias();
  for (const linha of linhas) {
    const adaptada = adaptarLinhaQuadro(linha, hoje);
    if (!adaptada) continue;
    const atual = colunas[adaptada.cartao.coluna];
    const cartoes = [...atual.cartoes, adaptada.cartao];
    const total = Number(linha.total_coluna);
    colunas[adaptada.cartao.coluna] = {
      cartoes, cursor: adaptada.cursor, haMais: linha.ha_mais === true,
      total: Number.isFinite(total) && linha.total_coluna !== null ? total : cartoes.length,
      valor: valorOuZero(linha.valor_coluna),
    };
  }
  return colunas;
}

/** Acrescenta a página seguinte de uma coluna, sem repetir cartões e sem mexer no que já estava. */
function juntar(atual: EstadoColuna, nova: EstadoColuna): EstadoColuna {
  const vistos = new Set(atual.cartoes.map((c) => c.id));
  const acrescentados = nova.cartoes.filter((c) => !vistos.has(c.id));
  if (nova.cartoes.length === 0) return { ...atual, haMais: false };
  return { cartoes: [...atual.cartoes, ...acrescentados], cursor: nova.cursor ?? atual.cursor, haMais: nova.haMais, total: nova.total, valor: nova.valor };
}

export interface QuadroPessoasEstado {
  colunas: ColunasQuadro;
  /** Todos os cartões carregados, pela ordem das colunas. */
  cartoes: CartaoQuadro[];
  isLoading: boolean;
  isFetching: boolean;
  /** true: os cartões visíveis são os de um filtro anterior (o novo ainda carrega). */
  aMostrarAnterior: boolean;
  isError: boolean;
  /** isError sem nenhum cartão: o único caso em que o erro bloqueia o ecrã. */
  erroSemDados: boolean;
  erro: ErroNeg | null;
  /** As colunas a que se está a pedir mais cartões. */
  aCarregarMais: ReadonlySet<ColunaQuadro>;
  /** O erro de «Carregar mais» de cada coluna; os cartões já carregados ficam. */
  errosAoCarregarMais: Partial<Record<ColunaQuadro, ErroNeg>>;
  /** `true`: há um pedido a andar (começou agora ou já estava em curso); `false`: nada se pediu (sem mais cartões, ou o cursor falta e ficou o erro). */
  carregarMais: (coluna: ColunaQuadro) => boolean;
  recarregar: () => void;
}

interface EstadoMais {
  carregando: ReadonlySet<string>;
  erros: ReadonlyMap<string, ErroNeg>;
}
const MAIS_INICIAL: EstadoMais = { carregando: new Set(), erros: new Map() };

/**
 * O Quadro das Pessoas: uma chamada traz as 7 colunas (25 cartões cada); «Carregar mais» pede só uma coluna, com o cursor da sua última linha.
 * Só consulta em modo real, com a organização da fonte e `ativo` (a página está no Quadro). O debounce da pesquisa fica na UI.
 */
export function useQuadroPessoas(filtros: FiltrosQuadro, ativo = true): QuadroPessoasEstado {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const normalizados = normalizar(filtros);
  const chave = quadroPessoasQueryKey(organizationId, filtros);
  const chaveTexto = JSON.stringify(chave);
  const [mais, setMais] = useState<EstadoMais>(MAIS_INICIAL);
  const emCurso = useRef(new Set<string>());

  const consulta = useQuery({
    queryKey: chave,
    queryFn: async () => montarColunas(await pedir(organizationId as string, normalizados, null, null)),
    enabled: !!organizationId && ativo,
    // Mantém os cartões anteriores ao mudar de filtro, nunca ao mudar de organização.
    placeholderData: (anterior, consultaAnterior) => (consultaAnterior?.queryKey[1] === organizationId ? anterior : undefined),
    staleTime: STALE_TIME_MS,
    retry: repetir,
  });

  const { refetch } = consulta;
  const colunas = consulta.data ?? SEM_COLUNAS;

  const carregarMais = useCallback((coluna: ColunaQuadro): boolean => {
    if (!organizationId) return false;
    const marca = `${chaveTexto}|${coluna}`;
    // A guarda é síncrona (uma ref): dois cliques seguidos antes de o estado atualizar não pedem duas vezes.
    if (emCurso.current.has(marca)) return true;
    const atual = client.getQueryData<ColunasQuadro>(JSON.parse(chaveTexto))?.[coluna];
    if (!atual?.haMais) return false;
    if (!atual.cursor) {
      // A base diz que há mais mas não deu onde continuar (`chave_ordem` nunca é nula na base): contrato partido. Diz-se (o rodapé mostra o erro
      // e «Repetir») e observa-se, em vez de deixar um botão que não faz nada.
      captureFlowError(new Error(`neg_resumo_quadro: ha_mais sem cursor na coluna ${coluna}`), "pessoas-neg");
      setMais((m) => ({ carregando: m.carregando, erros: new Map(m.erros).set(marca, new ErroNeg(null, null, CHAVE_ERRO_GENERICO)) }));
      return false;
    }
    emCurso.current.add(marca);
    setMais((m) => {
      const erros = new Map(m.erros);
      erros.delete(marca);
      return { carregando: new Set(m.carregando).add(marca), erros };
    });
    const fim = (erro: ErroNeg | null) => {
      emCurso.current.delete(marca);
      setMais((m) => {
        const carregando = new Set(m.carregando);
        carregando.delete(marca);
        const erros = new Map(m.erros);
        if (erro) erros.set(marca, erro);
        return { carregando, erros };
      });
    };
    void pedir(organizationId, normalizados, coluna, atual.cursor).then(
      (linhas) => {
        const nova = montarColunas(linhas)[coluna];
        client.setQueryData<ColunasQuadro>(JSON.parse(chaveTexto), (antes) => (antes ? { ...antes, [coluna]: juntar(antes[coluna], nova) } : antes));
        fim(null);
      },
      (erro: unknown) => fim(comoErroNeg(erro)),
    );
    return true;
    // `normalizados` é função de `chaveTexto`: não precisa de ser dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, organizationId, chaveTexto]);

  const recarregar = useCallback(() => {
    if (!organizationId) return;
    void refetch();
  }, [organizationId, refetch]);

  const cartoes = useMemo(() => COLUNAS_QUADRO.flatMap((d) => colunas[d.id].cartoes), [colunas]);
  const aCarregarMais = useMemo(
    () => new Set(COLUNAS_QUADRO.filter((d) => mais.carregando.has(`${chaveTexto}|${d.id}`)).map((d) => d.id)),
    [mais, chaveTexto],
  );
  const errosAoCarregarMais = useMemo(() => {
    const fora: Partial<Record<ColunaQuadro, ErroNeg>> = {};
    for (const d of COLUNAS_QUADRO) {
      const erro = mais.erros.get(`${chaveTexto}|${d.id}`);
      if (erro) fora[d.id] = erro;
    }
    return fora;
  }, [mais, chaveTexto]);

  return {
    colunas, cartoes,
    isLoading: consulta.isLoading, isFetching: consulta.isFetching, aMostrarAnterior: consulta.isPlaceholderData,
    isError: consulta.isError, erroSemDados: consulta.isError && cartoes.length === 0,
    erro: consulta.isError ? comoErroNeg(consulta.error) : null,
    aCarregarMais, errosAoCarregarMais, carregarMais, recarregar,
  };
}
