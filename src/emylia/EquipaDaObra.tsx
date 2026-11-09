// 9/11 (Rúben: «possibilidade de editar os técnicos, clicar no técnico para ver a agenda dele, e também permitir criar equipas
// diretamente, com alertas e sugestões, tudo dinâmico», no Estúdio e por baixo do orçamento). A equipa da obra:
//  · os técnicos do plano; tocar num abre a agenda dele (esta obra, as outras obras e as férias do RH);
//  · os alertas (ocupado nesses dias, ninguém do ofício) e as sugestões (passar para outro livre, começar noutro dia em que estão todos livres);
//  · trocar o técnico de uma tarefa (TrocarTecnico, no mapa de datas);
//  · criar a equipa da obra (os técnicos que se escolhem primeiro) e guardá-la para outras obras (neste browser).
// As escolhas ficam no negócio (f.plano_tecnicos, f.plano_equipa) ou no projeto do Estúdio, e o plano da obra usa-as (preparacaoObra.ts).
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Lightbulb, Plus, Save, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, type Estado } from "./motor";
import { ausenteNoRh } from "./equipa/tecnicos";
import { dataCurta, deIso, diasDaObra, isoDia } from "./planoObra";
import { motivoOcupado, ocupacaoDosTecnicos, type EscolhasEquipa } from "./preparacaoObra";
import type { PlanoDatas, TarefaDatas } from "./planoDaVisita";

const CHAVE_EQUIPAS = "olyvia.equipas.v1";
interface EquipaGuardada { nome: string; membros: string[] }
const lerEquipas = (): EquipaGuardada[] => { try { return JSON.parse(localStorage.getItem(CHAVE_EQUIPAS) ?? "[]"); } catch { return []; } };
const gravarEquipas = (L: EquipaGuardada[]) => { try { localStorage.setItem(CHAVE_EQUIPAS, JSON.stringify(L)); } catch { /* fica só no ecrã */ } };
const nomeTec = (id: string | null) => TECS.find((x) => x.id === id)?.n ?? "Por atribuir";
const primeiro = (n: string) => n.split(" ")[0];

export interface PropsEquipa {
  P: PlanoDatas; S: Estado; negocio?: number; escolhas: EscolhasEquipa;
  /** Sem ela, só se vê (o orçamento enviado). */
  mudar?: (e: EscolhasEquipa) => void;
  /** O plano para outro dia de início (para sugerir um dia com todos livres) e mudar o início. */
  calcular?: (inicio: string) => PlanoDatas;
  mudarInicio?: (iso: string) => void;
}

/** Os técnicos que podem fazer uma tarefa: os do ofício primeiro, cada um com o motivo de não estar livre (null: livre). */
export function candidatos(t: TarefaDatas, P: PlanoDatas, S: Estado, negocio?: number): { id: string; n: string; sk: string; doOficio: boolean; motivo: string | null }[] {
  const ocup = ocupacaoDosTecnicos(S, negocio);
  const outras = P.plano.tasks.filter((x) => !(x.dia === t.dia && x.nome === t.nome));
  return TECS.map((x) => ({ id: x.id, n: x.n, sk: x.sk, doOficio: x.sk === t.oficio, motivo: motivoOcupado(x.id, t, P.plano, ocup, outras) }))
    .sort((a, b) => Number(b.doOficio) - Number(a.doOficio) || Number(!!a.motivo) - Number(!!b.motivo) || a.n.localeCompare(b.n, "pt"));
}

/** Trocar o técnico de uma tarefa (no detalhe da tarefa do mapa de datas). */
export function TrocarTecnico({ t, P, S, negocio, escolhas, mudar }: { t: TarefaDatas; P: PlanoDatas; S: Estado; negocio?: number; escolhas: EscolhasEquipa; mudar: (e: EscolhasEquipa) => void }) {
  const L = candidatos(t, P, S, negocio);
  const escolher = (id: string) => {
    const tecnicos = { ...(escolhas.tecnicos ?? {}) };
    if (id) tecnicos[t.chave] = id; else delete tecnicos[t.chave];
    mudar({ ...escolhas, tecnicos });
  };
  return (
    <label className="grid max-w-md gap-1 text-sm font-medium">Quem faz
      <select value={t.aMao ? t.tec ?? "" : ""} onChange={(e) => escolher(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3 text-[15px]">
        <option value="">Automático: {t.tecNome}{t.ocupado ? ` (${t.ocupado})` : ""}</option>
        {L.map((x) => <option key={x.id} value={x.id}>{x.n} · {x.sk}{x.motivo ? ` · ${x.motivo}` : " · livre"}</option>)}
      </select>
    </label>
  );
}

export function EquipaDaObra({ P, S, negocio, escolhas, mudar, calcular, mudarInicio }: PropsEquipa) {
  const [agenda, setAgenda] = useState<string | null>(null);
  const [criar, setCriar] = useState(false);
  const [agendas, setAgendas] = useState(false);
  const [guardadas, setGuardadas] = useState<EquipaGuardada[]>(lerEquipas);
  const equipa = escolhas.equipa ?? [];

  const alertas = P.tarefas.filter((t) => t.ocupado || !t.tec);
  // a sugestão de dia: o primeiro início, nas 6 semanas seguintes, em que ninguém fica ocupado
  const diaLivre = useMemo(() => {
    if (!alertas.length || !calcular || !P.inicio) return null;
    for (const d of diasDaObra(P.inicio, 31).slice(1)) {
      const Q = calcular(isoDia(d));
      if (Q.tarefas.length && !Q.tarefas.some((t) => t.ocupado)) return { iso: isoDia(d), Q };
    }
    return null;
  }, [alertas.length, calcular, P.inicio]); // eslint-disable-line react-hooks/exhaustive-deps

  const passar = (t: TarefaDatas, id: string) => mudar?.({ ...escolhas, tecnicos: { ...(escolhas.tecnicos ?? {}), [t.chave]: id } });

  return (
    <section aria-label="A equipa da obra" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" aria-hidden="true" />A equipa{equipa.length ? ` · equipa da obra: ${equipa.map((x) => primeiro(nomeTec(x))).join(", ")}` : ""}</h4>
        <span className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-10" aria-expanded={agendas} onClick={() => setAgendas((x) => !x)}><CalendarDays className="mr-1 h-4 w-4" aria-hidden="true" />As agendas</Button>
          {mudar && <Button type="button" variant="outline" size="sm" className="min-h-10" aria-expanded={criar} onClick={() => setCriar((x) => !x)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />{equipa.length ? "Mudar a equipa" : "Criar equipa"}</Button>}
        </span>
      </div>

      {P.equipa.length ? (
        <ul className="flex flex-wrap gap-2">
          {P.equipa.map((x) => {
            const ocupado = P.tarefas.some((t) => t.tec === x.id && t.ocupado);
            return (
              <li key={x.id}>
                <button type="button" aria-expanded={agenda === x.id} onClick={() => setAgenda(agenda === x.id ? null : x.id)}
                  className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors", agenda === x.id ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:border-foreground/40")}>
                  {ocupado && <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground" aria-label="Ocupado em alguns dias" />}
                  <b className="font-medium">{x.n}</b><span className="text-muted-foreground">· {x.oficio}</span>
                  <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">O RH ainda não tem técnicos dos ofícios desta obra.</p>}

      {agendas && <Disponibilidade P={P} S={S} negocio={negocio} equipa={equipa} mudarInicio={mudarInicio} />}
      {agenda && <AgendaTecnico id={agenda} P={P} S={S} negocio={negocio} fechar={() => setAgenda(null)} />}

      {/* os alertas, com as sugestões */}
      {alertas.length > 0 && (
        <ul className="space-y-2" aria-label="Alertas da equipa">
          {alertas.map((t) => {
            const livres = candidatos(t, P, S, negocio).filter((x) => x.doOficio && !x.motivo && x.id !== t.tec).slice(0, 3);
            return (
              <li key={t.chave} className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" aria-hidden="true" />
                  <span><b className="font-medium">{t.nome}</b> ({dataCurta(t.inicio)}{t.dur > 1 ? ` a ${dataCurta(t.fim)}` : ""}): {t.tec ? `${t.tecNome} está ${t.ocupado}.` : `o RH não tem ninguém de ${t.oficio}.`}</span></p>
                {mudar && livres.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
                    {livres.map((x) => <button key={x.id} type="button" className="min-h-9 rounded-full border border-primary/40 bg-card px-3 text-primary hover:bg-primary/[0.06]" onClick={() => passar(t, x.id)}>Passar para {x.n} (livre)</button>)}
                  </p>
                )}
              </li>
            );
          })}
          {diaLivre && mudarInicio && (
            <li className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 text-sm">
              <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Sugestão: a começar a <b className="font-medium">{dataCurta(deIso(diaLivre.iso))}</b> estão todos livres (pronta a {diaLivre.Q.fim ? dataCurta(diaLivre.Q.fim) : ""}).</span>
              <button type="button" className="min-h-9 rounded-full bg-primary px-3 font-medium text-primary-foreground" onClick={() => mudarInicio(diaLivre.iso)}>Começar nesse dia</button>
            </li>
          )}
        </ul>
      )}

      {criar && mudar && (
        <CriarEquipa P={P} S={S} negocio={negocio} atual={equipa} guardadas={guardadas}
          usar={(membros) => { mudar({ ...escolhas, equipa: membros }); setCriar(false); }}
          guardar={(e) => { const L = [...guardadas.filter((x) => x.nome !== e.nome), e]; setGuardadas(L); gravarEquipas(L); }}
          apagar={(nome) => { const L = guardadas.filter((x) => x.nome !== nome); setGuardadas(L); gravarEquipas(L); }}
          fechar={() => setCriar(false)} />
      )}
    </section>
  );
}

/** A agenda de um técnico: os dias desta obra e as duas semanas a seguir, com esta obra, as outras e as ausências do RH. */
function AgendaTecnico({ id, P, S, negocio, fechar }: { id: string; P: PlanoDatas; S: Estado; negocio?: number; fechar: () => void }) {
  const tec = TECS.find((x) => x.id === id);
  const dias = P.inicio ? diasDaObra(P.inicio, Math.max(1, P.dias) + 10) : [];
  const outras = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of S.deals ?? []) {
      const p = d.obra?.plano;
      if (d.id === negocio || !p?.inicio || p.estado === "concluída") continue;
      const fim = p.tasks.reduce((a, t) => Math.max(a, t.dia + t.dur), 0);
      const ds = diasDaObra(deIso(p.inicio), Math.max(1, fim));
      for (const t of p.tasks) if (t.tec === id) for (let k = t.dia; k < t.dia + t.dur && k < ds.length; k++) {
        const iso = isoDia(ds[k]);
        m.set(iso, [...(m.get(iso) ?? []), `${d.nome}: ${t.nome}`]);
      }
    }
    return m;
  }, [S.deals, id, negocio]);
  if (!tec) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">A agenda de {tec.n} <span className="font-normal text-muted-foreground">· {tec.sk}</span></p>
        <Button type="button" variant="ghost" size="sm" className="min-h-9" aria-label="Fechar a agenda" onClick={fechar}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      <ol className="mt-2 max-h-80 space-y-1 overflow-y-auto text-sm">
        {dias.map((d, k) => {
          const iso = isoDia(d);
          const aqui = P.tarefas.filter((t) => t.tec === id && k >= t.dia && k < t.dia + t.dur).map((t) => t.nome);
          const fora = outras.get(iso) ?? [];
          const ausente = ausenteNoRh(id, iso) || tec.feriasDatas?.includes(iso);
          const conflito = aqui.length > 0 && (fora.length > 0 || ausente);
          return (
            <li key={iso} className={cn("grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1.5", conflito ? "bg-warning/15" : k < P.dias ? "bg-muted/50" : "")}>
              <span className="tabular-nums text-muted-foreground">{dataCurta(d)}</span>
              <span className="min-w-0">
                {aqui.map((n) => <span key={n} className="block"><b className="font-medium">Esta obra:</b> {n}</span>)}
                {fora.map((n) => <span key={n} className="block text-warning-foreground">Outra obra · {n}</span>)}
                {ausente && <span className="block text-warning-foreground">Ausente (RH)</span>}
                {!aqui.length && !fora.length && !ausente && <span className="text-muted-foreground">Livre</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Criar a equipa da obra: os técnicos (com a disponibilidade nos dias da obra), usar nesta obra e guardar para outras. */
function CriarEquipa({ P, S, negocio, atual, guardadas, usar, guardar, apagar, fechar }: {
  P: PlanoDatas; S: Estado; negocio?: number; atual: string[]; guardadas: EquipaGuardada[];
  usar: (m: string[]) => void; guardar: (e: EquipaGuardada) => void; apagar: (nome: string) => void; fechar: () => void;
}) {
  const [sel, setSel] = useState<string[]>(atual.length ? atual : P.equipa.map((x) => x.id));
  const [nome, setNome] = useState("");
  const ocup = useMemo(() => ocupacaoDosTecnicos(S, negocio), [S, negocio]);
  const diasObra = P.inicio ? diasDaObra(P.inicio, Math.max(1, P.dias)).map(isoDia) : [];
  const ocupados = (id: string) => diasObra.filter((iso) => ocup.get(id)?.has(iso) || ausenteNoRh(id, iso) || TECS.find((x) => x.id === id)?.feriasDatas?.includes(iso)).length;
  const porOficio = [...new Set(TECS.map((x) => x.sk))].sort((a, b) => a.localeCompare(b, "pt"));
  const precisa = new Set(P.tarefas.map((t) => t.oficio));
  const falta = [...precisa].filter((o) => o !== "Por definir" && !TECS.some((x) => x.sk === o && sel.includes(x.id)));
  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">A equipa desta obra</p>
        <Button type="button" variant="ghost" size="sm" className="min-h-9" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      {guardadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Equipas guardadas:</span>
          {guardadas.map((e) => (
            <span key={e.nome} className="inline-flex items-center rounded-full border border-border bg-card">
              <button type="button" className="min-h-9 px-3" onClick={() => setSel(e.membros.filter((id) => TECS.some((x) => x.id === id)))}>{e.nome}</button>
              <button type="button" className="min-h-9 pr-2 text-muted-foreground" aria-label={`Apagar a equipa ${e.nome}`} onClick={() => apagar(e.nome)}><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {porOficio.map((o) => (
          <fieldset key={o} className="space-y-1">
            <legend className={cn("text-xs font-semibold", precisa.has(o) ? "text-foreground" : "text-muted-foreground")}>{o}{precisa.has(o) ? " · nesta obra" : ""}</legend>
            {TECS.filter((x) => x.sk === o).map((x) => {
              const n = ocupados(x.id), on = sel.includes(x.id);
              return (
                <button key={x.id} type="button" role="checkbox" aria-checked={on} onClick={() => setSel((s) => (on ? s.filter((y) => y !== x.id) : [...s, x.id]))}
                  className={cn("flex min-h-10 w-full items-center gap-2 rounded-lg border px-2 text-left text-sm", on ? "border-primary bg-card" : "border-border bg-card/60")}>
                  <span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border-2", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1 truncate">{x.n}</span>
                  <span className={cn("shrink-0 text-xs", n ? "text-warning-foreground" : "text-success")}>{n ? `${n} ${n === 1 ? "dia ocupado" : "dias ocupados"}` : "livre"}</span>
                </button>
              );
            })}
          </fieldset>
        ))}
      </div>
      {falta.length > 0 && <p className="flex items-start gap-2 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Sem ninguém de {falta.join(", ")} na equipa: essas tarefas ficam com quem estiver livre.</p>}
      <div className="flex flex-wrap items-end gap-2">
        <Button type="button" className="min-h-11" disabled={!sel.length} onClick={() => usar(sel)}><Check className="mr-1 h-4 w-4" aria-hidden="true" />Usar nesta obra</Button>
        {atual.length > 0 && <Button type="button" variant="outline" className="min-h-11" onClick={() => usar([])}>Sem equipa fixa</Button>}
        <label className="grid gap-1 text-xs font-medium">Guardar como
          <span className="flex gap-1">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Equipa A" className="h-11 w-40 rounded-lg border border-input bg-background px-3 text-[15px]" />
            <Button type="button" variant="outline" className="min-h-11" disabled={!nome.trim() || !sel.length} onClick={() => { guardar({ nome: nome.trim(), membros: sel }); setNome(""); }}><Save className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Guardar a equipa</span></Button>
          </span>
        </label>
      </div>
    </div>
  );
}

/**
 * As agendas lado a lado: os técnicos dos ofícios da obra (a equipa primeiro) nas próximas 6 semanas úteis, dia a dia: esta obra, outra
 * obra, ausente (RH) ou livre. Em cima, o primeiro dia em que cada ofício da obra tem alguém livre e, com `mudarInicio`, começar aí.
 */
function Disponibilidade({ P, S, negocio, equipa, mudarInicio }: { P: PlanoDatas; S: Estado; negocio?: number; equipa: string[]; mudarInicio?: (iso: string) => void }) {
  const dias = useMemo(() => diasDaObra(new Date(), 30), []);
  const ocup = useMemo(() => ocupacaoDosTecnicos(S, negocio), [S, negocio]);
  const oficios = [...new Set(P.tarefas.map((t) => t.oficio))];
  const tecs = TECS.filter((x) => oficios.includes(x.sk) || equipa.includes(x.id) || P.equipa.some((y) => y.id === x.id))
    .sort((a, b) => Number(!equipa.includes(a.id)) - Number(!equipa.includes(b.id)) || a.sk.localeCompare(b.sk, "pt") || a.n.localeCompare(b.n, "pt"));
  const nestaObra = new Map<string, string[]>();
  if (P.inicio) {
    const ds = diasDaObra(P.inicio, Math.max(1, P.dias));
    for (const t of P.tarefas) if (t.tec) for (let k = t.dia; k < t.dia + t.dur; k++) if (ds[k]) {
      const c = `${t.tec}|${isoDia(ds[k])}`;
      nestaObra.set(c, [...(nestaObra.get(c) ?? []), t.nome]);
    }
  }
  const estado = (id: string, iso: string): "esta" | "outra" | "ausente" | "livre" => {
    const tec = TECS.find((x) => x.id === id);
    if (ausenteNoRh(id, iso) || tec?.feriasDatas?.includes(iso)) return "ausente";
    if (ocup.get(id)?.has(iso)) return "outra";
    if (nestaObra.has(`${id}|${iso}`)) return "esta";
    return "livre";
  };
  const primeiroLivre = dias.find((d) => oficios.every((o) => tecs.some((x) => x.sk === o && (estado(x.id, isoDia(d)) === "livre" || estado(x.id, isoDia(d)) === "esta"))));
  const COR = { esta: "bg-primary", outra: "bg-warning", ausente: "bg-destructive/70", livre: "bg-success/25" } as const;
  const LETRA = ["d", "s", "t", "q", "q", "s", "s"];
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-semibold">As agendas da equipa · próximas 6 semanas</p>
      {primeiroLivre && (
        <p className="flex flex-wrap items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
          A partir de <b className="font-medium">{dataCurta(primeiroLivre)}</b> há alguém livre em cada ofício da obra.
          {mudarInicio && P.inicio && isoDia(primeiroLivre) !== isoDia(P.inicio) && <button type="button" className="min-h-9 rounded-full border border-primary/40 px-3 text-primary hover:bg-primary/[0.06]" onClick={() => mudarInicio(isoDia(primeiroLivre))}>Começar nesse dia</button>}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-max border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card pr-2 text-left font-medium">Técnico</th>
              {dias.map((d) => <th key={isoDia(d)} scope="col" className={cn("w-7 text-center font-normal tabular-nums text-muted-foreground", d.getDay() === 1 && "border-l-2 border-l-foreground/20")}>{LETRA[d.getDay()]}<span className="block text-foreground">{d.getDate()}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {tecs.map((x) => (
              <tr key={x.id}>
                <th scope="row" className="sticky left-0 z-10 max-w-[11rem] truncate bg-card pr-2 text-left font-normal">
                  <b className="font-medium">{x.n}</b>{equipa.includes(x.id) ? " ★" : ""}<span className="block text-muted-foreground">{x.sk}</span>
                </th>
                {dias.map((d) => {
                  const iso = isoDia(d), e = estado(x.id, iso);
                  const txt = e === "esta" ? `Esta obra: ${(nestaObra.get(`${x.id}|${iso}`) ?? []).join(", ")}` : e === "outra" ? "Noutra obra" : e === "ausente" ? "Ausente (RH)" : "Livre";
                  return <td key={iso} title={`${dataCurta(d)} · ${txt}`} className={cn("h-7 w-7 rounded", COR[e], d.getDay() === 1 && "border-l-2 border-l-foreground/20")}><span className="sr-only">{dataCurta(d)}: {txt}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" />Esta obra</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-warning" />Noutra obra</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-destructive/70" />Ausente (RH)</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-success/25" />Livre</span>
        {equipa.length > 0 && <span>★ equipa da obra</span>}
      </p>
    </div>
  );
}
