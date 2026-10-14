// Os Condutores (pgCondutores do protótipo): vêm de Pessoas (RH). A carta, as categorias e a validade leem-se da ficha
// da pessoa; aqui não se escrevem. Na app real a ligação é o RH de exemplo (/rh-exemplo/pessoas), quando há permissão.
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPills, usePermissionGate } from "@/components/frota-exemplo/inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Selo, Tabela, Vazio, useVista } from "../pecas";
import { dias, fData, textoData, tomSelo, viaturaDe, type Pessoa } from "../dados";

export function CondutoresFrota() {
  const { F, abrir, dlg } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const gate = usePermissionGate();
  const aCaducar = (p: Pessoa) => !p.carta.length || (!!p.cartaVal && dias(p.cartaVal) <= 60);
  const l = F.pessoas.filter((p) => vista !== "carta" || aCaducar(p));
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Condutores" texto="Os condutores vêm de Pessoas (RH). A carta de condução, as categorias e a validade não se escrevem aqui, leem-se da ficha da pessoa."
        acoes={gate("users.view").allowed ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/rh-exemplo/pessoas"><Users className="h-4 w-4" aria-hidden="true" />Abrir Pessoas (RH de exemplo)</Link></Button>
        ) : null} />
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <FilterPills ariaLabel="Vistas" value={vista} onChange={setVista} options={[
          { value: "todas", label: "Todas as pessoas", count: F.pessoas.length },
          { value: "carta", label: "Carta a caducar ou em falta", count: F.pessoas.filter(aCaducar).length },
        ]} />
      </div>
      {l.length ? (
        <Tabela>
          <Table>
            <caption className="sr-only">Condutores</caption>
            <TableHeader><TableRow>
              <TableHead>Pessoa</TableHead><TableHead>Equipa</TableHead><TableHead>Carta</TableHead><TableHead>Validade</TableHead>
              <TableHead>Viatura atual</TableHead><TableHead className="text-right">Multas</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {l.map((p) => {
                const v = viaturaDe(F, p.id), m = F.ocorr.filter((o) => o.tipo === "Multa" && o.pid === p.id).length;
                return (
                  <TableRow key={p.id}>
                    <TableCell><div className="flex flex-col"><b>{p.nome}</b><span className="text-xs text-muted-foreground">{p.funcao}{p.tec ? " · técnico das obras" : ""}</span></div></TableCell>
                    <TableCell>{p.equipa}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{p.carta.length ? p.carta.map((c) => <Selo key={c} tom="neu">{c}</Selo>) : <Selo tom="bad">Sem carta</Selo>}</div></TableCell>
                    <TableCell>{p.cartaVal ? <div className="flex flex-col items-start gap-1"><span>{fData(p.cartaVal)}</span><Selo tom={tomSelo(p.cartaVal)}>{textoData(p.cartaVal)}</Selo></div> : "—"}</TableCell>
                    <TableCell>{v ? <button type="button" className="font-mono text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => abrir(v.id)}>{v.mat}</button> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{m}</TableCell>
                    <TableCell className="text-right">{!v && p.carta.length ? <BotaoFrota escrita aoClicar={() => dlg("atribuir", { p: p.id })}>Atribuir viatura</BotaoFrota> : null}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Tabela>
      ) : <Vazio titulo="Ninguém nesta vista" texto="Escolhe outra vista." />}
    </div>
  );
}
