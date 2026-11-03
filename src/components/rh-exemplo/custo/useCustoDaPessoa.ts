/**
 * O custo no mes escolhido, para o ecra: a retribuicao vem do processamento salarial real (a mesma conta da «Visao
 * geral»), os valores avulsos sao os lancamentos pontuais desse periodo (da base), o tipo de contrato e as horas por
 * semana vem dos vinculos da base, e os equipamentos, as taxas e as excecoes tambem vem da base (hooks `useDadosCusto`).
 */
import { useMemo } from "react";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useFiliaisDaArvore } from "@/components/rh-exemplo/hooks/useFiliaisDaArvore";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { usePessoaVinculoHoras } from "@/components/rh-exemplo/hooks/usePessoaVinculoHoras";
import { usePessoasVinculosVigentes, vinculoDoMes } from "@/components/rh-exemplo/hooks/usePessoasVinculosVigentes";
import type { LinhaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useCalculoRealDaPessoa, useCalculoRealDoMes } from "@/components/rh-exemplo/processamento/useCalculoReal";
import type { Pessoa } from "@/components/rh-exemplo/tipos";
import { custoDaPessoa, linhasDaOrganizacao, type CustoDaPessoa } from "./custoLido";
import {
  acoesDosLancamentos,
  avulsosDosLancamentos,
  lancamentoParaAvulso,
  retribuicaoSemPontuais,
  type AcoesLancamentos,
} from "./lancamentosCusto";
import { horasContratuaisNoMes, pessoaParaCusto, SEM_CATALOGOS } from "./pessoaParaCusto";
import { useDadosCusto } from "./useDadosCusto";

export type { CustoDaPessoa } from "./custoLido";

/** AAAA-MM -> [ano, mes]. */
export const dividirMes = (mes: string): [number, number] => {
  const [ano, m] = mes.split("-").map(Number);
  return [ano || 0, m || 1];
};

export interface CustoLidoDaPessoa {
  /** `null` enquanto carrega, ou quando a retribuicao ou os dados da base nao se podem ler (ver as outras marcas). */
  custo: CustoDaPessoa | null;
  aCarregar: boolean;
  /** Sem permissao para ver retribuicoes: o custo nao se calcula. */
  retribuicaoRecusada: boolean;
  /** O texto traduzido da falha ao ler equipamentos, taxas ou excecoes; `null` quando correu bem. */
  erroBase: string | null;
  /** Pode atribuir, devolver, alterar a conta e guardar taxas (`hr.pessoas.retribuicao.edit`). */
  podeEditar: boolean;
  /** A assiduidade do mes so se leu em parte por falta de permissao. */
  incompleta: boolean;
  /** Registar e anular valores avulsos (lancamentos pontuais do periodo do mes). */
  lancamentos: AcoesLancamentos;
}

export function useCustoDaPessoa(pessoa: Pessoa, mes: string): CustoLidoDaPessoa {
  const [ano, m] = dividirMes(mes);
  const { activeCompany } = useCompany();
  const calculo = useCalculoRealDaPessoa(pessoa.id, ano, m);
  const horas = usePessoaVinculoHoras(pessoa.id, activeCompany.id);
  const base = useDadosCusto(pessoa.id);
  const { resultado, dados } = calculo;
  const retribuicaoRecusada = calculo.retribuicaoRecusada || base.semPermissao;
  const dadosBase = base.dados;
  const lancamentosDaPessoa = dados.lancamentosPorPessoa.get(pessoa.id);

  const custo = useMemo(() => {
    if (!resultado || retribuicaoRecusada || !dadosBase) return null;
    const avulsos = (lancamentosDaPessoa ?? []).map((l) => lancamentoParaAvulso(l, mes));
    const dadosDoMes = {
      retribuicaoMes: retribuicaoSemPontuais(resultado),
      planeadoMinutos: resultado.totais.planeadoMinutos,
      horasContratuais: horasContratuaisNoMes(horas.versoes, mes),
    };
    return custoDaPessoa(pessoaParaCusto(pessoa, SEM_CATALOGOS, dadosDoMes, mes), mes, resultado.totais.realizadoMinutos / 60, dadosBase, avulsos);
  }, [pessoa, mes, resultado, retribuicaoRecusada, lancamentosDaPessoa, horas.versoes, dadosBase]);

  return {
    custo,
    aCarregar: calculo.aCarregar || horas.loading || (!retribuicaoRecusada && base.aCarregar),
    retribuicaoRecusada,
    erroBase: base.erro,
    podeEditar: base.podeEditar,
    incompleta: calculo.incompleta,
    lancamentos: acoesDosLancamentos(dados),
  };
}

/** O custo de todas as pessoas activas no mes, para o modulo «Custos». Quem ainda nao tem assiduidade lida fica de fora. */
export function useCustoDaOrganizacao(mes: string) {
  const [ano, m] = dividirMes(mes);
  const calculo = useCalculoRealDoMes(ano, m);
  const { locais } = useLocaisTrabalho();
  const { filiais } = useFiliaisDaArvore();
  const { cargos } = useCargos();
  const vinculosHook = usePessoasVinculosVigentes();
  const base = useDadosCusto(null);
  const dadosBase = base.dados;
  const { pessoasActivas, resultados, lancamentosPorPessoa } = calculo;
  const retribuicaoRecusada = calculo.retribuicoesHook.recusado || base.semPermissao;
  const { vinculos } = vinculosHook;

  const avulsosReais = useMemo(() => avulsosDosLancamentos(lancamentosPorPessoa, mes), [lancamentosPorPessoa, mes]);
  const avulsosPorPessoa = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof avulsosDosLancamentos>>();
    for (const a of avulsosReais) mapa.set(a.pessoaId, [...(mapa.get(a.pessoaId) ?? []), a]);
    return mapa;
  }, [avulsosReais]);

  const linhas = useMemo<LinhaCusto[]>(() => {
    // Sem os dados da base (a carregar, falha ou sem permissao) nao ha linhas: nunca se calcula com valores de exemplo.
    if (!dadosBase) return [];
    const catalogos = { locais, filiais, cargos };
    const pessoas = pessoasActivas.flatMap((pessoa) => {
      const r = resultados.get(pessoa.id);
      if (!r) return [];
      const vinculo = vinculoDoMes(vinculos.get(pessoa.id), mes);
      const dados = {
        retribuicaoMes: retribuicaoRecusada ? null : retribuicaoSemPontuais(r),
        planeadoMinutos: r.totais.planeadoMinutos,
        tipoContrato: vinculo?.tipoContrato ?? null,
        horasContratuais: vinculo?.horasSemanais ?? null,
      };
      return [pessoaParaCusto(pessoa, catalogos, dados, mes)];
    });
    return linhasDaOrganizacao(mes, pessoas, dadosBase, avulsosReais);
  }, [mes, pessoasActivas, resultados, retribuicaoRecusada, locais, filiais, cargos, vinculos, avulsosReais, dadosBase]);

  return {
    linhas,
    /** Os dados da base ainda nao chegaram (equipamentos, taxas, excecoes). */
    baseACarregar: !base.semPermissao && base.aCarregar,
    /** Ha dados da base (mesmo antigos): se uma releitura falhar, mostram-se com o aviso de erro em vez de esconder tudo. */
    baseTemDados: dadosBase !== null,
    erroBase: base.erro,
    semPermissaoCusto: base.semPermissao,
    podeEditar: base.podeEditar,
    calculo,
    ano,
    mesNum: m,
    vinculosHook,
    avulsosPorPessoa,
    lancamentos: acoesDosLancamentos(calculo),
  };
}
