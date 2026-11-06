/**
 * O calculo REAL do processamento salarial, partilhado pelo «Calculo do mes», pelos «Custos» e pelo valor da hora do
 * desconto de uma falta. Nao ha segunda conta: tudo passa por `calcularResultadoReal` (a mesma da «Visao geral»).
 *
 * Fontes (todas por wrappers de rh-exemplo/hooks): pessoas, relatorio de assiduidade mensal, retribuicoes vigentes da
 * organizacao, codigos de processamento, regra salarial em vigor, direitos das pessoas, periodo e lancamentos pontuais.
 *
 * POR QUE HA UMA INSTANCIA OCULTA POR PESSOA
 * -------------------------------------------
 * `useRelatorioAssiduidadeMensal` e um hook de uma pessoa e as regras dos hooks nao deixam chamá-lo num ciclo. Segue-se o
 * padrao da «Visao geral» (`ResumoPessoaProcessamentoOculto`): um componente por pessoa que devolve os totais por callback.
 * Esta versao tambem devolve se alguma parte da assiduidade foi recusada por falta de permissao, para o ecra o dizer.
 * Os totais ficam guardados com o mes na chave, para um mes novo nunca mostrar os totais do anterior.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useCodigosProcessamento } from "@/components/rh-exemplo/hooks/useCodigosProcessamento";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useProcessamentoLancamentos } from "@/components/rh-exemplo/hooks/useProcessamentoLancamentos";
import { useProcessamentoPeriodo } from "@/components/rh-exemplo/hooks/useProcessamentoPeriodo";
import { regraEmVigorNoDia, useRegrasSalariais } from "@/components/rh-exemplo/hooks/useRegrasSalariais";
import { direitosDaPessoa, useDireitosSalariaisDaOrganizacao } from "@/components/rh-exemplo/hooks/useDireitosSalariaisDaOrganizacao";
import {
  useRelatorioAssiduidadeMensal,
  type DiaRelatorioMensal,
  type TotaisRelatorioMensal,
} from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";
import { useRetribuicoesVigentesDaOrganizacao } from "@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao";
import { intervaloEfectivo, usePeriodoFolhaRegras } from "@/components/rh-exemplo/hooks/periodoFolha";
import type { HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";
import { calcularResultadoReal, type ResultadoCalculoReal } from "./calculoReal";

const SEM_FAIXAS: readonly { hora_inicio: string; hora_fim: string }[] = [];

/** O que a assiduidade de uma pessoa devolveu, e se alguma parte foi recusada por falta de permissao. */
export interface RecolhaAssiduidade {
  totais: TotaisRelatorioMensal;
  dias: readonly DiaRelatorioMensal[];
  incompleta: boolean;
}

/** O que e comum a todas as pessoas do mes: periodo, lancamentos, retribuicoes, codigos, a regra salarial em vigor e os direitos. */
export function useDadosDoCalculoReal(ano: number, mes: number) {
  const { activeCompany } = useCompany();
  const { codigos, isLoading: codigosACarregar, estado: codigosEstado } = useCodigosProcessamento();
  const periodoHook = useProcessamentoPeriodo(ano, mes);
  const periodoId = periodoHook.periodo?.id;
  const lancamentosHook = useProcessamentoLancamentos(periodoId);
  // O intervalo da folha (as datas do periodo, ou as regras): faltas, horas extra, assiduidade e subsidio contam por ele.
  const { regras } = usePeriodoFolhaRegras();
  const intervalo = useMemo(() => intervaloEfectivo(periodoHook.periodo, ano, mes, regras), [periodoHook.periodo, ano, mes, regras]);
  const retribuicoesHook = useRetribuicoesVigentesDaOrganizacao(activeCompany?.id, ano, mes, intervalo);
  const regrasHook = useRegrasSalariais();
  const direitosHook = useDireitosSalariaisDaOrganizacao(activeCompany?.id);
  const ultimoDia = intervalo.ate;
  // A regra em vigor no ULTIMO DIA do periodo (a mesma a que a base calcula km e ajudas) e as suas faixas noturnas.
  const regra = useMemo(() => regraEmVigorNoDia(regrasHook.versoes, ultimoDia), [regrasHook.versoes, ultimoDia]);
  const faixasNoturnas = useMemo(() => regra?.noturnas ?? SEM_FAIXAS, [regra]);
  const codigosActivos = useMemo(() => codigos.filter((c) => c.activo), [codigos]);

  // So os lancamentos do periodo deste mes: ao mudar de mes o hook ainda guarda os do anterior ate a resposta chegar.
  const lancamentosPorPessoa = useMemo(() => {
    const mapa = new Map<string, HrProcessamentoLancamento[]>();
    for (const l of lancamentosHook.lancamentos) {
      if (l.periodo_id !== periodoId) continue;
      const lista = mapa.get(l.pessoa_id) ?? [];
      lista.push(l);
      mapa.set(l.pessoa_id, lista);
    }
    return mapa;
  }, [lancamentosHook.lancamentos, periodoId]);

  return {
    periodoHook,
    lancamentosHook,
    retribuicoesHook,
    regrasHook,
    direitosHook,
    /** Os direitos (IHT, km, ajudas) so valem se a leitura correu bem; senao os totais podem estar incompletos. */
    direitosLidos: direitosHook.estado === "ok",
    /** O catalogo de codigos lido por inteiro (`ok`), a carregar, recusado ou com erro: so `ok` deixa fechar o periodo. */
    codigosEstado,
    regra,
    faixasNoturnas,
    intervalo,
    ultimoDia,
    codigosActivos,
    lancamentosPorPessoa,
    aCarregar:
      periodoHook.loading ||
      lancamentosHook.loading ||
      retribuicoesHook.loading ||
      regrasHook.isLoading ||
      direitosHook.isLoading ||
      codigosACarregar,
  };
}

export type DadosDoCalculoReal = ReturnType<typeof useDadosDoCalculoReal>;

/** O calculo de toda a organizacao num mes: uma linha por pessoa activa. */
export function useCalculoRealDoMes(ano: number, mes: number) {
  const dados = useDadosDoCalculoReal(ano, mes);
  const { pessoas, loading: pessoasACarregar, error: pessoasErro } = usePessoas();
  const chave = `${ano}-${mes}-${dados.intervalo.de}-${dados.intervalo.ate}`;
  const [recolhas, setRecolhas] = useState<Record<string, RecolhaAssiduidade>>({});

  const pessoasActivas = useMemo(() => pessoas.filter((p) => p.estado_registo === "activo"), [pessoas]);

  const registar = useCallback(
    (pessoaId: string, recolha: RecolhaAssiduidade) => {
      setRecolhas((actual) => ({ ...actual, [`${chave}:${pessoaId}`]: recolha }));
    },
    [chave],
  );

  const { retribuicoesHook, ultimoDia, lancamentosPorPessoa, codigosActivos, regra, direitosHook } = dados;
  const direitosPorPessoa = direitosHook.porPessoa;
  const resultados = useMemo(() => {
    const mapa = new Map<string, ResultadoCalculoReal>();
    for (const pessoa of pessoasActivas) {
      const recolha = recolhas[`${chave}:${pessoa.id}`];
      if (!recolha) continue;
      mapa.set(
        pessoa.id,
        calcularResultadoReal({
          totais: recolha.totais,
          dias: recolha.dias,
          versoes: retribuicoesHook.porPessoa.get(pessoa.id) ?? [],
          ultimoDia,
          lancamentos: lancamentosPorPessoa.get(pessoa.id) ?? [],
          codigosActivos,
          regra,
          direitoIht: direitosDaPessoa(direitosPorPessoa, pessoa.id).iht,
        }),
      );
    }
    return mapa;
  }, [pessoasActivas, recolhas, chave, retribuicoesHook.porPessoa, ultimoDia, lancamentosPorPessoa, codigosActivos, regra, direitosPorPessoa]);

  const pendentes = pessoasActivas.filter((p) => !recolhas[`${chave}:${p.id}`]).length;
  const incompletas = pessoasActivas.filter((p) => recolhas[`${chave}:${p.id}`]?.incompleta).length;
  /** A assiduidade desta pessoa so se leu em parte (recusada ou com erro): bloqueia o fecho. */
  const assiduidadeIncompleta = useCallback(
    (pessoaId: string) => recolhas[`${chave}:${pessoaId}`]?.incompleta === true,
    [recolhas, chave],
  );

  return {
    ...dados,
    pessoasActivas,
    /** Todas as pessoas (tambem as arquivadas): um periodo fechado pode ter resultados de quem entretanto saiu. */
    todasAsPessoas: pessoas,
    pessoasACarregar,
    pessoasErro,
    resultados,
    registar,
    /** Pessoas cuja assiduidade ainda nao chegou. */
    pendentes,
    /** Pessoas cuja assiduidade so se leu em parte por falta de permissao. */
    incompletas,
    assiduidadeIncompleta,
  };
}

export type CalculoRealDoMes = ReturnType<typeof useCalculoRealDoMes>;

interface RecolhaOcultaProps {
  pessoaId: string;
  ano: number;
  /** 1-12 (o wrapper do relatorio converte). */
  mes: number;
  intervalo: { de: string; ate: string };
  /** As faixas noturnas da regra em vigor (memoizadas): sem elas nao ha minutos noturnos por faixa. */
  faixasNoturnas: readonly { hora_inicio: string; hora_fim: string }[];
  aoTerminar: (pessoaId: string, recolha: RecolhaAssiduidade) => void;
}

function RecolhaOculta({ pessoaId, ano, mes, intervalo, faixasNoturnas, aoTerminar }: RecolhaOcultaProps) {
  const relatorio = useRelatorioAssiduidadeMensal(pessoaId, ano, mes, intervalo, faixasNoturnas);
  const avisouRef = useRef(false);

  useEffect(() => {
    avisouRef.current = false;
  }, [pessoaId, ano, mes, intervalo.de, intervalo.ate, faixasNoturnas]);

  useEffect(() => {
    if (relatorio.loading || avisouRef.current) return;
    avisouRef.current = true;
    aoTerminar(pessoaId, {
      totais: relatorio.totais,
      dias: relatorio.dias,
      incompleta: relatorio.realizadoRecusado || relatorio.faltasRecusadas || relatorio.planeadoRecusado || relatorio.erro === true,
    });
    // `aoTerminar` muda com o mes, mas so deve disparar quando o relatorio acaba de carregar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatorio.loading, relatorio.totais, relatorio.dias, pessoaId]);

  return null;
}

/** As instancias ocultas: nao desenha nada, so recolhe a assiduidade de cada pessoa activa. */
export function RecolhaDeAssiduidade({ calculo, ano, mes }: { calculo: CalculoRealDoMes; ano: number; mes: number }) {
  return (
    <>
      {calculo.pessoasActivas.map((pessoa) => (
        <RecolhaOculta key={`${pessoa.id}:${calculo.intervalo.de}:${calculo.intervalo.ate}`} pessoaId={pessoa.id} ano={ano} mes={mes} intervalo={calculo.intervalo} faixasNoturnas={calculo.faixasNoturnas} aoTerminar={calculo.registar} />
      ))}
    </>
  );
}

/** O calculo de UMA pessoa num mes (para a ficha e para o desconto de uma falta). `resultado` e `null` enquanto carrega. */
export function useCalculoRealDaPessoa(pessoaId: string | undefined, ano: number, mes: number) {
  const dados = useDadosDoCalculoReal(ano, mes);
  const relatorio = useRelatorioAssiduidadeMensal(pessoaId, ano, mes, dados.intervalo, dados.faixasNoturnas);
  const { retribuicoesHook, ultimoDia, lancamentosPorPessoa, codigosActivos, regra, direitosHook } = dados;
  const direitoIht = pessoaId ? direitosDaPessoa(direitosHook.porPessoa, pessoaId).iht : false;
  const aCarregar = relatorio.loading || dados.aCarregar;

  const resultado = useMemo<ResultadoCalculoReal | null>(() => {
    if (!pessoaId || aCarregar) return null;
    return calcularResultadoReal({
      totais: relatorio.totais,
      dias: relatorio.dias,
      versoes: retribuicoesHook.porPessoa.get(pessoaId) ?? [],
      ultimoDia,
      lancamentos: lancamentosPorPessoa.get(pessoaId) ?? [],
      codigosActivos,
      regra,
      direitoIht,
    });
  }, [pessoaId, aCarregar, relatorio.totais, relatorio.dias, retribuicoesHook.porPessoa, ultimoDia, lancamentosPorPessoa, codigosActivos, regra, direitoIht]);

  return {
    resultado,
    aCarregar,
    /** Os dados partilhados do mes (periodo, lancamentos, codigos): o custo regista e anula lancamentos por aqui. */
    dados,
    retribuicaoRecusada: retribuicoesHook.recusado,
    direitosLidos: dados.direitosLidos,
    incompleta: relatorio.realizadoRecusado || relatorio.faltasRecusadas || relatorio.planeadoRecusado || relatorio.erro === true,
    periodoAberto: dados.periodoHook.periodo?.estado === "aberto",
    temPeriodo: dados.periodoHook.periodo !== null,
  };
}
