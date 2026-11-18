import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { obterIdioma } from "@/lib/idiomaDocumento/registo";

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
  /** Em verdadeiro (versão de idioma): os campos ficam desativados com a nota. Em falso: não muda nada no DOM. */
  versao?: VersaoEmEdicao;
  children: ReactNode;
  className?: string;
}

/**
 * Cores, margens, logótipo e restantes opções são comuns a todos os idiomas: só se alteram no idioma base.
 * Fora de uma versão devolve os filhos tal e qual (sem elemento a mais); numa versão embrulha-os num
 * `fieldset` desativado (desativa todos os botões, interruptores e campos lá dentro) com a nota.
 */
export function CamposComuns({ versao, children, className }: Props) {
  const { t } = useTranslation();
  if (!versao) return <>{children}</>;
  return (
    <fieldset disabled className={cn("pointer-events-none m-0 min-w-0 space-y-4 border-0 p-0 opacity-60", className)}>
      <p className="text-[11px] italic text-muted-foreground">
        {t("contractTemplates.versoes.comum.nota", { base: obterIdioma(versao.base)?.nomeNativo ?? versao.base })}
      </p>
      {children}
    </fieldset>
  );
}
