// Horas e horário do contrato, na aba "Contrato e local": horas contratadas e a sua unidade, tempo de trabalho (sempre 100%),
// dias de trabalho, política de feriados, máximos e isenção. O horário por dia define-se na aba Planeamento da ficha.
import { CampoTexto } from "@/components/hr/form/Campos";
import { equivalenteSemanal } from "@/lib/hr/horas";
import { numeroDe } from "@/lib/hr/numeros";
import { DIAS_SEMANA, HORAS_FREQUENCIAS, POLITICAS_FERIADOS, type DiaSemana } from "@/types/hr";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CampoI, CampoS, CampoT, GRELHA, LinhaCampo } from "./camposNova";
import { useNova } from "./contextoNova";
import { opcoes } from "./opcoesNova";
import { SeccaoNova } from "./SeccaoNova";

function DiasDeTrabalho() {
  const { t } = useTranslation();
  const { valores, alterar } = useNova();
  const dias = valores.contrato.dias_uteis;
  const alternar = (dia: DiaSemana) =>
    alterar("contrato", { dias_uteis: dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia] });
  return (
    <LinhaCampo id="hr-novo-dias-uteis" largo>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{t("hr.contrato.diasUteis")}</legend>
        <div className="flex flex-wrap gap-2">
          {DIAS_SEMANA.map((dia) => (
            <label key={dia} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
              <input
                type="checkbox" checked={dias.includes(dia)} onChange={() => alternar(dia)}
                className={cn("h-5 w-5 accent-primary", FOCO)}
              />
              {t(`hr.dias.${dia}`)}
            </label>
          ))}
        </div>
      </fieldset>
    </LinhaCampo>
  );
}

export function ContratoHoras() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const c = valores.contrato;
  const equivalente = equivalenteSemanal(numeroDe(c.horas_trabalho), c.horas_frequencia);
  return (
    <SeccaoNova titulo={t("rhNova.sec.horas")}>
      <div className={GRELHA}>
        <CampoT
          g="contrato" k="horas_trabalho" id="hr-novo-horas-trabalho" rotulo={t("hr.contrato.horasTrabalho")}
          ajuda={equivalente === null ? t("hr.contrato.ajudaHorasNovoContrato") : t("hr.contrato.ajudaEquivalenteSemanal", { horas: equivalente })}
        />
        <CampoS g="contrato" k="horas_frequencia" id="hr-novo-horas-frequencia" rotulo={t("hr.contrato.horasFrequencia")} opcoes={opcoes(t, "hr.horasFrequencia", HORAS_FREQUENCIAS)} />
        <LinhaCampo id="hr-novo-tempo-trabalho-pct">
          <CampoTexto
            id="hr-novo-tempo-trabalho-pct" label={t("hr.contrato.tempoTrabalhoPct")} valor={c.tempo_trabalho_pct}
            onChange={() => undefined} disabled ajuda={t("hr.contrato.ajudaFteFixo")}
          />
        </LinhaCampo>
        <CampoS g="contrato" k="politica_feriados" id="hr-novo-politica-feriados" rotulo={t("hr.contrato.politicaFeriados")} opcoes={opcoes(t, "hr.politicaFeriados", POLITICAS_FERIADOS)} />
        <CampoT g="contrato" k="horas_semanais_maximas" id="hr-novo-horas-semanais-maximas" rotulo={t("hr.contrato.horasSemanaisMaximas")} />
        <CampoT g="contrato" k="horas_anuais_maximas" id="hr-novo-horas-anuais-maximas" rotulo={t("hr.contrato.horasAnuaisMaximas")} />
        <CampoI g="extra" k="isencao_horario" id="hr-novo-isencao-horario" rotulo={t("hr.contrato.isencaoHorario")} />
        <DiasDeTrabalho />
      </div>
    </SeccaoNova>
  );
}
