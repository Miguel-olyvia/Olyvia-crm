// Os Documentos: seguro, IPO, IUC e contratos de renting ou leasing de cada viatura ativa (fleet_compliance atual), com
// os vencidos e os próximos 30 e 90 dias. "Renovar" grava a nova validade (rpc_fleet_renew_compliance: histórico + custo).
// Os ficheiros (DUA, apólice, certificado) estão na ficha da viatura › Documentos (documents, entity_type='vehicle').
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FleetVehicleView } from "@/integrations/supabase/fleetTypes";
import { FilterPills } from "../inventarioUi";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Selo, Tabela, VRef, Vazio, useVista } from "../pecas";
import { VENC, ativa, dias, fData, textoData, tomSelo, useReferenciaFrota, vencimentos, type Vencimento } from "../dados";

type Linha = Vencimento & { v: FleetVehicleView; data: string };

export function DocumentosFrota() {
  const { F, dlg, abrir } = useFrotaCtx();
  const fornecedores = useReferenciaFrota("fornecedores");
  const [vista, setVista] = useVista();
  const all = F.viaturas.filter(ativa).flatMap((v) => vencimentos(v).map((x) => ({ v, ...x }))).filter((x): x is Linha => !!x.data);
  const cumpre = (x: Linha, k: string) => k === "todas" || (k === "vencidos" ? dias(x.data, F.hoje) < 0 : k === "30d" ? dias(x.data, F.hoje) >= 0 && dias(x.data, F.hoje) <= 30 : dias(x.data, F.hoje) >= 0 && dias(x.data, F.hoje) <= 90);
  const rows = all.filter((x) => cumpre(x, vista)).sort((a, b) => a.data.localeCompare(b.data));
  const entidade = (x: Linha) => (x.k === "insurance" ? fornecedores.dados.find((f) => f.id === x.v.insurer_supplier_id)?.nome ?? "Seguradora"
    : x.k === "inspection" ? "Centro de inspeções" : x.k === "road_tax" ? "Autoridade Tributária" : fornecedores.dados.find((f) => f.id === x.v.lessor_supplier_id)?.nome ?? "Locadora");
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Documentos" texto="Seguro, inspeção periódica, IUC e contratos de renting ou leasing. Os ficheiros (DUA, apólice, certificado de inspeção) ficam na ficha de cada viatura." />
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
              <TableHead>Estado</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.v.id + x.k}>
                  <TableCell><VRef v={x.v} /></TableCell>
                  <TableCell>{x.tipo}</TableCell>
                  <TableCell>{entidade(x)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fData(x.data)}</TableCell>
                  <TableCell><Selo tom={tomSelo(x.data, F.hoje)}>{textoData(x.data, F.hoje)}</Selo></TableCell>
                  <TableCell className="text-right">
                    <span className="flex justify-end gap-2">
                      <BotaoFrota aoClicar={() => abrir(x.v.id, "docs")} aria-label={`Ficheiros da ${x.v.plate}`}>Ficheiros</BotaoFrota>
                      <BotaoFrota requer="gerirOuCustos" aoClicar={() => dlg("renovar", { v: x.v.id, k: x.k })} aria-label={`Renovar ${VENC[x.k]} da ${x.v.plate}`}>Renovar</BotaoFrota>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Tabela>
      ) : <Vazio titulo={all.length ? "Nada nesta vista" : "Sem documentos"} texto={all.length ? "Nenhum documento cumpre este filtro." : "Os vencimentos aparecem quando criares viaturas (seguro, IPO, IUC)."} />}
    </div>
  );
}
