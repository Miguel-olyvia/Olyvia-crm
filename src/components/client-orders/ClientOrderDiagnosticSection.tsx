// "Diagnóstico da obra (só leitura)" na folha da Encomenda Cliente — caixa
// colapsável como no protótipo (details.box). Conteúdo igual ao que o detalhe
// já mostrava: a cópia congelada tirada pelo QuoteBuilder ao gravar o
// orçamento (não há gatilho de assinatura por trás). Sem diagnóstico (vendas
// diretas, manuais) não se renderiza nada.
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InventoryStatusBadge } from "@/components/inventory/ui";
import type { ClientOrderDiagnosticNeed } from "@/pages/ClientOrders";

const fmt = (value: number): string => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(value);

interface Props {
  needs: readonly ClientOrderDiagnosticNeed[];
  /** t() com texto PT de reserva (as chaves podem ainda não existir). */
  tf: (key: string, fallback: string) => string;
}

export function ClientOrderDiagnosticSection({ needs, tf }: Props) {
  if (needs.length === 0) return null;
  return (
    <Collapsible className="group rounded-[10px] border bg-card">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" />
        <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {tf("clientOrders.dialog.diagnostic.title", "Diagnóstico da obra")} (só leitura)
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-3 pb-3">
        <p className="text-xs text-muted-foreground">
          {tf(
            "clientOrders.dialog.diagnostic.subtitle",
            "Cópia do diagnóstico no momento em que o orçamento foi gravado. Não faz parte das linhas da encomenda.",
          )}
        </p>
        {needs.map((need) => {
          const fields: Array<{ label: string; value: string; wide?: boolean }> = [];
          if (need.diag_demolir_descricao) {
            fields.push({ label: tf("clientOrders.dialog.diagnostic.demolish", "Demolir"), value: need.diag_demolir_descricao, wide: true });
          }
          if (need.diag_demolir_m2 !== null) {
            fields.push({ label: tf("clientOrders.dialog.diagnostic.demolishArea", "Área a demolir"), value: `${fmt(need.diag_demolir_m2)} m²` });
          }
          if (need.diag_proteger_descricao) {
            fields.push({ label: tf("clientOrders.dialog.diagnostic.protect", "Proteger"), value: need.diag_proteger_descricao, wide: true });
          }
          if (need.diag_intervencao_tipo) {
            fields.push({ label: tf("clientOrders.dialog.diagnostic.interventionType", "Tipo de intervenção"), value: need.diag_intervencao_tipo });
          }
          if (need.diag_intervencao_descricao) {
            fields.push({
              label: tf("clientOrders.dialog.diagnostic.interventionDescription", "Descrição da intervenção"),
              value: need.diag_intervencao_descricao,
              wide: true,
            });
          }
          return (
            <div key={need.deal_need_id} className="space-y-3 rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-sm font-medium">
                  {need.need_title || tf("clientOrders.dialog.diagnostic.untitledNeed", "Necessidade sem título")}
                </span>
                {need.diag_area_m2 !== null && <InventoryStatusBadge>{fmt(need.diag_area_m2)} m²</InventoryStatusBadge>}
              </div>
              {fields.length > 0 && (
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  {fields.map((field) => (
                    <div key={field.label} className={field.wide ? "sm:col-span-2" : undefined}>
                      <dt className="text-xs text-muted-foreground">{field.label}</dt>
                      <dd className="whitespace-pre-wrap break-words font-medium">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {need.materials.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {tf("clientOrders.dialog.diagnostic.materials", "Materiais previstos")}
                    </span>
                    <InventoryStatusBadge>
                      {tf("clientOrders.dialog.diagnostic.materialsBadge", "Informativo para o armazém")}
                    </InventoryStatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tf("clientOrders.dialog.diagnostic.materialsNote", "Não são linhas da encomenda, não têm preço e não somam ao total.")}
                  </p>
                  <ul className="space-y-1">
                    {need.materials.map((material, i) => (
                      <li key={`${need.deal_need_id}-mat-${i}`} className="flex items-baseline gap-2 text-sm">
                        <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
                          {fmt(material.quantity)}
                          {material.unidade ? ` ${material.unidade}` : ""}
                        </span>
                        <span className="min-w-0 break-words text-muted-foreground">{material.descricao || "-"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
