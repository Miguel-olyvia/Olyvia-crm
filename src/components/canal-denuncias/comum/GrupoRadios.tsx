// Um grupo de opções em botões de rádio nativos (teclado e leitor de ecrã de graça), com alvos de 44 px, a opção
// escolhida marcada por um ✓ além da cor, e o erro (se houver) ligado ao grupo por aria-describedby.
import { Check, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface OpcaoRadio<T extends string> {
  valor: T;
  rotulo: string;
}

interface GrupoRadiosProps<T extends string> {
  nome: string;
  legenda: string;
  valor: T | null;
  opcoes: readonly OpcaoRadio<T>[];
  onChange: (valor: T) => void;
  erro?: string;
}

export function GrupoRadios<T extends string>({ nome, legenda, valor, opcoes, onChange, erro }: GrupoRadiosProps<T>) {
  const idErro = `${nome}-erro`;
  return (
    <fieldset className="space-y-1.5" aria-describedby={erro ? idErro : undefined}>
      <legend className="text-sm font-medium text-foreground">{legenda}</legend>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => {
          const escolhida = o.valor === valor;
          return (
            <label
              key={o.valor}
              className={cn(
                "relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-4 text-sm",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
                escolhida ? "border-primary bg-primary/10 font-medium text-foreground" : "border-input bg-card hover:border-foreground/40",
              )}
            >
              <input
                type="radio"
                name={nome}
                value={o.valor}
                checked={escolhida}
                onChange={() => onChange(o.valor)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {escolhida && <Check className="h-4 w-4 text-primary dark:text-violet-300" aria-hidden="true" />}
              {o.rotulo}
            </label>
          );
        })}
      </div>
      {erro && (
        <p id={idErro} className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </p>
      )}
    </fieldset>
  );
}
