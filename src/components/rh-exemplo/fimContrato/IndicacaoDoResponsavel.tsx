/**
 * No cartão «Fim do contrato» do RH: o que o responsável indicou, com quem e quando. É só uma indicação:
 * as ações Renovar e Terminar continuam a ser do RH.
 */
import { Badge } from "@/components/ui/badge";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useTranslation } from "@/hooks/useTranslation";

export function IndicacaoDoResponsavel({ vinculoId }: { vinculoId: string }) {
  const { t } = useTranslation();
  // Duas leituras separadas: o selector tem de devolver sempre a mesma referência (um objecto novo faria ciclo).
  const resposta = useEstadoRh((e) => {
    const ficha = Object.values(e.fichas).find((f) => f.vinculos.some((v) => v.id === vinculoId));
    return ficha?.respostasFim[vinculoId] ?? null;
  });
  const responsavel = useEstadoRh((e) => {
    const ficha = Object.values(e.fichas).find((f) => f.vinculos.some((v) => v.id === vinculoId));
    const id = ficha?.pessoa.reporta_a_pessoa_id ?? null;
    return id ? (e.fichas[id]?.pessoa.nome_completo ?? null) : null;
  });
  const dados = { resposta, responsavel };
  const quando = resposta ? new Date(resposta.em).toLocaleString() : "";

  return (
    <section aria-label={t("rhA.fimContrato.indicacaoTitulo")} className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
      <h4 className="text-sm font-medium">{t("rhA.fimContrato.indicacaoTitulo")}</h4>
      {dados.resposta ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge className="font-normal">{t(`hr.fimContrato.resposta.${dados.resposta.resposta}`)}</Badge>
          <span className="text-muted-foreground">
            {t("rhA.fimContrato.indicacaoPor", { quem: dados.responsavel ?? t("hr.campos.semValor"), quando })}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rhA.fimContrato.indicacaoAinda")}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("rhA.fimContrato.soRhDecide")}</p>
    </section>
  );
}
