// Alternador PT | EN do portal: um grupo com dois botões aria-pressed. Os nomes («Português», «English») são fixos
// e escritos na língua de cada um, para quem não percebe o idioma atual os conseguir sempre encontrar.
import { cn } from "@/lib/utils";
import { usePortalIdioma } from "./usePortalIdioma";
import type { PortalIdioma } from "./tipos";

interface PortalSeletorIdiomaProps {
  /** Mostra só PT | EN (para cabeçalhos estreitos); o nome acessível continua a ser o nome por extenso. */
  compacto?: boolean;
  className?: string;
}

const OPCOES: ReadonlyArray<{ idioma: PortalIdioma; nome: string; sigla: string }> = [
  { idioma: "pt", nome: "Português", sigla: "PT" },
  { idioma: "en", nome: "English", sigla: "EN" },
];

const BASE_DO_BOTAO =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function PortalSeletorIdioma({ compacto = false, className }: PortalSeletorIdiomaProps) {
  const { idioma, setIdioma } = usePortalIdioma();

  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5", className)}
    >
      {OPCOES.map((opcao) => {
        const ativo = idioma === opcao.idioma;
        return (
          <button
            key={opcao.idioma}
            type="button"
            lang={opcao.idioma}
            aria-label={opcao.nome}
            aria-pressed={ativo}
            onClick={() => setIdioma(opcao.idioma)}
            className={cn(
              BASE_DO_BOTAO,
              compacto ? "px-2 text-xs tracking-wide" : "px-4",
              ativo
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {compacto ? opcao.sigla : opcao.nome}
          </button>
        );
      })}
    </div>
  );
}
