/**
 * No cartão «Fim do contrato» do RH: o que o responsável indicou para este ciclo do contrato, e quando. É só uma
 * indicação: as ações Renovar e Terminar continuam a ser do RH. Lê as indicações que `usePessoaContratoFim` já carregou
 * (`hr_contrato_indicacoes`), por isso não faz pedidos nem estado próprio.
 */
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import type { IndicacaoContrato } from "@/lib/hr/fimContrato";
import { indicacaoDoCiclo } from "./indicacaoResponsavel";

interface IndicacaoDoResponsavelProps {
  vinculoId: string;
  /** A data de fim do contrato de agora: define o ciclo. */
  dataFim: string | null;
  indicacoes: readonly IndicacaoContrato[];
}

export function IndicacaoDoResponsavel({ vinculoId, dataFim, indicacoes }: IndicacaoDoResponsavelProps) {
  const { t } = useTranslation();
  const indicacao = indicacaoDoCiclo(indicacoes, vinculoId, dataFim);
  const quando = indicacao ? new Date(indicacao.indicada_em).toLocaleString() : "";

  return (
    <section aria-label={t("rhA.fimContrato.indicacaoTitulo")} className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
      <h4 className="text-sm font-medium">{t("rhA.fimContrato.indicacaoTitulo")}</h4>
      {indicacao ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className="font-normal">{t(`hr.fimContrato.resposta.${indicacao.resposta}`)}</Badge>
          <span className="text-muted-foreground">{t("rhA.fimContrato.indicacaoEm", { quando })}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rhA.fimContrato.indicacaoAinda")}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("rhA.fimContrato.soRhDecide")}</p>
    </section>
  );
}
