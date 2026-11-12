// 12/11 (Rúben: «o comercial não deve conseguir terminar a proposta/orçamento sem ter os técnicos disponíveis para a obra»). No orçamento,
// antes de enviar, a agenda da obra à vista: com o dia de início da proposta, cada tarefa tem um técnico do ofício livre (sem outra obra
// aprovada ou em curso a encher-lhe o dia, sem férias)? Se sim, uma linha verde com quem vem. Se não, o envio fica bloqueado (motor:
// alertas e A.enviar) e aqui diz-se porquê, com os próximos dias de início em que ficam todos livres, num toque.
import { useMemo } from "react";
import { CalendarCheck, CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, type Negocio } from "./motor";
import { dataCurta, deIso } from "./planoObra";
import { agendaDaProposta, iniciosLivres } from "./preparacaoObra";
import type { Ctx } from "./pecas";

const nome = (id: string) => TECS.find((x) => x.id === id)?.n ?? "Técnico";

export function AgendaDaPropostaCartao({ S, A, run, d }: Pick<Ctx, "S" | "A" | "run"> & { d: Negocio }) {
  const AG = agendaDaProposta(d, S);
  const bloqueado = !!AG?.ocupadas.length;
  // os dias com todos livres só se procuram quando o dia escolhido não serve (são várias contas do plano)
  const livres = useMemo(() => (bloqueado ? iniciosLivres(d, S, { n: 3 }) : []), [bloqueado, AG?.inicio, d.orc?.linhas, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!AG) return null;
  const quando = `${AG.escolhido ? "A começar" : "Sem início escolhido; a começar"} a ${dataCurta(deIso(AG.inicio))}`;
  return (
    <section aria-label="A agenda da obra" className={cn("rounded-xl border p-4", bloqueado ? "border-destructive/30 bg-destructive/[0.04]" : "border-success/30 bg-success/[0.06]")}>
      {bloqueado ? <>
        <p className="flex items-start gap-2 text-[15px]">
          <CalendarX2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <span><b className="font-semibold">A proposta não sai sem os técnicos livres.</b> {quando}:</span>
        </p>
        <ul className="mt-2 space-y-1 pl-7 text-[15px]">
          {AG.ocupadas.map((x, k) => <li key={k}><b className="font-medium">{nome(x.tec)}</b> está {x.motivo} <span className="text-muted-foreground">· {x.nome}</span></li>)}
        </ul>
        {livres.length ? <>
          <p className="mt-3 pl-7 text-sm font-medium">Dias de início com todos livres</p>
          <div role="group" aria-label="Dias de início com todos os técnicos livres" className="mt-2 flex flex-wrap gap-2 pl-7">
            {livres.map((x) => (
              <Button key={x.iso} type="button" variant="outline" className="min-h-11 h-auto flex-col items-start gap-0 py-2 text-left" onClick={() => run(() => A.inicioObra(d.id, x.iso))}>
                <span className="text-[15px] font-semibold">Começar a {dataCurta(deIso(x.iso))}</span>
                <span className="text-xs font-normal text-muted-foreground">{x.dias} {x.dias === 1 ? "dia útil" : "dias úteis"}{x.fim ? ` · pronta a ${dataCurta(x.fim)}` : ""}</span>
              </Button>
            ))}
          </div>
        </> : <p className="mt-3 pl-7 text-sm text-muted-foreground">Nas próximas 10 semanas não há um início com todos livres: troque o técnico das tarefas no plano da obra, mais abaixo.</p>}
      </> : (
        <p className="flex items-start gap-2 text-[15px]">
          <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <span><b className="font-semibold">Técnicos livres para a obra.</b> {quando}{AG.fim ? `, pronta a ${dataCurta(AG.fim)}` : ""}.
            {AG.semNinguem.length > 0 && <span className="block text-sm text-muted-foreground">Ninguém no RH faz {AG.semNinguem.join(", ")}: essas tarefas ficam para as Operações atribuírem.</span>}
          </span>
        </p>
      )}
    </section>
  );
}
