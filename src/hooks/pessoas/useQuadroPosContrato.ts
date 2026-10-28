import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUNAS_POS_CONTRATO, type ColunaPosContrato } from "@/components/pessoas/quadro/colunasPosContrato";
import { obterArmazem } from "@/components/pessoas/negocioEmylia/armazemNegocioEmylia";
import { cartaoPosContratoDe, filtrarCartoesPosContrato, type CartaoPosContrato } from "./adaptarCartaoPosContrato";
import { ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import type { FiltrosQuadro } from "./quadroPessoasTipos";
import { useFontePessoas } from "./useFontePessoas";

const IDS: readonly ColunaPosContrato[] = COLUNAS_POS_CONTRATO.map((c) => c.id);

export interface EstadoColunaPosContrato {
  cartoes: CartaoPosContrato[];
  cursor: null;
  /** Sem páginas: a leitura traz todos os negócios da organização de uma vez. */
  haMais: false;
  total: number;
  valor: number;
}
type ColunasPosContrato = Record<ColunaPosContrato, EstadoColunaPosContrato>;

export interface QuadroPosContratoEstado {
  colunas: ColunasPosContrato;
  /** Todos os cartões, Financeiro primeiro. */
  cartoes: CartaoPosContrato[];
  /** A leitura da organização ainda não acabou. */
  isLoading: boolean;
  isError: boolean;
  erro: ErroNeg | null;
  /** Nada se pagina (tudo vem na mesma leitura): ficam vazios e `carregarMais` nunca pede nada. */
  aCarregarMais: ReadonlySet<ColunaPosContrato>;
  errosAoCarregarMais: Partial<Record<ColunaPosContrato, ErroNeg>>;
  carregarMais: (coluna: ColunaPosContrato) => boolean;
  /** Lê outra vez a organização (o erro tem «Repetir»). */
  recarregar: () => void;
}

const SEM_PAGINAS = { aCarregarMais: new Set<ColunaPosContrato>(), errosAoCarregarMais: {} as Partial<Record<ColunaPosContrato, ErroNeg>>, carregarMais: () => false };

function colunasDe(cartoes: readonly CartaoPosContrato[]): ColunasPosContrato {
  const fora = {} as ColunasPosContrato;
  for (const id of IDS) {
    const dela = cartoes.filter((c) => c.coluna === id);
    fora[id] = { cartoes: dela, cursor: null, haMais: false, total: dela.length, valor: dela.reduce((s, c) => s + (c.valor ?? 0), 0) };
  }
  return fora;
}

/**
 * As colunas Financeiro e Obra do Pipeline, lidas da MESMA leitura que a página de Negócios e a ficha usam (neg_ler_negocios, pelo armazém do Ben): uma leitura por
 * organização, partilhada, sem dupla chamada, e sem depender de nenhuma função própria do quadro. `negocios.fase` 4 é Financeiro e 5 é Obra. O mesmo filtro do
 * Pipeline (papel, pesquisa, ordem) aplica-se. Quando a ficha grava, o armazém avisa e as colunas refazem-se sozinhas. Se a leitura falha, `isError` e `recarregar`.
 */
export function useQuadroPosContrato(filtros: FiltrosQuadro, ativo = true, sb: SupabaseClient = supabase as unknown as SupabaseClient): QuadroPosContratoEstado {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const utilizador = fonte.modo === "real" ? (fonte.utilizadorId ?? "") : "";
  const armazem = useMemo(() => (ativo && org ? obterArmazem(sb, org, utilizador) : null), [ativo, org, sb, utilizador]);
  const subscrever = useCallback((f: () => void) => (armazem ? armazem.subscrever(f) : () => undefined), [armazem]);
  const versao = useSyncExternalStore(subscrever, () => (armazem ? armazem.versao() : 0), () => 0);
  // ao abrir o Pipeline: ler outra vez, se a última leitura não é fresca e não há nada por gravar
  useEffect(() => { armazem?.atualizar(); }, [armazem]);
  const leitura = armazem?.leitura() ?? { k: "a-ler" as const };
  const { papel, pesquisa, ordem } = filtros;
  const cartoes = useMemo(() => {
    if (!armazem || leitura.k !== "pronto") return [];
    const todos = armazem.negociosLidos().flatMap((n) => { const c = cartaoPosContratoDe(n, armazem.S); return c ? [c] : []; });
    return filtrarCartoesPosContrato(todos, { papel, pesquisa, ordem });
    // `versao` muda sempre que o armazém muda (leitura, gravação): é ela que refaz as colunas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armazem, leitura.k, versao, papel, pesquisa, ordem]);
  const colunas = useMemo(() => colunasDe(cartoes), [cartoes]);
  const todosOsCartoes = useMemo(() => IDS.flatMap((id) => colunas[id].cartoes), [colunas]);
  const recarregar = useCallback(() => { armazem?.reler(); }, [armazem]);
  const erro = leitura.k === "erro" ? new ErroNeg(new Error(leitura.t), null, CHAVE_ERRO_GENERICO) : null;
  return {
    colunas, cartoes: todosOsCartoes, isLoading: ativo && org !== null && leitura.k === "a-ler", isError: leitura.k === "erro", erro, recarregar, ...SEM_PAGINAS,
  };
}
