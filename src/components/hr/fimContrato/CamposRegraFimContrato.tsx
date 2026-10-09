/**
 * Os campos de uma regra de fim de contrato, partilhados pelo ecra de
 * configuracao da organizacao (os defaults) e pela excepcao de um contrato.
 *
 * Presentacional: quem a usa guarda o formulario (`FormRegraFimContrato`, texto
 * de input) e valida (`problemasDaRegra`). Na excepcao (`herdavel`) cada campo
 * tem a opcao "Herdar da organizacao" -- campo vazio = herda; na organizacao
 * nao ha de quem herdar, por isso os vazios so existem onde significam "igual a
 * duracao inicial" (a duracao da renovacao). Nenhum valor por omissao esta
 * aqui: so o que o formulario trouxer.
 */
import { CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import {
  AO_ATINGIR_LIMITE,
  DIAS_AVISO_MAX,
  DIAS_AVISO_MIN,
  UNIDADES_DURACAO,
  type AoAtingirLimite,
  type ErroRegra,
  type FormRegraFimContrato,
  type UnidadeDuracao,
} from "@/lib/hr/fimContrato";

interface CamposRegraFimContratoProps {
  idPrefixo: string;
  valor: FormRegraFimContrato;
  onChange: (patch: Partial<FormRegraFimContrato>) => void;
  /** Os erros a mostrar (so depois de tentar guardar). */
  erros: readonly ErroRegra[];
  /** Excepcao de um contrato: cada campo pode herdar da organizacao. */
  herdavel?: boolean;
  disabled?: boolean;
}

export function CamposRegraFimContrato({
  idPrefixo,
  valor,
  onChange,
  erros,
  herdavel,
  disabled,
}: CamposRegraFimContratoProps) {
  const { t } = useTranslation();
  const herdar = herdavel ? t("hr.fimContrato.herdar") : undefined;
  const erro = (chave: ErroRegra, key: string) => (erros.includes(chave) ? t(key) : null);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CampoTexto
        id={`${idPrefixo}-dias-aviso`}
        label={t("hr.fimContrato.diasAviso")}
        ajuda={herdavel ? t("hr.fimContrato.herdaSeVazio") : t("hr.fimContrato.diasAvisoAjuda")}
        erro={erro("dias", "hr.fimContrato.erroDias")}
        tipo="number"
        min={DIAS_AVISO_MIN}
        max={DIAS_AVISO_MAX}
        step="1"
        valor={valor.dias_aviso}
        disabled={disabled}
        onChange={(v) => onChange({ dias_aviso: v })}
      />
      <CampoSelect
        id={`${idPrefixo}-renovacao-automatica`}
        label={t("hr.fimContrato.renovacaoAutomatica")}
        ajuda={t("hr.fimContrato.renovacaoAutomaticaAjuda")}
        valor={valor.renovacao_automatica}
        vazioLabel={herdar}
        disabled={disabled}
        opcoes={[
          { value: "sim", label: t("common.yes") },
          { value: "nao", label: t("common.no") },
        ]}
        onChange={(v) => onChange({ renovacao_automatica: v as FormRegraFimContrato["renovacao_automatica"] })}
      />
      <CampoTexto
        id={`${idPrefixo}-max-renovacoes`}
        label={t("hr.fimContrato.maxRenovacoes")}
        ajuda={herdavel ? t("hr.fimContrato.herdaSeVazio") : t("hr.fimContrato.maxRenovacoesAjuda")}
        erro={erro("max", "hr.fimContrato.erroMax")}
        tipo="number"
        min={0}
        step="1"
        valor={valor.max_renovacoes}
        disabled={disabled}
        onChange={(v) => onChange({ max_renovacoes: v })}
      />
      <CampoSelect
        id={`${idPrefixo}-ao-atingir-limite`}
        label={t("hr.fimContrato.aoAtingirLimite")}
        valor={valor.ao_atingir_limite}
        vazioLabel={herdar}
        disabled={disabled}
        opcoes={AO_ATINGIR_LIMITE.map((opcao) => ({
          value: opcao,
          label: t(`hr.fimContrato.limite.${opcao}`),
        }))}
        onChange={(v) => onChange({ ao_atingir_limite: v as AoAtingirLimite | "" })}
      />
      <CampoTexto
        id={`${idPrefixo}-duracao-valor`}
        label={t("hr.fimContrato.duracaoValor")}
        ajuda={herdavel ? t("hr.fimContrato.duracaoAjudaExcepcao") : t("hr.fimContrato.duracaoAjuda")}
        erro={erro("duracao", "hr.fimContrato.erroDuracao")}
        tipo="number"
        min={1}
        step="1"
        valor={valor.duracao_valor}
        disabled={disabled}
        onChange={(v) => onChange({ duracao_valor: v })}
      />
      <CampoSelect
        id={`${idPrefixo}-duracao-unidade`}
        label={t("hr.fimContrato.duracaoUnidade")}
        valor={valor.duracao_unidade}
        vazioLabel={herdavel ? t("hr.fimContrato.herdar") : t("hr.fimContrato.igualInicial")}
        disabled={disabled}
        opcoes={UNIDADES_DURACAO.map((unidade) => ({
          value: unidade,
          label: t(`hr.fimContrato.unidade.${unidade}`),
        }))}
        onChange={(v) => onChange({ duracao_unidade: v as UnidadeDuracao | "" })}
      />
    </div>
  );
}
