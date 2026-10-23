/** O selo discreto que diz que os ecrãs de Recursos Humanos desta secção usam dados de exemplo. */
import { useTranslation } from "@/hooks/useTranslation";

export function SeloExemplo() {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-xs font-normal text-muted-foreground"
      title={t("rhExemplo.selo.ajuda")}
    >
      {t("rhExemplo.selo")}
    </span>
  );
}
