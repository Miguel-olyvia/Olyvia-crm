// As Ocorrências (pgOcorrencias do protótipo HTML): multas, sinistros e avarias. Numa multa, o condutor sugere-se pela atribuição em vigor no dia
// da infração, e o prazo para o identificar conta 15 dias úteis desde a notificação.
import { Info, Plus } from "lucide-react";
import { Selo } from "../inventario/pecasInv";
import { dias, fData, fEur, maiuscula } from "./base";
import { resolverOcorrencia } from "./acoes";
import { useCtxFrota } from "./ctxFrota";
import { Btn, Cab, ChipF, Placa, Src, VazioF } from "./pecasFrota";
import { pessoa, prazoMulta, quemConduzia, viatura } from "./regras";
import type { EstadoOcorr, Tom } from "./tipos";

export const TOM_OCORR: Record<EstadoOcorr, Tom> = { "por identificar": "bad", identificado: "info", "em resolução": "warn", participado: "info", resolvido: "ok", registada: "neu" };

export function OcorrenciasFrota() {
  const { F, visiveis, f, dlg, agir } = useCtxFrota();
  const vis = new Set(visiveis.map((v) => v.id)), chip = f.ochip || "todas";
  const base = F.ocorr.filter((o) => vis.has(o.vid));
  const pend = (o: (typeof base)[number]) => o.tipo === "Multa" && o.estado === "por identificar";
  const l = base.filter((o) => chip === "todas" || (chip === "pend" ? pend(o) : o.tipo === chip)).sort((a, b) => b.quando.localeCompare(a.quando));
  return (
    <>
      <Cab titulo="Ocorrências" texto="Multas, sinistros e avarias. Numa multa, o condutor é sugerido a partir da atribuição em vigor no dia e hora da infração."
        acoes={<Btn primario icone={Plus} acao="ocorrencia" aoClicar={() => dlg("ocorrencia")}>Registar ocorrência</Btn>}
        fonte={<Src nova t="fleet_incidents (substitui a tabela órfã incidents) · documents para fotos" />} />
      <div className="card filters">
        <div className="chips" role="group" aria-label="Vistas">
          <ChipF k="ochip" v="todas" n={base.length}>Todas</ChipF>
          <ChipF k="ochip" v="pend" n={base.filter(pend).length}>Multas por identificar</ChipF>
          <ChipF k="ochip" v="Multa" n={base.filter((o) => o.tipo === "Multa").length}>Multas</ChipF>
          <ChipF k="ochip" v="Sinistro" n={base.filter((o) => o.tipo === "Sinistro").length}>Sinistros</ChipF>
          <ChipF k="ochip" v="Avaria" n={base.filter((o) => o.tipo === "Avaria").length}>Avarias</ChipF>
        </div>
      </div>
      {l.length ? (
        <div className="tw">
          <table className="min-900">
            <caption className="sr">Ocorrências</caption>
            <thead><tr><th>Quando</th><th>Viatura</th><th>Tipo</th><th>O que aconteceu</th><th>Condutor</th><th>Prazo</th><th>Estado</th><th><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {l.map((o) => {
                const sug = quemConduzia(F, o.vid, o.quando), pz = pend(o) ? prazoMulta(o) : null;
                return (
                  <tr key={o.id}>
                    <td>{fData(o.quando.slice(0, 10))}<br /><small className="muted">{o.quando.slice(11)}</small></td>
                    <td><Placa mat={viatura(F, o.vid)?.mat ?? ""} /></td>
                    <td><Selo tom={o.tipo === "Multa" ? "violet" : o.tipo === "Sinistro" ? "warn" : "neu"}>{o.tipo}</Selo></td>
                    <td><div className="stk"><span>{o.desc}</span><small className="muted">{o.local}{o.valor ? " · " + fEur(o.valor) : ""}{o.fotos ? ` · ${o.fotos} fotos` : ""}</small></div></td>
                    <td>{o.pid ? pessoa(F, o.pid)?.nome : <div className="stk"><Selo tom="bad">Por identificar</Selo>{sug ? <small className="muted">Sugestão: {sug.nome}</small> : null}</div>}</td>
                    <td>{pz ? <div className="stk"><span>{fData(pz)}</span><Selo tom={dias(pz) <= 7 ? "bad" : "warn"}>{`Faltam ${dias(pz)} d`}</Selo></div> : "—"}</td>
                    <td><Selo tom={TOM_OCORR[o.estado] ?? "neu"}>{maiuscula(o.estado)}</Selo></td>
                    <td className="act">{pz ? <Btn pequeno acao="identificar" aoClicar={() => dlg("identificar", { o: o.id })}>Identificar condutor</Btn>
                      : o.estado !== "resolvido" ? <Btn pequeno acao="identificar" aoClicar={() => agir((G) => resolverOcorrencia(G, o.id), (m) => m)}>Marcar resolvida</Btn> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="card"><VazioF titulo="Sem ocorrências nesta vista" texto="Escolhe outro filtro." /></div>}
      <p className="muted" style={{ marginTop: 10 }}><Info className="ic sm" aria-hidden="true" /> O prazo da multa conta 15 dias úteis desde a notificação, o prazo habitual para identificar o condutor.</p>
    </>
  );
}
