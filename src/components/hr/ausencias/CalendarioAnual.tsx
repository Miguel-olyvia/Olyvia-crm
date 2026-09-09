/**
 * O ano inteiro numa vista: doze mini-meses com os dias marcados.
 *
 * PORQUE E UMA GRELHA NOVA
 * ------------------------
 * Nao ha calendario reutilizavel no projecto. `ui/calendar.tsx` e um selector
 * de data dentro de um Popover, e o `ScheduleCalendarView` sao 577 linhas ao
 * servico do modulo de agendas, acopladas aos tipos dele. Extrair um generico
 * de la mexe em codigo de outro modulo e nao e decisao de quem executa. Isto e
 * uma grelha propria, feita com `date-fns`, que ja e dependencia.
 *
 * O QUE A COR DIZ, E O QUE NAO DIZ SOZINHA
 * ----------------------------------------
 * A cor e a do tipo; o ESTADO nao e saturacao, e padrao: aprovado a cor cheia,
 * pendente as riscas. Quem nao distingue as duas coisas continua a ter tudo
 * escrito na `aria-label` de cada dia e na legenda por cima. Fins de semana e
 * feriados ficam esbatidos e nao recebem cor de tipo mesmo quando o pedido os
 * cobre -- e o que torna o ano legivel de relance.
 *
 * TECLADO
 * -------
 * Uma paragem de tabulacao POR MES, nao 365. Dentro do mes, as setas andam dia
 * a dia e atravessam a fronteira do mes; cima e baixo andam uma semana; Home e
 * End vao ao principio e ao fim da semana; PageUp e PageDown mudam de mes.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de, enUS, es, fr, pt } from "date-fns/locale";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { corDoTipo } from "@/components/hr/ausencias/TipoEtiqueta";
import { eFeriado, eFimDeSemana, type IndiceFeriados } from "@/lib/hr/ausencias";
import type { AusenciaDia, AusenciaTipo } from "@/types/hrAusencias";

const LOCALES: Record<string, Locale> = { en: enUS, pt, es, fr, de };
type Locale = typeof enUS;

export interface CalendarioAnualProps {
  ano: number;
  dias: AusenciaDia[];
  tiposPorId: Map<string, AusenciaTipo>;
  feriados: IndiceFeriados;
  /** Clique num dia com ausencia. Sem isto, o dia marcado nao e clicavel. */
  onAbrirPedido?: (pedidoId: string) => void;
  /** Clique num dia livre -- em "as minhas ausencias", abre o pedido ja com a data. */
  onEscolherDiaLivre?: (isoData: string) => void;
}

function iso(data: Date): string {
  return format(data, "yyyy-MM-dd");
}

export function CalendarioAnual({
  ano,
  dias,
  tiposPorId,
  feriados,
  onAbrirPedido,
  onEscolherDiaLivre,
}: CalendarioAnualProps) {
  const { t, language } = useTranslation();
  const locale = LOCALES[language] ?? enUS;
  const contentor = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState<string>(`${ano}-01-01`);

  /** Um dia so pode ter uma marca visivel: fica com a que conta -- a aprovada. */
  const porData = useMemo(() => {
    const mapa = new Map<string, AusenciaDia>();
    for (const dia of dias) {
      if (dia.estado === "recusado" || dia.estado === "cancelado") continue;
      const actual = mapa.get(dia.data);
      if (!actual || (actual.estado !== "aprovado" && dia.estado === "aprovado")) {
        mapa.set(dia.data, dia);
      }
    }
    return mapa;
  }, [dias]);

  const tiposPresentes = useMemo(() => {
    const ids = new Set([...porData.values()].map((dia) => dia.tipo_id));
    return [...ids]
      .map((id) => tiposPorId.get(id))
      .filter((tipo): tipo is AusenciaTipo => Boolean(tipo))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [porData, tiposPorId]);

  const mover = useCallback(
    (deIso: string, passo: number) => {
      const alvo = iso(addDays(new Date(`${deIso}T12:00:00Z`), passo));
      if (alvo.slice(0, 4) !== String(ano)) return;
      setFoco(alvo);
      requestAnimationFrame(() => {
        const elemento = contentor.current?.querySelector<HTMLElement>(`[data-iso="${alvo}"]`);
        elemento?.focus();
      });
    },
    [ano],
  );

  const aoTeclar = useCallback(
    (evento: React.KeyboardEvent<HTMLButtonElement>, isoData: string) => {
      const passos: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
        PageUp: -28,
        PageDown: 28,
      };
      const passo = passos[evento.key];
      if (passo !== undefined) {
        evento.preventDefault();
        mover(isoData, passo);
        return;
      }
      if (evento.key === "Home" || evento.key === "End") {
        evento.preventDefault();
        const data = new Date(`${isoData}T12:00:00Z`);
        const destino =
          evento.key === "Home"
            ? startOfWeek(data, { locale })
            : endOfWeek(data, { locale });
        mover(isoData, Math.round((destino.getTime() - data.getTime()) / 86400000));
      }
    },
    [mover, locale],
  );

  const meses = useMemo(
    () => Array.from({ length: 12 }, (_, indice) => new Date(Date.UTC(ano, indice, 1, 12))),
    [ano],
  );

  const focoNoMes = (mes: Date) =>
    foco.startsWith(format(mes, "yyyy-MM")) ? foco : iso(startOfMonth(mes));

  return (
    <div ref={contentor} className="space-y-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {tiposPresentes.map((tipo) => (
          <li key={tipo.id} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: corDoTipo(tipo) }}
            />
            {tipo.nome}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-foreground/70" />
          {t("hr.ausencias.calendario.legendaAprovado")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, currentColor, currentColor 2px, transparent 2px, transparent 4px)",
            }}
          />
          {t("hr.ausencias.calendario.legendaPendente")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-muted" />
          {t("hr.ausencias.calendario.legendaNaoUtil")}
        </li>
      </ul>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {meses.map((mes) => {
          const grelha = eachDayOfInterval({
            start: startOfWeek(startOfMonth(mes), { locale }),
            end: endOfWeek(endOfMonth(mes), { locale }),
          });
          const isoDoTab = focoNoMes(mes);

          return (
            <div key={format(mes, "yyyy-MM")} className="rounded-md border p-2">
              <p className="mb-1 text-xs font-medium capitalize">
                {format(mes, "LLLL", { locale })}
              </p>
              <div
                role="grid"
                aria-label={format(mes, "LLLL yyyy", { locale })}
                className="grid grid-cols-7 gap-0.5"
              >
                {grelha.map((data) => {
                  const isoData = iso(data);
                  if (!isSameMonth(data, mes)) {
                    return <span key={isoData} aria-hidden="true" className="h-6 w-6" />;
                  }

                  const marca = porData.get(isoData);
                  const naoUtil = eFimDeSemana(isoData) || eFeriado(isoData, feriados);
                  const tipo = marca ? (tiposPorId.get(marca.tipo_id) ?? null) : null;
                  const cor = corDoTipo(tipo);
                  const pintar = marca && !naoUtil;
                  const pendente = marca?.estado === "pendente";

                  const descricao = marca
                    ? t("hr.ausencias.calendario.diaComAusencia", {
                        data: format(data, "PP", { locale }),
                        tipo: tipo?.nome ?? t("hr.ausencias.tipoDesconhecido"),
                        estado: t(`hr.ausencias.estadoDia.${marca.estado}`),
                      })
                    : t("hr.ausencias.calendario.diaLivre", {
                        data: format(data, "PP", { locale }),
                      });

                  const clicavel = marca ? Boolean(onAbrirPedido) : Boolean(onEscolherDiaLivre);

                  return (
                    <button
                      key={isoData}
                      type="button"
                      data-iso={isoData}
                      role="gridcell"
                      tabIndex={isoData === isoDoTab ? 0 : -1}
                      aria-label={descricao}
                      title={descricao}
                      disabled={!clicavel}
                      onFocus={() => setFoco(isoData)}
                      onKeyDown={(evento) => aoTeclar(evento, isoData)}
                      onClick={() => {
                        if (marca) onAbrirPedido?.(marca.pedido_id);
                        else onEscolherDiaLivre?.(isoData);
                      }}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-[3px] text-[10px] tabular-nums",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        naoUtil && "bg-muted text-muted-foreground",
                        !naoUtil && !pintar && "text-foreground/80 hover:bg-accent",
                        pintar && "font-medium text-white",
                      )}
                      style={
                        pintar
                          ? pendente
                            ? {
                                backgroundImage: `repeating-linear-gradient(45deg, ${cor}, ${cor} 3px, transparent 3px, transparent 6px)`,
                                color: "inherit",
                                boxShadow: `inset 0 0 0 1px ${cor}`,
                              }
                            : { backgroundColor: cor }
                          : undefined
                      }
                    >
                      {format(data, "d")}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
