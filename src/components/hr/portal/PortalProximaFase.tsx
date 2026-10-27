/**
 * O que a pessoa fara no portal mais tarde e que ainda nao existe: ver o contrato e assinar, e os
 * pedidos de documentos. Desenhado e desactivado, com a razao (ver `BotaoProximaFase`). Preencher, gravar o
 * rascunho, corrigir e submeter ja se fazem no proprio formulario; o envio de documentos esta no cartao de
 * documentos (fase 2).
 */
import { useTranslation } from "@/hooks/useTranslation";
import { BotaoProximaFase } from "./BotaoProximaFase";

export function PortalProximaFase() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="portal-proxima-titulo" className="space-y-3 rounded-lg border bg-background p-5">
      <h2 id="portal-proxima-titulo" className="text-base font-semibold">
        {t("portal.proxima.titulo")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("portal.proxima.descricao")}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <BotaoProximaFase id="portal-contrato" rotulo={t("portal.proxima.contrato")} />
        <BotaoProximaFase id="portal-pedidos" rotulo={t("portal.proxima.pedidos")} />
      </div>
    </section>
  );
}
