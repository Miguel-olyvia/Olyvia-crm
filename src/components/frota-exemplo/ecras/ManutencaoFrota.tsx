// A Manutenção (pgManutencao do protótipo): o plano de revisões (por km ou por data, a que chegar primeiro) e as
// intervenções. Uma manutenção marcada bloqueia a viatura na agenda nesse dia.
import { CalendarPlus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPills, KpiGrid, KpiTile } from "@/components/frota-exemplo/inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Placa, Prog, Seccao, Selo, Tabela, VRef, useVista } from "../pecas";
import { ativa, fData, fEur, fKm, maiuscula, revisao, soma, viatura, type EstadoManut, type Tom } from "../dados";

const EB: Record<EstadoManut, Tom> = { agendada: "info", "em curso": "warn", "concluída": "ok" };

export function ManutencaoFrota() {
  const { F, dlg } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const vs = F.viaturas.filter(ativa);
  const planos = vs.filter((v) => vista !== "rev" || revisao(v).tom !== "ok").sort((a, b) => revisao(a).faltaKm - revisao(b).faltaKm);
  const ev = [...F.manut].sort((a, b) => b.data.localeCompare(a.data));
  const mes = soma(ev.filter((m) => m.estado === "concluída" && m.data >= "2026-10-01"), (m) => m.valor) + soma(ev.filter((m) => m.estado === "em curso"), (m) => m.valor);
  const emCurso = ev.filter((m) => m.estado === "em curso");
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Manutenção" texto="Revisões por km ou por data (a que chegar primeiro), inspeções e reparações. As oficinas são fornecedores do Inventário."
        acoes={<BotaoFrota variant="default" escrita icone={CalendarPlus} aoClicar={() => dlg("manut")}>Agendar manutenção</BotaoFrota>} />
      <KpiGrid>
        <KpiTile label="Agendadas" value={ev.filter((m) => m.estado === "agendada").length} hint="próximos 15 dias" />
        <KpiTile label="Em curso" value={emCurso.length} hint={emCurso.map((m) => viatura(F, m.vid)?.mat).join(", ") || "Nenhuma"} tone="warn" />
        <KpiTile label="Revisões a fazer" value={vs.filter((v) => revisao(v).tom !== "ok").length} hint="por km ou por data" tone="bad" onClick={() => setVista("rev")} active={vista === "rev"} actionLabel="Mostrar só as que precisam" />
        <KpiTile label="Custo em outubro" value={fEur(mes)} hint="inclui orçamentos em curso" />
      </KpiGrid>
      <Seccao titulo="Plano de revisões" acoes={<FilterPills ariaLabel="Vistas" value={vista} onChange={setVista} options={[{ value: "todas", label: "Todas" }, { value: "rev", label: "Só as que precisam" }]} />}>
        <Tabela>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Viatura</TableHead><TableHead className="text-right">Km atuais</TableHead><TableHead>Regra</TableHead><TableHead>Última</TableHead>
              <TableHead>Próxima</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {planos.map((v) => {
                const r = revisao(v);
                return (
                  <TableRow key={v.id}>
                    <TableCell><VRef v={v} /></TableCell>
                    <TableCell className="text-right tabular-nums">{fKm(v.km)}</TableCell>
                    <TableCell>A cada {fKm(v.rev.cadaKm)} ou {v.rev.cadaMeses} meses</TableCell>
                    <TableCell>{fKm(v.rev.ultKm)}<div className="text-xs text-muted-foreground">{fData(v.rev.ultData)}</div></TableCell>
                    <TableCell>{fKm(r.nextKm)}<div className="text-xs text-muted-foreground">até {fData(r.nextData)}</div></TableCell>
                    <TableCell><div className="flex flex-col items-start gap-1"><Prog tom={r.tom} pct={r.pct} /><Selo tom={r.tom}>{r.txt}</Selo></div></TableCell>
                    <TableCell className="text-right">{r.tom !== "ok" ? <BotaoFrota escrita aoClicar={() => dlg("manut", { v: v.id })}>Agendar</BotaoFrota> : null}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Tabela>
      </Seccao>
      <Seccao titulo="Intervenções">
        <Tabela>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Viatura</TableHead><TableHead>Intervenção</TableHead><TableHead>Oficina</TableHead>
              <TableHead>Estado</TableHead><TableHead className="text-right">Valor</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {ev.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{fData(m.data)}{m.prev ? <div className="text-xs text-muted-foreground">prev. {fData(m.prev)}</div> : null}</TableCell>
                  <TableCell><Placa mat={viatura(F, m.vid)?.mat ?? ""} /></TableCell>
                  <TableCell><div className="flex flex-col"><span>{m.tipo}</span>{m.nota ? <span className="text-xs text-muted-foreground">{m.nota}</span> : null}</div></TableCell>
                  <TableCell>{m.oficina}</TableCell>
                  <TableCell><Selo tom={EB[m.estado]}>{maiuscula(m.estado)}</Selo></TableCell>
                  <TableCell className="text-right tabular-nums">{fEur(m.valor)}</TableCell>
                  <TableCell className="text-right">{m.estado !== "concluída" ? <BotaoFrota escrita aoClicar={() => dlg("concluir", { m: m.id })}>Concluir</BotaoFrota> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Tabela>
      </Seccao>
    </div>
  );
}
