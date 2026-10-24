// As duas abas sublinhadas do painel "Novo negócio": o mesmo aspeto das abas do Inventário, por cima de `ui/tabs`
// (só classes) e com cópia local das classes, porque esta pasta não importa de ficha-comum. Cada aba pode levar um
// contador (em pastilha, e dito em texto ao leitor de ecrã) e um aviso de erros (ícone e texto, nunca só a cor).
import type { ComponentPropsWithoutRef } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { N } from "./PecasNovoNegocio";

export { Tabs, TabsContent } from "@/components/ui/tabs";

const LISTA = "h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent px-6 py-0 text-muted-foreground";
const ABA = [
  "min-h-11 shrink-0 gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-normal shadow-none",
  "text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none",
  "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
  "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-medium",
  "data-[state=active]:text-primary dark:data-[state=active]:text-violet-300 data-[state=active]:shadow-none",
].join(" ");

export function ListaAbasNovo({ className, ...props }: ComponentPropsWithoutRef<typeof TabsList>) {
  return <TabsList className={cn(LISTA, className)} {...props} />;
}

interface AbaNovoProps extends Omit<ComponentPropsWithoutRef<typeof TabsTrigger>, "children"> {
  rotulo: string;
  contador?: number;
  /** O que o leitor de ecrã ouve a seguir ao nome, quando há contador. */
  contadorLeitor?: string;
  comErros?: boolean;
}

export function AbaNovo({ rotulo, contador, contadorLeitor, comErros, className, ...props }: AbaNovoProps) {
  const { t } = useTranslation();
  return (
    <TabsTrigger className={cn(ABA, className)} {...props}>
      {rotulo}
      {contador !== undefined && (
        <>
          <span aria-hidden="true" className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
            {contador}
          </span>
          <span className="sr-only">{contadorLeitor}</span>
        </>
      )}
      {comErros && (
        <>
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          <span className="sr-only">{t(`${N}tab.errors`)}</span>
        </>
      )}
    </TabsTrigger>
  );
}
