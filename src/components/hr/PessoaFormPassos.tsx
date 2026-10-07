/**
 * A lista de passos do assistente de criacao de pessoa (a navegacao lateral).
 *
 * Extraida de `PessoaFormDialog` (que passava das 800 linhas): so apresentacao.
 * Cada entrada anuncia o seu estado em TEXTO -- o ponto de aviso nao pode ser so
 * cor -- e todas sao clicaveis desde o primeiro instante (navegacao livre).
 */
import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { SECCOES, type SeccaoId } from "@/lib/hr/novaPessoa";

interface PessoaFormPassosProps {
  seccao: SeccaoId;
  onSeleccionar: (id: SeccaoId) => void;
  /** O icone do estado de cada passo (aviso, preenchido, aberto, vazio). */
  icone: (id: SeccaoId) => ReactNode;
  /** O estado do passo por extenso, para o leitor de ecra. */
  estadoTexto: (id: SeccaoId) => string;
}

export function PessoaFormPassos({ seccao, onSeleccionar, icone, estadoTexto }: PessoaFormPassosProps) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("hr.form.listaPassos")}
      aria-orientation="vertical"
      className="hidden border-r p-3 sm:block"
    >
      {SECCOES.map((id, i) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === seccao}
          aria-controls={`hr-novo-painel-${id}`}
          id={`hr-novo-passo-${id}`}
          onClick={() => onSeleccionar(id)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
            id === seccao ? "bg-muted font-medium" : "hover:bg-muted/60",
          )}
        >
          {icone(id)}
          <span className="flex-1">
            {i + 1}. {t(`hr.form.seccoes.${id}`)}
          </span>
          <span className="sr-only">{estadoTexto(id)}</span>
        </button>
      ))}
    </div>
  );
}
