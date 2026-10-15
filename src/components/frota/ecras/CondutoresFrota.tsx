// Os Condutores (fleet_drivers): com ou sem conta no CRM. A carta, as categorias e a validade vivem na Frota até o RH
// chegar à main (depois passam a vir da ficha da pessoa). Criar e editar: rpc_fleet_upsert_driver (fleet.manage).
import { UserPlus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FleetDriver } from "@/integrations/supabase/fleetTypes";
import { FilterPills } from "../inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Selo, Tabela, Vazio, useVista } from "../pecas";
import { dias, fData, textoData, tomSelo, viaturaDoCondutor } from "../dados";

export function CondutoresFrota() {
  const { F, abrir, dlg } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const aCaducar = (p: FleetDriver) => p.is_active && (!p.licence_categories.length || (!!p.licence_expires_on && dias(p.licence_expires_on, F.hoje) <= 60));
  const l = F.condutores.filter((p) => (vista === "carta" ? aCaducar(p) : vista === "inativos" ? !p.is_active : p.is_active));
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Condutores" texto="Quem conduz as viaturas, com ou sem conta no CRM. Com conta, o condutor vê a sua viatura e recebe os avisos (multas, carta a caducar)."
        acoes={<BotaoFrota variant="default" requer="gerir" icone={UserPlus} aoClicar={() => dlg("condutor")}>Novo condutor</BotaoFrota>} />
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <FilterPills ariaLabel="Vistas" value={vista} onChange={setVista} options={[
          { value: "todas", label: "Ativos", count: F.condutores.filter((p) => p.is_active).length },
          { value: "carta", label: "Carta a caducar ou em falta", count: F.condutores.filter(aCaducar).length },
          { value: "inativos", label: "Inativos", count: F.condutores.filter((p) => !p.is_active).length },
        ]} />
      </div>
      {l.length ? (
        <Tabela>
          <Table>
            <caption className="sr-only">Condutores</caption>
            <TableHeader><TableRow>
              <TableHead>Condutor</TableHead><TableHead>Equipa</TableHead><TableHead>Carta</TableHead><TableHead>Validade</TableHead>
              <TableHead>Viatura atual</TableHead><TableHead className="text-right">Multas</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {l.map((p) => {
                const v = viaturaDoCondutor(F, p.id), m = F.ocorr.filter((o) => o.kind === "fine" && o.driver_id === p.id).length;
                return (
                  <TableRow key={p.id}>
                    <TableCell><div className="flex flex-col"><b>{p.full_name}</b><span className="text-xs text-muted-foreground">{p.job_title ?? ""}{p.user_id ? " · com conta no CRM" : " · sem conta"}</span></div></TableCell>
                    <TableCell>{p.team ?? "—"}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{p.licence_categories.length ? p.licence_categories.map((c) => <Selo key={c} tom="neu">{c}</Selo>) : <Selo tom="bad">Sem carta</Selo>}</div></TableCell>
                    <TableCell>{p.licence_expires_on ? <div className="flex flex-col items-start gap-1"><span>{fData(p.licence_expires_on)}</span><Selo tom={tomSelo(p.licence_expires_on, F.hoje)}>{textoData(p.licence_expires_on, F.hoje)}</Selo></div> : "—"}</TableCell>
                    <TableCell>{v ? <button type="button" className="font-mono text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => abrir(v.id)}>{v.plate}</button> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{m}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-2">
                        {!v && p.is_active && p.licence_categories.length ? <BotaoFrota requer="gerir" aoClicar={() => dlg("atribuir", { p: p.id })}>Atribuir viatura</BotaoFrota> : null}
                        <BotaoFrota requer="gerir" aoClicar={() => dlg("condutor", { p: p.id })} aria-label={`Editar ${p.full_name}`}>Editar</BotaoFrota>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Tabela>
      ) : F.condutores.length ? <Vazio titulo="Ninguém nesta vista" texto="Escolhe outra vista." />
        : <Vazio titulo="Ainda não há condutores" texto="Cria os condutores com “Novo condutor” (com ou sem conta no CRM) para poderes atribuir viaturas." />}
    </div>
  );
}
