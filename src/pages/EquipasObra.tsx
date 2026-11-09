// 9/11 (Rúben: «técnicos isolados e técnicos associados a equipas (ou vem toda a equipa, ou não vem nenhum membro), e ter uma área onde
// podemos gerir isto»). As equipas de obra da empresa: criar, dar nome, juntar e tirar técnicos (os do RH, com o ofício), pôr de parte, e
// a lista dos técnicos isolados. Uma pessoa só está numa equipa. Grava-se na base (neg_equipas_guardar); sem a função ainda aplicada,
// fica neste browser e diz-se isso.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Plus, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { TECS } from "@/emylia/motor";
import { carregarEquipasObra, guardarEquipasObra, origemEquipas, useEquipasObra, type EquipaObra } from "@/emylia/equipa/equipasObra";
import { useCatalogoDoEstudio } from "@/pages/prototipo-estudio/catalogoDoEstudio";
import { irPara } from "@/emylia/urlNegocio";

const novoId = () => (crypto?.randomUUID?.() ?? `e-${Date.now()}-${Math.round(Math.random() * 1e6)}`);

export default function EquipasObra() {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  const { S, aLer, erro } = useCatalogoDoEstudio();
  const daBase = useEquipasObra();
  const [L, setL] = useState<EquipaObra[]>(daBase);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { if (org) void carregarEquipasObra(supabase, org); }, [org]);
  useEffect(() => { setL(daBase); }, [daBase]);
  const tecs = useMemo(() => [...TECS].sort((a, b) => a.sk.localeCompare(b.sk, "pt") || a.n.localeCompare(b.n, "pt")), [S]); // eslint-disable-line react-hooks/exhaustive-deps
  const ativas = L.filter((e) => e.ativa);
  const equipaDe = (id: string, menos?: string) => ativas.find((e) => e.id !== menos && e.membros.includes(id));
  const isolados = tecs.filter((x) => !equipaDe(x.id));
  const mudou = JSON.stringify(L) !== JSON.stringify(daBase);

  const mudar = (id: string, fn: (e: EquipaObra) => EquipaObra) => setL((x) => x.map((e) => (e.id === id ? fn(e) : e)));
  const gravar = async () => {
    setAGravar(true); setMsg(null);
    const e = await guardarEquipasObra(org ? supabase : null, org, L);
    setAGravar(false);
    setMsg(e ? { t: e, ok: false } : { t: origemEquipas() === "base" ? "Equipas gravadas." : "Equipas guardadas neste browser (falta aplicar a migration 20270112200000 na base).", ok: true });
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => irPara("/negocios")}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Negócios</button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Users className="h-6 w-6 text-primary" aria-hidden="true" />Equipas de obra</h1>
          <p className="text-[15px] text-muted-foreground">Uma equipa vai sempre junta: numa obra, vem a equipa toda ou ninguém dela. Quem não está numa equipa é um técnico isolado.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setL((x) => [...x, { id: novoId(), nome: `Equipa ${x.length + 1}`, membros: [], ativa: true }])}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Nova equipa</Button>
          <Button type="button" className="min-h-11" disabled={!mudou || aGravar} onClick={() => void gravar()}><Check className="mr-1 h-4 w-4" aria-hidden="true" />{aGravar ? "A gravar…" : "Gravar"}</Button>
        </div>
      </div>
      {msg && <p role="status" className={cn("rounded-xl px-4 py-3 text-[15px]", msg.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{msg.t}</p>}
      {aLer && !TECS.length && <p className="text-[15px] text-muted-foreground">A ler os técnicos do RH…</p>}
      {erro && <p className="text-sm text-amber-800 dark:text-amber-300">{erro}</p>}

      {!L.length && <p className="rounded-xl border border-dashed border-border p-6 text-center text-[15px] text-muted-foreground">Ainda não há equipas. Carregue em «Nova equipa».</p>}
      <ul className="grid gap-4 md:grid-cols-2">
        {L.map((e) => {
          const livres = tecs.filter((x) => !e.membros.includes(x.id) && !equipaDe(x.id, e.id));
          const oficios = [...new Set(e.membros.map((m) => TECS.find((x) => x.id === m)?.sk).filter(Boolean))];
          return (
            <li key={e.id} className={cn("space-y-3 rounded-2xl border bg-card p-4 shadow-[var(--shadow-sm)]", e.ativa ? "border-border" : "border-dashed border-border opacity-70")}>
              <div className="flex items-center gap-2">
                <input value={e.nome} aria-label="Nome da equipa" onChange={(ev) => mudar(e.id, (x) => ({ ...x, nome: ev.target.value }))}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[15px] font-semibold" />
                <button type="button" role="switch" aria-checked={e.ativa} onClick={() => mudar(e.id, (x) => ({ ...x, ativa: !x.ativa }))}
                  className={cn("min-h-11 shrink-0 rounded-full px-3 text-sm font-medium", e.ativa ? "bg-success/15 text-success" : "border border-input text-muted-foreground")}>{e.ativa ? "Ativa" : "De parte"}</button>
                <Button type="button" variant="ghost" className="min-h-11" aria-label={`Apagar ${e.nome}`} onClick={() => setL((x) => x.filter((y) => y.id !== e.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
              <p className="text-sm text-muted-foreground">{e.membros.length} {e.membros.length === 1 ? "pessoa" : "pessoas"}{oficios.length ? ` · ${oficios.join(", ")}` : ""}</p>
              <ul className="flex flex-wrap gap-2">
                {e.membros.map((m) => { const t = TECS.find((x) => x.id === m); return (
                  <li key={m} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-muted pl-3 text-sm">{t ? `${t.n} · ${t.sk}` : "Pessoa que já não está no RH"}
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-background" aria-label={`Tirar ${t?.n ?? "a pessoa"} da equipa`} onClick={() => mudar(e.id, (x) => ({ ...x, membros: x.membros.filter((y) => y !== m) }))}><X className="h-3.5 w-3.5" /></button>
                  </li>); })}
              </ul>
              {livres.length > 0 && (
                <label className="grid gap-1 text-sm font-medium">Juntar um técnico
                  <select value="" onChange={(ev) => { const id = ev.target.value; if (id) mudar(e.id, (x) => ({ ...x, membros: [...x.membros, id] })); }}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-[15px]">
                    <option value="">Escolher…</option>
                    {livres.map((x) => <option key={x.id} value={x.id}>{x.n} · {x.sk}</option>)}
                  </select>
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="t-isolados" className="space-y-2">
        <h2 id="t-isolados" className="text-lg font-semibold">Técnicos isolados <span className="font-normal text-muted-foreground">· {isolados.length}</span></h2>
        <p className="text-sm text-muted-foreground">Escolhem-se tarefa a tarefa, sozinhos.</p>
        <ul className="flex flex-wrap gap-2">
          {isolados.map((x) => <li key={x.id} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"><b className="font-medium">{x.n}</b> <span className="text-muted-foreground">· {x.sk}</span></li>)}
        </ul>
      </section>
    </main>
  );
}
