// Passo 3: provas. Anexos simulados em memória: nome, tamanho e remover; no máximo 5.
import { useTranslation } from "@/hooks/useTranslation";
import { SeletorFicheiros } from "../comum/SeletorFicheiros";
import type { PassoProps } from "./PassoModo";

export function PassoProvas({ dados, onChange }: PassoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("cd.provas.intro")}</p>
      <SeletorFicheiros idBase="den-provas" anexos={dados.anexos} onChange={(anexos) => onChange({ anexos })} />
      <p role="note" className="text-xs text-muted-foreground">{t("cd.provas.metadados")}</p>
    </div>
  );
}
