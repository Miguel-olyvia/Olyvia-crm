/** O que se vê em «Denunciar» e «As minhas denúncias» quando a sessão não tem ficha em RH (nos dados de exemplo, não acontece). */
import { useTranslation } from "@/hooks/useTranslation";

export function SemFichaDenuncias() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 p-6">
      <h1 className="text-xl font-semibold">{t("cdm.semFicha.titulo")}</h1>
      <p className="text-sm text-muted-foreground">{t("cdm.semFicha.texto")}</p>
    </div>
  );
}

/** Enquanto a ficha ligada à sessão se lê: evita piscar «Sem ficha» a quem a tem. */
export function CarregandoDenuncias() {
  const { t } = useTranslation();
  return (
    <div className="p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
      {t("cdm.carregandoFicha")}
    </div>
  );
}
