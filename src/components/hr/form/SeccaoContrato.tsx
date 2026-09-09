/**
 * Passo 4 -- Informacoes de contrato: o que se assina.
 *
 * Tres blocos, e a ordem importa: o CONTRATO (tipo, datas, periodo
 * experimental), a RETRIBUICAO (montante, moeda, periodicidade) e o TEMPO DE
 * TRABALHO (modalidade, horas, FTE, dias uteis, feriados, maximos).
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
 * "Tempo parcial" e tambem um dos seis TIPOS DE CONTRATO, e por isso os dois
 * campos podem contradizer-se. Ao escolher esse tipo, o regime segue -- excepto
 * se a pessoa ja o tiver escolhido a mao, caso em que a escolha dela fica e
 * aparece um aviso. A regra vive em `lib/hr/contrato`, com a justificacao.
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
import { HorarioEditor } from "@/components/hr/HorarioEditor";
import { type HorarioRascunho } from "@/lib/hr/horario";
import { dataDoPeriodoExperimental, type RascunhoContrato } from "@/lib/hr/novaPessoa";
import {
  regimeAoMudarTipoContrato,
  regimeContradizTipoContrato,
} from "@/lib/hr/contrato";
import {
  equivalenteParaMostrar,
  horasImplausiveis,
  maximoDaFrequencia,
} from "@/lib/hr/horas";
import {
  DIAS_SEMANA,
  HORAS_FREQUENCIAS,
  PERIODICIDADES,
  POLITICAS_FERIADOS,
  REGIMES_TRABALHO,
  TIPOS_CONTRATO,
  TIPOS_TRABALHO,
  type DiaSemana,
  type HorasFrequencia,
  type LocalTrabalho,
  type Periodicidade,
  type PoliticaFeriados,
  type RegimeTrabalho,
  type TipoContrato,
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
}

export function SeccaoContrato({
  valor,
  onPatch,
  erroDe,
  dataAdmissao,
  locais,
  locaisALoad,
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

  /**
   * So aparece quando a pessoa escolheu o regime A MAO e ele contradiz o tipo:
   * quando ninguem lhe tocou, o regime ja seguiu o tipo e nao ha nada a avisar.
   */
  const regimeContradiz = regimeContradizTipoContrato(valor.tipo_contrato, valor.regime);

  const alternarDiaUtil = (dia: DiaSemana, marcado: boolean) =>
    onPatch({
      dias_uteis: marcado
        ? [...valor.dias_uteis, dia]
        : valor.dias_uteis.filter((outro) => outro !== dia),
    });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSelect
          id="hr-novo-tipo-contrato"
          label={t("hr.contrato.tipoContrato")}
          valor={valor.tipo_contrato}
          vazioLabel={t("hr.campos.semValor")}
          opcoes={TIPOS_CONTRATO.map((tipo) => ({
            value: tipo,
            label: t(`hr.tipoContrato.${tipo}`),
          }))}
          onChange={(v) => {
            const tipo = v as TipoContrato | "";
            onPatch({
              tipo_contrato: tipo,
              regime: regimeAoMudarTipoContrato(tipo, valor.regime, valor.regime_manual),
            });
          }}
        />
        {/* `regime` na base; "Tipo de trabalho" no ecra. Ver cabecalho. */}
        <div className="space-y-1.5">
          <CampoSelect
            id="hr-novo-regime"
            label={t("hr.contrato.regime")}
            ajuda={t("hr.contrato.ajudaRegime")}
            valor={valor.regime}
            opcoes={REGIMES_TRABALHO.map((regime) => ({
              value: regime,
              label: t(`hr.regime.${regime}`),
            }))}
            onChange={(v) => onPatch({ regime: v as RegimeTrabalho, regime_manual: true })}
          />
          {regimeContradiz && (
            <p className="text-xs text-amber-600 dark:text-amber-500" role="status">
              {t("hr.form.avisoRegimeContradizTipoContrato")}
            </p>
          )}
        </div>
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
          onChange={(v) => onPatch({ data_fim: v })}
        />
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
        <div className="grid gap-4 sm:grid-cols-3">
          <CampoTexto
            id="hr-novo-valor-base"
            label={t("hr.contrato.valorBase")}
            tipo="number"
            min={0}
            step="0.01"
            valor={valor.valor_base}
            erro={erroDe("hr-novo-valor-base")}
            onChange={(v) => onPatch({ valor_base: v })}
          />
          <CampoTexto
            id="hr-novo-moeda"
            label={t("hr.contrato.moeda")}
            valor={valor.moeda}
            onChange={(v) => onPatch({ moeda: v.toUpperCase() })}
          />
          <CampoSelect
            id="hr-novo-periodicidade"
            label={t("hr.contrato.periodicidade")}
            valor={valor.periodicidade}
            opcoes={PERIODICIDADES.map((p) => ({
              value: p,
              label: t(`hr.periodicidade.${p}`),
            }))}
            onChange={(v) => onPatch({ periodicidade: v as Periodicidade })}
          />
        </div>
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
            ajuda={t("hr.contrato.ajudaFte")}
            tipo="number"
            min={0}
            max={100}
            step="1"
            valor={valor.tempo_trabalho_pct}
            erro={erroDe("hr-novo-tempo-trabalho-pct")}
            onChange={(v) => onPatch({ tempo_trabalho_pct: v })}
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
