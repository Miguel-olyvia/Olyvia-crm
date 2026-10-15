// A ligação discreta, nas páginas dentro da app, para ver a página pública como a vê quem não tem login.
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";

export function LigacaoPublica() {
  const { t } = useTranslation();
  return (
    <Link
      to="/canal-denuncias/nova"
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground ${FOCO}`}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      {t("cdm.verPublica")}
    </Link>
  );
}
