// A Atividade da Frota: o histórico de todas as ações (log de atividade), com filtro por viatura e por tipo. Cada entrada
// diz quando, quem (o utilizador com sessão iniciada), a viatura, o quê e o detalhe. A mesma lista, só da viatura,
// é a aba "Histórico" da ficha.
import { useState } from "react";
import { History } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFrotaCtx } from "../contexto";
import { Cabecalho, Placa, Selo, Tabela, Vazio } from "../pecas";
import { viatura, type EntradaLog } from "../dados";

const quando = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(d);
};

/** A tabela do histórico (a Atividade e a aba Histórico da ficha). `semViatura` esconde a coluna da viatura. */
export function ListaHistorico({ entradas, semViatura }: { entradas: readonly EntradaLog[]; semViatura?: boolean }) {
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
          {entradas.map((e, i) => {
            const v = e.vid ? viatura(F, e.vid) : undefined;
            return (
              <TableRow key={e.at + i}>
                <TableCell className="whitespace-nowrap tabular-nums">{quando(e.at)}</TableCell>
                <TableCell>{e.quem ?? "—"}</TableCell>
                {semViatura ? null : <TableCell>{v ? <Placa mat={v.mat} /> : <span className="text-muted-foreground">Frota</span>}</TableCell>}
                <TableCell><div className="flex flex-col items-start gap-1">{e.acao ? <Selo tom="neu">{e.acao}</Selo> : null}<span>{e.t}</span></div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.det ?? ""}</TableCell>
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
  const log = F.log ?? [];
  const tipos = [...new Set(log.map((e) => e.acao).filter((x): x is string => !!x))].sort();
  const l = log.filter((e) => (!vid || e.vid === vid) && (!tipo || e.acao === tipo));
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Atividade" texto="O histórico de tudo o que se registou na Frota: quando, quem, a viatura e o quê. Fica guardado no exemplo, neste navegador." />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div className="w-56"><NativeSelect aria-label="Filtrar por viatura" value={vid} onValueChange={setVid}
          options={[{ value: "", label: "Todas as viaturas" }, ...F.viaturas.map((v) => ({ value: v.id, label: `${v.mat} · ${v.marca} ${v.modelo.split(" ")[0]}` }))]} /></div>
        <div className="w-56"><NativeSelect aria-label="Filtrar por tipo" value={tipo} onValueChange={setTipo}
          options={[{ value: "", label: "Todos os tipos" }, ...tipos.map((t) => ({ value: t, label: t }))]} /></div>
        <span className="ml-auto text-sm text-muted-foreground">{l.length} de {log.length} registo(s)</span>
      </div>
      <ListaHistorico entradas={l} />
    </div>
  );
}
