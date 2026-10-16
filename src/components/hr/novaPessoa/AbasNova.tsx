// As abas sublinhadas do painel "Nova pessoa": o aspeto das abas das fichas (classes de ficha-comum, por cima de `ui/tabs`)
// e, em cada uma, o aviso de erros em ícone e texto, nunca só a cor.
import type { ComponentPropsWithoutRef } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ABA, LISTA_ABAS } from "@/components/ficha-comum/estilosAbas";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export { Tabs, TabsContent } from "@/components/ui/tabs";

export function ListaAbasNova({ className, ...props }: ComponentPropsWithoutRef<typeof TabsList>) {
  return <TabsList className={cn(LISTA_ABAS, "px-6", className)} {...props} />;
}

interface AbaComErrosProps extends Omit<ComponentPropsWithoutRef<typeof TabsTrigger>, "children"> {
  rotulo: string;
  /** Quantos campos desta aba têm erro; 0 não mostra nada. */
  erros: number;
}

export function AbaComErros({ rotulo, erros, className, ...props }: AbaComErrosProps) {
  const { t } = useTranslation();
  return (
    <TabsTrigger className={cn(ABA, className)} {...props}>
      {rotulo}
      {erros > 0 && (
        <>
          <span aria-hidden="true" className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium tabular-nums text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {erros}
          </span>
          <span className="sr-only">{t("rhForm.nova.tabs.errosN", { n: erros })}</span>
        </>
      )}
    </TabsTrigger>
  );
}
