// Os Relatórios: custo total, custo por km (só custos variáveis, o critério de fn_fleet_cost_per_km), consumo e utilização
// nos últimos 90 dias. As barras são feitas à mão (sem biblioteca de gráficos), com "Ver como tabela".
import { BarChart3, Lightbulb, Table as TableIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FleetExpenseCategory } from "@/integrations/supabase/fleetTypes";
import { KpiGrid, KpiTile } from "../inventarioUi";
import { cn } from "@/lib/utils";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Cartao, LinhaClicavel, ListaV, Prog, Seccao, Tabela, VRef, Vazio, useVista } from "../pecas";
import { COMBUSTIVEIS, DIAS_PERIODO, KM_FIXO, consumo, custoKm, custoKmMedio, custoTotal, custosV, eletrica, fData, fEur, fNum, inicioPeriodo, kmPeriodo, soma, utilizacao, useReferenciaFrota } from "../dados";

const CAT: readonly (readonly [string, readonly FleetExpenseCategory[], string])[] = [
  ["Combustível e energia", ["fuel", "charging"], "bg-primary"],
  ["Portagens e estacionamento", ["tolls", "parking"], "bg-info"],
  ["Oficina e manutenção", ["workshop", "inspection"], "bg-warning"],
  ["Renting e leasing", ["rent"], "bg-success"],
  ["Outros", ["washing", "insurance", "road_tax", "fine", "other"], "bg-muted-foreground"],
];

export function RelatoriosFrota() {
  const { F, abrir } = useFrotaCtx();
  const obras = useReferenciaFrota("obras");
  const [modo, setModo] = useVista("grafico");
  const tabela = modo === "tabela";
  const desde = inicioPeriodo(F.hoje);
  const custos = F.custos.filter((c) => c.spent_on >= desde);
  const vs = F.viaturas.filter((v) => custosV(F, v.id).length || kmPeriodo(F, v.id));
  const max = Math.max(1, ...vs.map((v) => custoTotal(F, v.id)));
  const totalKm = soma(vs, (v) => kmPeriodo(F, v.id)), total = soma(custos, (c) => c.amount);
  const porCentro: Record<string, number> = {};
  for (const c of custos) {
    const ob = c.ops_obra_id ? obras.dados.find((o) => o.id === c.ops_obra_id) : undefined;
    const k = ob ? `Obra ${ob.codigo} · ${ob.nome}` : c.ops_obra_id ? "Obra" : c.cost_center_label || "Sem centro de custo";
    porCentro[k] = (porCentro[k] || 0) + c.amount;
  }
  const somaCat = (vid: string, tipos: readonly FleetExpenseCategory[]) => soma(custosV(F, vid).filter((x) => tipos.includes(x.category)), (x) => x.amount);
  const ordenadas = [...vs].sort((a, b) => custoTotal(F, b.id) - custoTotal(F, a.id));
  const kmMedio = custoKmMedio(F);
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Relatórios" texto={`Custo total, custo por km, consumo e utilização dos últimos ${DIAS_PERIODO} dias (desde ${fData(desde)}).`}
        acoes={vs.length ? <BotaoFrota icone={tabela ? BarChart3 : TableIcon} aoClicar={() => setModo(tabela ? "grafico" : "tabela")}>{tabela ? "Ver como gráfico" : "Ver como tabela"}</BotaoFrota> : null} />
      {!vs.length ? <Vazio titulo="Ainda sem dados" texto="Os relatórios enchem-se com os km e os custos registados nas viaturas." /> : <>
        <KpiGrid>
          <KpiTile label="Custo total" value={fEur(total)} hint={`${custos.length} lançamentos`} />
          <KpiTile label="Km percorridos" value={fNum(totalKm)} hint="toda a frota" />
          <KpiTile label="Custo por km" value={kmMedio != null ? fEur(kmMedio) : "—"} hint="custos variáveis, média ponderada" />
          <KpiTile label="Custo médio por viatura/mês" value={vs.length ? fEur(total / vs.length / (DIAS_PERIODO / 30.4)) : "—"} hint={`${vs.length} viaturas com dados`} />
        </KpiGrid>
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao>
            <Seccao titulo="Custo por viatura">
              {tabela ? (
                <Tabela className="shadow-none">
                  <Table>
                    <caption className="sr-only">Custo por viatura e por categoria</caption>
                    <TableHeader><TableRow><TableHead>Viatura</TableHead>{CAT.map((c) => <TableHead key={c[0]} className="text-right">{c[0]}</TableHead>)}<TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>{vs.map((v) => (
                      <TableRow key={v.id}><TableCell className="font-mono">{v.plate}</TableCell>{CAT.map((c) => <TableCell key={c[0]} className="text-right tabular-nums">{fEur(somaCat(v.id, c[1]))}</TableCell>)}<TableCell className="text-right font-semibold tabular-nums">{fEur(custoTotal(F, v.id))}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                </Tabela>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{CAT.map((c) => <span key={c[0]} className="inline-flex items-center gap-1.5"><i className={cn("h-3 w-3 rounded-sm", c[2])} aria-hidden="true" />{c[0]}</span>)}</div>
                  <div className="space-y-2" role="img" aria-label={`Custo por viatura: ${ordenadas.map((v) => `${v.plate} ${fEur(custoTotal(F, v.id))}`).join("; ")}`}>
                    {ordenadas.map((v) => (
                      <div key={v.id} className="grid grid-cols-[80px_1fr_90px] items-center gap-2 text-sm">
                        <span className="font-mono text-xs">{v.plate}</span>
                        <div className="flex h-4 overflow-hidden rounded" style={{ width: `${(custoTotal(F, v.id) / max) * 100}%` }}>
                          {CAT.map((c) => { const s = somaCat(v.id, c[1]); return s ? <span key={c[0]} className={c[2]} style={{ width: `${(s / custoTotal(F, v.id)) * 100}%` }} title={`${c[0]}: ${fEur(s)}`} /> : null; })}
                        </div>
                        <span className="text-right tabular-nums">{fEur(custoTotal(F, v.id))}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Seccao>
          </Cartao>
          <Cartao>
            <Seccao titulo="Por centro de custo e obra">
              {Object.keys(porCentro).length ? (
                <ListaV>
                  {Object.entries(porCentro).sort((a, b) => b[1] - a[1]).map(([k, val]) => (
                    <div key={k}><span>{k}</span><b className="tabular-nums">{fEur(val)}</b></div>
                  ))}
                </ListaV>
              ) : <p className="text-sm text-muted-foreground">Sem custos no período.</p>}
            </Seccao>
          </Cartao>
        </div>
        <Seccao titulo="Eficiência por viatura">
          <Tabela>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Viatura</TableHead><TableHead>Combustível</TableHead><TableHead className="text-right">Km no período</TableHead><TableHead className="text-right">Consumo</TableHead>
                <TableHead className="text-right">Custo/km</TableHead><TableHead className="text-right">Utilização</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {vs.map((v) => {
                  const c = consumo(F, v.id), u = utilizacao(F, v), k = custoKm(F, v.id);
                  return (
                    <LinhaClicavel key={v.id} aoAbrir={() => abrir(v.id)} rotulo={`Abrir a ${v.plate}`}>
                      <TableCell><VRef v={v} /></TableCell>
                      <TableCell>{COMBUSTIVEIS[v.fuel_type]}</TableCell>
                      <TableCell className="text-right tabular-nums">{fNum(kmPeriodo(F, v.id))}</TableCell>
                      <TableCell className="text-right tabular-nums">{c ? `${fNum(c, 1)}${eletrica(v) ? " kWh" : " L"}/100 km` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{k != null ? fEur(k) : "—"}</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-2"><Prog tom={u < 50 ? "warn" : "ok"} pct={u} /><span className="tabular-nums">{fNum(u)}%</span></div></TableCell>
                    </LinhaClicavel>
                  );
                })}
              </TableBody>
            </Table>
          </Tabela>
          <div className="flex items-start gap-2 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-info" aria-hidden="true" />
            <span>A deslocação ligada a uma ordem usa o custo por km real da viatura (média da frota quando não há dados; {fEur(KM_FIXO)}/km sem dados nenhuns). Média atual: <b>{kmMedio != null ? fEur(kmMedio) : "—"}</b>/km.</span>
          </div>
        </Seccao>
      </>}
    </div>
  );
}
