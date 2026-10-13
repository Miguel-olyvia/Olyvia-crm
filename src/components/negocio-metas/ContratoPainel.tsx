import { useTranslation } from "@/hooks/useTranslation";
import { Campo, ListaCampos } from "./CamposPainel";
import { formatarMeta } from "./formatoMetas";
import type { DetalheNegocio } from "./negocioDetalhes";
import { valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { formatarData } from "./negocioPainel";

/**
 * O separador Contrato: o estado (pendente ou assinado, em texto), o valor, a criação e a assinatura (quem e
 * como). Um contrato pendente ainda aguarda assinatura.
 */
export function ContratoPainel({ negocio, detalhe }: { negocio: NegocioMes; detalhe: DetalheNegocio | null }) {
  const { t } = useTranslation();
  const contrato = negocio.contrato;
  if (!contrato) return null;
  const d = detalhe?.contrato;
  return (
    <ListaCampos>
      <Campo rotulo={t("businessGoals.painel.contract.state")}>{t(`businessGoals.contract.${contrato.estado}`)}</Campo>
      <Campo rotulo={t("businessGoals.painel.contract.value")}>{formatarMeta("euro", valorDoNegocio(negocio))}</Campo>
      {d?.criadoEm && <Campo rotulo={t("businessGoals.painel.contract.created")}>{formatarData(d.criadoEm)}</Campo>}
      {contrato.estado === "pendente" ? (
        <Campo rotulo={t("businessGoals.painel.contract.signedOn")}>{t("businessGoals.painel.contract.awaiting")}</Campo>
      ) : (
        <>
          {d?.assinadoEm && <Campo rotulo={t("businessGoals.painel.contract.signedOn")}>{formatarData(d.assinadoEm)}</Campo>}
          {d?.assinatura && (
            <Campo rotulo={t("businessGoals.painel.contract.signedBy")}>
              {t("businessGoals.painel.contract.signature", {
                quem: d.assinatura.quem, como: t(`businessGoals.painel.contract.how.${d.assinatura.como}`),
              })}
            </Campo>
          )}
        </>
      )}
    </ListaCampos>
  );
}
