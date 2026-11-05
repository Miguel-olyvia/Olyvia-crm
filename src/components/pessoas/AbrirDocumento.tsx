// «Abrir orçamento / proposta / contrato»: na ficha real, leva ao ecrã da app desse documento (com `?voltar=` para regressar à ficha). Só
// aparece quando o processo real o sabe fazer (`abrirDocumento`); no exemplo não desenha nada. 05/11 (ronda 2): e só a quem pode abrir
// a página do documento (a mesma permissão «ver» da rota: lib/rotasForaDoMenu.ts).
import { ExternalLink } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { usePodeAbrirDestino } from "@/hooks/usePodeAbrirDestino";
import { useProcesso } from "./processo/processoContexto";

const ROTA_DO_DOCUMENTO = { orcamento: "/quotes", proposta: "/proposals", contrato: "/client-contracts" } as const;

interface AbrirDocumentoProps {
  tipo: "orcamento" | "proposta" | "contrato";
  negocioId: string;
}

export function AbrirDocumento({ tipo, negocioId }: AbrirDocumentoProps) {
  const { t } = useTranslation();
  const processo = useProcesso();
  const abrir = processo?.abrirDocumento;
  const podeAbrir = usePodeAbrirDestino();
  if (!abrir || !podeAbrir(ROTA_DO_DOCUMENTO[tipo])) return null;
  return (
    <Button type="button" variant="outline" className={cn("mb-3 min-h-11 gap-2", FOCO)} onClick={() => abrir(tipo, negocioId)}>
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
      {t(`pessoasPagina.neg.process.open.${tipo}`)}
    </Button>
  );
}
