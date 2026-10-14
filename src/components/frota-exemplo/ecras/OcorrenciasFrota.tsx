// As Ocorrências (pgOcorrencias do protótipo): multas, sinistros e avarias. Numa multa, o condutor sugere-se pela
// atribuição em vigor no dia da infração, e o prazo para o identificar conta 15 dias úteis desde a notificação.
import { Info, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPills } from "@/components/frota-exemplo/inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Placa, Selo, Tabela, Vazio, useVista } from "../pecas";
import { dias, fData, fEur, maiuscula, pessoa, prazoMulta, quemConduzia, resolverOcorrencia, viatura, type EstadoOcorr, type Ocorrencia, type Tom } from "../dados";

export const TOM_OCORR: Record<EstadoOcorr, Tom> = { "por identificar": "bad", identificado: "info", "em resolução": "warn", participado: "info", resolvido: "ok", registada: "neu" };

export function OcorrenciasFrota() {
  const { F, dlg, agir, confirmar } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const base = F.ocorr;
  const pend = (o: Ocorrencia) => o.tipo === "Multa" && o.estado === "por identificar";
  const l = base.filter((o) => vista === "todas" || (vista === "pend" ? pend(o) : o.tipo === vista)).sort((a, b) => b.quando.localeCompare(a.quando));
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Ocorrências" texto="Multas, sinistros e avarias. Numa multa, o condutor é sugerido a partir da atribuição em vigor no dia e hora da infração."
        acoes={<BotaoFrota variant="default" escrita icone={Plus} aoClicar={() => dlg("ocorrencia")}>Registar ocorrência</BotaoFrota>} />
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <FilterPills ariaLabel="Vistas" value={vista} onChange={setVista} options={[
          { value: "todas", label: "Todas", count: base.length },
          { value: "pend", label: "Multas por identificar", count: base.filter(pend).length },
          { value: "Multa", label: "Multas", count: base.filter((o) => o.tipo === "Multa").length },
          { value: "Sinistro", label: "Sinistros", count: base.filter((o) => o.tipo === "Sinistro").length },
          { value: "Avaria", label: "Avarias", count: base.filter((o) => o.tipo === "Avaria").length },
        ]} />
      </div>
      {l.length ? (
        <Tabela>
          <Table>
            <caption className="sr-only">Ocorrências</caption>
            <TableHeader><TableRow>
              <TableHead>Quando</TableHead><TableHead>Viatura</TableHead><TableHead>Tipo</TableHead><TableHead>O que aconteceu</TableHead>
              <TableHead>Condutor</TableHead><TableHead>Prazo</TableHead><TableHead>Estado</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {l.map((o) => {
                const sug = quemConduzia(F, o.vid, o.quando), pz = pend(o) ? prazoMulta(o) : null;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap">{fData(o.quando.slice(0, 10))}<div className="text-xs text-muted-foreground">{o.quando.slice(11)}</div></TableCell>
                    <TableCell><Placa mat={viatura(F, o.vid)?.mat ?? ""} /></TableCell>
                    <TableCell><Selo tom={o.tipo === "Multa" ? "violet" : o.tipo === "Sinistro" ? "warn" : "neu"}>{o.tipo}</Selo></TableCell>
                    <TableCell><div className="flex flex-col"><span>{o.desc}</span><span className="text-xs text-muted-foreground">{o.local}{o.valor ? " · " + fEur(o.valor) : ""}{o.fotos ? ` · ${o.fotos} fotos` : ""}</span></div></TableCell>
                    <TableCell>{o.pid ? pessoa(F, o.pid)?.nome : <div className="flex flex-col items-start gap-1"><Selo tom="bad">Por identificar</Selo>{sug ? <span className="text-xs text-muted-foreground">Sugestão: {sug.nome}</span> : null}</div>}</TableCell>
                    <TableCell>{pz ? <div className="flex flex-col items-start gap-1"><span>{fData(pz)}</span><Selo tom={dias(pz) <= 7 ? "bad" : "warn"}>{`Faltam ${dias(pz)} d`}</Selo></div> : "—"}</TableCell>
                    <TableCell><Selo tom={TOM_OCORR[o.estado] ?? "neu"}>{maiuscula(o.estado)}</Selo></TableCell>
                    <TableCell className="text-right">{pz ? <BotaoFrota escrita aoClicar={() => dlg("identificar", { o: o.id })}>Identificar condutor</BotaoFrota>
                      : o.estado !== "resolvido" ? <BotaoFrota escrita aoClicar={() => confirmar({
                        titulo: "Marcar a ocorrência como resolvida", ok: "Marcar resolvida",
                        texto: `${o.tipo} da ${viatura(F, o.vid)?.mat ?? "viatura"} de ${fData(o.quando.slice(0, 10))}: ${o.desc}`,
                        aoConfirmar: () => agir((G) => resolverOcorrencia(G, o.id), (m) => m),
                      })}>Marcar resolvida</BotaoFrota> : null}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Tabela>
      ) : <Vazio titulo="Sem ocorrências nesta vista" texto="Escolhe outro filtro." />}
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />O prazo da multa conta 15 dias úteis desde a notificação, o prazo habitual para identificar o condutor.</p>
    </div>
  );
}
