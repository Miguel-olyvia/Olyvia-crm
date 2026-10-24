// A Manutenção: o plano de revisões (por km ou por data, a que chegar primeiro) e as intervenções (agendar:
// rpc_fleet_schedule_maintenance, que põe o item na Agenda; concluir: rpc_fleet_complete_maintenance).
import { CalendarPlus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPills, KpiGrid, KpiTile } from "../inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Placa, Prog, Seccao, Selo, Tabela, VRef, Vazio, useVista } from "../pecas";
import { ESTADOS_MANUT, ativa, fData, fEur, fKm, manutAbertas, revisao, soma, viatura } from "../dados";

export function ManutencaoFrota() {
  const { F, dlg } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const vs = F.viaturas.filter(ativa);
  const comRev = vs.map((v) => ({ v, r: revisao(v, F.hoje) })).filter((x) => x.r);
  const planos = comRev.filter((x) => vista !== "rev" || x.r!.tom !== "ok").sort((a, b) => (a.r!.faltaKm ?? 1e9) - (b.r!.faltaKm ?? 1e9));
  const ev = [...F.manut].sort((a, b) => b.scheduled_on.localeCompare(a.scheduled_on));
  const mes = F.hoje.slice(0, 7);
  const custoMes = soma(ev.filter((m) => m.status === "done" && (m.done_on ?? "").startsWith(mes)), (m) => m.final_cost);
  const abertas = manutAbertas(F), emCurso = abertas.filter((m) => m.status === "in_progress");
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Manutenção" texto="Revisões por km ou por data (a que chegar primeiro), inspeções e reparações. As oficinas são fornecedores do Inventário; as marcações ficam na Agenda (quadro Frota)."
        acoes={<BotaoFrota variant="default" requer="gerir" icone={CalendarPlus} aoClicar={() => dlg("manut")}>Agendar manutenção</BotaoFrota>} />
      <KpiGrid>
        <KpiTile label="Agendadas" value={abertas.filter((m) => m.status === "scheduled").length} hint="por fazer" />
        <KpiTile label="Em curso" value={emCurso.length} hint={emCurso.map((m) => viatura(F, m.vehicle_id)?.plate).join(", ") || "Nenhuma"} tone="warn" />
        <KpiTile label="Revisões a fazer" value={comRev.filter((x) => x.r!.tom !== "ok").length} hint="por km ou por data" tone="bad" onClick={() => setVista("rev")} active={vista === "rev"} actionLabel="Mostrar só as que precisam" />
        <KpiTile label="Custo este mês" value={fEur(custoMes)} hint="intervenções concluídas" />
      </KpiGrid>
      <Seccao titulo="Plano de revisões" acoes={<FilterPills ariaLabel="Vistas" value={vista} onChange={setVista} options={[{ value: "todas", label: "Todas" }, { value: "rev", label: "Só as que precisam" }]} />}>
        {planos.length ? (
          <Tabela>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Viatura</TableHead><TableHead className="text-right">Km atuais</TableHead><TableHead>Regra</TableHead><TableHead>Última</TableHead>
                <TableHead>Próxima</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {planos.map(({ v, r }) => (
                  <TableRow key={v.id}>
                    <TableCell><VRef v={v} /></TableCell>
                    <TableCell className="text-right tabular-nums">{fKm(v.odometer_km)}</TableCell>
                    <TableCell>A cada {v.service_every_km ? fKm(v.service_every_km) : "—"} ou {v.service_every_months ?? "—"} meses</TableCell>
                    <TableCell>{fKm(v.service_last_km)}<div className="text-xs text-muted-foreground">{fData(v.service_last_on)}</div></TableCell>
                    <TableCell>{r!.nextKm != null ? fKm(r!.nextKm) : "—"}<div className="text-xs text-muted-foreground">até {fData(r!.nextData)}</div></TableCell>
                    <TableCell><div className="flex flex-col items-start gap-1"><Prog tom={r!.tom} pct={r!.pct} /><Selo tom={r!.tom}>{r!.txt}</Selo></div></TableCell>
                    <TableCell className="text-right">{r!.tom !== "ok" ? <BotaoFrota requer="gerir" aoClicar={() => dlg("manut", { v: v.id })} aria-label={`Agendar revisão da ${v.plate}`}>Agendar</BotaoFrota> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Tabela>
        ) : <Vazio titulo={vs.length ? "Nada nesta vista" : "Sem viaturas"} texto={vs.length ? "Todas as revisões estão em dia." : "O plano de revisões aparece quando criares viaturas."} />}
      </Seccao>
      <Seccao titulo="Intervenções">
        {ev.length ? (
          <Tabela>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Viatura</TableHead><TableHead>Intervenção</TableHead><TableHead>Oficina</TableHead>
                <TableHead>Estado</TableHead><TableHead className="text-right">Valor</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ev.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{fData(m.done_on ?? m.scheduled_on)}{m.expected_end_on ? <div className="text-xs text-muted-foreground">prev. {fData(m.expected_end_on)}</div> : null}</TableCell>
                    <TableCell><Placa mat={viatura(F, m.vehicle_id)?.plate ?? ""} /></TableCell>
                    <TableCell><div className="flex flex-col"><span>{m.title}</span>{m.notes ? <span className="text-xs text-muted-foreground">{m.notes}</span> : null}</div></TableCell>
                    <TableCell>{m.supplier_label ?? "—"}</TableCell>
                    <TableCell><Selo tom={ESTADOS_MANUT[m.status][0]}>{ESTADOS_MANUT[m.status][1]}</Selo></TableCell>
                    <TableCell className="text-right tabular-nums">{fEur(m.final_cost ?? m.estimated_cost)}</TableCell>
                    <TableCell className="text-right">{m.status === "scheduled" || m.status === "in_progress" ? <BotaoFrota requer="gerir" aoClicar={() => dlg("concluir", { m: m.id })} aria-label={`Concluir ${m.title} da ${viatura(F, m.vehicle_id)?.plate ?? ""}`}>Concluir</BotaoFrota> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Tabela>
        ) : <Vazio titulo="Sem intervenções" texto="Agenda a primeira revisão com “Agendar manutenção”." />}
      </Seccao>
    </div>
  );
}
