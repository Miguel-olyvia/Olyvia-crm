// A Manutenção (pgManutencao do protótipo HTML): o plano de revisões (por km ou por data, a que chegar primeiro) e as intervenções.
// As oficinas são fornecedores do Inventário; uma manutenção marcada bloqueia a viatura na agenda nesse dia.
import { CalendarPlus } from "lucide-react";
import { Selo } from "../inventario/pecasInv";
import { fData, fEur, fKm, maiuscula, soma } from "./base";
import { useCtxFrota } from "./ctxFrota";
import { Btn, Cab, ChipF, KpiF, Placa, Prog, Src, VRef } from "./pecasFrota";
import { ativa, revisao, viatura } from "./regras";
import type { EstadoManut, Tom } from "./tipos";

const EB: Record<EstadoManut, Tom> = { agendada: "info", "em curso": "warn", "concluída": "ok" };

export function ManutencaoFrota() {
  const { F, visiveis, f, setF, dlg } = useCtxFrota();
  const vs = visiveis.filter(ativa), chip = f.mchip || "todas";
  const planos = vs.filter((v) => chip !== "rev" || revisao(v).tom !== "ok").sort((a, b) => revisao(a).faltaKm - revisao(b).faltaKm);
  const ids = new Set(visiveis.map((v) => v.id));
  const ev = F.manut.filter((m) => ids.has(m.vid)).sort((a, b) => b.data.localeCompare(a.data));
  const mes = soma(ev.filter((m) => m.estado === "concluída" && m.data >= "2026-10-01"), (m) => m.valor) + soma(ev.filter((m) => m.estado === "em curso"), (m) => m.valor);
  const emCurso = ev.filter((m) => m.estado === "em curso");
  return (
    <>
      <Cab titulo="Manutenção" texto="Revisões por km ou por data (a que chegar primeiro), inspeções e reparações. As oficinas são fornecedores do Inventário."
        acoes={<Btn primario icone={CalendarPlus} acao="manut" aoClicar={() => dlg("manut")}>Agendar manutenção</Btn>}
        fonte={<Src nova t="fleet_maintenance_plans · fleet_maintenance_events · suppliers" />} />
      <div className="kpis">
        <KpiF rotulo="Agendadas" valor={ev.filter((m) => m.estado === "agendada").length} nota="próximos 15 dias" />
        <KpiF rotulo="Em curso" valor={emCurso.length} nota={emCurso.map((m) => viatura(F, m.vid)?.mat).join(", ")} tom="warn" />
        <KpiF rotulo="Revisões a fazer" valor={vs.filter((v) => revisao(v).tom !== "ok").length} nota="por km ou por data" tom="bad" aoClicar={() => setF("mchip", "rev")} />
        <KpiF rotulo="Custo em outubro" valor={fEur(mes)} nota="inclui orçamentos em curso" />
      </div>
      <section aria-labelledby="fr-plano">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 id="fr-plano">Plano de revisões</h2>
          <div className="chips" role="group" aria-label="Vistas"><ChipF k="mchip" v="todas">Todas</ChipF><ChipF k="mchip" v="rev">Só as que precisam</ChipF></div>
        </div>
        <div className="tw">
          <table className="min-900">
            <thead><tr><th>Viatura</th><th className="num">Km atuais</th><th>Regra</th><th>Última</th><th>Próxima</th><th>Estado</th><th><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {planos.map((v) => {
                const r = revisao(v);
                return (
                  <tr key={v.id}>
                    <td><VRef v={v} /></td><td className="num">{fKm(v.km)}</td><td>A cada {fKm(v.rev.cadaKm)} ou {v.rev.cadaMeses} meses</td>
                    <td>{fKm(v.rev.ultKm)}<br /><small className="muted">{fData(v.rev.ultData)}</small></td>
                    <td>{fKm(r.nextKm)}<br /><small className="muted">até {fData(r.nextData)}</small></td>
                    <td><div className="stk"><Prog tom={r.tom} pct={r.pct} /><Selo tom={r.tom}>{r.txt}</Selo></div></td>
                    <td className="act">{r.tom !== "ok" ? <Btn pequeno acao="manut" aoClicar={() => dlg("manut", { v: v.id })}>Agendar</Btn> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="sec" aria-labelledby="fr-interv">
        <h2 id="fr-interv">Intervenções</h2>
        <div className="tw">
          <table className="min-900">
            <thead><tr><th>Data</th><th>Viatura</th><th>Intervenção</th><th>Oficina</th><th>Estado</th><th className="num">Valor</th><th><span className="sr">Ações</span></th></tr></thead>
            <tbody>
              {ev.map((m) => (
                <tr key={m.id}>
                  <td>{fData(m.data)}{m.prev ? <><br /><small className="muted">prev. {fData(m.prev)}</small></> : null}</td>
                  <td><Placa mat={viatura(F, m.vid)?.mat ?? ""} /></td>
                  <td><div className="stk"><span>{m.tipo}</span>{m.nota ? <small className="muted">{m.nota}</small> : null}</div></td>
                  <td>{m.oficina}</td>
                  <td><Selo tom={EB[m.estado]}>{maiuscula(m.estado)}</Selo></td>
                  <td className="num">{fEur(m.valor)}</td>
                  <td className="act">{m.estado !== "concluída" ? <Btn pequeno acao="manut" aoClicar={() => dlg("concluir", { m: m.id })}>Concluir</Btn> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
