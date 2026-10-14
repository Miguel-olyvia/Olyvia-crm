// As Atribuições (pgAtribuicoes do protótipo HTML): o calendário semanal por viatura (permanentes, reservas pontuais para obras e ordens,
// oficina e manutenções marcadas, que bloqueiam a viatura) e as listas Em curso, Reservas e Histórico.
import { ChevronLeft, ChevronRight, KeyRound, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Selo } from "../inventario/pecasInv";
import { HOJE, addDias, diaSemana, fData, fDataC, fKm } from "./base";
import { cancelarReserva, podeReservar } from "./acoes";
import { useCtxFrota } from "./ctxFrota";
import { pode } from "./perfil";
import { Btn, Cab, LigObra, Placa, Src, VazioF } from "./pecasFrota";
import { ativa, bloqueios, cobre, pessoa, viatura } from "./regras";
import type { Atribuicao } from "./tipos";

export function AtribuicoesFrota() {
  const { F, visiveis, perfil, f, setF, abrir, dlg, agir } = useCtxFrota();
  const aba = f.aaba || "semana";
  const semana = Number(f.semana || 0);
  const ini = addDias("2026-10-12", semana * 7), dd = Array.from({ length: 7 }, (_, i) => addDias(ini, i));
  const vs = visiveis.filter(ativa);
  const ids = new Set(visiveis.map((v) => v.id));
  const curso = F.atrib.filter((a) => ids.has(a.vid) && cobre(a, HOJE));
  const res = F.atrib.filter((a) => ids.has(a.vid) && a.ini > HOJE).sort((a, b) => a.ini.localeCompare(b.ini));
  const hist = F.atrib.filter((a) => ids.has(a.vid) && a.fim && (a.fim < HOJE || a.devolvida)).sort((a, b) => b.fim!.localeCompare(a.fim!));
  const tabs: [string, string, number | null][] = [["semana", "Calendário", null], ["curso", "Em curso", curso.length], ["res", "Reservas", res.length], ["hist", "Histórico", hist.length]];

  const cal = (
    <>
      <div className="row between" style={{ margin: "12px 0" }}>
        <div className="row">
          <Btn pequeno icone={ChevronLeft} aoClicar={() => setF("semana", String(semana - 1))}>Semana anterior</Btn>
          <Btn pequeno aoClicar={() => setF("semana", "0")}>Esta semana</Btn>
          <Btn pequeno icone={ChevronRight} aoClicar={() => setF("semana", String(semana + 1))}>Seguinte</Btn>
        </div>
        <span className="muted">{fData(dd[0])} a {fData(dd[6])}</span>
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--i-primary-soft)", border: "1px solid var(--i-primary)" }} />Atribuição permanente</span>
        <span><i style={{ background: "var(--i-info-bg)", border: "1px solid hsl(214 85% 50%)" }} />Reserva pontual (obra, ordem)</span>
        <span><i style={{ background: "var(--i-warn-bg)", border: "1px solid hsl(var(--warning))" }} />Oficina ou manutenção marcada</span>
      </div>
      <div className="tw">
        <table className="cal min-900">
          <caption className="sr">Calendário da semana de {fData(dd[0])} a {fData(dd[6])}</caption>
          <thead><tr><th>Viatura</th>{dd.map((d) => <th key={d} className={d === HOJE ? "hoje" : undefined}>{diaSemana(d)} {fDataC(d)}{d === HOJE ? " · hoje" : ""}</th>)}</tr></thead>
          <tbody>
            {vs.map((v) => (
              <tr key={v.id}>
                <td><button type="button" className="link" onClick={() => abrir(v.id)}>{v.mat}</button><br /><small className="muted">{v.marca} {v.modelo.split(" ")[0]}</small></td>
                {dd.map((d) => {
                  const bl = bloqueios(F, v.id, d);
                  if (!bl.length) return (
                    <td key={d}>{podeReservar(F, v.id, d) && pode(perfil, "atribuir")
                      ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => dlg("atribuir", { v: v.id, ini: d })} aria-label={`Reservar ${v.mat} a ${fData(d)}`}><Plus className="ic sm" aria-hidden="true" /></button> : null}</td>
                  );
                  return (
                    <td key={d}>
                      <div className="stk" style={{ gap: 3 }}>
                        {bl.map((b, i) => {
                          if (b.tipo === "oficina" || b.tipo === "manutencao") return <span key={i} className="blk ofi" title={b.manut ? `${b.manut.tipo} · ${b.manut.oficina}` : v.motivo}>{b.txt}</span>;
                          const a = b.atrib!, nome = pessoa(F, a.pid)?.nome ?? "";
                          return <span key={i} className={cn("blk", a.tipo === "pontual" ? "pont" : "perm")} title={nome + (a.nota ? " · " + a.nota : "")}>{nome.split(" ")[0]}{a.tipo === "pontual" && a.nota ? " · " + a.nota.split(" ")[0] + (a.obra ? ` #${a.obra}` : "") : ""}</span>;
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Src nova t="fleet_assignments + schedule_resources (resource_type='vehicle') · check_schedule_conflict" />
    </>
  );

  const linhas = (l: Atribuicao[]) => (l.length ? (
    <div className="tw">
      <table className="min-900">
        <thead><tr><th>Viatura</th><th>Condutor</th><th>Tipo</th><th>Período</th><th className="num">Km</th><th>Motivo</th><th><span className="sr">Ações</span></th></tr></thead>
        <tbody>
          {l.map((a) => {
            const v = viatura(F, a.vid), p = pessoa(F, a.pid);
            const aberta = !a.devolvida && (!a.fim || a.fim >= HOJE);
            return (
              <tr key={a.id}>
                <td>{v ? <Placa mat={v.mat} /> : null}</td><td>{p?.nome}</td>
                <td>{a.tipo === "pontual" ? <Selo tom="info">Pontual</Selo> : <Selo tom="violet">Permanente</Selo>}</td>
                <td>{fData(a.ini)} → {a.fim ? fData(a.fim) : "sem fim"}</td>
                <td className="num">{a.kmIni != null ? fKm(a.kmIni) : "—"}{a.kmFim != null ? " → " + fKm(a.kmFim) : ""}{a.kmFim != null && a.kmIni != null ? <><br /><small className="muted">{fKm(a.kmFim - a.kmIni)} feitos</small></> : null}</td>
                <td>{a.obra ? <LigObra id={a.obra}>{a.nota}</LigObra> : a.nota ?? ""}</td>
                <td className="act">{aberta ? (a.ini <= HOJE
                  ? <Btn pequeno acao="atribuir" aoClicar={() => dlg("devolver", { a: a.id })}>Devolver</Btn>
                  : <Btn pequeno acao="atribuir" aoClicar={() => agir((G) => cancelarReserva(G, a.id), (m) => m)}>Cancelar</Btn>) : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : <div className="card"><VazioF titulo="Nada para mostrar" texto="As atribuições aparecem aqui quando entregares uma viatura." /></div>);

  return (
    <>
      <Cab titulo="Atribuições" texto="Quem tem que viatura e quando. A atribuição confirma a carta de condução no RH e recusa sobreposições na mesma viatura e dias de manutenção marcada."
        acoes={<Btn primario icone={KeyRound} acao="atribuir" aoClicar={() => dlg("atribuir")}>Nova atribuição</Btn>} />
      <div className="tabs" role="tablist" aria-label="Atribuições">
        {tabs.map(([k, t, n]) => (
          <button key={k} type="button" role="tab" className={cn("tab", aba === k && "on")} aria-selected={aba === k} onClick={() => setF("aaba", k)}>{t}{n != null ? <span className="pill">{n}</span> : null}</button>
        ))}
      </div>
      {aba === "semana" ? cal : <div style={{ marginTop: 12 }}>{linhas(aba === "curso" ? curso : aba === "res" ? res : hist)}</div>}
    </>
  );
}
