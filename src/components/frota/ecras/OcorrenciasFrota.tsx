// As Ocorrências (fleet_incidents): multas, sinistros e avarias. Numa multa, o condutor sugere-se pela atribuição em vigor
// no dia da infração, e o prazo para o identificar (identify_by) conta 15 dias úteis desde a notificação (feriados da
// organização incluídos, calculado pela RPC).
import { Info, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FleetIncident } from "@/integrations/supabase/fleetTypes";
import { FilterPills } from "../inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Placa, Selo, Tabela, Vazio, useVista } from "../pecas";
import { ESTADOS_OCORR, TIPOS_OCORR, condutor, diaDe, dias, fData, fEur, horaDe, quemConduzia, rpcFrota, viatura } from "../dados";

const pend = (o: FleetIncident): boolean => o.kind === "fine" && o.status === "to_identify";

/** A ação de uma ocorrência (a mesma na lista das Ocorrências e na ficha da viatura): multa por identificar →
 *  Identificar condutor; outra por resolver → Marcar resolvida (com confirmação); resolvida → nada. */
export function AcaoOcorrencia({ o }: { o: FleetIncident }) {
  const { F, dlg, agir, confirmar } = useFrotaCtx();
  if (pend(o)) return <BotaoFrota requer="gerir" aoClicar={() => dlg("identificar", { o: o.id })}>Identificar condutor</BotaoFrota>;
  if (o.status === "resolved") return null;
  return (
    <BotaoFrota requer="gerir" aoClicar={() => confirmar({
      titulo: "Marcar a ocorrência como resolvida", ok: "Marcar resolvida",
      texto: `${TIPOS_OCORR[o.kind]} da ${viatura(F, o.vehicle_id)?.plate ?? "viatura"} de ${fData(diaDe(o.occurred_at))}: ${o.description}`,
      aoConfirmar: () => void agir("resolver", () => rpcFrota("rpc_fleet_resolve_incident", { p_incident_id: o.id }), { ok: "Ocorrência marcada como resolvida." }),
    })}>Marcar resolvida</BotaoFrota>
  );
}

export function OcorrenciasFrota() {
  const { F, dlg } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const base = F.ocorr;
  const l = base.filter((o) => vista === "todas" || (vista === "pend" ? pend(o) : o.kind === vista)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Ocorrências" texto="Multas, sinistros e avarias. Numa multa, o condutor é sugerido a partir da atribuição em vigor no dia da infração."
        acoes={<BotaoFrota variant="default" requer="gerirOuSelf" icone={Plus} aoClicar={() => dlg("ocorrencia")}>Registar ocorrência</BotaoFrota>} />
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <FilterPills ariaLabel="Vistas" value={vista} onChange={setVista} options={[
          { value: "todas", label: "Todas", count: base.length },
          { value: "pend", label: "Multas por identificar", count: base.filter(pend).length },
          { value: "fine", label: "Multas", count: base.filter((o) => o.kind === "fine").length },
          { value: "accident", label: "Sinistros", count: base.filter((o) => o.kind === "accident").length },
          { value: "breakdown", label: "Avarias", count: base.filter((o) => o.kind === "breakdown").length },
        ]} />
      </div>
      {l.length ? (
        <Tabela>
          <Table>
            <caption className="sr-only">Ocorrências</caption>
            <TableHeader><TableRow>
              <TableHead>Quando</TableHead><TableHead>Viatura</TableHead><TableHead>Tipo</TableHead><TableHead>O que aconteceu</TableHead>
              <TableHead>Condutor</TableHead><TableHead>Prazo</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {l.map((o) => {
                const sug = quemConduzia(F, o.vehicle_id, o.occurred_at), pz = pend(o) ? o.identify_by : null;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap">{fData(diaDe(o.occurred_at))}<div className="text-xs text-muted-foreground">{horaDe(o.occurred_at)}</div></TableCell>
                    <TableCell><Placa mat={viatura(F, o.vehicle_id)?.plate ?? ""} /></TableCell>
                    <TableCell><Selo tom={o.kind === "fine" ? "violet" : o.kind === "accident" ? "warn" : "neu"}>{TIPOS_OCORR[o.kind]}</Selo></TableCell>
                    <TableCell><div className="flex flex-col"><span>{o.description}</span><span className="text-xs text-muted-foreground">{o.location}{o.amount ? " · " + fEur(o.amount) : ""}</span></div></TableCell>
                    <TableCell>{o.driver_id ? condutor(F, o.driver_id)?.full_name : <div className="flex flex-col items-start gap-1">{o.kind === "fine" ? <Selo tom="bad">Por identificar</Selo> : "—"}{sug && o.kind === "fine" ? <span className="text-xs text-muted-foreground">Sugestão: {sug.full_name}</span> : null}</div>}</TableCell>
                    <TableCell>{pz ? <div className="flex flex-col items-start gap-1"><span>{fData(pz)}</span><Selo tom={dias(pz, F.hoje) <= 7 ? "bad" : "warn"}>{dias(pz, F.hoje) < 0 ? `Passou há ${-dias(pz, F.hoje)} d` : `Faltam ${dias(pz, F.hoje)} d`}</Selo></div> : "—"}</TableCell>
                    <TableCell><Selo tom={ESTADOS_OCORR[o.status][0]}>{ESTADOS_OCORR[o.status][1]}</Selo></TableCell>
                    <TableCell className="text-right"><AcaoOcorrencia o={o} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Tabela>
      ) : <Vazio titulo={base.length ? "Sem ocorrências nesta vista" : "Sem ocorrências"} texto={base.length ? "Escolhe outro filtro." : "Nenhuma multa, sinistro ou avaria registada."} />}
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />O prazo da multa conta 15 dias úteis desde a notificação (sem fins de semana nem feriados da organização).</p>
    </div>
  );
}
