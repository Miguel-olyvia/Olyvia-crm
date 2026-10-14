/**
 * Um dia do calendario: o previsto, o feito e a diferenca (chips), num unico botao. Sem botoes dentro do botao.
 * Nas teclas de seta passa de dia para dia (esquerda/direita) e de semana para semana (cima/baixo).
 */
import type { KeyboardEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { ChipDoDia } from "./ChipDoDia";
import { idDaCelula, textoFeito, textoPrevisto } from "./formatos";
import { textoDoChip } from "./textosChips";
import type { DiaCalendario } from "./montarMes";

const MAX_CHIPS = 3;

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

const PASSO_DA_TECLA: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function aoCarregarTecla(evento: KeyboardEvent<HTMLButtonElement>, data: string): void {
  const passo = PASSO_DA_TECLA[evento.key];
  if (passo === undefined) return;
  const alvo = document.getElementById(idDaCelula(somarDias(data, passo)));
  if (!alvo) return;
  evento.preventDefault();
  alvo.focus();
}

const SEM_HORARIO = new Set(["feriado", "nao_trabalha", "ausencia", "sem_contrato", "sem_horario"]);

interface Props {
  dia: DiaCalendario;
  dataLonga: string;
  diaSemanaCurto: string;
  aoAbrir: (data: string) => void;
}

export function CelulaDia({ dia, dataLonga, diaSemanaCurto, aoAbrir }: Props) {
  const { t } = useTranslation();
  const previsto = textoPrevisto(dia.previsto, t);
  const feito = textoFeito({ previsto: dia.previsto, feitos: dia.feitos, feitoMin: dia.feitoMin, passado: dia.passado, hoje: dia.hoje }, t);
  const visiveis = dia.chips.slice(0, MAX_CHIPS);
  const resto = dia.chips.length - visiveis.length;
  const falada = [dataLonga, previsto, feito, ...dia.chips.map((c) => textoDoChip(c, t))].filter(Boolean).join(". ");
  const apagado = SEM_HORARIO.has(dia.previsto.kind) && dia.feitos.length === 0;

  return (
    <button
      type="button"
      id={idDaCelula(dia.data)}
      aria-label={falada}
      aria-current={dia.hoje ? "date" : undefined}
      onClick={() => aoAbrir(dia.data)}
      onKeyDown={(e) => aoCarregarTecla(e, dia.data)}
      className={`flex min-h-11 w-full flex-col items-start gap-1 rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none md:min-h-[7.5rem] ${
        apagado ? "bg-muted/40 text-muted-foreground" : "bg-card"
      } ${dia.hoje ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
    >
      <span className="flex w-full items-baseline gap-2">
        <span className="text-sm font-semibold tabular-nums">{Number(dia.data.slice(8, 10))}</span>
        <span className="capitalize text-muted-foreground md:hidden">{diaSemanaCurto}</span>
        {dia.hoje && <span className="ml-auto rounded bg-primary px-1.5 py-0.5 text-[0.65rem] font-medium text-primary-foreground">{t("rhCal.hoje")}</span>}
      </span>
      <span className="leading-snug">{previsto}</span>
      {feito && <span className="font-medium leading-snug text-foreground">{feito}</span>}
      {visiveis.length > 0 && (
        <span className="flex flex-col items-start gap-1">
          {visiveis.map((chip, i) => <ChipDoDia key={`${chip.tipo}-${chip.refId ?? i}`} chip={chip} />)}
          {resto > 0 && <span className="text-muted-foreground">{t("rhCal.chip.maisN", { n: String(resto) })}</span>}
        </span>
      )}
    </button>
  );
}
