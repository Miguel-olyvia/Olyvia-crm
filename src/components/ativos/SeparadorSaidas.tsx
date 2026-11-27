/**
 * O separador «Saídas», ao lado de Serviço, Estrutura e Pessoas. Não é um grupo de ativos (não tem ativos, totais nem «Registar»), por
 * isso não entra em `GRUPOS_ATIVO` e vive aqui, com o mesmo desenho dos outros três (ícone, nome e descrição curta).
 */
import { DoorOpen } from "lucide-react";
import { toneBadge } from "@/components/inventory/ui/tones";
import { TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

export const VALOR_SEPARADOR_SAIDAS = "saidas";

export function SeparadorSaidas() {
  const { t } = useTranslation();
  return (
    <TabsTrigger
      value={VALOR_SEPARADOR_SAIDAS}
      className={cn(
        "group min-h-11 min-w-0 justify-start gap-3 whitespace-normal rounded-xl px-2.5 py-2.5 text-left text-muted-foreground sm:px-3.5 sm:py-3",
        "transition-[background-color,box-shadow,color] duration-150 hover:text-foreground motion-reduce:transition-none",
        "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <span aria-hidden="true" className={cn("hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid", toneBadge.warn)}>
        <DoorOpen className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold sm:text-[15px]">{t("ativos.saidas.separador")}</span>
        <span className="mt-0.5 hidden truncate text-xs font-normal text-muted-foreground md:block">{t("ativos.saidas.separador.curto")}</span>
      </span>
    </TabsTrigger>
  );
}
