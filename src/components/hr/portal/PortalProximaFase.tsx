/**
 * O que a pessoa fara no portal a seguir e que fica para a V3b: gravar o rascunho, submeter,
 * corrigir os campos devolvidos, ver o contrato e os pedidos de documentos. Desenhado e
 * desactivado, com a razao (ver `BotaoProximaFase`). A leitura da ficha e o NISS e o IBAN
 * (accao `sensiveis`) sao os unicos que a V3a deixa fazer.
 */
import { useTranslation } from "@/hooks/useTranslation";
import { BotaoProximaFase } from "./BotaoProximaFase";

export function PortalProximaFase({ devolvida }: { devolvida: boolean }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="portal-proxima-titulo" className="space-y-3 rounded-lg border bg-background p-5">
      <h2 id="portal-proxima-titulo" className="text-base font-semibold">
        {t("portal.proxima.titulo")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("portal.proxima.descricao")}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <BotaoProximaFase id="portal-gravar" rotulo={t("portal.proxima.gravar")} />
        <BotaoProximaFase id="portal-submeter" rotulo={t("portal.proxima.submeter")} />
        {devolvida && <BotaoProximaFase id="portal-corrigir" rotulo={t("portal.proxima.corrigir")} />}
        <BotaoProximaFase id="portal-contrato" rotulo={t("portal.proxima.contrato")} />
        <BotaoProximaFase id="portal-pedidos" rotulo={t("portal.proxima.pedidos")} />
      </div>
    </section>
  );
}
