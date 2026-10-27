/**
 * O custo no mes escolhido, para o ecra: a retribuicao vem do processamento salarial real (a mesma conta da «Visao
 * geral»), e recalcula quando o store em memoria dos avulsos, equipamentos e taxas muda.
 */
import { useMemo } from "react";
import { useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useFiliaisDaArvore } from "@/components/rh-exemplo/hooks/useFiliaisDaArvore";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import type { LinhaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useCalculoRealDaPessoa, useCalculoRealDoMes } from "@/components/rh-exemplo/processamento/useCalculoReal";
import type { Pessoa } from "@/components/rh-exemplo/tipos";
import { custoDaPessoa, linhasDaOrganizacao, type CustoDaPessoa } from "./custoLido";
import { pessoaParaCusto, SEM_CATALOGOS } from "./pessoaParaCusto";

export type { CustoDaPessoa } from "./custoLido";

/** AAAA-MM -> [ano, mes]. */
export const dividirMes = (mes: string): [number, number] => {
  const [ano, m] = mes.split("-").map(Number);
  return [ano || 0, m || 1];
};

/** As assinaturas do store em memoria que mudam o custo. O calculo le-o directamente; aqui so se sabe QUANDO recalcular. */
function useAssinaturaDoCusto(): unknown[] {
  return [
    useCusto((e) => e.avulsos), useCusto((e) => e.equipamentos), useCusto((e) => e.definicoes), useCusto((e) => e.excecoes),
  ];
}

export interface CustoLidoDaPessoa {
  /** `null` enquanto carrega, ou quando a retribuicao nao se pode ler (ver as outras marcas). */
  custo: CustoDaPessoa | null;
  aCarregar: boolean;
  /** Sem permissao para ver retribuicoes: o custo nao se calcula. */
  retribuicaoRecusada: boolean;
  /** A assiduidade do mes so se leu em parte por falta de permissao. */
  incompleta: boolean;
}

export function useCustoDaPessoa(pessoa: Pessoa, mes: string): CustoLidoDaPessoa {
  const [ano, m] = dividirMes(mes);
  const calculo = useCalculoRealDaPessoa(pessoa.id, ano, m);
  const assinatura = useAssinaturaDoCusto();
  const { resultado, retribuicaoRecusada } = calculo;

  const custo = useMemo(() => {
    if (!resultado || retribuicaoRecusada) return null;
    const dados = { retribuicaoMes: resultado.resultado.totalBrutoEstimado, planeadoMinutos: resultado.totais.planeadoMinutos };
    return custoDaPessoa(pessoaParaCusto(pessoa, SEM_CATALOGOS, dados, mes), mes, resultado.totais.realizadoMinutos / 60);
    // As assinaturas do store em memoria entram para recalcular quando os avulsos ou equipamentos mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoa, mes, resultado, retribuicaoRecusada, ...assinatura]);

  return { custo, aCarregar: calculo.aCarregar, retribuicaoRecusada, incompleta: calculo.incompleta };
}

/** O custo de todas as pessoas activas no mes, para o modulo «Custos». Quem ainda nao tem assiduidade lida fica de fora. */
export function useCustoDaOrganizacao(mes: string) {
  const [ano, m] = dividirMes(mes);
  const calculo = useCalculoRealDoMes(ano, m);
  const { locais } = useLocaisTrabalho();
  const { filiais } = useFiliaisDaArvore();
  const { cargos } = useCargos();
  const assinatura = useAssinaturaDoCusto();
  const { pessoasActivas, resultados } = calculo;
  const retribuicaoRecusada = calculo.retribuicoesHook.recusado;

  const linhas = useMemo<LinhaCusto[]>(() => {
    const catalogos = { locais, filiais, cargos };
    const pessoas = pessoasActivas.flatMap((pessoa) => {
      const r = resultados.get(pessoa.id);
      if (!r) return [];
      const dados = { retribuicaoMes: retribuicaoRecusada ? null : r.resultado.totalBrutoEstimado, planeadoMinutos: r.totais.planeadoMinutos };
      return [pessoaParaCusto(pessoa, catalogos, dados, mes)];
    });
    return linhasDaOrganizacao(mes, pessoas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, pessoasActivas, resultados, retribuicaoRecusada, locais, filiais, cargos, ...assinatura]);

  return { linhas, calculo, ano, mesNum: m };
}
