// «Abrir orçamento / proposta / contrato»: na ficha real, leva ao ecrã da app desse documento (com `?voltar=` para regressar à ficha). Só
// aparece quando o processo real o sabe fazer (`abrirDocumento`); no exemplo não desenha nada.
import { ExternalLink } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useProcesso } from "./processo/processoContexto";

interface AbrirDocumentoProps {
  tipo: "orcamento" | "proposta" | "contrato";
  negocioId: string;
}

export function AbrirDocumento({ tipo, negocioId }: AbrirDocumentoProps) {
  const { t } = useTranslation();
  const processo = useProcesso();
  const abrir = processo?.abrirDocumento;
  if (!abrir) return null;
  return (
    <Button type="button" variant="outline" className={cn("mb-3 min-h-11 gap-2", FOCO)} onClick={() => abrir(tipo, negocioId)}>
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
      {t(`pessoasPagina.neg.process.open.${tipo}`)}
    </Button>
  );
}
