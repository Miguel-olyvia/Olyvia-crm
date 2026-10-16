// O que falta para um passo avançar, escrito junto ao botão que o travou e que lá fica até o utilizador agir (um toast sumia em
// segundos). O leitor de ecrã já a ouve na região live da página; o botão liga-se a ela com `aria-describedby`.
import { AlertCircle } from "lucide-react";

interface ExplicacaoDoPassoProps {
  id: string;
  texto: string;
}

/** O texto vai em `text-foreground` (contraste) e a cor fica só no ícone, que é decorativo. */
export function ExplicacaoDoPasso({ id, texto }: ExplicacaoDoPassoProps) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-foreground">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      {texto}
    </p>
  );
}
