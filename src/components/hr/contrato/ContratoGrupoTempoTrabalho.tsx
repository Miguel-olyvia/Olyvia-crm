/**
 * Grupo 3 do separador Contratos -- Tempo de trabalho: tipo de trabalho,
 * modalidade e tudo o que mede a jornada. A chave desta legenda ja existia --
 * e a mesma usada no assistente de admissao, em `SeccaoContrato.tsx`.
 *
 * DOIS ROTULOS QUE NAO CORRESPONDEM AO NOME DA COLUNA: "Tipo de trabalho" e
 * `regime` (tempo integral / parcial) e "Modalidade" e `tipo_trabalho`
 * (presencial / remoto / hibrido). Nao confundir com o "Regime contratual"
 * (`regime_contratual`, individual / coletivo), que e do grupo do contrato.
 *
 * AS HORAS (`horas_periodo`/`horas_frequencia`) SO SE ESCREVEM AQUI AO CRIAR O
 * CONTRATO (`criandoContrato`). Sao derivadas de `pessoas_vinculos_horas`
 * desde 20261130120000: ao EDITAR um contrato existente ficam em leitura e
 * alteram-se no cartao "Horas contratadas", que distingue ALTERAR de CORRIGIR
 * e pede data de efeito. Ao criar o primeiro contrato nao ha nada para esse
 * cartao alterar -- um vinculo novo nascia sem horas se o campo ficasse
 * bloqueado -- por isso so nesse caso o campo e editavel e `onGuardarVinculo`
 * grava a primeira versao (ver `usePessoa.saveVinculo`).
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { equivalenteParaMostrar, horasImplausiveis } from "@/lib/hr/horas";
import {
  DIAS_SEMANA,
  HORAS_FREQUENCIAS,
  POLITICAS_FERIADOS,
  REGIMES_TRABALHO,
  TIPOS_TRABALHO,
  type HorasFrequencia,
  type PoliticaFeriados,
  type RegimeTrabalho,
} from "@/types/hr";
import { CAMPOS_NUMERICOS, type DefinirCampo, type RascunhoVinculo } from "./rascunhoVinculo";

interface ContratoGrupoTempoTrabalhoProps {
  rascunho: RascunhoVinculo;
  definir: DefinirCampo;
  podeEditar: boolean;
  /** Sem vinculo em vigor: as horas ainda se escrevem aqui. */
  criandoContrato: boolean;
  erroDe: (campoId: string) => string | null;
}

export function ContratoGrupoTempoTrabalho({
  rascunho,
  definir,
  podeEditar,
  criandoContrato,
  erroDe,
}: ContratoGrupoTempoTrabalhoProps) {
  const { t } = useTranslation();

  const horasNumero = Number(rascunho.horas_periodo.replace(",", "."));
  const horasLegiveis = rascunho.horas_periodo.trim() !== "" && Number.isFinite(horasNumero);
  const equivalente = horasLegiveis
    ? equivalenteParaMostrar(horasNumero, rascunho.horas_frequencia)
    : null;
  const horasSuspeitas =
    horasLegiveis && horasImplausiveis(horasNumero, rascunho.horas_frequencia);

  return (
    <div className="space-y-3">
      <h3 id="hr-contrato-grupo-tempo" className="text-sm font-medium">
        {t("hr.contrato.tempoTrabalho")}
      </h3>
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-labelledby="hr-contrato-grupo-tempo"
      >
        {/* `regime` na base; "Tipo de trabalho" no ecra. */}
        <CampoSelect
          id="hr-contrato-regime"
          label={t("hr.contrato.regime")}
          ajuda={t("hr.contrato.ajudaRegime")}
          valor={rascunho.regime}
          disabled={!podeEditar}
          opcoes={REGIMES_TRABALHO.map((regime) => ({
            value: regime,
            label: t(`hr.regime.${regime}`),
          }))}
          onChange={(v) => definir("regime", v as RegimeTrabalho)}
        />
        {/* `tipo_trabalho` na base; "Modalidade" no ecra. */}
        <CampoSelect
          id="hr-contrato-tipo-trabalho"
          label={t("hr.contrato.tipoTrabalho")}
          ajuda={t("hr.contrato.ajudaTipoTrabalho")}
          valor={rascunho.tipo_trabalho}
          vazioLabel={t("hr.campos.semValor")}
          disabled={!podeEditar}
          opcoes={TIPOS_TRABALHO.map((tipo) => ({
            value: tipo,
            label: t(`hr.tipoTrabalho.${tipo}`),
          }))}
          onChange={(v) => definir("tipo_trabalho", v)}
        />
        <CampoTexto
          id="hr-contrato-horas-periodo"
          label={t("hr.contrato.horasTrabalho")}
          ajuda={
            criandoContrato
              ? t("hr.contrato.ajudaHorasNovoContrato")
              : equivalente
                ? // As duas frases juntas, de proposito: mostrar so o
                  // equivalente sem dizer ONDE se muda deixava a pessoa sem
                  // saber que ha um sitio para isso.
                  `${t("hr.contrato.ajudaEquivalenteSemanal", { horas: equivalente })} ${t("hr.contrato.ajudaHorasDerivadas")}`
                : t("hr.contrato.ajudaHorasDerivadas")
          }
          tipo="number"
          valor={rascunho.horas_periodo}
          disabled={!criandoContrato || !podeEditar}
          onChange={(v) => definir("horas_periodo", v)}
          erro={erroDe(CAMPOS_NUMERICOS.horas)}
        />
        <CampoSelect
          id="hr-contrato-horas-frequencia"
          label={t("hr.contrato.horasFrequencia")}
          valor={rascunho.horas_frequencia}
          ajuda={criandoContrato ? undefined : t("hr.contrato.ajudaHorasDerivadas")}
          disabled={!criandoContrato || !podeEditar}
          opcoes={HORAS_FREQUENCIAS.map((f) => ({
            value: f,
            label: t(`hr.horasFrequencia.${f}`),
          }))}
          onChange={(v) => definir("horas_frequencia", v as HorasFrequencia)}
        />
        {horasSuspeitas && (
          <p className="text-xs text-amber-600 dark:text-amber-500" role="status">
            {t("hr.form.avisoHorasImplausiveis", { horas: equivalente ?? "" })}
          </p>
        )}
        <CampoTexto
          id="hr-contrato-tempo-trabalho-pct"
          label={t("hr.contrato.tempoTrabalhoPct")}
          ajuda={t("hr.contrato.ajudaFteFixo")}
          tipo="number"
          valor="100"
          disabled
          onChange={() => {}}
        />
        <CampoSelect
          id="hr-contrato-politica-feriados"
          label={t("hr.contrato.politicaFeriados")}
          valor={rascunho.politica_feriados}
          disabled={!podeEditar}
          opcoes={POLITICAS_FERIADOS.map((p) => ({
            value: p,
            label: t(`hr.politicaFeriados.${p}`),
          }))}
          onChange={(v) => definir("politica_feriados", v as PoliticaFeriados)}
        />
        <CampoTexto
          id="hr-contrato-horas-anuais-maximas"
          label={t("hr.contrato.horasAnuaisMaximas")}
          erro={erroDe("hr-contrato-horas-anuais-maximas")}
          tipo="number"
          min={0}
          max={4000}
          valor={rascunho.horas_anuais_maximas}
          disabled={!podeEditar}
          onChange={(v) => definir("horas_anuais_maximas", v)}
        />
        <CampoTexto
          id="hr-contrato-horas-semanais-maximas"
          label={t("hr.contrato.horasSemanaisMaximas")}
          erro={erroDe("hr-contrato-horas-semanais-maximas")}
          tipo="number"
          min={0}
          max={80}
          step="0.5"
          valor={rascunho.horas_semanais_maximas}
          disabled={!podeEditar}
          onChange={(v) => definir("horas_semanais_maximas", v)}
        />
        <div className="flex items-center gap-2 self-end pb-2">
          {/* `aria-labelledby` e nao so `htmlFor`: o Switch do Radix e um
              <button>, e o nome acessivel de um botao NAO vem de uma
              <label for>. */}
          <Switch
            id="hr-contrato-isencao-horario"
            aria-labelledby="hr-contrato-isencao-horario-rotulo"
            checked={rascunho.isencao_horario}
            disabled={!podeEditar}
            onCheckedChange={(v) => definir("isencao_horario", v)}
          />
          <Label
            id="hr-contrato-isencao-horario-rotulo"
            htmlFor="hr-contrato-isencao-horario"
            className="font-normal"
          >
            {t("hr.contrato.isencaoHorario")}
          </Label>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("hr.contrato.diasUteis")}</legend>
        <div className="flex flex-wrap gap-3">
          {DIAS_SEMANA.map((dia) => {
            const id = `hr-contrato-dia-util-${dia}`;
            return (
              <div key={dia} className="flex items-center gap-1.5">
                <Checkbox
                  id={id}
                  checked={rascunho.dias_uteis.includes(dia)}
                  disabled={!podeEditar}
                  onCheckedChange={(marcado) =>
                    definir(
                      "dias_uteis",
                      marcado === true
                        ? [...rascunho.dias_uteis, dia]
                        : rascunho.dias_uteis.filter((outro) => outro !== dia),
                    )
                  }
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
  );
}
