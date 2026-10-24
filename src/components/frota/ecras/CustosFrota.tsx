// Abastecimentos e custos (fleet_expenses): combustível, energia, portagens, estacionamento, oficina e rendas, cada
// despesa imputada a um centro de custo ou a uma obra das Operações. Só com fleet.costs (o condutor vê os seus).
// "Importar extrato" lê o CSV do cartão frota (rpc_fleet_import_statement).
import { useState } from "react";
import { FileUp, ListChecks, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiGrid, KpiTile } from "../inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, LinhaClicavel, Placa, RefOps, Selo, Tabela, Vazio } from "../pecas";
import { CATEGORIAS_CUSTO, DIAS_PERIODO, ORIGENS_CUSTO, condutor, fData, fEur, fNum, inicioPeriodo, opcoesDe, soma, useReferenciaFrota, viatura } from "../dados";

export function CustosFrota() {
  const { F, abrir, dlg, pode } = useFrotaCtx();
  const obras = useReferenciaFrota("obras");
  const [tf, setTf] = useState(""), [vf, setVf] = useState(""), [q, setQ] = useState("");
  const ql = q.toLowerCase();
  const desde = inicioPeriodo(F.hoje);
  const todos = F.custos.filter((c) => c.spent_on >= desde);
  const l = todos.filter((c) => (!tf || c.category === tf) && (!vf || c.vehicle_id === vf)
    && (!ql || ((c.supplier_label ?? "") + (c.cost_center_label ?? "") + (viatura(F, c.vehicle_id)?.plate ?? "") + (c.notes ?? "")).toLowerCase().includes(ql)))
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on));
  const mes = F.hoje.slice(0, 7);
  const doMes = todos.filter((c) => c.spent_on.startsWith(mes));
  const comb = soma(todos.filter((c) => c.category === "fuel" || c.category === "charging"), (c) => c.amount);
  const rever = todos.filter((c) => c.needs_review);
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Abastecimentos e custos" texto={`Combustível, carregamentos, portagens, estacionamento, oficina e rendas dos últimos ${DIAS_PERIODO} dias. Cada despesa fica imputada a um centro de custo ou a uma obra.`}
        acoes={<>
          {rever.length ? <BotaoFrota requer="custos" icone={ListChecks} aoClicar={() => dlg("rever")}>{`Rever linhas (${rever.length})`}</BotaoFrota> : null}
          <BotaoFrota requer="custos" icone={FileUp} aoClicar={() => dlg("importar")}>Importar extrato</BotaoFrota>
          <BotaoFrota variant="default" requer="gerirOuCustos" icone={Plus} aoClicar={() => dlg("despesa")}>Registar despesa</BotaoFrota>
        </>} />
      {!pode("custos").ok ? <p className="text-sm text-muted-foreground">Os custos da frota só se veem com a permissão fleet.costs; aqui aparecem só os que te estão imputados.</p> : null}
      <KpiGrid>
        <KpiTile label="Total no período" value={fEur(soma(todos, (c) => c.amount))} hint={`desde ${fData(desde)}`} />
        <KpiTile label="Este mês" value={fEur(soma(doMes, (c) => c.amount))} hint={`${doMes.length} lançamentos`} />
        <KpiTile label="Combustível e energia" value={fEur(comb)} hint={`${fNum(soma(todos.filter((c) => c.unit === "L"), (c) => c.quantity), 0)} L · ${fNum(soma(todos.filter((c) => c.unit === "kWh"), (c) => c.quantity), 0)} kWh`} />
        <KpiTile label="Para rever" value={rever.length} hint="linhas de extrato com km abaixo da última leitura" tone={rever.length ? "warn" : undefined} />
      </KpiGrid>
      <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Fornecedor, centro de custo, nota" placeholder="Fornecedor, centro de custo, nota" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-52"><NativeSelect aria-label="Tipo" value={tf} onValueChange={setTf} options={[{ value: "", label: "Todos os tipos" }, ...opcoesDe(CATEGORIAS_CUSTO)]} /></div>
        <div className="w-52"><NativeSelect aria-label="Viatura" value={vf} onValueChange={setVf} options={[{ value: "", label: "Todas as viaturas" }, ...F.viaturas.map((v) => ({ value: v.id, label: v.plate }))]} /></div>
      </div>
      {l.length ? (
        <>
          <Tabela>
            <Table>
              <caption className="sr-only">Despesas</caption>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Viatura</TableHead><TableHead>Tipo</TableHead><TableHead>Origem</TableHead><TableHead>Centro de custo / obra</TableHead>
                <TableHead className="text-right">Quantidade</TableHead><TableHead className="text-right">Km</TableHead><TableHead className="text-right">Valor</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {l.map((c) => {
                  const ob = c.ops_obra_id ? obras.dados.find((o) => o.id === c.ops_obra_id) : undefined;
                  return (
                    <LinhaClicavel key={c.id} aoAbrir={() => abrir(c.vehicle_id, "custos")} rotulo={`Abrir os custos da ${viatura(F, c.vehicle_id)?.plate ?? "viatura"}: ${CATEGORIAS_CUSTO[c.category]} de ${fData(c.spent_on)}, ${fEur(c.amount)}`}>
                      <TableCell className="whitespace-nowrap">{fData(c.spent_on)}</TableCell>
                      <TableCell><Placa mat={viatura(F, c.vehicle_id)?.plate ?? ""} /></TableCell>
                      <TableCell><div className="flex flex-wrap items-center gap-1">{CATEGORIAS_CUSTO[c.category]}{c.needs_review ? <Selo tom="warn">Rever km</Selo> : null}</div></TableCell>
                      <TableCell><div className="flex flex-col"><span>{c.supplier_label ?? ORIGENS_CUSTO[c.source]}</span>{c.driver_id ? <span className="text-xs text-muted-foreground">{condutor(F, c.driver_id)?.full_name}</span> : null}</div></TableCell>
                      <TableCell>{ob ? <Selo tom="violet"><RefOps tipo="obra" codigo={ob.codigo} titulo={ob.nome} /></Selo> : c.ops_obra_id ? "Obra" : c.cost_center_label || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.quantity ? `${fNum(c.quantity, 1)} ${c.unit ?? ""}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.odometer_km ? fNum(c.odometer_km) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fEur(c.amount)}</TableCell>
                    </LinhaClicavel>
                  );
                })}
              </TableBody>
            </Table>
          </Tabela>
          <p className="flex justify-between text-sm"><span className="text-muted-foreground">{l.length} lançamento(s)</span><b>Total {fEur(soma(l, (c) => c.amount))}</b></p>
        </>
      ) : todos.length ? <Vazio titulo="Sem despesas com estes filtros" texto="Muda o tipo ou a viatura." />
        : <Vazio titulo="Ainda não há custos" texto="Regista abastecimentos na ficha da viatura, despesas aqui, ou importa o extrato do cartão frota." />}
      {F.importacoes.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Último extrato: {F.importacoes[0].file_name} ({F.importacoes[0].rows_imported} de {F.importacoes[0].rows_total} linhas{F.importacoes[0].rows_flagged ? `, ${F.importacoes[0].rows_flagged} para rever` : ""}).</span>
          {rever.some((c) => c.import_id === F.importacoes[0].id) ? (
            <BotaoFrota requer="custos" aoClicar={() => dlg("rever", { imp: F.importacoes[0].id })} aria-label={`Rever as linhas de ${F.importacoes[0].file_name}`}>Rever estas linhas</BotaoFrota>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
