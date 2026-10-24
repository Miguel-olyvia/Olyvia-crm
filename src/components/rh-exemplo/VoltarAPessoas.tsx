/** A ligação «Voltar a Pessoas» das páginas de configuração (campos de admissão e regras de fim de contrato). */
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

export function VoltarAPessoas() {
  const { t } = useTranslation();
  return (
    <Link
      to="/rh-exemplo/pessoas"
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm text-muted-foreground underline-offset-4",
        "hover:text-foreground hover:underline motion-reduce:transition-none",
        FOCO,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("rhA.pessoas.voltar")}
    </Link>
  );
}
