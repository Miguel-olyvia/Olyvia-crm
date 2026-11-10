/**
 * Separador "Visao geral" do Processamento Salarial -- FASE 1: ciclo de vida
 * do periodo (abrir/fechar), o resumo por pessoa dentro do periodo, e
 * premios/lancamentos pontuais.
 *
 * O RECIBO EM SI E A EXPORTACAO FICAM PARA A FASE 2 -- de proposito, fora
 * deste ecra.
 *
 * O RESUMO POR PESSOA REAPROVEITA `useRelatorioAssiduidadeMensal`
 * -----------------------------------------------------------------
 * Nada aqui recalcula dias trabalhados, faltas ou horas extra -- esses
 * numeros vem sempre do relatorio de assiduidade, atraves de uma instancia
 * OCULTA por pessoa (`ResumoPessoaProcessamentoOculto`), o mesmo padrao de
 * `RelatorioAssiduidadeMensalOrganizacao.tsx`.
 */
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useCodigosProcessamento } from "@/components/rh-exemplo/hooks/useCodigosProcessamento";
import { useProcessamentoPeriodo } from "@/components/rh-exemplo/hooks/useProcessamentoPeriodo";
import {
  useProcessamentoLancamentos,
  type NovoLancamentoProcessamento,
} from "@/components/rh-exemplo/hooks/useProcessamentoLancamentos";
import {
  useRetribuicoesVigentesDaOrganizacao,
  escolherRetribuicaoVigente,
} from "@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao";
import {
  SeletorPeriodoFolha,
  formatarIntervaloPeriodo,
  intervaloEfectivo,
  localeDaLingua,
  nomeDaFolha,
  usePeriodoFolhaEscolhido,
} from "@/components/rh-exemplo/hooks/periodoFolha";
import { regraEmVigorNoDia, useRegrasSalariais } from "@/components/rh-exemplo/hooks/useRegrasSalariais";
import { direitosDaPessoa, useDireitosSalariaisDaOrganizacao } from "@/components/rh-exemplo/hooks/useDireitosSalariaisDaOrganizacao";
import { minutosDoCalculo } from "@/components/rh-exemplo/processamento/calculoReal";
import { ResumoPessoaProcessamentoOculto } from "@/components/rh-exemplo/processamento/ResumoPessoaProcessamentoOculto";
import { AvisosDeDesvios } from "@/components/rh-exemplo/processamento/AvisosDeDesvios";
import { AvisosDeHorasExtra } from "@/components/rh-exemplo/processamento/AvisosDeHorasExtra";
import { AvisoSubsidiosPorLer } from "@/components/rh-exemplo/processamento/AvisoSubsidiosPorLer";
import { useSubsidiosDoPeriodo } from "@/components/rh-exemplo/processamento/useSubsidiosDoPeriodo";
import { AVISO_SUBSIDIO_CHAVE } from "@/components/rh-exemplo/hooks/subsidiosReal";
import { prepararFechoComDesvios, prepararFechoComHorasExtra } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { argsDoFechoDeHorasExtra, assinaturaDeHorasExtraDoCalculo } from "@/components/rh-exemplo/hooks/horasExtraFechoReal";
import type { DiaRelatorioMensal, TotaisRelatorioMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";
import {
  calcularProcessamentoPessoa,
  minutosTrabalhadosPorDia,
  type AvisoProcessamento,
  type LinhaRegraSalarial,
  type ResultadoProcessamentoPessoa,
} from "@/components/rh-exemplo/lib/processamentoTotais";
import type { HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";
import { toast } from "@/lib/toast";
import { conferirFaltasDoFecho } from "@/components/rh-exemplo/hooks/faltasReal";
import { Eye, Loader2, Lock, Plus, TriangleAlert } from "lucide-react";
import {
  construirResultadosDoFecho,
  MAX_DESCRICAO_LANCAMENTO,
  motivoDeBloqueioDoFecho,
  resultadoDeLinhaGravada,
  usePessoasObrigatoriasDoFecho,
  useProcessamentoResultados,
} from "@/components/rh-exemplo/hooks/useProcessamentoResultados";
import { BannerFechoGravado } from "@/components/rh-exemplo/hooks/BannerFechoGravado";

/** Minutos -> horas com no maximo 2 casas decimais, sem zeros a mais. */
function horasDeMinutos(minutos: number): string {
  return String(Math.round((minutos / 60) * 100) / 100);
}

/**
 * Minutos -> horas para mostrar entre parenteses ao lado de uma contagem de dias.
 * Inteiro quando o numero de horas e redondo (ex.: "189h"), uma casa decimal com
 * virgula quando nao e (ex.: "4,5h").
 */
function horasEntreParenteses(minutos: number): string {
  const horas = Math.round((minutos / 60) * 10) / 10;
  const horasTexto = Number.isInteger(horas) ? String(horas) : horas.toFixed(1).replace(".", ",");
  return `(${horasTexto}h)`;
}

function formatarValor(valor: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);
}

const PERIODICIDADE_LEGENDA: Record<string, string> = {
  hora: "hora",
  diaria: "diária",
  semanal: "semanal",
  mensal: "mensal",
  anual: "anual",
};

/** Uma linha por codigo aplicado, ex. "100 · 12h · 138,46 €" -- sem as horas quando o modo nao as tem. */
function formatarLinhaCodigo(linha: { codigo: string; horas: number | null; valor: number }): string {
  const partes = [linha.codigo];
  if (linha.horas !== null) partes.push(`${Math.round(linha.horas * 100) / 100}h`);
  partes.push(formatarValor(linha.valor));
  return partes.join(" · ");
}

/** Uma linha da regra salarial (noturnas por faixa, IHT, km, ajudas): rotulo, quantidade se houver, valor. */
function formatarLinhaRegra(linha: LinhaRegraSalarial, rotulo: string): string {
  const partes = [rotulo];
  if (linha.quantidade !== null) partes.push(String(Math.round(linha.quantidade * 100) / 100));
  partes.push(formatarValor(linha.valor));
  return partes.join(" · ");
}

/** A chave de traducao de cada aviso de `processamentoTotais.ts` -- uma frase por aviso. */
const AVISO_CHAVE: Record<AvisoProcessamento, string> = {
  sem_retribuicao: "hr.vencimento.visaoGeral.avisoSemRetribuicao",
  periodicidade_nao_convertivel: "hr.vencimento.visaoGeral.avisoPeriodicidadeNaoConvertivel",
  duodecimos_por_decidir: "hr.vencimento.visaoGeral.avisoDuodecimosPorDecidir",
  sem_regra_salarial: "hr.vencimento.visaoGeral.avisoSemRegraSalarial",
  sem_horas_planeadas_no_mes: "hr.vencimento.visaoGeral.avisoSemHorasPlaneadasNoMes",
  faltas_provisorias: "hr.vencimento.visaoGeral.avisoFaltasProvisorias",
  dias_sem_picagem_descontados: "hr.vencimento.visaoGeral.avisoDiasSemPicagemDescontados",
};

const SEM_FAIXAS: readonly { hora_inicio: string; hora_fim: string }[] = [];
const SEM_TOTAIS: Record<string, TotaisRelatorioMensal> = {};
const SEM_DIAS: Record<string, readonly DiaRelatorioMensal[]> = {};
const SEM_INCOMPLETAS: Record<string, boolean> = {};
const FORM_LANCAMENTO_VAZIO = { descricao: "", valor: "", codigoProcessamentoId: "" };

export function ProcessamentoVisaoGeralTab() {
  const { t, language } = useTranslation();
  const locale = localeDaLingua(language);
  const { hasPermission } = usePermissions();
  const { activeCompany } = useCompany();
  const { pessoas, loading: pessoasLoading } = usePessoas();
  const { codigos, estado: codigosEstado } = useCodigosProcessamento();

  const podeVerPeriodo = hasPermission("hr.processamento.periodo.view");
  const podeGerirPeriodo = hasPermission("hr.processamento.periodo.gerir");
  const podeGerirLancamentos = hasPermission("hr.processamento.lancamentos.gerir");

  // O PERIODO da folha, nao o mes de calendario: (ano, mes 1-12) e o mes do FECHO; o mes e SEMPRE 1-12 aqui (o wrapper do
  // relatorio faz a unica conversao para 0-11). Sem regra (ou base sem as RPCs) o dia de inicio e 1: o mes de calendario.
  const { ano, mes, escolher, regras } = usePeriodoFolhaEscolhido();

  const periodoHook = useProcessamentoPeriodo(ano, mes);
  const { periodo } = periodoHook;
  const lancamentosHook = useProcessamentoLancamentos(periodo?.id);
  const { lancamentos } = lancamentosHook;

  const intervalo = useMemo(() => intervaloEfectivo(periodo, ano, mes, regras), [periodo, ano, mes, regras]);
  const ultimoDia = intervalo.ate;
  // Subsidios de ferias e de Natal: a configuracao da organizacao e, so no periodo que os paga, os vinculos (a proporcao).
  // A assinatura dos subsidios vem da mesma leitura que decide o que o periodo paga: e a que segue no fecho (nunca lida de novo ao fechar).
  const { subsidiosLeitura, subsidiosExtraDaPessoa, subsidiosAssinatura, subsidiosAReler, relerSubsidios } = useSubsidiosDoPeriodo(mes, ultimoDia, periodo?.id);

  const retribuicoesHook = useRetribuicoesVigentesDaOrganizacao(activeCompany?.id, ano, mes, intervalo);
  const regrasHook = useRegrasSalariais();
  const direitosHook = useDireitosSalariaisDaOrganizacao(activeCompany?.id);
  // Sem os direitos (IHT, km, ajudas) o total pode estar incompleto: nunca se apresenta como definitivo.
  const direitosLidos = periodo?.estado === "fechado" || direitosHook.estado === "ok";
  // A regra em vigor no ULTIMO DIA do periodo e as suas faixas noturnas (memoizadas: o relatorio de cada pessoa depende delas).
  const regra = useMemo(() => regraEmVigorNoDia(regrasHook.versoes, ultimoDia), [regrasHook.versoes, ultimoDia]);
  const faixasNoturnas = useMemo(() => regra?.noturnas ?? SEM_FAIXAS, [regra]);
  // Os totais de assiduidade ficam guardados COM o periodo a que pertencem: ao mudar de periodo os do anterior deixam de valer
  // de imediato (sem efeito que os apague e sem uma janela em que o periodo novo mostra os totais do velho).
  const chavePeriodo = `${ano}-${mes}-${intervalo.de}-${intervalo.ate}`;
  const [recolhido, setRecolhido] = useState<{
    chave: string;
    totais: Record<string, TotaisRelatorioMensal>;
    dias: Record<string, readonly DiaRelatorioMensal[]>;
    /** A assiduidade da pessoa so se leu em parte (recusada ou com erro): bloqueia o fecho. */
    incompletas: Record<string, boolean>;
  }>({ chave: chavePeriodo, totais: {}, dias: {}, incompletas: {} });
  const totaisPorPessoa = recolhido.chave === chavePeriodo ? recolhido.totais : SEM_TOTAIS;
  const diasPorPessoa = recolhido.chave === chavePeriodo ? recolhido.dias : SEM_DIAS;
  const incompletasPorPessoa = recolhido.chave === chavePeriodo ? recolhido.incompletas : SEM_INCOMPLETAS;
  // Muda quando a deteccao de desvios do fecho alterou dias: as instancias ocultas remontam e leem tudo outra vez.
  const [versaoRecolha, setVersaoRecolha] = useState(0);
  const desviosNaoLidosPorPessoa = (id: string): boolean => totaisPorPessoa[id]?.desviosNaoLidos === true;
  const pessoasSemDesvios = Object.values(totaisPorPessoa).filter((tot) => tot?.desviosNaoLidos === true).length;
  const diasPorValidar = Object.values(totaisPorPessoa).reduce((soma, tot) => soma + (tot?.diasPorValidar ?? 0), 0);
  // Horas extra aprovadas (interruptor ligado): pendentes que bloqueiam o fecho, excesso sem hora extra e leituras falhadas.
  const horasExtraNaoLidasPorPessoa = (id: string): boolean => totaisPorPessoa[id]?.horasExtraNaoLidas === true;
  const horasExtraPendentesPorPessoa = (id: string): number => totaisPorPessoa[id]?.horasExtraPendentes ?? 0;
  const pessoasSemHorasExtra = Object.values(totaisPorPessoa).filter((tot) => tot?.horasExtraNaoLidas === true).length;
  const totalHorasExtraPendentes = Object.values(totaisPorPessoa).reduce((soma, tot) => soma + (tot?.horasExtraPendentes ?? 0), 0);
  const pessoasSemPermissaoHorasExtra = Object.values(totaisPorPessoa).filter((tot) => tot?.horasExtraRecusadas === true).length;
  const totalHorasExtraNaoContadas = Object.values(totaisPorPessoa).reduce((soma, tot) => soma + (tot?.horasExtraAprovadasNaoContadasMinutos ?? 0), 0);
  const totalExcessoPorDetetar =Object.values(totaisPorPessoa).reduce((soma, tot) => soma + (tot?.excessoSemHoraExtra ?? 0), 0);
  const [confirmarFecho, setConfirmarFecho] = useState(false);
  const estadoFechoRef = useRef<HTMLParagraphElement>(null);
  const [pessoaParaLancamento, setPessoaParaLancamento] = useState<string | null>(null);
  const [pessoaParaDetalhe, setPessoaParaDetalhe] = useState<string | null>(null);
  const [formLancamento, setFormLancamento] = useState(FORM_LANCAMENTO_VAZIO);
  const [lancamentoParaAnular, setLancamentoParaAnular] = useState<HrProcessamentoLancamento | null>(
    null,
  );
  const [motivoAnulacao, setMotivoAnulacao] = useState("");

  const pessoasActivas = useMemo(
    () => pessoas.filter((p) => p.estado_registo === "activo"),
    [pessoas],
  );

  const marcarTotais = (
    pessoaId: string,
    totais: TotaisRelatorioMensal,
    dias: readonly DiaRelatorioMensal[],
    incompleta: boolean,
  ) => {
    setRecolhido((atual) => {
      const base = atual.chave === chavePeriodo ? atual : { chave: chavePeriodo, totais: {}, dias: {}, incompletas: {} };
      return {
        chave: chavePeriodo,
        totais: { ...base.totais, [pessoaId]: totais },
        dias: { ...base.dias, [pessoaId]: dias },
        incompletas: { ...base.incompletas, [pessoaId]: incompleta },
      };
    });
  };

  const lancamentosPorPessoa = useMemo(() => {
    const mapa = new Map<string, HrProcessamentoLancamento[]>();
    for (const lancamento of lancamentos) {
      const lista = mapa.get(lancamento.pessoa_id) ?? [];
      lista.push(lancamento);
      mapa.set(lancamento.pessoa_id, lista);
    }
    return mapa;
  }, [lancamentos]);

  const codigosActivos = useMemo(() => codigos.filter((c) => c.activo), [codigos]);

  interface ResultadoPessoa {
    resultado: ResultadoProcessamentoPessoa;
    valorBase: number | null;
    periodicidade: string | null;
    mudouAMeioDoMes: boolean;
  }

  /** `undefined` = totais da assiduidade ainda por carregar para esta pessoa. */
  const resultadosPorPessoa = useMemo(() => {
    const mapa = new Map<string, ResultadoPessoa>();
    for (const pessoa of pessoasActivas) {
      const totais = totaisPorPessoa[pessoa.id];
      if (!totais) continue;

      const versoes = retribuicoesHook.porPessoa.get(pessoa.id) ?? [];
      const { retribuicao, mudouAMeioDoMes } = escolherRetribuicaoVigente(versoes, ultimoDia);
      const lancamentosDaPessoa = lancamentosPorPessoa.get(pessoa.id) ?? [];
      const diasDaPessoa = diasPorPessoa[pessoa.id] ?? [];

      const resultado = calcularProcessamentoPessoa({
        totais: {
          planeadoMinutos: totais.planeadoMinutos,
          realizadoMinutos: totais.realizadoMinutos,
          contadoMinutos: totais.contadoMinutos,
          horasExtraFonte: totais.horasExtraFonte,
          minutosExtraNormal: totais.minutosExtraNormal,
          minutosFeriadoTrabalhado: totais.minutosFeriadoTrabalhado,
          minutosDescansoTrabalhado: totais.minutosDescansoTrabalhado,
          horasExtraNoturnasMinutos: totais.horasExtraNoturnasMinutos,
          minutosAusenciaRemunerada: totais.minutosAusenciaRemunerada ?? 0,
          faltas: totais.faltasParaDesconto ?? [],
          limiteFaltaPorDia: totais.limiteFaltaPorDia,
          diasFeriadoTrabalhados: totais.diasFeriadoTrabalhados,
          // `TotaisRelatorioMensal` nao tem esta contagem ainda -- lacuna
          // conhecida, documentada no cabecalho de processamentoTotais.ts.
          diasDescansoTrabalhado: 0,
        },
        minutosPorDia: minutosTrabalhadosPorDia(diasDaPessoa),
        minutosNoturnosPorFaixa: totais.minutosNoturnosPorFaixa ?? [],
        regra,
        direitoIht: direitosDaPessoa(direitosHook.porPessoa, pessoa.id).iht,
        retribuicao: retribuicao
          ? {
              valorBase: retribuicao.valor_base,
              periodicidade: retribuicao.periodicidade,
              duodecimosPct: retribuicao.duodecimos_pct,
            }
          : null,
        codigos: codigosActivos,
        lancamentos: lancamentosDaPessoa,
        subsidiosExtra: subsidiosExtraDaPessoa(pessoa.id),
      });

      mapa.set(pessoa.id, {
        resultado,
        valorBase: retribuicao?.valor_base ?? null,
        periodicidade: retribuicao?.periodicidade ?? null,
        mudouAMeioDoMes,
      });
    }
    return mapa;
  }, [
    pessoasActivas,
    totaisPorPessoa,
    diasPorPessoa,
    retribuicoesHook.porPessoa,
    lancamentosPorPessoa,
    codigosActivos,
    regra,
    direitosHook.porPessoa,
    ultimoDia,
    subsidiosExtraDaPessoa,
  ]);

  const periodoFechado = periodo?.estado === "fechado";

  // Um periodo fechado LE o que ficou gravado e nao recalcula (nem pede a assiduidade de ninguem).
  const leitura = useProcessamentoResultados(periodo?.id, periodoFechado);
  const idsActivas = useMemo(() => pessoasActivas.map((p) => p.id), [pessoasActivas]);
  const { obrigatorias, estado: estadoVinculos } = usePessoasObrigatoriasDoFecho(idsActivas, intervalo.de, intervalo.ate);
  const gravados = useMemo(() => {
    const mapa = new Map<string, ResultadoPessoa>();
    for (const [id, linha] of leitura.porPessoa) {
      // O gravado nao guarda o valor base nem a periodicidade da retribuicao: na coluna do salario base fica a base do mes.
      const resultado = resultadoDeLinhaGravada(linha);
      mapa.set(id, { resultado, valorBase: resultado.baseMes, periodicidade: null, mudouAMeioDoMes: false });
    }
    return mapa;
  }, [leitura.porPessoa]);
  const resultadosMostrados: ReadonlyMap<string, ResultadoPessoa> = periodoFechado ? gravados : resultadosPorPessoa;
  const semValoresGravados = periodoFechado && (leitura.estado !== "ok" || leitura.antesDoRegisto);
  const pessoasDaTabela = useMemo<{ id: string; nome_completo: string }[]>(() => {
    if (!periodoFechado) return pessoasActivas;
    const nomes = new Map(pessoas.map((p) => [p.id, p.nome_completo]));
    return [...gravados.keys()]
      .map((id) => ({ id, nome_completo: nomes.get(id) ?? t("rhProcReal.pessoaRemovida") }))
      .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
  }, [periodoFechado, pessoasActivas, pessoas, gravados, t]);

  const motivoBloqueio = motivoDeBloqueioDoFecho({
    direitosLidos: direitosHook.estado === "ok",
    // O fecho grava para sempre: so avanca com as retribuicoes, os codigos e a assiduidade lidos por inteiro.
    retribuicoes: retribuicoesHook.estado,
    codigos: codigosEstado,
    regras: regrasHook.isLoading ? "a_carregar" : regrasHook.estado,
    vinculos: estadoVinculos,
    // A configuracao dos subsidios de ferias e de Natal (e os vinculos, no periodo que os paga): sem ela o periodo ficaria gravado sem eles.
    subsidios: subsidiosLeitura,
    pessoasObrigatorias: obrigatorias,
    comCalculo: (id) => resultadosPorPessoa.has(id),
    assiduidadeIncompleta: (id) => incompletasPorPessoa[id] === true,
    // Sem a margem ou os desvios o calculo estaria errado: bloqueia com motivo escrito, nunca calcula em silencio.
    desviosNaoLidos: desviosNaoLidosPorPessoa,
    horasExtraNaoLidas: horasExtraNaoLidasPorPessoa,
    horasExtraPendentes: horasExtraPendentesPorPessoa,
  });
  // Durante a releitura dos subsidios (depois de um fecho recusado) os dados antigos ainda parecem lidos: espera-se, senao um segundo clique reenviava a assinatura velha.
  const textoBloqueio = motivoBloqueio
    ? t(`rhProcReal.fecho.bloqueio.${motivoBloqueio.codigo}`, "n" in motivoBloqueio ? { n: motivoBloqueio.n } : undefined)
    : subsidiosAReler
      ? t("rhProcReal.fecho.bloqueio.subsidiosAReler")
      : null;

  const abrirPeriodo = async () => {
    const erro = await periodoHook.abrir();
    if (erro) toast.error(erro);
    else toast.success(t("hr.vencimento.visaoGeral.periodoAbertoSucesso"));
  };

  const fecharPeriodo = async () => {
    setConfirmarFecho(false);
    // O botao so e ria-disabled: o clique nunca fecha com o motivo por resolver.
    if (textoBloqueio) {
      toast.error(textoBloqueio);
      return;
    }
    // ANTES de gravar: detetar os desvios do periodo (a base recusa se ficarem dias por validar) e ler as assinaturas. Se a
    // deteccao mudou dias, o calculo do ecra ja nao e o de agora: relê-se tudo e fecha-se de novo.
    if (!activeCompany?.id || !periodo) {
      toast.error(t("rhProcReal.fecho.erroAssinaturas"));
      return;
    }
    const preparacao = await prepararFechoComDesvios({ organizationId: activeCompany.id, periodoId: periodo.id, de: intervalo.de, ate: intervalo.ate, calculadas: new Map(obrigatorias.map((id) => [id, totaisPorPessoa[id]?.desviosChave ?? ""])) });
    if (!preparacao.ok) {
      if (preparacao.motivo === "erro") {
        toast.error(preparacao.texto);
      } else {
        setRecolhido({ chave: chavePeriodo, totais: {}, dias: {}, incompletas: {} });
        setVersaoRecolha((v) => v + 1);
        toast.error(t("rhProcReal.fecho.desviosMudaram", { n: String(preparacao.mudou) }));
      }
      return;
    }
    // As faltas marcadas, anuladas ou justificadas depois do calculo mudam o desconto: nunca se fecha com um calculo mais antigo.
    const faltas = await conferirFaltasDoFecho({
      organizationId: activeCompany.id,
      de: intervalo.de,
      ate: intervalo.ate,
      calculadas: new Map(obrigatorias.map((id) => [id, totaisPorPessoa[id]?.faltasChave ?? ""])),
    });
    if (!faltas.ok) {
      if (faltas.motivo === "erro") {
        toast.error(t("rhProcReal.fecho.erroFaltas"));
      } else {
        setRecolhido({ chave: chavePeriodo, totais: {}, dias: {}, incompletas: {} });
        setVersaoRecolha((v) => v + 1);
        toast.error(t("rhProcReal.fecho.faltasMudaram", { n: String(faltas.mudou) }));
      }
      return;
    }
    // Horas extra aprovadas: a assinatura de cada pessoa, lida imediatamente antes de montar os resultados; se mudaram desde o calculo,
    // este e mais antigo e nao se fecha.
    // Confere TODAS as pessoas (bruto incluido) e o interruptor; o que segue no resultado e a chave do CALCULO, nunca a de agora.
    const horasExtra = await prepararFechoComHorasExtra(
      argsDoFechoDeHorasExtra({ organizationId: activeCompany.id, periodoId: periodo.id, de: intervalo.de, ate: intervalo.ate, obrigatorias, totaisDe: (id) => totaisPorPessoa[id] }),
    );
    if (!horasExtra.ok) {
      if (horasExtra.motivo === "erro") {
        toast.error(horasExtra.texto);
      } else {
        setRecolhido({ chave: chavePeriodo, totais: {}, dias: {}, incompletas: {} });
        setVersaoRecolha((v) => v + 1);
        toast.error(
          horasExtra.motivo === "sem_confirmadas"
            ? t("rhProcReal.fecho.horasExtraSemConfirmadas")
            : t("rhProcReal.fecho.horasExtraMudaram", { n: String(horasExtra.mudou) }),
        );
      }
      return;
    }
    // Fecha e GRAVA o resultado de cada pessoa obrigatoria, tal como o ecra o mostra agora.
    const { resultados: paraGravar, semCalculo } = construirResultadosDoFecho({
      assinaturaDeDesviosDe: (id) => preparacao.assinaturas.get(id) ?? null,
      assinaturaDeHorasExtraDe: (id) => assinaturaDeHorasExtraDoCalculo(totaisPorPessoa[id]),
      assinaturaDeSubsidios: subsidiosAssinatura,
      pessoasObrigatorias: obrigatorias,
      resultadoDe: (id) => resultadosPorPessoa.get(id)?.resultado,
      minutosDe: (id) => minutosDoCalculo(totaisPorPessoa[id] ? { totais: totaisPorPessoa[id] } : undefined),
      versoesDe: (id) => retribuicoesHook.porPessoa.get(id) ?? [],
      lancamentosDe: (id) => lancamentosPorPessoa.get(id) ?? [],
      dataFim: ultimoDia,
      regraSalarialId: regra?.id ?? null,
    });
    const erro = semCalculo.length > 0
      ? t("rhProcReal.fecho.bloqueio.calculo", { n: semCalculo.length })
      : await periodoHook.fechar(paraGravar);
    if (erro) {
      toast.error(erro);
      // A configuracao dos subsidios pode ter mudado depois do calculo: volta a ler, e o calculo refaz-se com a assinatura nova.
      void relerSubsidios();
    } else {
      toast.success(t("hr.vencimento.visaoGeral.periodoFechadoSucesso"));
      // O botao que se clicou desaparece (fechado nao tem botao): o foco passa para a mensagem de estado do periodo.
      requestAnimationFrame(() => estadoFechoRef.current?.focus());
    }
  };

  const abrirFormularioLancamento = (pessoaId: string) => {
    setFormLancamento(FORM_LANCAMENTO_VAZIO);
    setPessoaParaLancamento(pessoaId);
  };

  const submeterLancamento = async () => {
    if (!pessoaParaLancamento) return;
    const valor = Number(formLancamento.valor);
    if (!formLancamento.descricao.trim() || !Number.isFinite(valor) || valor === 0) return;
    const novo: NovoLancamentoProcessamento = {
      pessoaId: pessoaParaLancamento,
      descricao: formLancamento.descricao.trim(),
      valor,
      codigoProcessamentoId: formLancamento.codigoProcessamentoId || null,
    };
    const erro = await lancamentosHook.criar(novo);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.vencimento.visaoGeral.lancamentoCriarSucesso"));
    setPessoaParaLancamento(null);
    setFormLancamento(FORM_LANCAMENTO_VAZIO);
  };

  const submeterAnulacao = async () => {
    if (!lancamentoParaAnular || !motivoAnulacao.trim()) return;
    const erro = await lancamentosHook.anular(lancamentoParaAnular.id, motivoAnulacao.trim());
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.vencimento.visaoGeral.lancamentoAnularSucesso"));
    setLancamentoParaAnular(null);
    setMotivoAnulacao("");
  };

  if (!podeVerPeriodo) {
    return <SemAcessoCard className="m-0" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SeletorPeriodoFolha ano={ano} mes={mes} de={intervalo.de} ate={intervalo.ate} onMudar={escolher} />
        {intervalo.estimado && (
          <p role="status" className="w-full text-xs text-muted-foreground">
            {t("hr.periodoFolha.intervaloEstimado")}
          </p>
        )}

        {periodo && (
          <div className="flex items-center gap-3">
            <Badge variant={periodoFechado ? "secondary" : "default"}>
              {periodoFechado
                ? t("hr.vencimento.visaoGeral.estadoFechado")
                : t("hr.vencimento.visaoGeral.estadoAberto")}
            </Badge>
            {podeGerirPeriodo && !periodoFechado && (
              <Button
                variant="outline" className="min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-busy={periodoHook.saving}
                onClick={() => { if (textoBloqueio === null && !periodoHook.saving) setConfirmarFecho(true); }}
                aria-disabled={textoBloqueio !== null || periodoHook.saving}
                aria-describedby={textoBloqueio ? "fecho-bloqueio" : undefined}
              >
                <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("hr.vencimento.visaoGeral.fecharPeriodo")}
              </Button>
            )}
          </div>
        )}
      </div>

      {periodo && podeGerirPeriodo && !periodoFechado && textoBloqueio && (
        <p id="fecho-bloqueio" role="status" className="text-sm text-amber-800 dark:text-amber-300">{textoBloqueio}</p>
      )}

      {periodoHook.loading || pessoasLoading || direitosHook.isLoading ? (
        <div className="flex justify-center py-12">
          <OlyviaLoader />
        </div>
      ) : !periodo ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p role="status" className="text-muted-foreground">
              {t("hr.vencimento.visaoGeral.semPeriodoIntervalo", {
                mes: nomeDaFolha(ano, mes, locale),
                intervalo: formatarIntervaloPeriodo(intervalo.de, intervalo.ate, locale, t("hr.periodoFolha.intervaloA"), "long"),
              })}
            </p>
            {podeGerirPeriodo ? (
              <Button className="min-h-11" onClick={abrirPeriodo} disabled={periodoHook.saving} aria-busy={periodoHook.saving}>
                {periodoHook.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {t("hr.vencimento.visaoGeral.abrirPeriodo")}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("hr.vencimento.visaoGeral.semPermissaoAbrir")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {!direitosLidos && (
            <p
              role={direitosHook.estado === "erro" ? "alert" : "status"}
              className="flex items-start gap-2 rounded-md border border-amber-800/40 p-3 text-sm text-amber-800 dark:border-amber-300/40 dark:text-amber-300"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("hr.vencimento.visaoGeral.avisoDireitosIndisponiveis")}
            </p>
          )}
          {!periodoFechado && <AvisoSubsidiosPorLer estado={subsidiosLeitura} />}
          {!periodoFechado && <AvisosDeDesvios diasPorValidar={diasPorValidar} pessoasSemDesvios={pessoasSemDesvios} />}
          {!periodoFechado && (
            <AvisosDeHorasExtra
              horasExtraPendentes={totalHorasExtraPendentes}
              excessoPorDetetar={totalExcessoPorDetetar}
              pessoasSemHorasExtra={pessoasSemHorasExtra}
              pessoasSemPermissaoHorasExtra={pessoasSemPermissaoHorasExtra}
              horasExtraNaoContadasMin={totalHorasExtraNaoContadas}
              de={intervalo.de}
              ate={intervalo.ate}
              aoDetetar={() => {
                setRecolhido({ chave: chavePeriodo, totais: {}, dias: {}, incompletas: {} });
                setVersaoRecolha((v) => v + 1);
              }}
            />
          )}
          {!periodoFechado && pessoasActivas.map((pessoa) => (
            <ResumoPessoaProcessamentoOculto
              key={`${pessoa.id}:${intervalo.de}:${intervalo.ate}:${versaoRecolha}`}
              pessoaId={pessoa.id}
              ano={ano}
              mes={mes}
              intervalo={intervalo}
              faixasNoturnas={faixasNoturnas}
              aoTerminarCarregamento={marcarTotais}
            />
          ))}

          {periodoFechado && (
            <BannerFechoGravado estado={leitura.estado} fechadoEm={leitura.fechadoEm} fechadoPorNome={leitura.fechadoPorNome} antesDoRegisto={leitura.antesDoRegisto} innerRef={estadoFechoRef} aoTentarDeNovo={leitura.recarregar} />
          )}
          {!semValoresGravados && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("hr.vencimento.visaoGeral.resumoTitulo")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <TooltipProvider>
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaPessoa")}</th>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaDiasPlaneados")}</th>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaDiasTrabalhados")}</th>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaFaltaCompleta")}</th>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaFaltaIncompleta")}</th>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaHorasExtra")}</th>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaSalarioBase")}</th>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaCodigosAplicados")}</th>
                    <th scope="col" className="px-4 py-2">{t("hr.vencimento.visaoGeral.colunaTotalBrutoEstimado")}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t("hr.vencimento.visaoGeral.colunaAccoes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoasDaTabela.map((pessoa) => {
                    const totais = totaisPorPessoa[pessoa.id];
                    const lancamentosDaPessoa = lancamentosPorPessoa.get(pessoa.id) ?? [];
                    const resultadoPessoa = resultadosMostrados.get(pessoa.id);
                    const semPermissaoRetribuicao = periodoFechado ? leitura.estado === "recusado" : retribuicoesHook.recusado;
                    return (
                      <tr key={pessoa.id} className="border-b last:border-b-0 align-top">
                        <td className="px-4 py-3 font-medium">{pessoa.nome_completo}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? (
                            `${totais.diasPlaneados ?? 0} ${horasEntreParenteses(totais.planeadoMinutos)}`
                          ) : periodoFechado ? (
                            "—"
                          ) : (
                            <OlyviaLoader size={16} />
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? (
                            `${totais.diasTrabalhados} ${horasEntreParenteses(totais.realizadoMinutos)}`
                          ) : periodoFechado ? (
                            "—"
                          ) : (
                            <OlyviaLoader size={16} />
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? totais.diasComFaltaCompleta : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? totais.diasComFaltaIncompleta : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {totais ? `${horasDeMinutos(totais.horasExtraMinutos)}h` : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {semPermissaoRetribuicao ? (
                            <span className="text-muted-foreground" title={t("hr.vencimento.visaoGeral.semPermissaoRetribuicao")}>
                              {t("hr.vencimento.visaoGeral.semPermissaoRetribuicao")}
                            </span>
                          ) : !resultadoPessoa ||
                            resultadoPessoa.resultado.baseMes === null ||
                            resultadoPessoa.valorBase === null ? (
                            "—"
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <div>
                                <div>{formatarValor(resultadoPessoa.valorBase)}</div>
                                {resultadoPessoa.periodicidade && (
                                  <div className="text-xs font-normal text-muted-foreground">
                                    {PERIODICIDADE_LEGENDA[resultadoPessoa.periodicidade] ?? resultadoPessoa.periodicidade}
                                  </div>
                                )}
                              </div>
                              {resultadoPessoa.mudouAMeioDoMes && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <TriangleAlert
                                      className="h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-300"
                                      aria-label={t("hr.vencimento.visaoGeral.avisoRetribuicaoMudouAMeioDoMes")}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("hr.vencimento.visaoGeral.avisoRetribuicaoMudouAMeioDoMes")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {semPermissaoRetribuicao ? (
                            <span className="text-muted-foreground" title={t("hr.vencimento.visaoGeral.semPermissaoRetribuicao")}>
                              {t("hr.vencimento.visaoGeral.semPermissaoRetribuicao")}
                            </span>
                          ) : resultadoPessoa && resultadoPessoa.resultado.linhasAutomaticas.length + resultadoPessoa.resultado.linhasRegra.length > 0 ? (
                            <ul className="space-y-0.5 text-xs">
                              {resultadoPessoa.resultado.linhasAutomaticas.map((linha) => (
                                <li key={linha.codigoId} className="tabular-nums">
                                  {formatarLinhaCodigo(linha)}
                                </li>
                              ))}
                              {resultadoPessoa.resultado.linhasRegra.map((linha) => (
                                <li key={`${linha.tipo}-${linha.faixa ?? ""}`} className="tabular-nums">
                                  {formatarLinhaRegra(linha, t(linha.tipo === "noturnas" ? "rhFluxosC.proc.passo.noturnas" : `rhFluxosC.proc.passo.${linha.tipo}`, { n: (linha.faixa ?? 0) + 1 }))}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {semPermissaoRetribuicao
                            ? "—"
                            : !resultadoPessoa || resultadoPessoa.resultado.totalBrutoEstimado === null
                              ? "—"
                              : formatarValor(resultadoPessoa.resultado.totalBrutoEstimado)}
                          {!semPermissaoRetribuicao && !direitosLidos && resultadoPessoa?.resultado.totalBrutoEstimado != null && (
                            <span className="block text-xs font-normal text-amber-800 dark:text-amber-300">
                              {t("hr.vencimento.visaoGeral.totalProvisorio")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="min-h-11"
                              onClick={() => setPessoaParaDetalhe(pessoa.id)}
                            >
                              <Eye className="mr-1 h-3 w-3" aria-hidden="true" />
                              {t("hr.vencimento.visaoGeral.verDetalhe")}
                              <span className="sr-only"> {pessoa.nome_completo}</span>
                            </Button>
                            {podeGerirLancamentos && !periodoFechado && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                onClick={() => abrirFormularioLancamento(pessoa.id)}
                              >
                                <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                                {t("hr.vencimento.visaoGeral.acrescentarValor")}
                                <span className="sr-only"> {pessoa.nome_completo}</span>
                              </Button>
                            )}
                          </div>
                          {lancamentosDaPessoa.length > 0 && (
                            <ul className="mt-2 space-y-1 text-left text-xs">
                              {lancamentosDaPessoa.map((lancamento) => (
                                <li
                                  key={lancamento.id}
                                  className={
                                    lancamento.anulado_em
                                      ? "text-muted-foreground line-through"
                                      : undefined
                                  }
                                >
                                  <span>{lancamento.descricao}</span>{" "}
                                  <span className="tabular-nums">{formatarValor(lancamento.valor)}</span>
                                  {!lancamento.anulado_em && podeGerirLancamentos && !periodoFechado && (
                                    <button
                                      type="button"
                                      className="ml-2 inline-flex min-h-11 items-center text-destructive underline"
                                      onClick={() => setLancamentoParaAnular(lancamento)}
                                    >
                                      {t("hr.vencimento.visaoGeral.anular")}
                                      <span className="sr-only"> {lancamento.descricao} {pessoa.nome_completo}</span>
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </TooltipProvider>
            </CardContent>
          </Card>
          )}
        </>
      )}

      {/* Confirmar fecho -- irreversivel nesta fase */}
      <AlertDialog open={confirmarFecho} onOpenChange={setConfirmarFecho}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.vencimento.visaoGeral.confirmarFechoTitulo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("rhProcReal.fecho.confirmarDescricao")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={fecharPeriodo}>
              {t("hr.vencimento.visaoGeral.fecharPeriodo")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Acrescentar valor pontual */}
      <Dialog
        open={!!pessoaParaLancamento}
        onOpenChange={(open) => !open && setPessoaParaLancamento(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("hr.vencimento.visaoGeral.acrescentarValor")}</DialogTitle>
            <DialogDescription>
              {t("hr.vencimento.visaoGeral.acrescentarValorDescricao")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lancamento-descricao">
                {t("hr.vencimento.visaoGeral.campoDescricao")}
              </Label>
              <Textarea
                id="lancamento-descricao"
                value={formLancamento.descricao}
                maxLength={MAX_DESCRICAO_LANCAMENTO}
                onChange={(e) => setFormLancamento((f) => ({ ...f, descricao: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lancamento-valor">{t("hr.vencimento.visaoGeral.campoValor")}</Label>
              <Input
                id="lancamento-valor"
                type="number"
                step="0.01"
                value={formLancamento.valor}
                onChange={(e) => setFormLancamento((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lancamento-codigo">{t("hr.vencimento.visaoGeral.campoCodigo")}</Label>
              <Select
                value={formLancamento.codigoProcessamentoId || "nenhum"}
                onValueChange={(v) =>
                  setFormLancamento((f) => ({
                    ...f,
                    codigoProcessamentoId: v === "nenhum" ? "" : v,
                  }))
                }
              >
                <SelectTrigger id="lancamento-codigo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">{t("hr.vencimento.visaoGeral.semCodigo")}</SelectItem>
                  {codigosActivos.map((codigo) => (
                    <SelectItem key={codigo.id} value={codigo.id}>
                      {codigo.codigo} -- {codigo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPessoaParaLancamento(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={submeterLancamento}
              disabled={
                lancamentosHook.saving ||
                !formLancamento.descricao.trim() ||
                !Number.isFinite(Number(formLancamento.valor)) ||
                Number(formLancamento.valor) === 0
              }
            >
              {lancamentosHook.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.vencimento.visaoGeral.acrescentarValor")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anular lancamento -- motivo obrigatorio */}
      <Dialog
        open={!!lancamentoParaAnular}
        onOpenChange={(open) => {
          if (!open) {
            setLancamentoParaAnular(null);
            setMotivoAnulacao("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("hr.vencimento.visaoGeral.anular")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="lancamento-motivo-anulacao">
              {t("hr.vencimento.visaoGeral.campoMotivoAnulacao")}
            </Label>
            <Textarea
              id="lancamento-motivo-anulacao"
              value={motivoAnulacao}
              onChange={(e) => setMotivoAnulacao(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLancamentoParaAnular(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={submeterAnulacao}
              disabled={lancamentosHook.saving || !motivoAnulacao.trim()}
            >
              {lancamentosHook.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("hr.vencimento.visaoGeral.anular")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe da conta por pessoa -- so apresentacao, nada aqui recalcula nada. */}
      <Dialog open={!!pessoaParaDetalhe} onOpenChange={(open) => !open && setPessoaParaDetalhe(null)}>
        <DialogContent className="max-w-lg">
          {(() => {
            if (!pessoaParaDetalhe) return null;
            const pessoaDetalhe = pessoasDaTabela.find((p) => p.id === pessoaParaDetalhe);
            const resultadoPessoa = resultadosMostrados.get(pessoaParaDetalhe);
            const semPermissaoRetribuicao = periodoFechado ? leitura.estado === "recusado" : retribuicoesHook.recusado;
            const { resultado } = resultadoPessoa ?? {};

            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {t("hr.vencimento.visaoGeral.detalheTitulo")}
                    {pessoaDetalhe ? ` -- ${pessoaDetalhe.nome_completo}` : ""}
                  </DialogTitle>
                </DialogHeader>
                {!resultado ? (
                  <p className="text-sm text-muted-foreground">
                    {t("hr.vencimento.visaoGeral.semPermissaoRetribuicao")}
                  </p>
                ) : (
                  <div className="space-y-4 text-sm">
                    {!semPermissaoRetribuicao && (
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("hr.vencimento.visaoGeral.detalheSalarioBase")}
                          </span>
                          <span className="tabular-nums">
                            {resultadoPessoa?.valorBase !== null && resultadoPessoa?.valorBase !== undefined
                              ? formatarValor(resultadoPessoa.valorBase)
                              : "—"}
                            {resultadoPessoa?.periodicidade
                              ? ` (${PERIODICIDADE_LEGENDA[resultadoPessoa.periodicidade] ?? resultadoPessoa.periodicidade})`
                              : ""}
                          </span>
                        </div>
                        {resultado.divisorDuodecimos !== null && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("hr.vencimento.visaoGeral.detalheDivisorDuodecimos")}
                            </span>
                            <span className="tabular-nums">{resultado.divisorDuodecimos}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("hr.vencimento.visaoGeral.detalheValorHoraReal")}
                          </span>
                          <span className="tabular-nums">
                            {resultado.valorHoraReal !== null ? formatarValor(resultado.valorHoraReal) : "—"}
                          </span>
                        </div>
                      </div>
                    )}

                    {!semPermissaoRetribuicao && (
                      <div className="space-y-1">
                        <div className="font-medium">
                          {t("hr.vencimento.visaoGeral.colunaCodigosAplicados")}
                        </div>
                        {resultado.linhasAutomaticas.length + resultado.linhasRegra.length > 0 ? (
                          <ul className="space-y-0.5">
                            {resultado.linhasAutomaticas.map((linha) => (
                              <li key={linha.codigoId} className="tabular-nums">
                                {formatarLinhaCodigo(linha)}
                              </li>
                            ))}
                            {resultado.linhasRegra.map((linha) => (
                              <li key={`${linha.tipo}-${linha.faixa ?? ""}`} className="tabular-nums">
                                {formatarLinhaRegra(linha, t(linha.tipo === "noturnas" ? "rhFluxosC.proc.passo.noturnas" : `rhFluxosC.proc.passo.${linha.tipo}`, { n: (linha.faixa ?? 0) + 1 }))}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">
                            {t("hr.vencimento.visaoGeral.detalheSemCodigos")}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t("hr.vencimento.visaoGeral.detalheDescontoFaltas")}
                        </span>
                        <span className="tabular-nums">
                          {resultado.descontoFaltas > 0
                            ? `-${formatarValor(resultado.descontoFaltas)}`
                            : formatarValor(0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t("hr.vencimento.visaoGeral.detalheSubsidioAlimentacao")}
                        </span>
                        <span className="tabular-nums">{formatarValor(resultado.subsidioAlimentacao)}</span>
                      </div>
                      {(resultado.subsidioFerias ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("rhSubs.linha.ferias")}</span>
                          <span className="tabular-nums">{formatarValor(resultado.subsidioFerias ?? 0)}</span>
                        </div>
                      )}
                      {(resultado.subsidioNatal ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("rhSubs.linha.natal")}</span>
                          <span className="tabular-nums">{formatarValor(resultado.subsidioNatal ?? 0)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {t("hr.vencimento.visaoGeral.detalheLancamentosPontuais")}
                        </span>
                        <span className="tabular-nums">{formatarValor(resultado.lancamentosPontuais)}</span>
                      </div>
                    </div>

                    {!semPermissaoRetribuicao && (
                      <div className="flex justify-between border-t pt-2 font-semibold">
                        <span>{t("hr.vencimento.visaoGeral.colunaTotalBrutoEstimado")}</span>
                        <span className="tabular-nums">
                          {resultado.totalBrutoEstimado !== null
                            ? formatarValor(resultado.totalBrutoEstimado)
                            : "—"}
                          {!direitosLidos && resultado.totalBrutoEstimado !== null && ` (${t("hr.vencimento.visaoGeral.totalProvisorio")})`}
                        </span>
                      </div>
                    )}

                    {(resultado.avisos.length > 0 || (resultado.avisosSubsidios?.length ?? 0) > 0) && (
                      <div className="space-y-1 border-t pt-2">
                        <div className="font-medium">{t("hr.vencimento.visaoGeral.detalheAvisos")}</div>
                        <ul className="space-y-0.5 text-amber-800 dark:text-amber-300">
                          {resultado.avisos.map((aviso) => (
                            <li key={aviso} className="flex items-center gap-1.5">
                              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {t(AVISO_CHAVE[aviso])}
                            </li>
                          ))}
                          {(resultado.avisosSubsidios ?? []).map((aviso) => (
                            <li key={aviso} className="flex items-center gap-1.5">
                              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {t(AVISO_SUBSIDIO_CHAVE[aviso])}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setPessoaParaDetalhe(null)}>
                    {t("common.cancel")}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
