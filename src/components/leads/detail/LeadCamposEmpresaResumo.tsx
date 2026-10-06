import { SlidersHorizontal } from "lucide-react";
import { useCamposEmpresa } from "@/hooks/useCamposEmpresa";
import { resumoExtra, type ValoresExtra } from "@/lib/campos/definicoes";

/**
 * Resumo de uma linha dos campos da empresa da lead (cfg_campos, ficha
 * "lead"; valores em anew_leads.field_values). Nada aparece sem campos
 * configurados ou sem valores. Edita-se no diálogo Editar da lead.
 */
export function LeadCamposEmpresaResumo({
  organizationId,
  fieldValues,
}: {
  organizationId: string | null | undefined;
  fieldValues: ValoresExtra | null | undefined;
}) {
  const { fichas } = useCamposEmpresa(organizationId ?? null);
  const texto = resumoExtra(fichas.lead.extra, fieldValues);
  if (!texto) return null;
  return (
    <div className="rounded-lg border p-3 text-sm text-muted-foreground flex items-start gap-2" data-testid="lead-campos-empresa-resumo">
      <SlidersHorizontal className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{texto}</span>
    </div>
  );
}
