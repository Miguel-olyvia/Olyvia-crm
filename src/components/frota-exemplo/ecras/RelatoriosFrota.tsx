// Os Relatórios (pgRelatorios do protótipo): custo total de posse, custo por km, consumo e utilização de 1/9 a 14/10.
// As barras são feitas à mão (sem biblioteca de gráficos), com "Ver como tabela" para quem não as consegue ler.
import { BarChart3, Lightbulb, Table as TableIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiGrid, KpiTile } from "@/components/frota-exemplo/inventarioUi";
import { cn } from "@/lib/utils";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Cartao, LinhaClicavel, ListaV, Prog, RefObra, Seccao, Selo, Tabela, VRef, useVista } from "../pecas";
import { HOJE, INICIO_PERIODO, consumo, custoKm, custoTotal, custosV, d2n, fEur, fNum, kmPeriodo, obraDoCentro, soma, utilizacao } from "../dados";

const CAT: readonly (readonly [string, readonly string[], string])[] = [
  ["Combustível e energia", ["Combustível", "Carregamento"], "bg-primary"],
  ["Portagens e estacionamento", ["Portagens", "Estacionamento"], "bg-info"],
  ["Oficina e manutenção", ["Oficina"], "bg-warning"],
  ["Renting e leasing", ["Renting / leasing"], "bg-success"],
  ["Outros", ["Lavagem", "Seguro", "IUC", "Outro"], "bg-muted-foreground"],
];

export function RelatoriosFrota() {
  const { F, abrir, obras } = useFrotaCtx();
  const [modo, setModo] = useVista("grafico");
  const tabela = modo === "tabela";
  const vs = F.viaturas.filter((v) => custosV(F, v.id).length);
  const max = Math.max(1, ...vs.map((v) => custoTotal(F, v.id)));
  const totalKm = soma(vs, (v) => kmPeriodo(F, v.id)), total = soma(F.custos, (c) => c.valor);
  const porCentro: Record<string, number> = {};
  for (const c of F.custos) { const k = c.centro || "Sem centro"; porCentro[k] = (porCentro[k] || 0) + c.valor; }
  const diasPer = d2n(HOJE) - d2n(INICIO_PERIODO) + 1;
  const somaCat = (vid: string, tipos: readonly string[]) => soma(custosV(F, vid).filter((x) => tipos.includes(x.tipo)), (x) => x.valor);
  const ordenadas = [...vs].sort((a, b) => custoTotal(F, b.id) - custoTotal(F, a.id));
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Relatórios" texto="Custo total de posse, custo por km, consumo e utilização, de 1 de setembro a 14 de outubro de 2026."
        acoes={<BotaoFrota icone={tabela ? BarChart3 : TableIcon} aoClicar={() => setModo(tabela ? "grafico" : "tabela")}>{tabela ? "Ver como gráfico" : "Ver como tabela"}</BotaoFrota>} />
      <KpiGrid>
        <KpiTile label="Custo total" value={fEur(total)} hint={`${F.custos.length} lançamentos`} />
        <KpiTile label="Km percorridos" value={fNum(totalKm)} hint="toda a frota" />
        <KpiTile label="Custo por km" value={totalKm ? fEur(total / totalKm) : "—"} hint="média ponderada" />
        <KpiTile label="Custo médio por viatura/mês" value={vs.length ? fEur(total / vs.length / (diasPer / 30.4)) : "—"} hint={`${vs.length} viaturas com custos`} />
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
                    <TableRow key={v.id}><TableCell className="font-mono">{v.mat}</TableCell>{CAT.map((c) => <TableCell key={c[0]} className="text-right tabular-nums">{fEur(somaCat(v.id, c[1]))}</TableCell>)}<TableCell className="text-right font-semibold tabular-nums">{fEur(custoTotal(F, v.id))}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </Tabela>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{CAT.map((c) => <span key={c[0]} className="inline-flex items-center gap-1.5"><i className={cn("h-3 w-3 rounded-sm", c[2])} aria-hidden="true" />{c[0]}</span>)}</div>
                <div className="space-y-2" role="img" aria-label={`Custo por viatura: ${ordenadas.map((v) => `${v.mat} ${fEur(custoTotal(F, v.id))}`).join("; ")}`}>
                  {ordenadas.map((v) => (
                    <div key={v.id} className="grid grid-cols-[80px_1fr_90px] items-center gap-2 text-sm">
                      <span className="font-mono text-xs">{v.mat}</span>
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
            <ListaV>
              {Object.entries(porCentro).sort((a, b) => b[1] - a[1]).map(([k, val]) => {
                const ob = obraDoCentro(k), o = ob ? obras.find((x) => x.id === ob) : undefined;
                return (
                  <div key={k}>
                    <span className="flex flex-wrap items-center gap-1.5">{ob ? <><Selo tom="violet"><RefObra id={ob}>{k}</RefObra></Selo><span className="text-xs text-muted-foreground">{o ? `${o.servico} · ${o.nome}, ${o.local}` : ""}</span></> : k}</span>
                    <b className="tabular-nums">{fEur(val)}</b>
                  </div>
                );
              })}
            </ListaV>
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
                  <LinhaClicavel key={v.id} aoAbrir={() => abrir(v.id)} rotulo={`Abrir a ${v.mat}`}>
                    <TableCell><VRef v={v} /></TableCell>
                    <TableCell>{v.comb}</TableCell>
                    <TableCell className="text-right tabular-nums">{fNum(kmPeriodo(F, v.id))}</TableCell>
                    <TableCell className="text-right tabular-nums">{c ? `${fNum(c, 1)}${v.comb === "Elétrico" ? " kWh" : " L"}/100 km` : "—"}</TableCell>
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
          <span>Hoje as Operações usam 0,40 €/km fixos para a deslocação das obras. Com a frota, passa a usar o custo por km real da viatura atribuída: média atual de <b>{totalKm ? fEur(total / totalKm) : "—"}</b>/km.</span>
        </div>
      </Seccao>
    </div>
  );
}
