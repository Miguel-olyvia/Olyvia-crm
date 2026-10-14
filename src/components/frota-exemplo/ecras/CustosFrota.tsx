// Abastecimentos e custos (pgCustos do protótipo): combustível, energia, portagens, estacionamento, oficina e rendas,
// cada despesa imputada a um centro de custo ou a uma obra (de exemplo). "Importar extrato" lê o extrato de exemplo.
import { useState } from "react";
import { FileUp, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiGrid, KpiTile } from "@/components/frota-exemplo/inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, LinhaClicavel, Placa, RefObra, Selo, Tabela, Vazio } from "../pecas";
import { TIPOS_CUSTO, fData, fEur, fNum, obraDoCentro, pessoa, soma, viatura } from "../dados";

export function CustosFrota() {
  const { F, abrir, dlg } = useFrotaCtx();
  const [tf, setTf] = useState(""), [vf, setVf] = useState(""), [q, setQ] = useState("");
  const ql = q.toLowerCase();
  const todos = F.custos;
  const l = todos.filter((c) => (!tf || c.tipo === tf) && (!vf || c.vid === vf) && (!ql || (c.fonte + (c.centro || "") + (viatura(F, c.vid)?.mat ?? "") + (c.nota || "")).toLowerCase().includes(ql)))
    .sort((a, b) => b.data.localeCompare(a.data));
  const out = todos.filter((c) => c.data >= "2026-10-01");
  const comb = soma(todos.filter((c) => c.tipo === "Combustível" || c.tipo === "Carregamento"), (c) => c.valor);
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Abastecimentos e custos" texto="Combustível, carregamentos, portagens, estacionamento, oficina e rendas. Cada despesa fica imputada a um centro de custo ou a uma obra."
        acoes={<>
          <BotaoFrota escrita icone={FileUp} aoClicar={() => dlg("importar")}>Importar extrato</BotaoFrota>
          <BotaoFrota variant="default" escrita icone={Plus} aoClicar={() => dlg("despesa")}>Registar despesa</BotaoFrota>
        </>} />
      <KpiGrid>
        <KpiTile label="Total no período" value={fEur(soma(todos, (c) => c.valor))} hint="1 set a 14 out 2026" />
        <KpiTile label="Em outubro" value={fEur(soma(out, (c) => c.valor))} hint={`${out.length} lançamentos`} />
        <KpiTile label="Combustível e energia" value={fEur(comb)} hint={`${fNum(soma(todos.filter((c) => c.un === "L"), (c) => c.qtd), 0)} L · ${fNum(soma(todos.filter((c) => c.un === "kWh"), (c) => c.qtd), 0)} kWh`} />
        <KpiTile label="Portagens" value={fEur(soma(todos.filter((c) => c.tipo === "Portagens"), (c) => c.valor))} hint="extrato Via Verde de setembro" />
      </KpiGrid>
      <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Fornecedor, centro de custo, obra" placeholder="Fornecedor, centro de custo, obra" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-52"><NativeSelect aria-label="Tipo" value={tf} onValueChange={setTf} options={[{ value: "", label: "Todos os tipos" }, ...TIPOS_CUSTO.map((t) => ({ value: t, label: t }))]} /></div>
        <div className="w-52"><NativeSelect aria-label="Viatura" value={vf} onValueChange={setVf} options={[{ value: "", label: "Todas as viaturas" }, ...F.viaturas.map((v) => ({ value: v.id, label: v.mat }))]} /></div>
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
                  const ob = obraDoCentro(c.centro);
                  return (
                    <LinhaClicavel key={c.id} aoAbrir={() => abrir(c.vid, "custos")} rotulo={`Abrir os custos da ${viatura(F, c.vid)?.mat ?? "viatura"}: ${c.tipo} de ${fData(c.data)}, ${fEur(c.valor)}`}>
                      <TableCell className="whitespace-nowrap">{fData(c.data)}</TableCell>
                      <TableCell><Placa mat={viatura(F, c.vid)?.mat ?? ""} /></TableCell>
                      <TableCell><div className="flex flex-wrap items-center gap-1">{c.tipo}{c.rever ? <Selo tom="warn">Rever km</Selo> : null}</div></TableCell>
                      <TableCell><div className="flex flex-col"><span>{c.fonte}</span>{c.pid ? <span className="text-xs text-muted-foreground">{pessoa(F, c.pid)?.nome}</span> : null}</div></TableCell>
                      <TableCell>{ob ? <Selo tom="violet"><RefObra id={ob}>{c.centro}</RefObra></Selo> : c.centro || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.qtd ? `${fNum(c.qtd, 1)} ${c.un}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.km ? fNum(c.km) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fEur(c.valor)}</TableCell>
                    </LinhaClicavel>
                  );
                })}
              </TableBody>
            </Table>
          </Tabela>
          <p className="flex justify-between text-sm"><span className="text-muted-foreground">{l.length} lançamento(s)</span><b>Total {fEur(soma(l, (c) => c.valor))}</b></p>
        </>
      ) : <Vazio titulo="Sem despesas com estes filtros" texto="Muda o tipo ou a viatura." />}
    </div>
  );
}
