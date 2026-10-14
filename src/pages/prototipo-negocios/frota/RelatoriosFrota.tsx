// Os Relatórios (pgRelatorios do protótipo HTML): custo total de posse, custo por km, consumo e utilização de 1/9 a 14/10. As barras são feitas
// à mão (sem biblioteca), com "Ver como tabela"; o custo por centro de custo e por obra liga às obras do protótipo.
import { BarChart3, Lightbulb, Table } from "lucide-react";
import { Selo } from "../inventario/pecasInv";
import { HOJE, INICIO_PERIODO, d2n, fEur, fNum, soma } from "./base";
import { useCtxFrota } from "./ctxFrota";
import { Btn, Cab, KpiF, LigObra, Src, VRef, VazioF } from "./pecasFrota";
import { consumo, custoKm, custoTotal, custosV, kmPeriodo, utilizacao } from "./regras";
import { obraDoCentro } from "./seed";

const CAT: readonly (readonly [string, readonly string[], string])[] = [
  ["Combustível e energia", ["Combustível", "Carregamento"], "--c1"], ["Portagens e estacionamento", ["Portagens", "Estacionamento"], "--c2"],
  ["Oficina e manutenção", ["Oficina"], "--c3"], ["Renting e leasing", ["Renting / leasing"], "--c4"], ["Outros", ["Lavagem", "Seguro", "IUC", "Outro"], "--c5"],
];

export function RelatoriosFrota() {
  const { F, perfil, f, setF, abrir, obras } = useCtxFrota();
  if (perfil === "tecnico") return (
    <>
      <Cab titulo="Relatórios" texto="Custos e utilização da frota." />
      <div className="card"><VazioF titulo="Os relatórios são para a gestão e o financeiro" texto="Muda o perfil em “A ver como” para os ver." /></div>
    </>
  );
  const vs = F.viaturas.filter((v) => custosV(F, v.id).length);
  const max = Math.max(1, ...vs.map((v) => custoTotal(F, v.id)));
  const totalKm = soma(vs, (v) => kmPeriodo(F, v.id)), total = soma(F.custos, (c) => c.valor);
  const porCentro: Record<string, number> = {};
  for (const c of F.custos) { const k = c.centro || "Sem centro"; porCentro[k] = (porCentro[k] || 0) + c.valor; }
  const diasPer = d2n(HOJE) - d2n(INICIO_PERIODO) + 1;
  const tabela = f.rtab === "1";
  const somaCat = (vid: string, tipos: readonly string[]) => soma(custosV(F, vid).filter((x) => tipos.includes(x.tipo)), (x) => x.valor);
  const ordenadas = [...vs].sort((a, b) => custoTotal(F, b.id) - custoTotal(F, a.id));
  return (
    <>
      <Cab titulo="Relatórios" texto="Custo total de posse, custo por km, consumo e utilização, de 1 de setembro a 14 de outubro de 2026."
        acoes={<Btn icone={tabela ? BarChart3 : Table} aoClicar={() => setF("rtab", tabela ? "0" : "1")}>{tabela ? "Ver como gráfico" : "Ver como tabela"}</Btn>}
        fonte={<Src nova t="rpc_fleet_cost_report (nova) sobre fleet_expenses + fleet_odometer_readings" />} />
      <div className="kpis">
        <KpiF rotulo="Custo total" valor={fEur(total)} nota={`${F.custos.length} lançamentos`} />
        <KpiF rotulo="Km percorridos" valor={fNum(totalKm)} nota="toda a frota" />
        <KpiF rotulo="Custo por km" valor={totalKm ? fEur(total / totalKm) : "—"} nota="média ponderada" />
        <KpiF rotulo="Custo médio por viatura/mês" valor={vs.length ? fEur(total / vs.length / (diasPer / 30.4)) : "—"} nota={`${vs.length} viaturas com custos`} />
      </div>
      <div className="two">
        <section className="card pad" aria-labelledby="fr-custo-v">
          <h2 id="fr-custo-v" style={{ marginBottom: 10 }}>Custo por viatura</h2>
          {tabela ? (
            <div className="tw" style={{ boxShadow: "none" }}>
              <table className="min-560">
                <caption className="sr">Custo por viatura e por categoria</caption>
                <thead><tr><th>Viatura</th>{CAT.map((c) => <th key={c[0]} className="num">{c[0]}</th>)}<th className="num">Total</th></tr></thead>
                <tbody>{vs.map((v) => <tr key={v.id}><td>{v.mat}</td>{CAT.map((c) => <td key={c[0]} className="num">{fEur(somaCat(v.id, c[1]))}</td>)}<td className="num"><b>{fEur(custoTotal(F, v.id))}</b></td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="legend" style={{ marginBottom: 12 }}>{CAT.map((c) => <span key={c[0]}><i style={{ background: `var(${c[2]})` }} />{c[0]}</span>)}</div>
              <div className="bars" role="img" aria-label={`Custo por viatura: ${ordenadas.map((v) => `${v.mat} ${fEur(custoTotal(F, v.id))}`).join("; ")}`}>
                {ordenadas.map((v) => (
                  <div key={v.id} className="bar-row">
                    <span className="mono">{v.mat}</span>
                    <div className="bar" style={{ width: `${(custoTotal(F, v.id) / max) * 100}%` }}>
                      {CAT.map((c) => { const s = somaCat(v.id, c[1]); return s ? <span key={c[0]} style={{ width: `${(s / custoTotal(F, v.id)) * 100}%`, background: `var(${c[2]})` }} title={`${c[0]}: ${fEur(s)}`} /> : null; })}
                    </div>
                    <span className="num">{fEur(custoTotal(F, v.id))}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="card pad" aria-labelledby="fr-centro">
          <h2 id="fr-centro" style={{ marginBottom: 10 }}>Por centro de custo e obra</h2>
          <div className="vlist">
            {Object.entries(porCentro).sort((a, b) => b[1] - a[1]).map(([k, val]) => {
              const ob = obraDoCentro(k), o = ob ? obras.find((x) => x.id === ob) : undefined;
              return (
                <div key={k}>
                  <span>{ob ? <><Selo tom="violet"><LigObra id={ob}>{k}</LigObra></Selo> <small className="muted">{o ? `${o.servico} · ${o.nome}, ${o.local}` : ""}</small></> : k}</span>
                  <b className="num">{fEur(val)}</b>
                </div>
              );
            })}
          </div>
          <Src t="ops_centro_custo · ops_obra (custo de deslocação real)" />
        </section>
      </div>
      <section className="sec" aria-labelledby="fr-efic">
        <h2 id="fr-efic">Eficiência por viatura</h2>
        <div className="tw">
          <table className="min-900">
            <thead><tr><th>Viatura</th><th>Combustível</th><th className="num">Km no período</th><th className="num">Consumo</th><th className="num">Custo/km</th><th className="num">Utilização</th></tr></thead>
            <tbody>
              {vs.map((v) => {
                const c = consumo(F, v.id), u = utilizacao(F, v), k = custoKm(F, v.id);
                return (
                  <tr key={v.id} className="click" tabIndex={0} data-vid={v.id} onClick={() => abrir(v.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) abrir(v.id); }}>
                    <td><VRef v={v} /></td><td>{v.comb}</td><td className="num">{fNum(kmPeriodo(F, v.id))}</td>
                    <td className="num">{c ? `${fNum(c, 1)}${v.comb === "Elétrico" ? " kWh" : " L"}/100 km` : "—"}</td>
                    <td className="num">{k != null ? fEur(k) : "—"}</td>
                    <td className="num"><div className="row" style={{ justifyContent: "flex-end" }}><div className={u < 50 ? "prog warn" : "prog"} aria-hidden="true"><span style={{ width: `${u}%` }} /></div>{fNum(u)}%</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="alert info" style={{ marginTop: 12 }}>
          <Lightbulb className="ic" aria-hidden="true" />
          <span>Hoje as Operações usam 0,40 €/km fixos para a deslocação das obras (<code>sugestaoFichaLocal.ts</code>). Com a frota, passa a usar o custo por km real da viatura atribuída: média atual de <b>{totalKm ? fEur(total / totalKm) : "—"}</b>/km.</span>
        </div>
      </section>
    </>
  );
}
