// O selo "Dados de exemplo" da Frota (mesmo aspeto do SeloExemplo do RH de exemplo). O texto da ajuda é outro: aqui
// os dados ficam guardados neste navegador (localStorage), não só em memória como no RH.
import { useTranslation } from "@/hooks/useTranslation";

export function SeloExemploFrota() {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-xs font-normal text-muted-foreground"
      title={t("frotaExemplo.selo.ajuda")}
    >
      {t("frotaExemplo.selo")}
    </span>
  );
}
