import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ID_NOTA_COMUM } from "./idsDeIdioma";

/** Numa versão de idioma, o que identifica o idioma base (para a nota «comum a todos os idiomas»). */
export interface VersaoEmEdicao {
  /** Código do idioma que se está a editar (nunca o base). */
  codigo: string;
  /** Código do idioma base. */
  base: string;
  /** O texto no idioma base, para mostrar como sugestão onde a versão ainda não tem texto. */
  textoBase?: string | null;
}

interface Props {
  /** Em verdadeiro (versão de idioma): os campos ficam desativados. Em falso: não muda nada no DOM. */
  versao?: VersaoEmEdicao;
  children: ReactNode;
  className?: string;
}

/**
 * Cores, margens, logótipo e restantes opções são comuns a todos os idiomas: só se alteram no idioma base.
 * Fora de uma versão devolve os filhos tal e qual (sem elemento a mais); numa versão embrulha-os num
 * `fieldset` desativado (desativa todos os botões, interruptores e campos lá dentro). A nota que explica
 * porquê é UMA só, fora da zona esbatida (está no painel de layout); cada zona aponta para ela.
 */
export function CamposComuns({ versao, children, className }: Props) {
  if (!versao) return <>{children}</>;
  return (
    <fieldset
      disabled
      aria-describedby={ID_NOTA_COMUM}
      className={cn("pointer-events-none m-0 min-w-0 space-y-4 border-0 p-0 opacity-60", className)}
    >
      {children}
    </fieldset>
  );
}
