// As Viaturas (pgViaturas do protótipo HTML): KPI que filtram, chips de vista com a contagem, pesquisa, combustível e posse, e a lista
// (tabela) ou os cartões. Cada viatura abre a ficha.
import { LayoutGrid, List, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pesquisa, Selo } from "../inventario/pecasInv";
import { fData, fEur, fKm, fNum, soma } from "./base";
import { useCtxFrota, type CtxFrota } from "./ctxFrota";
import { Btn, Cab, ChipF, KpiF, Placa, Prog, SeloEstado, Src, VRef, VazioF } from "./pecasFrota";
import { abaixoMin, alertas, atribEm, ativa, condutor, custoKm, custoTotal, kmPeriodo, proxVenc, revisao, textoData, tomData } from "./regras";
import type { Viatura } from "./tipos";

/** A lista filtrada (filtraViaturas do HTML), com a vista `chip` (por omissão a do filtro atual). */
export function filtrarViaturas(ctx: Pick<CtxFrota, "F" | "visiveis" | "f" | "stock">, chip = ctx.f.vchip || "todas"): Viatura[] {
  const { F, f } = ctx, q = (f.vq || "").toLowerCase().replace(/-/g, ""), comb = f.vcomb || "", posse = f.vposse || "";
  return ctx.visiveis.filter((v) => {
    if (chip === "ativas" && v.estado !== "ativa") return false;
    if (chip === "livres" && !(v.estado === "ativa" && !atribEm(F, v.id))) return false;
    if (chip === "oficina" && v.estado !== "oficina") return false;
    if (chip === "alertas" && !alertas(F, v, ctx.stock(v.id)).length) return false;
    if (chip === "stock" && !abaixoMin(ctx.stock(v.id)).length) return false;
    if (chip === "inativas" && ativa(v)) return false;
    if (chip !== "inativas" && chip !== "todas" && !ativa(v)) return false;
    if (comb && v.comb !== comb) return false;
    if (posse && v.posse !== posse) return false;
    if (q && !(v.mat + v.marca + v.modelo + (condutor(F, v.id)?.nome ?? "")).toLowerCase().replace(/-/g, "").includes(q)) return false;
    return true;
  });
}

const ALTERNATIVA = (n: number) => n + (n > 1 ? " alertas" : " alerta");

export function ViaturasFrota() {
  const ctx = useCtxFrota();
  const { F, visiveis, f, setF, abrir, dlg, stock } = ctx;
  const at = visiveis.filter(ativa), lista = filtrarViaturas(ctx), modo = f.modo || "lista";
  const ck = at.map((v) => custoKm(F, v.id)).filter((x) => x != null);
  const cnt = (k: string) => filtrarViaturas(ctx, k).length;
  const paradas = at.filter((v) => v.estado !== "ativa");
  const linha = (v: Viatura) => {
    const r = revisao(v), pv = proxVenc(v), al = alertas(F, v, stock(v.id)), c = condutor(F, v.id), k = custoKm(F, v.id);
    return (
      <tr key={v.id} className={cn("click", !ativa(v) && "apagada")} tabIndex={0} data-vid={v.id} aria-label={`Abrir a ${v.mat}`}
        onClick={() => abrir(v.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) abrir(v.id); }}>
        <td><VRef v={v} /></td>
        <td><SeloEstado v={v} />{v.pool ? <> <Selo tom="violet">Partilhada</Selo></> : null}</td>
        <td>{c ? <div className="stk"><span>{c.nome}</span><small className="muted">{c.equipa}</small></div> : <span className="muted">{v.pool && ativa(v) ? "Livre para reserva" : "—"}</span>}</td>
        <td className="num">{fKm(v.km)}</td>
        <td>{pv && ativa(v) ? <div className="stk"><span>{pv.tipo} · {fData(pv.data)}</span><Selo tom={tomData(pv.data)}>{textoData(pv.data)}</Selo></div> : "—"}</td>
        <td>{ativa(v) ? <div className="stk"><Prog tom={r.tom} pct={r.pct} /><small className={r.tom === "ok" ? "muted" : undefined}>{r.txt}</small></div> : "—"}</td>
        <td className="num">{k != null ? fEur(k) : "—"}</td>
        <td>{al.length ? <Selo tom={al.some((a) => a.tom === "bad") ? "bad" : "warn"}>{ALTERNATIVA(al.length)}</Selo> : ativa(v) ? <Selo tom="ok">Em dia</Selo> : null}</td>
      </tr>
    );
  };
  const cartao = (v: Viatura) => {
    const c = condutor(F, v.id), r = revisao(v), al = alertas(F, v, stock(v.id)), k = custoKm(F, v.id);
    return (
      <button key={v.id} type="button" className="card whcard" data-vid={v.id} onClick={() => abrir(v.id)}>
        <div className="row between"><Placa mat={v.mat} grande /><SeloEstado v={v} /></div>
        <div><b>{v.marca} {v.modelo}</b><div className="muted">{v.tipo} · {v.comb} · {v.posse}</div></div>
        <div className="row"><UserRound className="ic sm" aria-hidden="true" />{c ? c.nome : <span className="muted">{v.pool ? "Livre para reserva" : "Sem condutor"}</span>}</div>
        <div className="stats">
          <div><b>{fNum(v.km / 1000, 1)}k</b><span>km</span></div>
          <div><b>{k != null ? fEur(k) : "—"}</b><span>custo/km</span></div>
          <div><b>{al.length}</b><span>alertas</span></div>
        </div>
        {ativa(v) ? <div className="row"><Prog tom={r.tom} pct={r.pct} /><small className="muted">Revisão · {r.txt.toLowerCase()}</small></div> : <small className="muted">{v.motivo || ""}</small>}
      </button>
    );
  };
  return (
    <>
      <Cab titulo="Viaturas" texto="Todas as viaturas da organização, com estado, condutor, vencimentos e custo por km de 1 set a 14 out."
        acoes={<>
          <Btn icone={modo === "lista" ? LayoutGrid : List} aoClicar={() => setF("modo", modo === "lista" ? "cartoes" : "lista")}>{modo === "lista" ? "Ver cartões" : "Ver lista"}</Btn>
          <Btn primario icone={Plus} acao="nova" aoClicar={() => dlg("nova")}>Nova viatura</Btn>
        </>}
        fonte={<Src nova t="fleet_vehicles (organization_id, RLS fleet.view)" />} />
      <div className="kpis">
        <KpiF rotulo="Ativas" valor={at.filter((v) => v.estado === "ativa").length} nota={`de ${at.length} na frota`} aoClicar={() => setF("vchip", "ativas")} />
        <KpiF rotulo="Em oficina ou paradas" valor={paradas.length} nota={paradas.map((v) => v.mat).join(", ") || "Nenhuma"} tom="warn" aoClicar={() => setF("vchip", "oficina")} />
        <KpiF rotulo="Com alertas" valor={at.filter((v) => alertas(F, v, stock(v.id)).length).length} nota="vencimentos, revisões, stock" tom="bad" aoClicar={() => setF("vchip", "alertas")} />
        <KpiF rotulo="Custo por km" valor={ck.length ? fEur(soma(at, (v) => custoTotal(F, v.id)) / soma(at, (v) => kmPeriodo(F, v.id))) : "—"} nota="média da frota no período" fonte={<Src nova t="fleet_expenses ÷ fleet_odometer_readings" />} />
      </div>
      <div className="card filters">
        <div className="chips" role="group" aria-label="Vistas">
          <ChipF k="vchip" v="todas" n={cnt("todas")}>Todas</ChipF><ChipF k="vchip" v="ativas" n={cnt("ativas")}>Ativas</ChipF>
          <ChipF k="vchip" v="livres" n={cnt("livres")}>Livres hoje</ChipF><ChipF k="vchip" v="oficina" n={cnt("oficina")}>Em oficina</ChipF>
          <ChipF k="vchip" v="alertas" n={cnt("alertas")}>Com alertas</ChipF><ChipF k="vchip" v="stock" n={cnt("stock")}>Stock baixo</ChipF>
          <ChipF k="vchip" v="inativas" n={cnt("inativas")}>Vendidas e inativas</ChipF>
        </div>
        <div className="frow">
          <Pesquisa rotulo="Matrícula, modelo ou condutor" valor={f.vq || ""} aoMudar={(v) => setF("vq", v)} />
          <select aria-label="Combustível" value={f.vcomb || ""} onChange={(e) => setF("vcomb", e.target.value)}>
            {[["", "Todos os combustíveis"], ["Gasóleo", "Gasóleo"], ["Híbrido", "Híbrido"], ["Elétrico", "Elétrico"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Posse" value={f.vposse || ""} onChange={(e) => setF("vposse", e.target.value)}>
            {[["", "Própria, renting e leasing"], ["Própria", "Própria"], ["Renting", "Renting"], ["Leasing", "Leasing"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      {!lista.length ? <div className="card"><VazioF titulo="Nenhuma viatura com estes filtros" texto="Limpa a pesquisa ou escolhe outra vista." /></div>
        : modo === "lista" ? (
          <div className="tw">
            <table className="min-900">
              <caption className="sr">Viaturas</caption>
              <thead><tr><th>Viatura</th><th>Estado</th><th>Condutor</th><th className="num">Km</th><th>Próximo vencimento</th><th>Revisão</th><th className="num">Custo/km</th><th>Alertas</th></tr></thead>
              <tbody>{lista.map(linha)}</tbody>
            </table>
          </div>
        ) : <div className="whcards">{lista.map(cartao)}</div>}
      <div className="tbl-foot"><span>{lista.length} viatura(s)</span><span>Clica numa viatura para abrir a ficha.</span></div>
    </>
  );
}
