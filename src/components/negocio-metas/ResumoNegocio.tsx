import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { COR_FASE } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import { proximoPasso, temValor } from "./logicaQuadro";
import { MiniCadeia } from "./MiniCadeia";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { SaudeTag } from "./SaudeTag";
import { rotuloPrazo } from "./saudeNegocio";
import { textoDias } from "./saudeTexto";
import { TextoDual } from "./TextoDual";

interface ResumoNegocioProps {
  negocio: NegocioMes;
  hoje: string;
  /** Esconde o comercial (quando "Os meus" está ativo, todos são do mesmo). */
  ocultarComercial?: boolean;
  /** No painel: acrescenta a fase e o "parado" por baixo do serviço. */
  detalhado?: boolean;
  className?: string;
}

/** Só no painel: a fase (ponto e texto) e há quantos dias está parado. */
function FaseEParado({ negocio }: { negocio: NegocioMes }) {
  const { t } = useTranslation();
  const fase = faseDoNegocio(negocio);
  return (
    <span className="flex flex-wrap items-center gap-x-3 text-xs text-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", COR_FASE[fase])} />
        {t(`businessGoals.phase.${fase}`)}
      </span>
      {negocio.parado !== null && (
        <span>
          {t("businessGoals.panel.stalled")}:{" "}
          <TextoDual curto={textoDias(t, negocio.parado)} longo={textoDias(t, negocio.parado, true)} />
        </span>
      )}
    </span>
  );
}

/** O que o cartão e o cabeçalho do painel dizem de um negócio: só `span`, para caber dentro de um botão. */
export function ResumoNegocio({ negocio, hoje, ocultarComercial = false, detalhado = false, className }: ResumoNegocioProps) {
  const { t } = useTranslation();
  const semValor = !temValor(negocio);
  const passo = t(`businessGoals.step.${proximoPasso(negocio)}`);
  const prazo = rotuloPrazo(negocio.proximoPrazo, hoje, t);
  const prazoLongo = rotuloPrazo(negocio.proximoPrazo, hoje, t, true);
  return (
    <span className={cn("block space-y-1.5", className)}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{negocio.pessoa}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <TextoDual curto={textoDias(t, negocio.dias)} longo={textoDias(t, negocio.dias, true)} />
        </span>
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {ocultarComercial ? negocio.servico : `${negocio.servico} · ${negocio.comercial}`}
      </span>
      {detalhado && <FaseEParado negocio={negocio} />}
      <span className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
          {semValor && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}
          {semValor ? t("businessGoals.card.noValue") : formatarMeta("euro", valorDoNegocio(negocio))}
        </span>
        <MiniCadeia negocio={negocio} />
      </span>
      <span className="block space-y-0.5 border-t border-border/60 pt-1.5">
        <SaudeTag negocio={negocio} hoje={hoje} />
        <span className="block text-xs font-medium text-foreground">
          {prazo && prazoLongo ? (
            <TextoDual curto={t("businessGoals.card.next", { step: passo, due: prazo })} longo={t("businessGoals.card.next", { step: passo, due: prazoLongo })} />
          ) : passo}
        </span>
      </span>
    </span>
  );
}
