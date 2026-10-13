// Abas sublinhadas (o estilo do Inventário) por cima de `ui/tabs`, sem lhe tocar: só classes. As setas, Home e End
// vêm do Radix. O contador é uma pastilha só para a vista, e o leitor de ecrã ouve o mesmo número em texto.
import type { ComponentPropsWithoutRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ABA, LISTA_ABAS } from "./estilosPessoas";

export { Tabs, TabsContent } from "@/components/ui/tabs";

/** A lista de abas, com a borda por baixo e a rolar na horizontal em ecrãs estreitos. */
export function ListaAbas({ className, ...props }: ComponentPropsWithoutRef<typeof TabsList>) {
  return <TabsList className={cn(LISTA_ABAS, className)} {...props} />;
}

interface AbaProps extends Omit<ComponentPropsWithoutRef<typeof TabsTrigger>, "children"> {
  rotulo: string;
  contador?: number;
  /** O que o leitor de ecrã ouve a seguir ao nome (por omissão, vírgula e o número); só com `contador`. */
  contadorLeitor?: string;
  /** A etiqueta "Novo": só quando há coisas por tratar. */
  novo?: boolean;
}

/** Uma aba: o rótulo, o contador em pastilha e, se for o caso, a etiqueta "Novo". */
export function Aba({ rotulo, contador, contadorLeitor, novo, className, ...props }: AbaProps) {
  const { t } = useTranslation();
  return (
    <TabsTrigger className={cn(ABA, className)} {...props}>
      {rotulo}
      {contador !== undefined && (
        <>
          <span aria-hidden="true" className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
            {contador}
          </span>
          <span className="sr-only">{contadorLeitor ?? `, ${contador}`}</span>
        </>
      )}
      {novo && (
        <span aria-hidden="true" className="rounded-sm border border-primary px-1 text-[0.625rem] font-semibold uppercase text-primary dark:text-violet-300">
          {t("pessoasPagina.tabs.new")}
        </span>
      )}
    </TabsTrigger>
  );
}
