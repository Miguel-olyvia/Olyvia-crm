// 9/11 (Rúben: «possibilidade de editar os técnicos, clicar no técnico para ver a agenda dele, e também permitir criar equipas
// diretamente, com alertas e sugestões, tudo dinâmico», no Estúdio e por baixo do orçamento). A equipa da obra:
//  · os técnicos do plano; tocar num abre a agenda dele (esta obra, as outras obras e as férias do RH);
//  · os alertas (ocupado nesses dias, ninguém do ofício) e as sugestões (passar para outro livre, começar noutro dia em que estão todos livres);
//  · trocar o técnico de uma tarefa (TrocarTecnico, no mapa de datas);
//  · criar a equipa da obra (os técnicos que se escolhem primeiro) e guardá-la para outras obras (neste browser).
// As escolhas ficam no negócio (f.plano_tecnicos, f.plano_equipa) ou no projeto do Estúdio, e o plano da obra usa-as (preparacaoObra.ts).
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Lightbulb, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, type Estado } from "./motor";
import { ausenteNoRh } from "./equipa/tecnicos";
import { dataCurta, deIso, diasDaObra, isoDia } from "./planoObra";
import { motivoOcupado, ocupacaoDosTecnicos, type EscolhasEquipa } from "./preparacaoObra";
import { equipaDe, useEquipasObra, type EquipaObra } from "./equipa/equipasObra";
import { irPara } from "./urlNegocio";
import type { PlanoDatas, TarefaDatas } from "./planoDaVisita";

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
        {L.map((x) => <option key={x.id} value={x.id}>{x.n} · {x.sk}{equipaDe(x.id) ? ` · ${equipaDe(x.id)!.nome} (vem a equipa)` : ""}{x.motivo ? ` · ${x.motivo}` : " · livre"}</option>)}
      </select>
    </label>
  );
}

export function EquipaDaObra({ P, S, negocio, escolhas, mudar, calcular, mudarInicio }: PropsEquipa) {
  const [agenda, setAgenda] = useState<string | null>(null);
  const [criar, setCriar] = useState(false);
  const [agendas, setAgendas] = useState(true);
  const todasEquipas = useEquipasObra();
  const equipa = escolhas.equipa ?? [];

  const conflitos = P.tarefas.filter((t) => t.tec && t.ocupado);
  const semNinguem = P.tarefas.filter((t) => !t.tec);
  const oficiosSem = [...new Set(semNinguem.map((t) => t.oficio))];
  // a sugestão de dia: o primeiro início, nas 8 semanas seguintes, em que nenhum técnico fica ocupado (os ofícios sem ninguém no RH não
  // dependem do dia, por isso não contam)
  const diaLivre = useMemo(() => {
    if (!conflitos.length || !calcular || !P.inicio) return null;
    for (const d of diasDaObra(P.inicio, 41).slice(1)) {
      const Q = calcular(isoDia(d));
      if (Q.tarefas.length && !Q.tarefas.some((t) => t.ocupado)) return { iso: isoDia(d), Q };
    }
    return null;
  }, [conflitos.length, calcular, P.inicio]);

  const passar = (t: TarefaDatas, id: string) => mudar?.({ ...escolhas, tecnicos: { ...(escolhas.tecnicos ?? {}), [t.chave]: id } });
  const pessoas = P.equipa.map((x) => {
    const ts = P.tarefas.filter((t) => t.tec === x.id);
    return { ...x, ts, conflitos: ts.filter((t) => t.ocupado) };
  });

  return (
    <section aria-label="A equipa da obra" className="space-y-4">
      {/* 1. como está: tudo livre, ou o que falta resolver, e a sugestão de dia */}
      <div className={cn("rounded-xl border p-4", conflitos.length ? "border-warning/50 bg-warning/10" : "border-success/40 bg-success/10")}>
        {conflitos.length ? (
          <p className="flex items-start gap-2 text-[15px]"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
            <span><b className="font-semibold">{conflitos.length} {conflitos.length === 1 ? "tarefa tem" : "tarefas têm"} o técnico ocupado</b> nestes dias
              ({[...new Set(conflitos.map((t) => t.tecNome.split(" ")[0]))].join(", ")}).</span></p>
        ) : (
          <p className="flex items-start gap-2 text-[15px]"><Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <span><b className="font-semibold">A equipa está livre</b>{P.inicio && P.fim ? ` de ${dataCurta(P.inicio)} a ${dataCurta(P.fim)}` : ""}.</span></p>
        )}
        {diaLivre && mudarInicio && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-card p-3">
            <Lightbulb className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[15px]">Sugestão: <b className="font-semibold">começar a {dataCurta(deIso(diaLivre.iso))}</b>. Ficam todos livres e a obra fica pronta a {diaLivre.Q.fim ? dataCurta(diaLivre.Q.fim) : ""}.</p>
            <Button type="button" className="min-h-11" onClick={() => mudarInicio(diaLivre.iso)}>Começar nesse dia</Button>
          </div>
        )}
        {conflitos.length > 0 && !diaLivre && calcular && <p className="mt-2 text-sm text-muted-foreground">Nas próximas 8 semanas não há um dia em que fiquem todos livres: troque o técnico das tarefas abaixo.</p>}
        {oficiosSem.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Sem ninguém no RH para {oficiosSem.join(", ")} ({semNinguem.length} {semNinguem.length === 1 ? "tarefa" : "tarefas"}): escolha alguém de outro ofício na tarefa, ou fica para as Operações.</p>
        )}
      </div>

      {/* 2. as pessoas: o que cada uma faz e quando; tocar abre a agenda */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" aria-hidden="true" />Quem vem{P.equipas.length ? ` · ${P.equipas.map((e) => e.nome).join(", ")}` : ""}</h4>
        <span className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-10" aria-expanded={agendas} onClick={() => setAgendas((x) => !x)}><CalendarDays className="mr-1 h-4 w-4" aria-hidden="true" />{agendas ? "Esconder as agendas" : "Ver as agendas"}</Button>
          {mudar && <Button type="button" variant="outline" size="sm" className="min-h-10" aria-expanded={criar} onClick={() => setCriar((x) => !x)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />{P.equipas.length ? "As equipas" : "Escolher equipas"}</Button>}
        </span>
      </div>
      {pessoas.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {pessoas.map((x) => (
            <li key={x.id} className="p-3">
              <button type="button" aria-expanded={agenda === x.id} onClick={() => setAgenda(agenda === x.id ? null : x.id)} className="flex w-full items-start justify-between gap-3 text-left">
                <span className="min-w-0">
                  <b className="font-semibold">{x.n}</b> <span className="text-muted-foreground">· {x.oficio}{x.equipa ? ` · ${x.equipa}` : ""}</span>
                  <span className="block text-sm text-muted-foreground">{x.ts.length ? x.ts.map((t) => `${t.nome} (${dataCurta(t.inicio)}${t.dur > 1 ? `–${dataCurta(t.fim)}` : ""})`).join(" · ") : "Vem com a equipa (sem tarefas suas nesta obra)"}</span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", x.conflitos.length ? "bg-warning/20 text-amber-800 dark:text-amber-300" : "bg-success/15 text-success")}>
                  {x.conflitos.length ? `ocupado em ${x.conflitos.length} ${x.conflitos.length === 1 ? "tarefa" : "tarefas"}` : "livre"}
                </span>
              </button>
              {x.conflitos.map((t) => {
                const livres = candidatos(t, P, S, negocio).filter((c) => c.doOficio && !c.motivo && c.id !== t.tec).slice(0, 3);
                return (
                  <div key={t.chave} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">{t.nome}: {primeiro(x.n)} está {t.ocupado}.</span>
                    {mudar && livres.map((c) => <button key={c.id} type="button" className="min-h-9 rounded-full border border-primary/40 bg-card px-3 text-primary hover:bg-primary/[0.06]" onClick={() => passar(t, c.id)}>Passar para {c.n}</button>)}
                    {mudar && !livres.length && <span className="text-muted-foreground">Ninguém do ofício livre: mude o dia de início.</span>}
                  </div>
                );
              })}
              {agenda === x.id && <div className="mt-3"><AgendaTecnico id={x.id} P={P} S={S} negocio={negocio} fechar={() => setAgenda(null)} /></div>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">O RH ainda não tem técnicos dos ofícios desta obra.</p>}

      {/* 3. as agendas lado a lado, nos dias do Gantt */}
      {agendas && <Disponibilidade P={P} S={S} negocio={negocio} equipa={equipa} />}

      {criar && mudar && (
        <EscolherEquipas P={P} S={S} negocio={negocio} equipas={todasEquipas} escolhas={escolhas} mudar={mudar} fechar={() => setCriar(false)} />
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
                {fora.map((n) => <span key={n} className="block text-amber-800 dark:text-amber-300">Outra obra · {n}</span>)}
                {ausente && <span className="block text-amber-800 dark:text-amber-300">Ausente (RH)</span>}
                {!aqui.length && !fora.length && !ausente && <span className="text-muted-foreground">Livre</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * 9/11 (Rúben: «técnicos isolados e técnicos associados a equipas: ou vem toda a equipa, ou não vem nenhum membro»). As equipas da empresa
 * (geridas em Equipas de obra): cada uma com os membros e quantos dias estão ocupados nos dias desta obra; «Vem esta equipa» põe-na na obra
 * (as tarefas dos ofícios dela passam para os membros). Os técnicos isolados escolhem-se tarefa a tarefa.
 */
function EscolherEquipas({ P, S, negocio, equipas, escolhas, mudar, fechar }: {
  P: PlanoDatas; S: Estado; negocio?: number; equipas: EquipaObra[]; escolhas: EscolhasEquipa; mudar: (e: EscolhasEquipa) => void; fechar: () => void;
}) {
  const ocup = useMemo(() => ocupacaoDosTecnicos(S, negocio), [S, negocio]);
  const diasObra = P.inicio ? diasDaObra(P.inicio, Math.max(1, P.dias)).map(isoDia) : [];
  const ocupados = (id: string) => diasObra.filter((iso) => ocup.get(id)?.has(iso) || ausenteNoRh(id, iso) || TECS.find((x) => x.id === id)?.feriasDatas?.includes(iso)).length;
  const ativas = equipas.filter((e) => e.ativa && e.membros.length);
  const naObra = new Set(P.equipas.map((e) => e.id));
  const escolhidas = new Set(escolhas.equipas ?? []);
  const isolados = TECS.filter((x) => !ativas.some((e) => e.membros.includes(x.id)));
  const alternar = (id: string) => {
    const L = new Set(escolhidas);
    if (L.has(id) || naObra.has(id)) {
      L.delete(id);
      // sem a equipa: as tarefas dadas à mão a membros dela voltam ao automático
      const membros = new Set(ativas.find((e) => e.id === id)?.membros ?? []);
      const tecnicos = Object.fromEntries(Object.entries(escolhas.tecnicos ?? {}).filter(([, t]) => !membros.has(t)));
      mudar({ ...escolhas, equipas: [...L], tecnicos });
    } else mudar({ ...escolhas, equipas: [...L, id] });
  };
  const precisa = new Set(P.tarefas.map((t) => t.oficio));
  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">As equipas da empresa</p>
        <span className="flex items-center gap-1">
          <button type="button" className="min-h-9 rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/[0.06]" onClick={() => irPara("/equipas-obra")}>Gerir as equipas</button>
          <Button type="button" variant="ghost" size="sm" className="min-h-9" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" aria-hidden="true" /></Button>
        </span>
      </div>
      {!ativas.length ? (
        <p className="text-sm text-muted-foreground">Ainda não há equipas: todos os técnicos são isolados. Crie-as em «Gerir as equipas».</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {ativas.map((e) => {
            const vem = naObra.has(e.id) || escolhidas.has(e.id);
            const dias = Math.max(0, ...e.membros.map(ocupados));
            const serve = e.membros.some((m) => precisa.has(TECS.find((x) => x.id === m)?.sk ?? ""));
            return (
              <li key={e.id} className={cn("rounded-xl border p-3", vem ? "border-primary bg-card" : "border-border bg-card/60")}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><b className="font-semibold">{e.nome}</b>
                    <span className={cn("block text-xs", dias ? "text-amber-800 dark:text-amber-300" : "text-success")}>{dias ? `ocupada ${dias} ${dias === 1 ? "dia" : "dias"} da obra` : "livre nos dias da obra"}{serve ? "" : " · sem ofícios desta obra"}</span>
                  </span>
                  <button type="button" role="switch" aria-checked={vem} onClick={() => alternar(e.id)}
                    className={cn("min-h-9 shrink-0 rounded-full px-3 text-sm font-medium", vem ? "bg-primary text-primary-foreground" : "border border-input")}>{vem ? "Vem" : "Não vem"}</button>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1 text-xs">
                  {e.membros.map((m) => { const tec = TECS.find((x) => x.id === m); const n = ocupados(m); return tec ? (
                    <li key={m} className={cn("rounded-full px-2 py-0.5", n ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-muted")}>{tec.n} · {tec.sk}</li>) : null; })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Uma equipa vem toda ou não vem ninguém dela. {isolados.length} {isolados.length === 1 ? "técnico isolado" : "técnicos isolados"}: escolhem-se tarefa a tarefa.</p>
    </div>
  );
}

/**
 * As agendas lado a lado, nos mesmos dias do Gantt: do início da obra até duas semanas depois do fim (só dias úteis). Os técnicos dos
 * ofícios da obra (a equipa fixa primeiro), dia a dia: esta obra, outra obra, as duas (conflito), ausente (RH) ou livre.
 */
function Disponibilidade({ P, S, negocio, equipa }: { P: PlanoDatas; S: Estado; negocio?: number; equipa: string[] }) {
  const dias = useMemo(() => (P.inicio ? diasDaObra(P.inicio, Math.max(1, P.dias) + 10) : []), [P.inicio, P.dias]);
  const ocup = useMemo(() => ocupacaoDosTecnicos(S, negocio), [S, negocio]);
  const oficios = [...new Set(P.tarefas.map((t) => t.oficio))];
  const tecs = TECS.filter((x) => P.equipa.some((y) => y.id === x.id) || equipa.includes(x.id) || oficios.includes(x.sk))
    .sort((a, b) => Number(!P.equipa.some((y) => y.id === a.id)) - Number(!P.equipa.some((y) => y.id === b.id)) || a.sk.localeCompare(b.sk, "pt") || a.n.localeCompare(b.n, "pt"));
  const nestaObra = new Map<string, string[]>();
  for (const t of P.tarefas) if (t.tec) for (let k = t.dia; k < t.dia + t.dur; k++) if (dias[k]) {
    const c = `${t.tec}|${isoDia(dias[k])}`;
    nestaObra.set(c, [...(nestaObra.get(c) ?? []), t.nome]);
  }
  type E = "esta" | "conflito" | "outra" | "ausente" | "livre";
  const estado = (id: string, iso: string): E => {
    const tec = TECS.find((x) => x.id === id);
    const aqui = nestaObra.has(`${id}|${iso}`), fora = !!ocup.get(id)?.has(iso), aus = ausenteNoRh(id, iso) || !!tec?.feriasDatas?.includes(iso);
    if (aqui && (fora || aus)) return "conflito";
    if (aqui) return "esta";
    if (aus) return "ausente";
    if (fora) return "outra";
    return "livre";
  };
  const COR: Record<E, string> = { esta: "bg-primary", conflito: "bg-destructive", outra: "bg-warning/70", ausente: "bg-muted-foreground/40", livre: "bg-success/20" };
  const TXT: Record<E, string> = { esta: "Esta obra", conflito: "Conflito: esta obra e outra (ou ausente)", outra: "Noutra obra", ausente: "Ausente (RH)", livre: "Livre" };
  const LETRA = ["d", "s", "t", "q", "q", "s", "s"];
  const naObra = (k: number) => k < P.dias;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-semibold">As agendas, nos dias da obra <span className="font-normal text-muted-foreground">· a faixa de cima marca os dias da obra, como no Gantt</span></p>
      <div className="overflow-x-auto">
        <table className="min-w-max border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card pr-2 text-left font-medium">Técnico</th>
              {dias.map((d, k) => (
                <th key={isoDia(d)} scope="col" className={cn("w-8 text-center font-normal tabular-nums", d.getDay() === 1 && k > 0 && "border-l-2 border-l-foreground/20")}>
                  <span className={cn("mb-0.5 block h-1.5 rounded-full", naObra(k) ? "bg-primary/60" : "bg-transparent")} aria-hidden="true" />
                  <span className="text-muted-foreground">{LETRA[d.getDay()]}</span><span className="block text-foreground">{d.getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tecs.map((x) => (
              <tr key={x.id}>
                <th scope="row" className="sticky left-0 z-10 max-w-[11rem] truncate bg-card pr-2 text-left font-normal">
                  <b className="font-medium">{x.n}</b>{equipa.includes(x.id) ? " ★" : ""}<span className="block text-muted-foreground">{x.sk}</span>
                </th>
                {dias.map((d, k) => {
                  const iso = isoDia(d), e = estado(x.id, iso);
                  const txt = e === "esta" || e === "conflito" ? `${TXT[e]}: ${(nestaObra.get(`${x.id}|${iso}`) ?? []).join(", ")}` : TXT[e];
                  return <td key={iso} title={`${dataCurta(d)} · ${txt}`} className={cn("h-8 w-8 rounded", COR[e], d.getDay() === 1 && k > 0 && "border-l-2 border-l-foreground/20")}><span className="sr-only">{dataCurta(d)}: {txt}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(COR) as E[]).map((e) => <span key={e} className="flex items-center gap-1"><span className={cn("h-3 w-3 rounded", COR[e])} />{e === "conflito" ? "Conflito" : TXT[e]}</span>)}
        {equipa.length > 0 && <span>★ equipa fixa</span>}
      </p>
    </div>
  );
}
