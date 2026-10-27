/**
 * Os documentos no portal: so a lista do que a `ler` devolveu (nome do ficheiro, sem abrir nem
 * descarregar) e o botao de enviar, desactivado, com o aviso de que o envio chega numa proxima fase (fase 2).
 * As accoes de anexos da Edge respondem 410 `portal_em_atualizacao`, por isso o portal nao as liga: nao ha
 * seletor de ficheiros nem chamada `anexo_*`.
 */
import { useTranslation } from "@/hooks/useTranslation";
import type { AnexoPortal } from "@/lib/hr/portalAdmissao";
import { BotaoProximaFase } from "./BotaoProximaFase";

export function PortalDocumentos({ anexos }: { anexos: AnexoPortal[] }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="portal-documentos-titulo" className="space-y-3 rounded-lg border bg-background p-5">
      <h2 id="portal-documentos-titulo" className="text-base font-semibold">
        {t("portal.documentos.titulo")}
      </h2>
      {anexos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("portal.documentos.vazio")}</p>
      ) : (
        <ul aria-label={t("portal.documentos.titulo")} className="list-disc space-y-1 pl-5 text-sm">
          {anexos.map((a) => (
            <li key={a.id}>{a.nome}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">{t("portal.documentos.proximaFase")}</p>
      <BotaoProximaFase id="portal-documentos" rotulo={t("portal.proxima.documentos")} />
    </section>
  );
}
