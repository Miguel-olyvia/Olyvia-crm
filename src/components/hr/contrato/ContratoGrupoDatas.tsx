/**
 * Grupo 2 do separador Contratos -- Datas e prazos: quando comeca, quando
 * acaba, e o que lhe da forma entretanto (periodo experimental, formacao).
 *
 * Termo certo: a DURACAO EM MESES vive aqui, ao lado da data de fim. Mudar os
 * meses ou o inicio recalcula a data de fim (a vespera do dia correspondente;
 * `useFimDoContratoPorMeses`, ligado no separador); escrever a data a mao
 * acerta os meses, ou esvazia-os se nenhuma duracao a produz.
 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CampoTexto } from "@/components/hr/form/Campos";
import { mesesDaDataFim } from "@/hooks/useFimDoContratoPorMeses";
import { useTranslation } from "@/hooks/useTranslation";
import { tipoTemDuracaoEmMeses } from "@/lib/hr/contrato";
import { MESES_MAXIMOS_CONTRATO } from "@/lib/hr/novaPessoaDatas";
import type { SugestaoPeriodoExperimental } from "@/lib/hr/periodoExperimental";
import type { DefinirCampo, RascunhoVinculo } from "./rascunhoVinculo";

interface ContratoGrupoDatasProps {
  rascunho: RascunhoVinculo;
  definir: DefinirCampo;
  podeEditar: boolean;
  temExperimental: boolean;
  onAlternarExperimental: (ligado: boolean) => void;
  sugestaoExperimental: SugestaoPeriodoExperimental | null;
  onAceitarSugestao: () => void;
  onDefinirCampoExperimental: (
    campo: "periodo_experimental_dias" | "periodo_experimental_ate",
    valor: string,
  ) => void;
  /** O erro de formato de um campo numerico (so depois de lhe tocar). */
  erroDe: (campoId: string) => string | null;
}

export function ContratoGrupoDatas({
  rascunho,
  definir,
  podeEditar,
  temExperimental,
  onAlternarExperimental,
  sugestaoExperimental,
  onAceitarSugestao,
  onDefinirCampoExperimental,
  erroDe,
}: ContratoGrupoDatasProps) {
  const { t } = useTranslation();
  const temMeses = tipoTemDuracaoEmMeses(rascunho.tipo_contrato);
  return (
    <div className="space-y-3">
      <h3 id="hr-contrato-grupo-datas" className="text-sm font-medium">
        {t("hr.contrato.datasPrazos")}
      </h3>
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-labelledby="hr-contrato-grupo-datas"
      >
        <CampoTexto
          id="hr-contrato-data-inicio"
          label={t("hr.contrato.dataInicio")}
          tipo="date"
          valor={rascunho.data_inicio}
          disabled={!podeEditar}
          onChange={(v) => definir("data_inicio", v)}
        />
        <CampoTexto
          id="hr-contrato-data-fim"
          label={t("hr.contrato.dataFim")}
          tipo="date"
          valor={rascunho.data_fim}
          ajuda={temMeses ? t("hr.contrato.ajudaDataFimPorDuracao") : undefined}
          disabled={!podeEditar}
          onChange={(v) => {
            definir("data_fim", v);
            // Escrever a data a mao acerta os meses (vazio se nenhuma duracao a produz).
            if (temMeses) definir("duracao_meses", mesesDaDataFim(rascunho.data_inicio, v));
          }}
        />
        {/* So no termo certo -- nos outros tipos nao ha duracao em meses. */}
        {temMeses && (
          <CampoTexto
            id="hr-contrato-duracao-meses"
            label={t("hr.contrato.duracaoMeses")}
            ajuda={t("hr.contrato.ajudaDuracaoMeses")}
            tipo="number"
            min={1}
            max={MESES_MAXIMOS_CONTRATO}
            step="1"
            valor={rascunho.duracao_meses}
            disabled={!podeEditar}
            onChange={(v) => definir("duracao_meses", v)}
          />
        )}
        <CampoTexto
          id="hr-contrato-motivo-termo"
          label={t("hr.contrato.motivoTermo")}
          valor={rascunho.motivo_termo}
          disabled={!podeEditar}
          onChange={(v) => definir("motivo_termo", v)}
        />
        {/* O interruptor ocupa uma celula da grelha; os dois campos so
            aparecem depois dele, e so quando ha mesmo periodo. */}
        <div className="flex items-center gap-2 self-end pb-2">
          {/* `aria-labelledby` e nao so `htmlFor`: o Switch do Radix e um
              <button>, e o nome acessivel de um botao NAO vem de uma
              <label for>. Sem isto o interruptor chega a quem usa leitor
              de ecra sem nome nenhum. */}
          <Switch
            id="hr-contrato-tem-experimental"
            aria-labelledby="hr-contrato-tem-experimental-rotulo"
            checked={temExperimental}
            disabled={!podeEditar}
            onCheckedChange={onAlternarExperimental}
          />
          <Label
            id="hr-contrato-tem-experimental-rotulo"
            htmlFor="hr-contrato-tem-experimental"
            className="font-normal"
          >
            {t("hr.contrato.temExperimental")}
          </Label>
        </div>
        {temExperimental && (
          <>
            <div className="space-y-1.5">
              <CampoTexto
                id="hr-contrato-periodo-experimental-dias"
                label={t("hr.contrato.periodoExperimentalDias")}
                erro={erroDe("hr-contrato-periodo-experimental-dias")}
                tipo="number"
                min={0}
                max={1095}
                valor={rascunho.periodo_experimental_dias}
                disabled={!podeEditar}
                onChange={(v) => onDefinirCampoExperimental("periodo_experimental_dias", v)}
              />
              {/* A sugestao NUNCA se escreve sozinha -- so aparece o botao,
                  e so quando ha um numero legal para o tipo de contrato e a
                  categoria escolhidos. Ver `lib/hr/periodoExperimental.ts`. */}
              {podeEditar && sugestaoExperimental && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={onAceitarSugestao}
                >
                  {t("hr.contrato.sugerirPeriodoExperimental", {
                    dias: String(sugestaoExperimental.dias),
                  })}
                </Button>
              )}
              {rascunho.periodo_experimental_origem === "sugerido" && (
                <p className="text-xs text-muted-foreground" role="status">
                  {t("hr.contrato.periodoExperimentalSugerido")}
                </p>
              )}
            </div>
            <CampoTexto
              id="hr-contrato-periodo-experimental-ate"
              label={t("hr.contrato.periodoExperimentalAte")}
              ajuda={t("hr.contrato.ajudaExperimentalDuasColunas")}
              tipo="date"
              valor={rascunho.periodo_experimental_ate}
              disabled={!podeEditar}
              onChange={(v) => onDefinirCampoExperimental("periodo_experimental_ate", v)}
            />
          </>
        )}
        <CampoTexto
          id="hr-contrato-formacao-inicio"
          label={t("hr.contrato.formacaoInicio")}
          tipo="date"
          valor={rascunho.formacao_inicio}
          disabled={!podeEditar}
          onChange={(v) => definir("formacao_inicio", v)}
        />
        <CampoTexto
          id="hr-contrato-formacao-fim"
          label={t("hr.contrato.formacaoFim")}
          erro={
            rascunho.formacao_fim.trim() !== "" &&
            rascunho.formacao_inicio.trim() !== "" &&
            rascunho.formacao_fim < rascunho.formacao_inicio
              ? t("hr.contrato.erroFormacaoFimAntesInicio")
              : null
          }
          tipo="date"
          valor={rascunho.formacao_fim}
          disabled={!podeEditar}
          onChange={(v) => definir("formacao_fim", v)}
        />
      </div>
    </div>
  );
}
