// Os Documentos (pgDocumentos do protótipo HTML): seguro, IPO, IUC e contratos de renting ou leasing de cada viatura ativa, com os vencidos e os
// próximos 30 e 90 dias. Os ficheiros (DUA, apólice, certificado) ficam em Documentos.
import { Paperclip } from "lucide-react";
import { Selo } from "../inventario/pecasInv";
import { dias, fData } from "./base";
import { useCtxFrota } from "./ctxFrota";
import { Btn, Cab, ChipF, Src, VRef, VazioF } from "./pecasFrota";
import { ativa, textoData, tomSelo, vencimentos, type Vencimento } from "./regras";
import type { ChaveVenc, Viatura } from "./tipos";

export function DocumentosFrota() {
  const { visiveis, f, dlg } = useCtxFrota();
  const chip = f.dchip || "todas";
  type Linha = Vencimento & { v: Viatura; data: string };
  const all = visiveis.filter(ativa).flatMap((v) => vencimentos(v).map((x) => ({ v, ...x }))).filter((x): x is Linha => !!x.data);
  const rows = all.filter((x) => chip === "todas" || (chip === "vencidos" ? dias(x.data) < 0 : chip === "30d" ? dias(x.data) >= 0 && dias(x.data) <= 30 : dias(x.data) >= 0 && dias(x.data) <= 90))
    .sort((a, b) => a.data.localeCompare(b.data));
  const entidade = (x: Linha) => (x.k === "seguro" ? x.v.seguradora : x.k === "ipo" ? "Centro de inspeções" : x.k === "iuc" ? "Autoridade Tributária" : "Locadora");
  return (
    <>
      <Cab titulo="Documentos" texto="Seguro, inspeção periódica, IUC e contratos de renting ou leasing. Os ficheiros (DUA, apólice, certificado de inspeção) ficam em Documentos."
        fonte={<Src nova t="fleet_documents_due (vencimentos) · documents (entity_type='vehicle') · alert_settings + job diário" />} />
      <div className="card filters">
        <div className="chips" role="group" aria-label="Vistas">
          <ChipF k="dchip" v="todas" n={all.length}>Todos</ChipF>
          <ChipF k="dchip" v="vencidos" n={all.filter((x) => dias(x.data) < 0).length}>Vencidos</ChipF>
          <ChipF k="dchip" v="30d" n={all.filter((x) => dias(x.data) >= 0 && dias(x.data) <= 30).length}>Próximos 30 dias</ChipF>
          <ChipF k="dchip" v="90d" n={all.filter((x) => dias(x.data) >= 0 && dias(x.data) <= 90).length}>Próximos 90 dias</ChipF>
        </div>
      </div>
      {rows.length ? (
        <div className="tw">
          <table className="min-900">
            <caption className="sr">Documentos e vencimentos</caption>
            <thead><tr><th>Viatura</th><th>Documento</th><th>Entidade</th><th>Validade</th><th>Estado</th><th>Ficheiro</th><th><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.v.id + x.k}>
                  <td><VRef v={x.v} /></td><td>{x.tipo}</td><td>{entidade(x)}</td><td>{fData(x.data)}</td>
                  <td><Selo tom={tomSelo(x.data)}>{textoData(x.data)}</Selo></td>
                  <td><span className="row" style={{ gap: 4 }}><Paperclip className="ic sm" aria-hidden="true" /><small>{x.k}-{x.v.mat}.pdf</small></span></td>
                  <td className="act">{x.k !== "contrato" ? <Btn pequeno acao="renovar" aoClicar={() => dlg("renovar", { v: x.v.id, k: x.k as ChaveVenc })}>Renovar</Btn> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="card"><VazioF titulo="Nada nesta vista" texto="Nenhum documento cumpre este filtro." /></div>}
    </>
  );
}
