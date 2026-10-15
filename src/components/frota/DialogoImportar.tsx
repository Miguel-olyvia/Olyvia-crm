// "Importar extrato do cartão frota": lê um CSV (Galp Frota, Via Verde ou outro, com cabeçalho), mostra as linhas com a
// verificação (matrícula desconhecida, km abaixo da última leitura → "Rever km") e importa-as com
// rpc_fleet_import_statement. O mesmo ficheiro (SHA-256) não entra duas vezes: a RPC recusa.
import { useState } from "react";
import { CircleAlert, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FleetStatementRow } from "@/integrations/supabase/fleetTypes";
import { useFrotaCtx } from "./contexto";
import { Alerta, Campo } from "./campos";
import { Selo, Tabela } from "./pecas";
import { fData, fEur, fNum, numero, rpcFrota, useReferenciaFrota, type Frota } from "./dados";

/** Os nomes de coluna aceites (minúsculas, sem acentos). */
const COLUNAS: Record<keyof FleetStatementRow, string[]> = {
  spent_on: ["data", "date", "dia"],
  plate: ["matricula", "plate", "viatura"],
  station: ["posto", "local", "station", "estacao"],
  quantity: ["quantidade", "litros", "kwh", "qtd", "quantity"],
  amount: ["valor", "montante", "total", "amount"],
  km: ["km", "quilometros", "odometro", "kms"],
  unit: ["unidade", "unit"],
  external_ref: ["referencia", "ref", "id", "transacao", "documento"],
};
const semAcentos = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Uma data do extrato ("13/10/2026", "2026-10-13") em AAAA-MM-DD; inválida → "". */
export function dataExtrato(s: string): string {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/** Separa uma linha CSV (aspas duplas, separador ; ou ,). */
function partir(linha: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (aspas && linha[i + 1] === '"') { cur += '"'; i++; } else aspas = !aspas; }
    else if (c === sep && !aspas) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** Lê o CSV do extrato: devolve as linhas para a RPC ou o porquê de não se conseguir ler. */
export function lerExtrato(texto: string): { linhas: FleetStatementRow[]; erro: string } {
  const l = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((x) => x.trim());
  if (l.length < 2) return { linhas: [], erro: "O ficheiro não tem linhas (precisa de um cabeçalho e pelo menos uma linha)." };
  const sep = (l[0].match(/;/g)?.length ?? 0) >= (l[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cab = partir(l[0], sep).map(semAcentos);
  const idx = Object.fromEntries((Object.keys(COLUNAS) as (keyof FleetStatementRow)[]).map((k) => [k, cab.findIndex((c) => COLUNAS[k].includes(c))])) as Record<keyof FleetStatementRow, number>;
  const faltam = (["spent_on", "plate", "amount"] as const).filter((k) => idx[k] < 0);
  if (faltam.length) return { linhas: [], erro: `Faltam colunas no cabeçalho: ${faltam.map((k) => COLUNAS[k][0]).join(", ")}. Colunas aceites: data, matrícula, posto, quantidade, valor, km, unidade, referência.` };
  const linhas: FleetStatementRow[] = [];
  for (const raw of l.slice(1)) {
    const c = partir(raw, sep);
    const val = (k: keyof FleetStatementRow): string => (idx[k] >= 0 ? c[idx[k]] ?? "" : "");
    const un = semAcentos(val("unit"));
    linhas.push({
      spent_on: dataExtrato(val("spent_on")),
      plate: val("plate").toUpperCase().replace(/\s/g, ""),
      station: val("station") || undefined,
      quantity: numero(val("quantity")),
      amount: numero(val("amount")) ?? 0,
      km: numero(val("km")) != null ? Math.trunc(numero(val("km"))!) : null,
      unit: un === "kwh" ? "kWh" : "L",
      external_ref: val("external_ref") || undefined,
    });
  }
  return { linhas, erro: "" };
}

/** O que acontece a cada linha na importação (a mesma regra da RPC). */
export function verificarLinha(F: Frota, r: FleetStatementRow): string | null {
  if (!r.spent_on) return "Data inválida";
  const v = F.viaturas.find((x) => x.plate === r.plate);
  if (!v) return "Matrícula desconhecida (fica de fora)";
  if (!(r.amount > 0)) return "Sem valor (fica de fora)";
  if (r.km != null && r.km < v.odometer_km) return `Rever km (última leitura ${fNum(v.odometer_km)})`;
  return null;
}

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const lerFicheiro = (f: File): Promise<string> =>
  typeof f.text === "function" ? f.text() : new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => falha(r.error); r.readAsText(f); });

export function DialogoImportar({ aoFechar }: { aoFechar: () => void }) {
  const { F, agir, pode, dados } = useFrotaCtx();
  const fornecedores = useReferenciaFrota("fornecedores");
  const [ficheiro, setFicheiro] = useState<{ nome: string; texto: string } | null>(null);
  const [linhas, setLinhas] = useState<FleetStatementRow[]>([]);
  const [fornecedor, setFornecedor] = useState("");
  const [erro, setErro] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const perm = pode("custos");
  const jaImportado = ficheiro ? F.importacoes.some((i) => i.file_name === ficheiro.nome) : false;

  const escolher = async (f: File | undefined): Promise<void> => {
    setErro(""); setLinhas([]); setFicheiro(null);
    if (!f) return;
    const texto = await lerFicheiro(f);
    const r = lerExtrato(texto);
    if (r.erro) { setErro(r.erro); return; }
    setFicheiro({ nome: f.name, texto });
    setLinhas(r.linhas);
  };
  const importar = async (): Promise<void> => {
    if (!perm.ok) { setErro(perm.porque); return; }
    if (!ficheiro || !linhas.length) { setErro("Escolhe o ficheiro do extrato (CSV)."); return; }
    const validas = linhas.filter((l) => l.spent_on);
    setAGravar(true);
    const hash = await sha256(ficheiro.texto);
    const r = await agir("importar", () => rpcFrota("rpc_fleet_import_statement", {
      p_organization_id: dados.org ?? "", p_file_name: ficheiro.nome, p_file_sha256: hash, p_supplier_id: fornecedor || null, p_rows: validas, p_document_id: null,
    }), {
      ok: (x) => `${x?.imported ?? 0} abastecimento(s) importado(s) de ${ficheiro.nome}.` + (x?.flagged ? ` ${x.flagged} ficou para rever.` : "") + (x?.skipped ? ` ${x.skipped} ficou de fora (matrícula desconhecida, sem valor ou já importada).` : ""),
      link: { rotulo: "Ver nos custos", para: "/frota/custos" },
    });
    setAGravar(false);
    if (r.ok) aoFechar(); else setErro(r.erro);
  };
  return (
    <Dialog open onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form noValidate onSubmit={(ev) => { ev.preventDefault(); void importar(); }} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Importar extrato do cartão frota</DialogTitle>
            <DialogDescription>CSV com cabeçalho: data, matrícula, posto, quantidade, valor, km, unidade (L ou kWh) e referência.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Ficheiro do extrato (CSV)">{(p) => <Input {...p} type="file" accept=".csv,text/csv" onChange={(e) => void escolher(e.target.files?.[0])} />}</Campo>
            <Campo rotulo="Fornecedor do cartão" ajuda="Opcional (Galp, Repsol, Via Verde…)">
              {(p) => <NativeSelect {...p} value={fornecedor} onValueChange={setFornecedor} options={[{ value: "", label: "Sem fornecedor" }, ...fornecedores.dados.map((f) => ({ value: f.id, label: f.nome }))]} />}
            </Campo>
          </div>
          {linhas.length ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><b className="flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4" aria-hidden="true" />{ficheiro?.nome}</b><span className="text-sm text-muted-foreground">{linhas.length} linhas</span></div>
              <Tabela className="shadow-none">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Data</TableHead><TableHead>Matrícula</TableHead><TableHead>Posto</TableHead><TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Km</TableHead><TableHead>Verificação</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{linhas.map((l, i) => { const prob = verificarLinha(F, l); return (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{fData(l.spent_on)}</TableCell><TableCell className="font-mono">{l.plate}</TableCell><TableCell>{l.station ?? ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantity != null ? `${fNum(l.quantity, 1)} ${l.unit}` : "—"}</TableCell><TableCell className="text-right tabular-nums">{fEur(l.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.km != null ? fNum(l.km) : "—"}</TableCell>
                      <TableCell>{prob ? <Selo tom="warn">{prob}</Selo> : <Selo tom="ok">OK</Selo>}</TableCell>
                    </TableRow>); })}</TableBody>
                </Table>
              </Tabela>
              <p className="text-sm text-muted-foreground">As linhas com km abaixo da última leitura entram marcadas “Rever km” e não mexem nos km da viatura.</p>
            </div>
          ) : null}
          {jaImportado ? <Alerta tom="warn" icone={TriangleAlert}>Já foi importado um extrato com este nome. Se for o mesmo ficheiro, a importação é recusada.</Alerta> : null}
          {erro ? <div role="alert"><Alerta tom="bad" icone={CircleAlert}>{erro}</Alerta></div> : null}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={aGravar} aria-disabled={!perm.ok || undefined} title={perm.ok ? undefined : perm.porque}>{aGravar ? "A importar…" : linhas.length ? `Importar ${linhas.length} linhas` : "Importar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
