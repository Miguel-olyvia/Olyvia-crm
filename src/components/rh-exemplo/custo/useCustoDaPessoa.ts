/**
 * O custo no mes escolhido, para o ecra: a retribuicao vem do processamento salarial real (a mesma conta da «Visao
 * geral»), os valores avulsos sao os lancamentos pontuais desse periodo (da base), o tipo de contrato e as horas por
 * semana vem dos vinculos da base, e os equipamentos, as taxas e as excecoes tambem vem da base (hooks `useDadosCusto`).
 *
 * MES FECHADO: as horas (planeadas e realizadas) e a retribuicao sem pontuais sao as GRAVADAS no fecho do periodo
 * (`useProcessamentoResultados`) e o calculo vivo desse mes nao se monta. Sem linha gravada para a pessoa (ou periodo fechado
 * antes do registo, sem permissao, com erro) o ecra avisa («Sem valores gravados no fecho») e nunca recalcula. Equipamentos,
 * taxas, excecoes e banco de horas continuam vivos. Periodo aberto ou sem periodo: tudo vivo, como sempre.
 */
import { useMemo } from "react";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useFiliaisDaArvore } from "@/components/rh-exemplo/hooks/useFiliaisDaArvore";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { usePessoaVinculoHoras } from "@/components/rh-exemplo/hooks/usePessoaVinculoHoras";
import { usePessoasVinculosVigentes, vinculoDoMes } from "@/components/rh-exemplo/hooks/usePessoasVinculosVigentes";
import { useProcessamentoResultados } from "@/components/rh-exemplo/hooks/useProcessamentoResultados";
import type { LinhaCusto, PessoaParaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useCalculoRealDaPessoa, useCalculoRealDoMes } from "@/components/rh-exemplo/processamento/useCalculoReal";
import type { Pessoa } from "@/components/rh-exemplo/tipos";
import { custoDaPessoa, linhasDaOrganizacao, type CustoDaPessoa } from "./custoLido";
import { pessoaDaLinhaGravada, valoresDoFecho } from "./custoFechado";
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
  /** O periodo do mes esta fechado: horas e retribuicao sao as gravadas no fecho. */
  fechado: boolean;
  /** Mes fechado sem valores gravados para esta pessoa: o ecra avisa e nao recalcula. */
  semValoresGravados: boolean;
}

export function useCustoDaPessoa(pessoa: Pessoa, mes: string): CustoLidoDaPessoa {
  const [ano, m] = dividirMes(mes);
  const { activeCompany } = useCompany();
  const calculo = useCalculoRealDaPessoa(pessoa.id, ano, m, { congelarSeFechado: true });
  const horas = usePessoaVinculoHoras(pessoa.id, activeCompany.id);
  const base = useDadosCusto(pessoa.id);
  const { dados } = calculo;
  const periodo = dados.periodoHook.periodo;
  const fechado = periodo?.estado === "fechado";
  const gravados = useProcessamentoResultados(periodo?.id, fechado);
  // Num mes fechado o calculo vivo nem se le: o `resultado` so existe no periodo aberto (ou sem periodo).
  const resultado = fechado ? null : calculo.resultado;
  const valores = useMemo(() => (fechado ? valoresDoFecho(gravados.porPessoa.get(pessoa.id)) : null), [fechado, gravados.porPessoa, pessoa.id]);
  const gravadosACarregar = fechado && gravados.estado === "a_carregar";
  const semValoresGravados = fechado && !gravadosACarregar && valores === null;
  const retribuicaoRecusada = calculo.retribuicaoRecusada || base.semPermissao;
  const dadosBase = base.dados;
  const lancamentosDaPessoa = dados.lancamentosPorPessoa.get(pessoa.id);

  const custo = useMemo(() => {
    if (retribuicaoRecusada || !dadosBase) return null;
    const avulsos = (lancamentosDaPessoa ?? []).map((l) => lancamentoParaAvulso(l, mes));
    if (fechado) {
      if (gravadosACarregar) return null;
      // Sem linha gravada: sem retribuicao e sem horas (nunca recalculadas); o custo fica «sem valor» e o ecra avisa.
      const dadosDoMes = { retribuicaoMes: valores?.retribuicaoMes ?? null, planeadoMinutos: valores?.planeadoMinutos ?? 0, horasContratuais: horasContratuaisNoMes(horas.versoes, mes) };
      return custoDaPessoa(pessoaParaCusto(pessoa, SEM_CATALOGOS, dadosDoMes, mes), mes, valores ? valores.realizadoMinutos / 60 : null, dadosBase, avulsos);
    }
    if (!resultado) return null;
    const dadosDoMes = {
      retribuicaoMes: retribuicaoSemPontuais(resultado),
      planeadoMinutos: resultado.totais.planeadoMinutos,
      horasContratuais: horasContratuaisNoMes(horas.versoes, mes),
    };
    return custoDaPessoa(pessoaParaCusto(pessoa, SEM_CATALOGOS, dadosDoMes, mes), mes, resultado.totais.realizadoMinutos / 60, dadosBase, avulsos);
  }, [pessoa, mes, fechado, gravadosACarregar, valores, resultado, retribuicaoRecusada, lancamentosDaPessoa, horas.versoes, dadosBase]);

  return {
    custo,
    aCarregar: calculo.aCarregar || horas.loading || gravadosACarregar || (!retribuicaoRecusada && base.aCarregar),
    retribuicaoRecusada,
    erroBase: base.erro,
    podeEditar: base.podeEditar,
    incompleta: calculo.incompleta,
    lancamentos: acoesDosLancamentos(dados),
    fechado,
    semValoresGravados,
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
  const { pessoasActivas, todasAsPessoas, lancamentosPorPessoa } = calculo;
  const periodo = calculo.periodoHook.periodo;
  const fechado = periodo?.estado === "fechado";
  const gravados = useProcessamentoResultados(periodo?.id, fechado);
  const gravadosACarregar = fechado && gravados.estado === "a_carregar";
  const gravadosFalhou = fechado && (gravados.estado === "erro" || gravados.estado === "recusado");
  // Os resultados vivos so se leem no periodo aberto; fechado nunca se montam (e as dependencias do useMemo ficam estaticas).
  const resultadosVivos = fechado ? null : calculo.resultados;
  // Fechado, mas sem nada gravado que se possa usar (fechado antes do registo, sem permissao ou com erro): o ecra avisa.
  const semValoresGravados = fechado && !gravadosACarregar && (gravados.estado !== "ok" || gravados.antesDoRegisto);
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
    const dadosDe = (pessoaId: string, planeadoMinutos: number, retribuicaoMes: number | null) => {
      const vinculo = vinculoDoMes(vinculos.get(pessoaId), mes);
      return {
        retribuicaoMes: retribuicaoRecusada ? null : retribuicaoMes,
        planeadoMinutos,
        tipoContrato: vinculo?.tipoContrato ?? null,
        horasContratuais: vinculo?.horasSemanais ?? null,
      };
    };
    if (fechado) {
      // Mes fechado: as linhas vem do gravado, tambem de quem saiu depois do fecho. O calculo vivo nem se le.
      if (gravadosACarregar) return [];
      const nomes = new Map((todasAsPessoas ?? pessoasActivas).map((p) => [p.id, p]));
      const horasRealizadas = new Map<string, number>();
      const pessoas: PessoaParaCusto[] = [];
      for (const [id, linha] of gravados.porPessoa) {
        const valores = valoresDoFecho(linha);
        const pessoa = nomes.get(id) ?? pessoaDaLinhaGravada(linha);
        if (valores) horasRealizadas.set(id, valores.realizadoMinutos / 60);
        pessoas.push({ ...pessoaParaCusto(pessoa, catalogos, dadosDe(id, valores?.planeadoMinutos ?? 0, valores?.retribuicaoMes ?? null), mes), semValoresGravados: valores === null });
      }
      // As pessoas activas sem linha gravada aparecem com o aviso, nunca com um valor recalculado.
      for (const pessoa of pessoasActivas) {
        if (gravados.porPessoa.has(pessoa.id)) continue;
        pessoas.push({ ...pessoaParaCusto(pessoa, catalogos, dadosDe(pessoa.id, 0, null), mes), semValoresGravados: true });
      }
      return linhasDaOrganizacao(mes, pessoas, dadosBase, avulsosReais, horasRealizadas);
    }
    const pessoas = pessoasActivas.flatMap((pessoa) => {
      const r = resultadosVivos?.get(pessoa.id);
      if (!r) return [];
      return [pessoaParaCusto(pessoa, catalogos, dadosDe(pessoa.id, r.totais.planeadoMinutos, retribuicaoSemPontuais(r)), mes)];
    });
    return linhasDaOrganizacao(mes, pessoas, dadosBase, avulsosReais);
  }, [mes, fechado, gravadosACarregar, gravados.porPessoa, pessoasActivas, todasAsPessoas, resultadosVivos, retribuicaoRecusada, locais, filiais, cargos, vinculos, avulsosReais, dadosBase]);

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
    /** O periodo do mes esta fechado: horas e retribuicao sao as gravadas no fecho e o calculo vivo nao se monta. */
    fechado,
    /** Mes fechado sem valores gravados utilizaveis: o ecra avisa em vez de mostrar custos recalculados. */
    semValoresGravados,
    /** Mes fechado a ler os valores gravados. */
    gravadosACarregar,
    /** Mes fechado cujo gravado deu erro ou foi recusado: o ecra oferece «Tentar de novo». */
    gravadosFalhou,
    /** Volta a ler os valores gravados (o do hook dos gravados). */
    recarregarGravados: gravados.recarregar,
  };
}
