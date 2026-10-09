/**
 * Passo 4 -- Informacoes de contrato: o que se assina.
 *
 * Tres blocos, e a ordem importa: o CONTRATO (tipo, datas, periodo
 * experimental), a RETRIBUICAO (so o que e DA PESSOA: subsidio de alimentacao
 * e duodecimos) e o TEMPO DE TRABALHO (modalidade, horas, FTE, dias uteis, feriados, maximos).
 *
 * "Tipo de trabalho" e "Modalidade" NAO sao o mesmo campo e por isso nao
 * aparecem lado a lado sem legenda:
 *   - TIPO DE TRABALHO e tempo integral / tempo parcial. Na base chama-se
 *     `pessoas_vinculos.regime` -- o nome de coluna nao mudou, so o rotulo;
 *   - MODALIDADE e presencial / remoto / hibrido, e na base e
 *     `pessoas_vinculos.tipo_trabalho`.
 * O nome de ecra do segundo TEVE de mudar quando o primeiro passou a chamar-se
 * "tipo de trabalho": ficariam dois campos com o mesmo nome no mesmo passo. A
 * migration 20261120140000 tem um COMMENT a avisar que as duas colunas sao
 * ortogonais (ha tempo parcial em remoto), porque foram confundidas uma vez.
 *
 * O MODELO DO CONTRATO sao duas perguntas (`CamposModeloContrato`): o "Tipo de
 * contrato" (sem termo, termo certo, termo incerto, duracao muito curta,
 * temporario) e o "Regime contratual" (individual ou coletivo). "Tempo
 * parcial" ja nao e um tipo de contrato: e o "Tipo de trabalho" acima.
 *
 * A DURACAO EM MESES so existe no termo certo. Mudar o inicio (ou a admissao,
 * que serve de inicio enquanto este esta vazio) ou os meses recalcula a data
 * de fim -- a vespera do dia correspondente, 31/01 + 1 mes = 28/02 --, e
 * escrever a data a mao acerta os meses (ou esvazia-os se nenhuma duracao a
 * produz). Ver `useFimDoContratoPorMeses`.
 *
 * O VALOR BASE NAO SE ESCREVE AQUI (fluxo 2): vem do cargo escolhido no passo 3.
 * Mostra-se em leitura ("Salario base do cargo: X"). O subsidio e os duodecimos
 * so se definem com `hr.pessoas.retribuicao.edit`; sem ela, a nota diz que o RH
 * completa depois. Os duodecimos propoem 50.
 *
 * No fim, a escolha que abre o horario variavel: "horas iguais todas as
 * semanas" ou "horario variavel por dia e por local". A segunda abre o mesmo
 * editor que vive no separador Horario da ficha.
 *
 * A data de fim do periodo experimental e MOSTRADA, nao editavel aqui: a base
 * guarda a duracao e a data e nao deriva uma da outra por trigger; quem deriva
 * e o ecra, e uma vez so.
 */
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoInterruptor, CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { CamposModeloContrato } from "@/components/hr/contrato/CamposModeloContrato";
import { HorarioEditor } from "@/components/hr/HorarioEditor";
import { mesesDaDataFim, useFimDoContratoPorMeses } from "@/hooks/useFimDoContratoPorMeses";
import { type HorarioRascunho } from "@/lib/hr/horario";
import {
  dataDoPeriodoExperimental,
  type RascunhoContrato,
} from "@/lib/hr/novaPessoa";
import { MESES_MAXIMOS_CONTRATO } from "@/lib/hr/novaPessoaDatas";
import { tipoTemDuracaoEmMeses } from "@/lib/hr/contrato";
import {
  equivalenteParaMostrar,
  horasContratadasSemanaisReais,
  horasImplausiveis,
  maximoDaFrequencia,
} from "@/lib/hr/horas";
import {
  DIAS_SEMANA,
  HORAS_FREQUENCIAS,
  POLITICAS_FERIADOS,
  REGIMES_TRABALHO,
  TIPOS_TRABALHO,
  type DiaSemana,
  type HorasFrequencia,
  type LocalTrabalho,
  type SubsidioAlimentacaoModo,
  type PoliticaFeriados,
  type RegimeTrabalho,
  type TipoTrabalho,
} from "@/types/hr";

interface SeccaoContratoProps {
  valor: RascunhoContrato;
  onPatch: (patch: Partial<RascunhoContrato>) => void;
  erroDe: (campoId: string) => string | null;
  /** Data de admissao do passo 3, para calcular o fim do periodo experimental
   * quando a data de inicio do contrato ainda esta vazia. */
  dataAdmissao: string;
  locais: LocalTrabalho[];
  locaisALoad: boolean;
  /** O salario base do cargo escolhido no passo 3, ja formatado; `null` sem cargo ou sem periodo. */
  salarioDoCargo: string | null;
  /** `hr.pessoas.retribuicao.edit`: sem ela o subsidio e os duodecimos ficam para o RH. */
  podeEditarRetribuicao: boolean;
}

export function SeccaoContrato({
  valor,
  onPatch,
  erroDe,
  dataAdmissao,
  locais,
  locaisALoad,
  salarioDoCargo,
  podeEditarRetribuicao,
}: SeccaoContratoProps) {
  const { t } = useTranslation();

  const inicioEfectivo = valor.data_inicio.trim() || dataAdmissao.trim();
  const dias = Number(valor.periodo_experimental_dias.replace(",", "."));
  const fimExperimental =
    valor.tem_periodo_experimental && Number.isFinite(dias) && valor.periodo_experimental_dias !== ""
      ? dataDoPeriodoExperimental(inicioEfectivo, dias)
      : null;

  /**
   * O tecto do campo de horas depende da UNIDADE escolhida: 16 por dia, 80 por
   * semana, 346,67 por mes, 4160 por ano. Nenhum destes numeros esta escrito
   * aqui -- saem todos do mesmo factor que a coluna gerada da base usa.
   */
  const maximoDeHoras = maximoDaFrequencia(valor.horas_frequencia);
  const horasNumero = Number(valor.horas_trabalho.replace(",", "."));
  const horasValidas = valor.horas_trabalho.trim() !== "" && Number.isFinite(horasNumero);
  const equivalente = horasValidas
    ? equivalenteParaMostrar(horasNumero, valor.horas_frequencia)
    : null;
  // Aviso, nao erro: 9,2h/semana e legal. O que isto apanha e "40 mensais".
  const horasSuspeitas = horasValidas && horasImplausiveis(horasNumero, valor.horas_frequencia);

  // Para o aviso de "excede o contrato" no editor de horario variavel, mais
  // abaixo -- REAIS, nao o equivalente fixo do tecto (ver horas.ts).
  const horasContratadasSemanais = horasContratadasSemanaisReais(
    horasValidas ? horasNumero : null,
    valor.horas_frequencia,
    valor.dias_uteis,
  );

  // A duracao em meses so existe no termo certo; nos outros tipos a data de fim
  // escreve-se a mao (ou nao existe, no sem termo).
  const temMeses = tipoTemDuracaoEmMeses(valor.tipo_contrato);

  useFimDoContratoPorMeses({
    tipoContrato: valor.tipo_contrato,
    inicioEfectivo,
    duracaoMeses: valor.duracao_meses,
    dataFim: valor.data_fim,
    onDataFim: (data_fim) => onPatch({ data_fim }),
  });

  const alternarDiaUtil = (dia: DiaSemana, marcado: boolean) =>
    onPatch({
      dias_uteis: marcado
        ? [...valor.dias_uteis, dia]
        : valor.dias_uteis.filter((outro) => outro !== dia),
    });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <CamposModeloContrato
          idTipo="hr-novo-tipo-contrato"
          idRegimeContratual="hr-novo-regime-contratual"
          tipoContrato={valor.tipo_contrato}
          regimeContratual={valor.regime_contratual}
          tipoRecomendado
          tipoPodeFicarVazio
          ajudaTipo={valor.tipo_contrato === "" ? t("hr.form.avisoCampoRhPendente") : undefined}
          onTipoContrato={(tipo) =>
            onPatch({
              tipo_contrato: tipo,
              // Os meses so valem no termo certo: ao sair dele esvaziam-se.
              ...(tipoTemDuracaoEmMeses(tipo) ? {} : { duracao_meses: "" }),
            })
          }
          onRegimeContratual={(regime_contratual) => onPatch({ regime_contratual })}
        />
        {/* `regime` na base; "Tipo de trabalho" no ecra. Ver cabecalho. */}
        <CampoSelect
          id="hr-novo-regime"
          label={t("hr.contrato.regime")}
          ajuda={t("hr.contrato.ajudaRegime")}
          valor={valor.regime}
          opcoes={REGIMES_TRABALHO.map((regime) => ({
            value: regime,
            label: t(`hr.regime.${regime}`),
          }))}
          onChange={(v) => onPatch({ regime: v as RegimeTrabalho })}
        />
        <CampoTexto
          id="hr-novo-data-inicio"
          label={t("hr.contrato.dataInicio")}
          tipo="date"
          valor={valor.data_inicio}
          erro={erroDe("hr-novo-data-inicio")}
          onChange={(v) => onPatch({ data_inicio: v })}
        />
        <CampoTexto
          id="hr-novo-data-fim"
          label={t("hr.contrato.dataFim")}
          tipo="date"
          valor={valor.data_fim}
          erro={erroDe("hr-novo-data-fim")}
          ajuda={temMeses ? t("hr.contrato.ajudaDataFimPorDuracao") : undefined}
          onChange={(v) =>
            onPatch({
              data_fim: v,
              // Escrever a data a mao acerta os meses (vazio se nenhuma duracao a produz).
              ...(temMeses ? { duracao_meses: mesesDaDataFim(inicioEfectivo, v) } : {}),
            })
          }
        />
        {/* So no termo certo. Mudar os meses (ou o inicio) recalcula a data de
            fim; quem preferir escrever a data directamente continua a poder,
            o campo acima nunca fica bloqueado. */}
        {temMeses && (
          <CampoTexto
            id="hr-novo-duracao-meses"
            label={t("hr.contrato.duracaoMeses")}
            ajuda={t("hr.contrato.ajudaDuracaoMeses")}
            tipo="number"
            min={1}
            max={MESES_MAXIMOS_CONTRATO}
            step="1"
            valor={valor.duracao_meses}
            onChange={(v) => onPatch({ duracao_meses: v })}
          />
        )}
      </div>

      <div className="space-y-3">
        <CampoInterruptor
          id="hr-novo-tem-periodo-experimental"
          label={t("hr.contrato.temPeriodoExperimental")}
          descricao={t("hr.contrato.ajudaPeriodoExperimental")}
          checked={valor.tem_periodo_experimental}
          onChange={(v) => onPatch({ tem_periodo_experimental: v })}
        />
        {valor.tem_periodo_experimental && (
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              id="hr-novo-periodo-experimental-dias"
              label={t("hr.contrato.periodoExperimentalDias")}
              tipo="number"
              min={0}
              max={1095}
              valor={valor.periodo_experimental_dias}
              erro={erroDe("hr-novo-periodo-experimental-dias")}
              onChange={(v) => onPatch({ periodo_experimental_dias: v })}
            />
            <div className="flex items-end pb-2">
              <p className="text-sm text-muted-foreground">
                {fimExperimental
                  ? `${t("hr.contrato.periodoExperimentalAte")}: ${fimExperimental}`
                  : t("hr.contrato.periodoExperimentalSemData")}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t("hr.contrato.retribuicao")}</p>
        {salarioDoCargo !== null && (
          <p className="text-sm">{t("hr.form.salarioDoCargo", { valor: salarioDoCargo })}</p>
        )}
        {podeEditarRetribuicao ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <CampoTexto
              id="hr-novo-subsidio"
              label={t("hr.retribuicaoCartao.subsidioAlimentacao")}
              tipo="number"
              min={0}
              step="0.01"
              valor={valor.subsidio}
              erro={erroDe("hr-novo-subsidio")}
              onChange={(v) => onPatch({ subsidio: v })}
            />
            <CampoSelect
              id="hr-novo-subsidio-modo"
              label={t("hr.retribuicaoCartao.subsidioAlimentacaoModo")}
              valor={valor.subsidio_modo}
              vazioLabel={t("common.none")}
              opcoes={(["dinheiro", "cartao"] as const).map((m) => ({
                value: m,
                label: t(`hr.subsidioAlimentacaoModo.${m}`),
              }))}
              onChange={(v) => onPatch({ subsidio_modo: v as SubsidioAlimentacaoModo | "" })}
            />
            <CampoSelect
              id="hr-novo-duodecimos"
              label={t("hr.contrato.duodecimos")}
              valor={valor.duodecimos_pct}
              vazioLabel={t("common.none")}
              ajuda={t("hr.form.duodecimosProposta")}
              opcoes={[0, 50, 100].map((d) => ({ value: String(d), label: `${d}%` }))}
              onChange={(v) => onPatch({ duodecimos_pct: v as RascunhoContrato["duodecimos_pct"] })}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("hr.form.parteDaPessoaDepois")}</p>
        )}
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t("hr.contrato.tempoTrabalho")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* `tipo_trabalho` na base; "Modalidade" no ecra. Ver cabecalho. */}
          <CampoSelect
            id="hr-novo-tipo-trabalho"
            label={t("hr.contrato.tipoTrabalho")}
            ajuda={t("hr.contrato.ajudaTipoTrabalho")}
            valor={valor.tipo_trabalho}
            vazioLabel={t("hr.campos.semValor")}
            opcoes={TIPOS_TRABALHO.map((tipo) => ({
              value: tipo,
              label: t(`hr.tipoTrabalho.${tipo}`),
            }))}
            onChange={(v) => onPatch({ tipo_trabalho: v as TipoTrabalho | "" })}
          />
          <div className="grid grid-cols-2 gap-2">
            <CampoTexto
              id="hr-novo-horas-trabalho"
              label={t("hr.contrato.horasTrabalho")}
              ajuda={
                equivalente
                  ? t("hr.contrato.ajudaEquivalenteSemanal", { horas: equivalente })
                  : undefined
              }
              tipo="number"
              min={0}
              max={maximoDeHoras}
              step="0.5"
              valor={valor.horas_trabalho}
              erro={erroDe("hr-novo-horas-trabalho")}
              onChange={(v) => onPatch({ horas_trabalho: v })}
            />
            <CampoSelect
              id="hr-novo-horas-frequencia"
              label={t("hr.contrato.horasFrequencia")}
              valor={valor.horas_frequencia}
              opcoes={HORAS_FREQUENCIAS.map((f) => ({
                value: f,
                label: t(`hr.horasFrequencia.${f}`),
              }))}
              onChange={(v) => onPatch({ horas_frequencia: v as HorasFrequencia })}
            />
            {horasSuspeitas && (
              <p
                className="col-span-2 text-xs text-amber-600 dark:text-amber-500"
                role="status"
              >
                {t("hr.form.avisoHorasImplausiveis", { horas: equivalente ?? "" })}
              </p>
            )}
          </div>
          <CampoTexto
            id="hr-novo-tempo-trabalho-pct"
            label={t("hr.contrato.tempoTrabalhoPct")}
            ajuda={t("hr.contrato.ajudaFteFixo")}
            tipo="number"
            valor="100"
            disabled
            onChange={() => {}}
          />
          <CampoSelect
            id="hr-novo-politica-feriados"
            label={t("hr.contrato.politicaFeriados")}
            valor={valor.politica_feriados}
            opcoes={POLITICAS_FERIADOS.map((p) => ({
              value: p,
              label: t(`hr.politicaFeriados.${p}`),
            }))}
            onChange={(v) => onPatch({ politica_feriados: v as PoliticaFeriados })}
          />
          <CampoTexto
            id="hr-novo-horas-anuais-maximas"
            label={t("hr.contrato.horasAnuaisMaximas")}
            tipo="number"
            min={0}
            max={4000}
            valor={valor.horas_anuais_maximas}
            erro={erroDe("hr-novo-horas-anuais-maximas")}
            onChange={(v) => onPatch({ horas_anuais_maximas: v })}
          />
          <CampoTexto
            id="hr-novo-horas-semanais-maximas"
            label={t("hr.contrato.horasSemanaisMaximas")}
            tipo="number"
            min={0}
            max={80}
            step="0.5"
            valor={valor.horas_semanais_maximas}
            erro={erroDe("hr-novo-horas-semanais-maximas")}
            onChange={(v) => onPatch({ horas_semanais_maximas: v })}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("hr.contrato.diasUteis")}</legend>
          <div className="flex flex-wrap gap-3">
            {DIAS_SEMANA.map((dia) => {
              const id = `hr-novo-dia-util-${dia}`;
              return (
                <div key={dia} className="flex items-center gap-1.5">
                  <Checkbox
                    id={id}
                    checked={valor.dias_uteis.includes(dia)}
                    onCheckedChange={(marcado) => alternarDiaUtil(dia, marcado === true)}
                  />
                  <Label htmlFor={id} className="text-sm font-normal">
                    {t(`hr.dias.${dia}`)}
                  </Label>
                </div>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* O horario. A escolha vem primeiro, em texto claro, porque a maioria
          dos contratos nao precisa do editor -- e quem precisa, precisa muito. */}
      <div className="space-y-3 rounded-md border p-3">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("hr.horario.titulo")}</p>
          <CampoInterruptor
            id="hr-novo-horario-variavel"
            label={t("hr.horario.variavel")}
            descricao={t("hr.horario.variavelDescricao")}
            checked={valor.horario_variavel}
            onChange={(v) => onPatch({ horario_variavel: v })}
          />
        </div>

        {valor.horario_variavel ? (
          <HorarioEditor
            valor={valor.horario}
            onChange={(horario: HorarioRascunho) => onPatch({ horario })}
            locais={locais}
            locaisALoad={locaisALoad}
            podeEditar
            idPrefixo="hr-novo-horario"
            horasContratadasSemanais={horasContratadasSemanais}
          />
        ) : (
          <Badge variant="outline" className="font-normal">
            {t("hr.horario.fixo")}
          </Badge>
        )}
      </div>
    </div>
  );
}
