// Abastecimentos e custos (pgCustos do protótipo HTML): combustível, energia, portagens, estacionamento, oficina e rendas, cada despesa
// imputada a um centro de custo ou a uma obra do protótipo (a obra abre em Operações).
import { FileUp, Fuel, Plus } from "lucide-react";
import { Pesquisa, Selo } from "../inventario/pecasInv";
import { fData, fEur, fNum, soma } from "./base";
import { useCtxFrota } from "./ctxFrota";
import { Btn, Cab, KpiF, LigObra, Placa, Src, VazioF } from "./pecasFrota";
import { pessoa, viatura } from "./regras";
import { TIPOS_CUSTO, obraDoCentro } from "./seed";

export function CustosFrota() {
  const { F, visiveis, perfil, f, setF, abrir, dlg } = useCtxFrota();
  const vis = new Set(visiveis.map((v) => v.id));
  const tf = f.ctipo || "", vf = f.cvia || "", q = (f.cq || "").toLowerCase();
  const todos = F.custos.filter((c) => vis.has(c.vid));
  const l = todos.filter((c) => (!tf || c.tipo === tf) && (!vf || c.vid === vf) && (!q || (c.fonte + (c.centro || "") + (viatura(F, c.vid)?.mat ?? "") + (c.nota || "")).toLowerCase().includes(q)))
    .sort((a, b) => b.data.localeCompare(a.data));
  const out = todos.filter((c) => c.data >= "2026-10-01");
  const comb = soma(todos.filter((c) => c.tipo === "Combustível" || c.tipo === "Carregamento"), (c) => c.valor);
  const tec = perfil === "tecnico", primeira = visiveis[0]?.id;
  return (
    <>
      <Cab titulo="Abastecimentos e custos" texto="Combustível, carregamentos, portagens, estacionamento, oficina e rendas. Cada despesa fica imputada a um centro de custo ou a uma obra."
        acoes={<>
          <Btn icone={FileUp} acao="importar" aoClicar={() => dlg("importar")}>Importar extrato</Btn>
          {tec ? <Btn primario icone={Fuel} acao="abastecer" aoClicar={() => dlg("abastecer", { v: primeira })}>Registar abastecimento</Btn>
            : <Btn primario icone={Plus} acao="despesa" aoClicar={() => dlg("despesa")}>Registar despesa</Btn>}
        </>}
        fonte={<Src nova t="fleet_expenses (fornecedor → suppliers, centro → ops_centro_custo, obra → ops_obra)" />} />
      <div className="kpis">
        <KpiF rotulo="Total no período" valor={fEur(soma(todos, (c) => c.valor))} nota="1 set a 14 out 2026" />
        <KpiF rotulo="Em outubro" valor={fEur(soma(out, (c) => c.valor))} nota={`${out.length} lançamentos`} />
        <KpiF rotulo="Combustível e energia" valor={fEur(comb)} nota={`${fNum(soma(todos.filter((c) => c.un === "L"), (c) => c.qtd), 0)} L · ${fNum(soma(todos.filter((c) => c.un === "kWh"), (c) => c.qtd), 0)} kWh`} />
        <KpiF rotulo="Portagens" valor={fEur(soma(todos.filter((c) => c.tipo === "Portagens"), (c) => c.valor))} nota="extrato Via Verde de setembro" fonte={<Src nova t="importação do extrato Via Verde (CSV)" />} />
      </div>
      <div className="card filters">
        <div className="frow">
          <Pesquisa rotulo="Fornecedor, centro de custo, obra" valor={f.cq || ""} aoMudar={(v) => setF("cq", v)} />
          <select aria-label="Tipo" value={tf} onChange={(e) => setF("ctipo", e.target.value)}>
            <option value="">Todos os tipos</option>{TIPOS_CUSTO.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select aria-label="Viatura" value={vf} onChange={(e) => setF("cvia", e.target.value)}>
            <option value="">Todas as viaturas</option>{visiveis.map((v) => <option key={v.id} value={v.id}>{v.mat}</option>)}
          </select>
        </div>
      </div>
      {l.length ? (
        <>
          <div className="tw">
            <table className="min-900">
              <caption className="sr">Despesas</caption>
              <thead><tr><th>Data</th><th>Viatura</th><th>Tipo</th><th>Origem</th><th>Centro de custo / obra</th><th className="num">Quantidade</th><th className="num">Km</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {l.map((c) => {
                  const ob = obraDoCentro(c.centro);
                  return (
                    <tr key={c.id} className="click" tabIndex={0} data-vid={c.vid} onClick={() => abrir(c.vid, "custos")} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) abrir(c.vid, "custos"); }}>
                      <td>{fData(c.data)}</td>
                      <td><Placa mat={viatura(F, c.vid)?.mat ?? ""} /></td>
                      <td>{c.tipo}{c.rever ? <> <Selo tom="warn">Rever km</Selo></> : null}</td>
                      <td><div className="stk"><span>{c.fonte}</span>{c.pid ? <small className="muted">{pessoa(F, c.pid)?.nome}</small> : null}</div></td>
                      <td>{ob ? <Selo tom="violet"><LigObra id={ob}>{c.centro}</LigObra></Selo> : c.centro || "—"}</td>
                      <td className="num">{c.qtd ? `${fNum(c.qtd, 1)} ${c.un}` : "—"}</td>
                      <td className="num">{c.km ? fNum(c.km) : "—"}</td>
                      <td className="num"><b>{fEur(c.valor)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="tbl-foot"><span>{l.length} lançamento(s)</span><b>Total {fEur(soma(l, (c) => c.valor))}</b></div>
        </>
      ) : <div className="card"><VazioF titulo="Sem despesas com estes filtros" texto="Muda o tipo ou a viatura." /></div>}
    </>
  );
}
