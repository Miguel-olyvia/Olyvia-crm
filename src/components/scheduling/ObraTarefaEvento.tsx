/**
 * Uma tarefa de obra no calendário da Agenda (30/10/2026): só de leitura (não se arrasta nem abre o diálogo de edição). Ao clicar abre um
 * resumo com a obra, a pessoa, os dias e o estado. O /negocios ainda não abre um negócio ou uma obra pelo endereço (só ?vista=operacoes),
 * por isso o botão leva às Operações, onde está a lista das obras.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, Check, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  NOME_ESTADO_OBRA, classesEstadoObra, corBarraObra, tarefaObraConcluida, type EventoObra,
} from "@/lib/agenda/obraTarefas";

export const LINK_OPERACOES_OBRA = "/negocios?vista=operacoes";

const dataCurta = (s: string) => {
  const [a, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
};
const horas = (h: number) => h.toLocaleString("pt-PT", { maximumFractionDigits: 1 });

interface ObraTarefaEventoProps {
  evento: EventoObra;
  variante: "month" | "week" | "day";
}

export function ObraTarefaEvento({ evento: e, variante }: ObraTarefaEventoProps) {
  const concluida = tarefaObraConcluida(e.estado);
  const rejeitada = e.estado === "rejeitada";
  const Icone = concluida ? Check : rejeitada ? AlertTriangle : HardHat;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="agenda-obra-tarefa"
          data-estado={e.estado}
          aria-label={`Tarefa de obra: ${e.titulo}${e.pessoaNome ? `, ${e.pessoaNome}` : ""} (${NOME_ESTADO_OBRA[e.estado]})`}
          onClick={(ev) => ev.stopPropagation()}
          className={cn(
            "block w-full min-h-6 text-left rounded border cursor-pointer transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            variante === "month" ? "text-xs p-1.5" : variante === "week" ? "p-2" : "p-2 mb-1",
            classesEstadoObra(e.estado),
          )}
          style={{ borderLeftWidth: "3px", borderLeftColor: corBarraObra(e.estado) }}
        >
          <span className="flex items-center gap-1">
            <Icone className={cn("shrink-0", variante === "day" ? "h-4 w-4" : "h-3 w-3")} aria-hidden />
            <span className={cn("truncate font-medium", variante === "week" && "text-sm", concluida && "line-through decoration-1")}>{e.titulo}</span>
          </span>
          {e.pessoaNome && (
            <span className={cn("block truncate opacity-80", variante === "month" ? "text-[10px]" : variante === "week" ? "text-xs" : "text-sm")} title={e.pessoaNome}>
              {e.pessoaNome}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm" align="start" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-tight">{e.titulo}</p>
          <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[11px]", classesEstadoObra(e.estado))}>{NOME_ESTADO_OBRA[e.estado]}</span>
        </div>
        {e.oficio && <p className="text-muted-foreground">{e.oficio}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Quem</dt><dd>{e.pessoaNome || "—"}</dd>
          <dt className="text-muted-foreground">Obra</dt>
          <dd>{[e.obraCodigo, e.obraTitulo].filter(Boolean).join(" · ") || "—"}</dd>
          {e.morada && (<><dt className="text-muted-foreground">Morada</dt><dd>{e.morada}</dd></>)}
          <dt className="text-muted-foreground">Dias</dt>
          <dd>{e.inicio === e.fim ? dataCurta(e.inicio) : `${dataCurta(e.inicio)} – ${dataCurta(e.fim)}`} (dias úteis)</dd>
          {e.horasDia != null && (<><dt className="text-muted-foreground">Horas/dia</dt><dd>{horas(e.horasDia)} h</dd></>)}
        </dl>
        <p className="text-xs text-muted-foreground">Planeada na obra do negócio; altera-se no plano da obra, não aqui.</p>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to={LINK_OPERACOES_OBRA}>Abrir nas Operações</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
