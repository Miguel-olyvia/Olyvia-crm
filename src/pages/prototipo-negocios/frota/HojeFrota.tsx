// O Hoje da Frota (pgHoje do protótipo HTML): a fila do que precisa de atenção (cada cartão abre a lista já filtrada), quem está na estrada
// hoje (as tarefas das obras do protótipo e as visitas, pela agenda) e as próximas reservas.
import { ArrowRight, CalendarClock, Gauge, KeyRound, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Selo } from "../inventario/pecasInv";
import { HOJE, dias, diaLongo, fData, fDataC } from "./base";
import { useCtxFrota } from "./ctxFrota";
import type { AbaFrota } from "./loja";
import { Btn, Cab, LigObra, Placa, Src, VazioF } from "./pecasFrota";
import { abaixoMin, atribEm, ativa, multasPend, pessoa, prazoMulta, revisao, vencimentos, viatura } from "./regras";
import type { Tom } from "./tipos";

const CHAVE_FILTRO: Partial<Record<AbaFrota, string>> = { documentos: "dchip", ocorrencias: "ochip", manutencao: "mchip", condutores: "cchip", viaturas: "vchip" };
export const chaveFiltro = (a: AbaFrota): string | undefined => CHAVE_FILTRO[a];

interface Cartao { n: number; tom: Tom; t: string; d: string; dest: AbaFrota; f: string; fonte: React.ReactNode; oculto?: boolean }

export function HojeFrota() {
  const { F, visiveis, perfil, stock, ir, abrir, dlg } = useCtxFrota();
  const vs = visiveis.filter(ativa), tec = perfil === "tecnico";
  const venc = vs.flatMap((v) => vencimentos(v).map((x) => ({ v, ...x })));
  const vencidos = venc.filter((x) => x.data && dias(x.data) < 0), prox = venc.filter((x) => x.data && dias(x.data) >= 0 && dias(x.data) <= 30);
  const revs = vs.filter((v) => revisao(v).tom !== "ok");
  const ofi = vs.filter((v) => v.estado === "oficina");
  const livres = vs.filter((v) => v.estado === "ativa" && !atribEm(F, v.id));
  const cartas = F.pessoas.filter((p) => p.cartaVal && dias(p.cartaVal) <= 60);
  const stockBaixo = vs.filter((v) => abaixoMin(stock(v.id)).length);
  const mp = [...multasPend(F)].sort((a, b) => prazoMulta(a).localeCompare(prazoMulta(b)));
  const fila: Cartao[] = ([
    { n: vencidos.length, tom: "bad", t: "Documentos vencidos", d: vencidos.map((x) => `${x.tipo} da ${x.v.mat}`).join(" · ") || "Nada vencido", dest: "documentos", f: "vencidos", fonte: <Src nova t="fleet_documents_due" /> },
    { n: mp.length, tom: "bad", t: "Multas por identificar", d: mp.length ? `Prazo mais próximo: ${fData(prazoMulta(mp[0]))} (15 dias úteis)` : "Nenhuma pendente", dest: "ocorrencias", f: "pend", fonte: <Src nova t="fleet_incidents" />, oculto: tec },
    { n: prox.length, tom: "warn", t: "Vencimentos em 30 dias", d: prox.map((x) => `${x.tipo} ${x.v.mat}`).join(" · ") || "Nenhum", dest: "documentos", f: "30d", fonte: <Src nova t="fleet_documents_due" /> },
    { n: revs.length, tom: "warn", t: "Revisões a fazer", d: revs.map((v) => `${v.mat}: ${revisao(v).txt.toLowerCase()}`).join(" · ") || "Tudo em dia", dest: "manutencao", f: "rev", fonte: <Src nova t="fleet_maintenance_plans" /> },
    { n: cartas.length, tom: "warn", t: "Cartas de condução a caducar", d: cartas.map((p) => `${p.nome}: ${fData(p.cartaVal)}`).join(" · ") || "Nenhuma", dest: "condutores", f: "carta", fonte: <Src t="pessoas_identificacao.carta_conducao_validade (ramo RH)" />, oculto: tec },
    { n: ofi.length, tom: "info", t: "Em oficina", d: ofi.map((v) => `${v.mat} · ${v.motivo || ""}`).join(" · ") || "Nenhuma", dest: "viaturas", f: "oficina", fonte: <Src nova t="fleet_vehicles.estado" /> },
    { n: stockBaixo.length, tom: "warn", t: "Carrinhas com stock abaixo do mínimo", d: stockBaixo.map((v) => `${v.mat} (${abaixoMin(stock(v.id)).length})`).join(" · ") || "Tudo acima do mínimo", dest: "viaturas", f: "stock", fonte: <Src t="stocks por warehouse da viatura · get_effective_stock" /> },
    { n: livres.length, tom: "ok", t: "Viaturas livres hoje", d: livres.map((v) => v.mat).join(" · ") || "Todas atribuídas", dest: "viaturas", f: "livres", fonte: <Src t="schedule_resources (resource_type='vehicle')" />, oculto: tec },
  ] as Cartao[]).filter((x) => !x.oculto);
  const ids = new Set(visiveis.map((v) => v.id));
  const hojeAg = F.agenda.filter((a) => a.data === HOJE && ids.has(a.vid)).sort((a, b) => a.hora.localeCompare(b.hora));
  const reservas = F.atrib.filter((a) => a.tipo === "pontual" && a.ini > HOJE && ids.has(a.vid)).sort((a, b) => a.ini.localeCompare(b.ini));
  const primeira = visiveis[0]?.id;
  return (
    <>
      <Cab titulo="Hoje" texto={`O que precisa de atenção na frota, ${diaLongo(HOJE)}. Cada cartão abre a lista já filtrada.`}
        acoes={tec
          ? <Btn primario icone={Gauge} acao="km" aoClicar={() => primeira && dlg("km", { v: primeira })}>Registar km</Btn>
          : <Btn primario icone={KeyRound} acao="atribuir" aoClicar={() => dlg("atribuir")}>Nova atribuição</Btn>} />
      <div className="queue">
        {fila.map((x) => (
          <button key={x.t} type="button" className={cn("qcard", `t-${x.tom}`, !x.n && "zero")} onClick={() => { const k = chaveFiltro(x.dest); ir(x.dest, k ? { [k]: x.f } : undefined); }}>
            <span className="qn">{x.n}</span>
            <span className="stk" style={{ minWidth: 0 }}>
              <span className="qt">{x.t}</span><span className="qd">{x.d}</span>
              <span className="go">Ver <ArrowRight className="ic sm" aria-hidden="true" /></span>{x.fonte}
            </span>
          </button>
        ))}
      </div>
      <div className="two sec">
        <section aria-labelledby="fr-estrada">
          <h2 id="fr-estrada"><Route className="ic" aria-hidden="true" />Na estrada hoje</h2>
          <div className="tw">
            <table className="min-560">
              <thead><tr><th>Hora</th><th>Viatura</th><th>Condutor</th><th>Serviço</th></tr></thead>
              <tbody>
                {hojeAg.length ? hojeAg.map((a) => (
                  <tr key={a.vid + a.hora} className="click" tabIndex={0} data-vid={a.vid} onClick={() => abrir(a.vid)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) abrir(a.vid); }}>
                    <td className="num" style={{ textAlign: "left" }}>{a.hora}</td>
                    <td><Placa mat={viatura(F, a.vid)?.mat ?? ""} /></td>
                    <td>{pessoa(F, a.pid)?.nome}</td>
                    <td><div className="stk"><span className="mono">{a.obra ? <LigObra id={a.obra}>{a.ref}</LigObra> : a.ref}</span><small className="muted">{a.desc}</small></div></td>
                  </tr>
                )) : <tr><td colSpan={4}><VazioF titulo="Nada agendado hoje" texto="As ordens e visitas da agenda aparecem aqui." /></td></tr>}
              </tbody>
            </table>
          </div>
          <Src t="schedule_items + schedule_item_assignees · ops_ordem (ligação ordem↔viatura nova)" />
        </section>
        <section aria-labelledby="fr-reservas">
          <h2 id="fr-reservas"><CalendarClock className="ic" aria-hidden="true" />Próximas reservas</h2>
          <div className="card pad vlist">
            {reservas.length ? reservas.map((a) => (
              <div key={a.id}>
                <span className="stk"><b>{viatura(F, a.vid)?.mat} · {pessoa(F, a.pid)?.nome}</b><small className="muted">{a.obra ? <LigObra id={a.obra}>{a.nota}</LigObra> : a.nota}</small></span>
                <Selo tom="info">{fDataC(a.ini)}–{fDataC(a.fim)}</Selo>
              </div>
            )) : <div className="muted">Sem reservas.</div>}
          </div>
        </section>
      </div>
    </>
  );
}
