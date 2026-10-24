import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { BulletComercial } from "./BulletComercial";
import { EstadoMetaTag } from "./EstadoMetaTag";
import { estadoDaMeta } from "./estadoMeta";
import { FOCO } from "./estilos";
import { TRANSICAO } from "./estilosDashboard";
import { formatarMeta } from "./formatoMetas";
import type { ProgressoMeta } from "./negocioMetas";

/** Empilha no telemóvel; a partir de `sm` é nome, bullet e números na mesma linha. */
const GRELHA = "grid grid-cols-1 gap-1.5 sm:grid-cols-[9rem_1fr_15rem] sm:items-center sm:gap-4";

interface LinhaComercialProps {
  nome: string;
  progresso: ProgressoMeta;
  ritmo: number;
  /** Sem `aoEscolher` a linha não é um botão (é o total da equipa). */
  aoEscolher?: () => void;
  ativo?: boolean;
  testId?: string;
}

/** Uma linha do comparativo: nome, bullet chart, valor, percentagem e estado em texto. */
export function LinhaComercial({
  nome, progresso, ritmo, aoEscolher, ativo = false, testId,
}: LinhaComercialProps) {
  const { t } = useTranslation();
  const { atual, meta, percentagem } = progresso;
  const estado = estadoDaMeta(percentagem, ritmo);
  const estadoTexto = t(`businessGoals.state.${estado}`);
  const conteudo: ReactNode = (
    <>
      <span className={cn("text-sm text-foreground", aoEscolher ? "font-medium" : "font-semibold")}>
        {nome}
      </span>
      <BulletComercial atual={atual} meta={meta} estado={estado} />
      <span className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="font-mono text-sm tabular-nums text-foreground">
          {formatarMeta("euro", atual)}
          <span className="text-muted-foreground"> / {formatarMeta("euro", meta)}</span>
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {percentagem}%
        </span>
        <EstadoMetaTag estado={estado} className="w-24 justify-start" />
      </span>
    </>
  );

  if (!aoEscolher) {
    return (
      <li data-testid={testId} className={cn(GRELHA, "border-t border-border/70 p-2 pt-3")}>
        {conteudo}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        aria-pressed={ativo}
        aria-label={t("businessGoals.reps.rowLabel", {
          name: nome,
          won: formatarMeta("euro", atual),
          goal: formatarMeta("euro", meta),
          percent: percentagem,
          state: estadoTexto,
        })}
        onClick={aoEscolher}
        className={cn(
          GRELHA, TRANSICAO, FOCO,
          "w-full cursor-pointer rounded-md p-2 text-left hover:bg-muted/60",
          ativo && "bg-muted",
        )}
      >
        {conteudo}
      </button>
    </li>
  );
}
