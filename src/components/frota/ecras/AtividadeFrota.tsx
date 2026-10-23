// A Atividade da Frota: o histórico de todas as ações (fleet_activity_log, escrito pelas RPCs com quem fez), com filtro por
// viatura e por tipo. A mesma lista, só da viatura, é a aba "Histórico" da ficha.
import { useState } from "react";
import { History } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FleetActivityLog } from "@/integrations/supabase/fleetTypes";
import { useFrotaCtx } from "../contexto";
import { Cabecalho, Placa, Selo, Tabela, Vazio } from "../pecas";
import { fQuando, viatura } from "../dados";

/** A tabela do histórico (a Atividade e a aba Histórico da ficha). `semViatura` esconde a coluna da viatura. */
export function ListaHistorico({ entradas, semViatura }: { entradas: readonly FleetActivityLog[]; semViatura?: boolean }) {
  const { F } = useFrotaCtx();
  if (!entradas.length) return <Vazio titulo="Sem atividade" texto="Cada ação registada na Frota fica aqui: quando, quem, a viatura e o quê." />;
  return (
    <Tabela>
      <Table>
        <caption className="sr-only">Histórico</caption>
        <TableHeader><TableRow>
          <TableHead>Quando</TableHead><TableHead>Quem</TableHead>{semViatura ? null : <TableHead>Viatura</TableHead>}<TableHead>O quê</TableHead><TableHead>Detalhe</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {entradas.map((e) => {
            const v = e.vehicle_id ? viatura(F, e.vehicle_id) : undefined;
            return (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{fQuando(e.created_at)}</TableCell>
                <TableCell>{e.actor_name ?? "—"}</TableCell>
                {semViatura ? null : <TableCell>{v ? <Placa mat={v.plate} /> : <span className="text-muted-foreground">Frota</span>}</TableCell>}
                <TableCell><div className="flex flex-col items-start gap-1"><Selo tom="neu">{e.action}</Selo><span>{e.summary}</span></div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.detail ?? ""}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Tabela>
  );
}

export function AtividadeFrota() {
  const { F } = useFrotaCtx();
  const [vid, setVid] = useState(""), [tipo, setTipo] = useState("");
  const log = F.log;
  const tipos = [...new Set(log.map((e) => e.action))].sort();
  const l = log.filter((e) => (!vid || e.vehicle_id === vid) && (!tipo || e.action === tipo));
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Atividade" texto="O histórico de tudo o que se registou na Frota: quando, quem, a viatura e o quê (as últimas 300 entradas)." />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div className="w-56"><NativeSelect aria-label="Filtrar por viatura" value={vid} onValueChange={setVid}
          options={[{ value: "", label: "Todas as viaturas" }, ...F.viaturas.map((v) => ({ value: v.id, label: `${v.plate} · ${v.make} ${v.model.split(" ")[0]}` }))]} /></div>
        <div className="w-56"><NativeSelect aria-label="Filtrar por tipo" value={tipo} onValueChange={setTipo}
          options={[{ value: "", label: "Todos os tipos" }, ...tipos.map((t) => ({ value: t, label: t }))]} /></div>
        <span className="ml-auto text-sm text-muted-foreground">{l.length} de {log.length} registo(s)</span>
      </div>
      <ListaHistorico entradas={l} />
    </div>
  );
}
