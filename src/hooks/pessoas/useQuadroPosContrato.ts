import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLUNAS_POS_CONTRATO, type ColunaPosContrato } from "@/components/pessoas/quadro/colunasPosContrato";
import { adaptarLinhaPosContrato, type CartaoPosContrato } from "./adaptarCartaoPosContrato";
import { valorOuZero } from "./adaptarCartaoQuadro";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { PAGINA_COLUNA, type CursorQuadro, type FiltrosQuadro, type LinhaQuadroDb } from "./quadroPessoasTipos";
import { comoErroNeg, pesquisaEfetiva, repetir } from "./useListaPessoas";
import { useFontePessoas } from "./useFontePessoas";
import { quadroPessoasQueryKey } from "./useQuadroPessoas";

const STALE_TIME_MS = 30_000;
/** O que a versão antiga de neg_resumo_quadro responde a uma coluna que não conhece (parâmetro inválido). */
const CODIGO_COLUNA_DESCONHECIDA = "NG009";
const IDS: readonly ColunaPosContrato[] = COLUNAS_POS_CONTRATO.map((c) => c.id);

export interface EstadoColunaPosContrato {
  cartoes: CartaoPosContrato[];
  cursor: CursorQuadro | null;
  haMais: boolean;
  /** O total da coluna INTEIRA segundo a base. */
  total: number;
  valor: number;
}
type ColunasPosContrato = Record<ColunaPosContrato, EstadoColunaPosContrato>;

interface Dados {
  colunas: ColunasPosContrato;
  /** A base ainda não conhece as colunas (versão antiga da função): vêm vazias, e diz-se. */
  indisponivel: boolean;
}

export interface QuadroPosContratoEstado {
  colunas: ColunasPosContrato;
  /** Todos os cartões carregados, Financeiro primeiro. */
  cartoes: CartaoPosContrato[];
  isLoading: boolean;
  isError: boolean;
  erro: ErroNeg | null;
  /** A base ainda não tem as colunas Financeiro e Obra: aparecem vazias com um aviso, sem partir o quadro. */
  indisponivel: boolean;
  aCarregarMais: ReadonlySet<ColunaPosContrato>;
  errosAoCarregarMais: Partial<Record<ColunaPosContrato, ErroNeg>>;
  /** `true`: há um pedido a andar; `false`: nada se pediu (sem mais cartões, ou o cursor falta e ficou o erro). */
  carregarMais: (coluna: ColunaPosContrato) => boolean;
  recarregar: () => void;
}

const colunaVazia = (): EstadoColunaPosContrato => ({ cartoes: [], cursor: null, haMais: false, total: 0, valor: 0 });
const colunasVazias = (): ColunasPosContrato => ({ financeiro: colunaVazia(), obra: colunaVazia() });
const SEM_COLUNAS = colunasVazias();

function normalizar(f: FiltrosQuadro) {
  return { papel: f.papel, pesquisa: pesquisaEfetiva(f.pesquisa), ordem: f.ordem };
}
type Filtros = ReturnType<typeof normalizar>;

async function pedir(organizationId: string, filtros: Filtros, colunas: readonly ColunaPosContrato[], depois: CursorQuadro | null): Promise<LinhaQuadroDb[]> {
  const linhas = await chamarNeg<LinhaQuadroDb[] | null>("neg_resumo_quadro", {
    p_organization_id: organizationId,
    p_colunas: [...colunas],
    p_papel: filtros.papel,
    p_pesquisa: filtros.pesquisa,
    p_ordem: filtros.ordem,
    p_depois_de_chave: depois?.chave ?? null,
    p_depois_de_id: depois?.id ?? null,
    p_limite: PAGINA_COLUNA,
  });
  return linhas ?? [];
}

/** Agrupa as linhas por coluna; os totais são os da coluna inteira (a base repete-os em cada linha). */
function montarColunas(linhas: readonly LinhaQuadroDb[]): ColunasPosContrato {
  const colunas = colunasVazias();
  for (const linha of linhas) {
    const adaptada = adaptarLinhaPosContrato(linha);
    if (!adaptada) continue;
    const cartoes = [...colunas[adaptada.cartao.coluna].cartoes, adaptada.cartao];
    const total = Number(linha.total_coluna);
    colunas[adaptada.cartao.coluna] = {
      cartoes, cursor: adaptada.cursor, haMais: linha.ha_mais === true,
      total: Number.isFinite(total) && linha.total_coluna !== null ? total : cartoes.length, valor: valorOuZero(linha.valor_coluna),
    };
  }
  return colunas;
}

function juntar(atual: EstadoColunaPosContrato, nova: EstadoColunaPosContrato): EstadoColunaPosContrato {
  if (nova.cartoes.length === 0) return { ...atual, haMais: false };
  const vistos = new Set(atual.cartoes.map((c) => c.id));
  return { cartoes: [...atual.cartoes, ...nova.cartoes.filter((c) => !vistos.has(c.id))], cursor: nova.cursor ?? atual.cursor, haMais: nova.haMais, total: nova.total, valor: nova.valor };
}

interface EstadoMais {
  carregando: ReadonlySet<string>;
  erros: ReadonlyMap<string, ErroNeg>;
}
const MAIS_INICIAL: EstadoMais = { carregando: new Set(), erros: new Map() };

/**
 * As colunas Financeiro e Obra do Pipeline: UMA chamada a neg_resumo_quadro (25 cartões por coluna), à parte da do Quadro principal, para o Quadro das
 * sete colunas não mudar. Só lê. Se a base ainda tem a versão antiga da função (NG009), as colunas vêm vazias com `indisponivel`. A chave fica DEBAIXO da
 * do Quadro: qualquer invalidação dele (por exemplo depois de gravar um negócio) refaz também estas colunas.
 */
export function useQuadroPosContrato(filtros: FiltrosQuadro, ativo = true): QuadroPosContratoEstado {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const normalizados = normalizar(filtros);
  const chave = [...quadroPessoasQueryKey(organizationId), "posContrato", normalizados] as const;
  const chaveTexto = JSON.stringify(chave);
  const [mais, setMais] = useState<EstadoMais>(MAIS_INICIAL);
  const emCurso = useRef(new Set<string>());

  const consulta = useQuery<Dados>({
    queryKey: chave,
    queryFn: async () => {
      try {
        return { colunas: montarColunas(await pedir(organizationId as string, normalizados, IDS, null)), indisponivel: false };
      } catch (erro) {
        if (erro instanceof ErroNeg && erro.codigo === CODIGO_COLUNA_DESCONHECIDA) return { colunas: colunasVazias(), indisponivel: true };
        throw erro;
      }
    },
    enabled: !!organizationId && ativo,
    placeholderData: (anterior, consultaAnterior) => (consultaAnterior?.queryKey[1] === organizationId ? anterior : undefined),
    staleTime: STALE_TIME_MS,
    retry: repetir,
  });
  const { refetch } = consulta;
  const colunas = consulta.data?.colunas ?? SEM_COLUNAS;

  const carregarMais = useCallback((coluna: ColunaPosContrato): boolean => {
    if (!organizationId) return false;
    const marca = `${chaveTexto}|${coluna}`;
    if (emCurso.current.has(marca)) return true;
    const atual = client.getQueryData<Dados>(JSON.parse(chaveTexto))?.colunas[coluna];
    if (!atual?.haMais) return false;
    if (!atual.cursor) {
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
    // Uma só saída: o que rebenta a tratar a resposta (uma linha malformada) também acaba em erro na coluna, e `fim` corre sempre (nada fica a «carregar»).
    void pedir(organizationId, normalizados, [coluna], atual.cursor)
      .then((linhas): ErroNeg | null => {
        const nova = montarColunas(linhas)[coluna];
        client.setQueryData<Dados>(JSON.parse(chaveTexto), (antes) => (antes ? { ...antes, colunas: { ...antes.colunas, [coluna]: juntar(antes.colunas[coluna], nova) } } : antes));
        return null;
      })
      .catch((erro: unknown): ErroNeg => {
        if (!(erro instanceof ErroNeg)) captureFlowError(erro, "pessoas-neg");
        return comoErroNeg(erro);
      })
      .then(fim);
    return true;
    // `normalizados` é função de `chaveTexto`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, organizationId, chaveTexto]);

  const recarregar = useCallback(() => {
    if (!organizationId) return;
    void refetch();
  }, [organizationId, refetch]);

  const cartoes = useMemo(() => IDS.flatMap((id) => colunas[id].cartoes), [colunas]);
  const aCarregarMais = useMemo(() => new Set(IDS.filter((id) => mais.carregando.has(`${chaveTexto}|${id}`))), [mais, chaveTexto]);
  const errosAoCarregarMais = useMemo(() => {
    const fora: Partial<Record<ColunaPosContrato, ErroNeg>> = {};
    for (const id of IDS) {
      const erro = mais.erros.get(`${chaveTexto}|${id}`);
      if (erro) fora[id] = erro;
    }
    return fora;
  }, [mais, chaveTexto]);

  return {
    colunas, cartoes, isLoading: consulta.isLoading, isError: consulta.isError, erro: consulta.isError ? comoErroNeg(consulta.error) : null,
    indisponivel: consulta.data?.indisponivel === true, aCarregarMais, errosAoCarregarMais, carregarMais, recarregar,
  };
}
