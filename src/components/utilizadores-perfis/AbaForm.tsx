// As abas sublinhadas dos formulários (o estilo do painel "Novo negócio"): cada aba pode levar um contador e o aviso de
// erros, em ícone e texto (a cor nunca é o único sinal).
import type { ComponentPropsWithoutRef } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ABA } from "@/components/ficha-comum/estilosAbas";

export { Tabs, TabsContent } from "@/components/ui/tabs";

const LISTA = "h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent px-6 py-0 text-muted-foreground";

export function ListaAbasForm({ className, ...props }: ComponentPropsWithoutRef<typeof TabsList>) {
  return <TabsList className={cn(LISTA, className)} {...props} />;
}

interface AbaFormProps extends Omit<ComponentPropsWithoutRef<typeof TabsTrigger>, "children"> {
  rotulo: string;
  contador?: number;
  comErros?: boolean;
}

export function AbaForm({ rotulo, contador, comErros, className, ...props }: AbaFormProps) {
  const { t } = useTranslation();
  return (
    <TabsTrigger className={cn(ABA, className)} {...props}>
      {rotulo}
      {contador !== undefined && (
        <>
          <span aria-hidden="true" className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">{contador}</span>
          <span className="sr-only">, {contador}</span>
        </>
      )}
      {comErros && (
        <>
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          <span className="sr-only">{t("usersProfiles.form.tab.errors")}</span>
        </>
      )}
    </TabsTrigger>
  );
}
