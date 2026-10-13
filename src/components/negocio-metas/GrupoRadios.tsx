import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FOCO } from "./estilos";
import { traduzir, type Texto } from "./workflowNegocio";

interface GrupoRadiosProps<T extends string> {
  legenda: string;
  ajuda: string;
  valor: T;
  opcoes: readonly T[];
  /** Por opção: `null` = admitida; um texto = indisponível, com o motivo escrito. */
  indisponiveis: Record<T, Texto | null>;
  rotulo: (opcao: T) => string;
  aoMudar: (opcao: T) => void;
}

/** Um grupo de opções exclusivas: fieldset com legenda, linhas de 44 px e as inválidas desativadas, com o motivo à vista. */
export function GrupoRadios<T extends string>({ legenda, ajuda, valor, opcoes, indisponiveis, rotulo, aoMudar }: GrupoRadiosProps<T>) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-4">
      <legend className="px-1"><h4 className="text-sm font-semibold text-foreground">{legenda}</h4></legend>
      <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">{ajuda}</p>
      <RadioGroup
        value={valor} onValueChange={(v) => aoMudar(v as T)}
        aria-describedby={`${id}-ajuda`}
      >
        {opcoes.map((opcao) => {
          const motivo = indisponiveis[opcao];
          const marcada = opcao === valor;
          return (
            <div
              key={opcao}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md border px-3 py-2",
                marcada ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <RadioGroupItem
                id={`${id}-${opcao}`} value={opcao} disabled={motivo !== null} className={FOCO}
              />
              <Label
                htmlFor={`${id}-${opcao}`}
                className={cn("flex-1 cursor-pointer py-2 leading-snug", motivo && "cursor-not-allowed text-muted-foreground")}
              >
                {rotulo(opcao)}
                {motivo && <span className="block text-xs font-normal">{traduzir(t, motivo)}</span>}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
