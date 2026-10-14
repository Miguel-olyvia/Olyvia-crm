// Os Documentos (pgDocumentos do protótipo): seguro, IPO, IUC e contratos de renting ou leasing de cada viatura ativa,
// com os vencidos e os próximos 30 e 90 dias. "Renovar" grava a nova validade (e o valor, se houver, nos custos).
import { Paperclip } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPills } from "@/components/frota-exemplo/inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Selo, Tabela, VRef, Vazio, useVista } from "../pecas";
import { ativa, dias, fData, textoData, tomSelo, vencimentos, type ChaveVenc, type Vencimento, type Viatura } from "../dados";

type Linha = Vencimento & { v: Viatura; data: string };

export function DocumentosFrota() {
  const { F, dlg } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const all = F.viaturas.filter(ativa).flatMap((v) => vencimentos(v).map((x) => ({ v, ...x }))).filter((x): x is Linha => !!x.data);
  const cumpre = (x: Linha, k: string) => k === "todas" || (k === "vencidos" ? dias(x.data) < 0 : k === "30d" ? dias(x.data) >= 0 && dias(x.data) <= 30 : dias(x.data) >= 0 && dias(x.data) <= 90);
  const rows = all.filter((x) => cumpre(x, vista)).sort((a, b) => a.data.localeCompare(b.data));
  const entidade = (x: Linha) => (x.k === "seguro" ? x.v.seguradora : x.k === "ipo" ? "Centro de inspeções" : x.k === "iuc" ? "Autoridade Tributária" : "Locadora");
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Documentos" texto="Seguro, inspeção periódica, IUC e contratos de renting ou leasing. Os ficheiros (DUA, apólice, certificado de inspeção) ficarão em Documentos." />
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <FilterPills ariaLabel="Vistas" value={vista} onChange={setVista}
          options={([["todas", "Todos"], ["vencidos", "Vencidos"], ["30d", "Próximos 30 dias"], ["90d", "Próximos 90 dias"]] as const).map(([value, label]) => ({ value, label, count: all.filter((x) => cumpre(x, value)).length }))} />
      </div>
      {rows.length ? (
        <Tabela>
          <Table>
            <caption className="sr-only">Documentos e vencimentos</caption>
            <TableHeader><TableRow>
              <TableHead>Viatura</TableHead><TableHead>Documento</TableHead><TableHead>Entidade</TableHead><TableHead>Validade</TableHead>
              <TableHead>Estado</TableHead><TableHead>Ficheiro</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.v.id + x.k}>
                  <TableCell><VRef v={x.v} /></TableCell>
                  <TableCell>{x.tipo}</TableCell>
                  <TableCell>{entidade(x)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fData(x.data)}</TableCell>
                  <TableCell><Selo tom={tomSelo(x.data)}>{textoData(x.data)}</Selo></TableCell>
                  <TableCell><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{x.k}-{x.v.mat}.pdf</span></TableCell>
                  <TableCell className="text-right">{x.k !== "contrato" ? <BotaoFrota escrita aoClicar={() => dlg("renovar", { v: x.v.id, k: x.k as ChaveVenc })} aria-label={`Renovar ${x.tipo} da ${x.v.mat}`}>Renovar</BotaoFrota> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Tabela>
      ) : <Vazio titulo="Nada nesta vista" texto="Nenhum documento cumpre este filtro." />}
    </div>
  );
}
