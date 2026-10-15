// As Atribuições: o calendário semanal por viatura (permanentes, reservas pontuais, oficina e manutenções marcadas, que
// bloqueiam a viatura) e as listas Em curso, Reservas e Histórico. Lê as mesmas tabelas que geram os itens do quadro
// "Frota" da Agenda (fleet_assignments e fleet_maintenance_events), por isso o calendário e a Agenda batem certo.
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, KeyRound, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocSheetTabs, docTabId, docTabPanelId } from "@/components/inventory/DocumentSheet";
import type { FleetAssignment } from "@/integrations/supabase/fleetTypes";
import { cn } from "@/lib/utils";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Placa, Selo, Tabela, Vazio, useVista } from "../pecas";
import { TIPOS_ATRIB, aberta, addDias, ativa, bloqueios, cobre, condutor, diaSemana, fData, fDataC, fKm, podeReservar, rpcFrota, segundaFeira, viatura } from "../dados";

type Aba = "semana" | "curso" | "res" | "hist";

export { segundaFeira } from "../dados";
const BLOCO = {
  perm: "border-primary/60 bg-primary/10 text-primary dark:text-violet-300",
  pont: "border-info/70 bg-info/15 text-sky-800 dark:text-info",
  ofi: "border-warning/80 bg-warning/20 text-amber-800 dark:text-warning",
} as const;

/** A ação de uma atribuição aberta (a mesma nas listas das Atribuições e na ficha da viatura): em curso → Devolver;
 *  reserva futura → Cancelar (com confirmação, rpc_fleet_cancel_reservation). Fechada → nada. */
export function AcaoAtribuicao({ a }: { a: FleetAssignment }) {
  const { F, dlg, agir, confirmar } = useFrotaCtx();
  if (!aberta(a, F.hoje)) return null;
  if (a.starts_on <= F.hoje) return <BotaoFrota requer="gerir" aoClicar={() => dlg("devolver", { a: a.id })}>Devolver</BotaoFrota>;
  const v = viatura(F, a.vehicle_id), p = condutor(F, a.driver_id);
  return (
    <BotaoFrota requer="gerir" aoClicar={() => confirmar({
      titulo: "Cancelar a reserva", ok: "Cancelar reserva", perigo: true,
      texto: `A reserva da ${v?.plate ?? "viatura"} para ${p?.full_name ?? "—"} (${fData(a.starts_on)} a ${a.ends_on ? fData(a.ends_on) : "sem fim"}) é cancelada e a viatura fica livre nesses dias (também na Agenda).`,
      aoConfirmar: () => void agir("cancelarReserva", () => rpcFrota("rpc_fleet_cancel_reservation", { p_assignment_id: a.id }), {
        ok: "Reserva cancelada. A viatura ficou livre na Agenda.",
      }),
    })}>Cancelar</BotaoFrota>
  );
}

export function AtribuicoesFrota() {
  const { F, abrir, dlg, pode } = useFrotaCtx();
  const [abaUrl, setAba] = useVista("semana");
  const aba = (["semana", "curso", "res", "hist"].includes(abaUrl) ? abaUrl : "semana") as Aba;
  // a semana do calendário vive no URL (?semana=1 = a próxima), para "Ver no calendário" abrir a semana certa
  const [params, setParams] = useSearchParams();
  const semana = Number(params.get("semana") || 0) || 0;
  const setSemana = (n: number): void => {
    const p = new URLSearchParams(params);
    if (n) p.set("semana", String(n)); else p.delete("semana");
    setParams(p, { replace: true });
  };
  const hoje = F.hoje;
  const ini = addDias(segundaFeira(hoje), semana * 7), dd = Array.from({ length: 7 }, (_, i) => addDias(ini, i));
  const vs = F.viaturas.filter(ativa);
  const curso = F.atrib.filter((a) => cobre(a, hoje));
  const res = F.atrib.filter((a) => a.starts_on > hoje).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const hist = F.atrib.filter((a) => a.ends_on && (a.ends_on < hoje || a.returned_on)).sort((a, b) => b.ends_on!.localeCompare(a.ends_on!));
  const podeAtribuir = pode("gerir").ok;

  const calendario = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <BotaoFrota icone={ChevronLeft} aoClicar={() => setSemana(semana - 1)}>Semana anterior</BotaoFrota>
          <BotaoFrota aoClicar={() => setSemana(0)}>Esta semana</BotaoFrota>
          <BotaoFrota icone={ChevronRight} aoClicar={() => setSemana(semana + 1)}>Seguinte</BotaoFrota>
        </div>
        <span className="text-sm text-muted-foreground">{fData(dd[0])} a {fData(dd[6])}</span>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className={cn("h-3 w-3 rounded-sm border", BLOCO.perm)} aria-hidden="true" />Atribuição permanente</span>
        <span className="inline-flex items-center gap-1.5"><i className={cn("h-3 w-3 rounded-sm border", BLOCO.pont)} aria-hidden="true" />Reserva pontual (obra, ordem)</span>
        <span className="inline-flex items-center gap-1.5"><i className={cn("h-3 w-3 rounded-sm border", BLOCO.ofi)} aria-hidden="true" />Oficina ou manutenção marcada</span>
      </div>
      {!vs.length ? <Vazio titulo="Sem viaturas ativas" texto="Cria uma viatura em Viaturas para a poderes atribuir." /> : (
        <Tabela>
          <Table className="min-w-[900px]">
            <caption className="sr-only">Calendário da semana de {fData(dd[0])} a {fData(dd[6])}</caption>
            <TableHeader><TableRow>
              <TableHead>Viatura</TableHead>
              {dd.map((d) => <TableHead key={d} className={cn(d === hoje && "text-primary")}>{diaSemana(d)} {fDataC(d)}{d === hoje ? " · hoje" : ""}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {vs.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <button type="button" className="font-mono text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => abrir(v.id)}>{v.plate}</button>
                    <div className="text-xs text-muted-foreground">{v.make} {v.model.split(" ")[0]}</div>
                  </TableCell>
                  {dd.map((d) => {
                    const bl = bloqueios(F, v.id, d);
                    if (!bl.length) return (
                      <TableCell key={d} className={cn(d === hoje && "bg-primary/5")}>
                        {podeAtribuir && podeReservar(F, v.id, d) ? (
                          <button type="button" onClick={() => dlg("atribuir", { v: v.id, ini: d })} aria-label={`Reservar ${v.plate} a ${fData(d)}`}
                            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : null}
                      </TableCell>
                    );
                    return (
                      <TableCell key={d} className={cn("align-top", d === hoje && "bg-primary/5")}>
                        <div className="flex flex-col gap-1">
                          {bl.map((b, i) => {
                            if (b.tipo === "workshop" || b.tipo === "maintenance") return <span key={i} className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", BLOCO.ofi)} title={b.manut ? `${b.manut.title}${b.manut.supplier_label ? " · " + b.manut.supplier_label : ""}` : v.status_reason ?? ""}>{b.tipo === "workshop" ? "Oficina" : `Manutenção · ${b.txt}`}</span>;
                            const a = b.atrib!, nome = condutor(F, a.driver_id)?.full_name ?? "";
                            return (
                              <span key={i} className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", a.kind === "temporary" ? BLOCO.pont : BLOCO.perm)} title={nome + (a.reason ? " · " + a.reason : "")}>
                                {nome.split(" ")[0]}{a.kind === "temporary" && a.reason ? " · " + a.reason.split(" ")[0] : ""}
                              </span>
                            );
                          })}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Tabela>
      )}
    </div>
  );

  const linhas = (l: FleetAssignment[]) => (l.length ? (
    <Tabela>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Viatura</TableHead><TableHead>Condutor</TableHead><TableHead>Tipo</TableHead><TableHead>Período</TableHead>
          <TableHead className="text-right">Km</TableHead><TableHead>Motivo</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {l.map((a) => {
            const v = viatura(F, a.vehicle_id), p = condutor(F, a.driver_id);
            return (
              <TableRow key={a.id}>
                <TableCell>{v ? <Placa mat={v.plate} /> : null}</TableCell>
                <TableCell>{p?.full_name}</TableCell>
                <TableCell>{a.kind === "temporary" ? <Selo tom="info">{TIPOS_ATRIB.temporary}</Selo> : <Selo tom="violet">{TIPOS_ATRIB.permanent}</Selo>}</TableCell>
                <TableCell className="whitespace-nowrap">{fData(a.starts_on)} → {a.ends_on ? fData(a.ends_on) : "sem fim"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.km_start != null ? fKm(a.km_start) : "—"}{a.km_end != null ? " → " + fKm(a.km_end) : ""}
                  {a.km_end != null && a.km_start != null ? <div className="text-xs text-muted-foreground">{fKm(a.km_end - a.km_start)} feitos</div> : null}
                </TableCell>
                <TableCell>{a.reason ?? ""}{a.damage_notes ? <div className="text-xs text-muted-foreground">Danos: {a.damage_notes}</div> : null}</TableCell>
                <TableCell className="text-right"><AcaoAtribuicao a={a} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Tabela>
  ) : <Vazio titulo="Nada para mostrar" texto="As atribuições aparecem aqui quando entregares uma viatura." />);

  const abas: { id: Aba; label: string; count?: number }[] = [
    { id: "semana", label: "Calendário" }, { id: "curso", label: "Em curso", count: curso.length }, { id: "res", label: "Reservas", count: res.length }, { id: "hist", label: "Histórico", count: hist.length },
  ];
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Atribuições" texto="Quem tem que viatura e quando. A atribuição confirma a carta de condução e recusa sobreposições na mesma viatura e dias de manutenção marcada. As reservas ficam também na Agenda (quadro Frota)."
        acoes={<BotaoFrota variant="default" requer="gerir" icone={KeyRound} aoClicar={() => dlg("atribuir")}>Nova atribuição</BotaoFrota>} />
      <div className="border-b">
        <DocSheetTabs label="Atribuições" idBase="frota-atrib" tabs={abas} value={aba} onChange={(a) => setAba(a)} />
      </div>
      <div role="tabpanel" id={docTabPanelId("frota-atrib", aba)} aria-labelledby={docTabId("frota-atrib", aba)}>
        {aba === "semana" ? calendario : linhas(aba === "curso" ? curso : aba === "res" ? res : hist)}
      </div>
    </div>
  );
}
