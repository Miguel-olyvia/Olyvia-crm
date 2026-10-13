import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FOCO } from "./estilos";
import { traduzir, type Texto } from "./workflowNegocio";

interface GrupoRadiosProps<T extends string> {
  legenda: string;
  /** Uma linha de ajuda por baixo da legenda; sem ela, o grupo fica só com a legenda. */
  ajuda?: string;
  /** O nível do título da legenda: h4 por defeito; h5 quando o grupo está dentro de uma secção com h4. */
  nivel?: "h4" | "h5";
  valor: T;
  opcoes: readonly T[];
  /** Por opção: `null` = admitida; um texto = indisponível, com o motivo escrito. */
  indisponiveis: Record<T, Texto | null>;
  rotulo: (opcao: T) => string;
  aoMudar: (opcao: T) => void;
}

/**
 * Um grupo de opções exclusivas: fieldset com legenda, linhas de 44 px e as inválidas com `aria-disabled` (continuam
 * focáveis, mas não se escolhem), com o motivo escrito fora do rótulo, em texto normal, e ligado por `aria-describedby`.
 */
export function GrupoRadios<T extends string>({
  legenda, ajuda, nivel: Titulo = "h4", valor, opcoes, indisponiveis, rotulo, aoMudar,
}: GrupoRadiosProps<T>) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-4">
      <legend className="px-1"><Titulo id={`${id}-legenda`} className="text-sm font-semibold text-foreground">{legenda}</Titulo></legend>
      {ajuda && <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">{ajuda}</p>}
      <RadioGroup
        value={valor} onValueChange={(v) => { if (!indisponiveis[v as T]) aoMudar(v as T); }}
        aria-labelledby={`${id}-legenda`} aria-describedby={ajuda ? `${id}-ajuda` : undefined}
      >
        {opcoes.map((opcao) => {
          const motivo = indisponiveis[opcao];
          const marcada = opcao === valor;
          return (
            <div
              key={opcao}
              className={cn(
                "flex min-h-11 flex-col justify-center gap-0.5 rounded-md border px-3 py-2",
                marcada ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem
                  id={`${id}-${opcao}`} value={opcao} className={cn(FOCO, motivo && "cursor-not-allowed opacity-50")}
                  aria-disabled={motivo ? "true" : undefined} aria-describedby={motivo ? `${id}-${opcao}-motivo` : undefined}
                />
                <Label
                  htmlFor={`${id}-${opcao}`}
                  className={cn("flex-1 py-2 leading-snug", motivo ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer")}
                >
                  {rotulo(opcao)}
                </Label>
              </div>
              {motivo && <p id={`${id}-${opcao}-motivo`} className="pl-7 text-xs text-foreground">{traduzir(t, motivo)}</p>}
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
