/**
 * As duas perguntas que definem o MODELO do contrato, partilhadas pelo
 * assistente "Nova pessoa" e pelo separador Contratos da ficha:
 *
 *   - "Tipo de contrato": sem termo, termo certo, termo incerto, duracao muito
 *     curta ou temporario (`TIPOS_CONTRATO`). "Tempo parcial" nao e um tipo: e o
 *     "Tipo de trabalho" (`regime`), que continua a ser outro campo;
 *   - "Regime contratual": individual ou coletivo
 *     (`pessoas_vinculos.regime_contratual`), sem campos extra.
 *
 * Presentacional: quem a usa guarda o estado. Devolve duas celulas de grelha
 * (um fragmento), para encaixar na grelha do ecra onde vive.
 */
import { CampoSelect } from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { tiposContratoParaMostrar } from "@/lib/hr/contrato";
import {
  REGIMES_CONTRATUAIS,
  type RegimeContratual,
  type TipoContrato,
} from "@/types/hr";

interface CamposModeloContratoProps {
  idTipo: string;
  idRegimeContratual: string;
  tipoContrato: TipoContrato | "";
  regimeContratual: RegimeContratual;
  onTipoContrato: (tipo: TipoContrato | "") => void;
  onRegimeContratual: (regime: RegimeContratual) => void;
  disabled?: boolean;
  /** Mostra a opcao "sem valor" no tipo (o assistente deixa-o por preencher). */
  tipoPodeFicarVazio?: boolean;
  tipoRecomendado?: boolean;
  ajudaTipo?: string;
}

export function CamposModeloContrato({
  idTipo,
  idRegimeContratual,
  tipoContrato,
  regimeContratual,
  onTipoContrato,
  onRegimeContratual,
  disabled,
  tipoPodeFicarVazio,
  tipoRecomendado,
  ajudaTipo,
}: CamposModeloContratoProps) {
  const { t } = useTranslation();
  return (
    <>
      <CampoSelect
        id={idTipo}
        label={t("hr.contrato.tipoContrato")}
        recomendado={tipoRecomendado}
        ajuda={ajudaTipo}
        valor={tipoContrato}
        vazioLabel={tipoPodeFicarVazio ? t("hr.campos.semValor") : undefined}
        disabled={disabled}
        opcoes={tiposContratoParaMostrar(tipoContrato).map((tipo) => ({
          value: tipo,
          label: t(`hr.tipoContrato.${tipo}`),
        }))}
        onChange={(v) => onTipoContrato(v as TipoContrato | "")}
      />
      <CampoSelect
        id={idRegimeContratual}
        label={t("hr.contrato.regimeContratual")}
        ajuda={t("hr.contrato.ajudaRegimeContratual")}
        valor={regimeContratual}
        disabled={disabled}
        opcoes={REGIMES_CONTRATUAIS.map((regime) => ({
          value: regime,
          label: t(`hr.regimeContratual.${regime}`),
        }))}
        onChange={(v) => onRegimeContratual(v as RegimeContratual)}
      />
    </>
  );
}
