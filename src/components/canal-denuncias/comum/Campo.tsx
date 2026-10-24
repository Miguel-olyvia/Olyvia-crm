// Um campo de formulário com etiqueta, ajuda e erro ligados por aria-describedby. O erro diz-se em texto e com ícone.
import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";

export interface AtributosCampo {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-required": true | undefined;
}

interface CampoProps {
  id: string;
  rotulo: string;
  /** Texto de ajuda ou contador, por baixo do campo. */
  ajuda?: string;
  /** Mensagem de erro já traduzida. */
  erro?: string;
  obrigatorio?: boolean;
  children: (atributos: AtributosCampo) => ReactNode;
}

export function Campo({ id, rotulo, ajuda, erro, obrigatorio, children }: CampoProps) {
  const ids = [ajuda ? `${id}-ajuda` : null, erro ? `${id}-erro` : null].filter(Boolean).join(" ");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {rotulo}
        {obrigatorio && <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children({
        id,
        "aria-describedby": ids || undefined,
        "aria-invalid": erro ? true : undefined,
        "aria-required": obrigatorio ? true : undefined,
      })}
      {ajuda && <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{ajuda}</p>}
      {erro && (
        <p id={`${id}-erro`} className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {erro}
        </p>
      )}
    </div>
  );
}
