// 11/11 (Rúben: «as dropdowns devem ser muito mais bonitas e ter pesquisa e também sugestão de disponibilidade»; «permitir também ir buscar
// equipas, e criar equipas»). Quem faz uma tarefa do plano: um botão com a pessoa e se está livre; ao abrir, a pesquisa, os sugeridos (do
// ofício e livres nesses dias), as equipas (vai a equipa toda) e os outros técnicos; quem está ocupado diz quando fica livre. Em baixo,
// criar uma equipa nova (grava como a área das Equipas de obra). Teclado: setas, Enter, Esc.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { TECS, type Plano, type Tarefa } from "../motor";
import { motivoOcupado, tecnicosDoOficio } from "../preparacaoObra";
import { dataCurta } from "../planoObra";
import { guardarEquipasObra, lerEquipasObra, useEquipasObra, type EquipaObra } from "../equipa/equipasObra";
import { orgDoModoReal } from "../acessosPortal";

type Ocupacao = Map<string, Set<string>>;
interface Opcao { id: string; tipo: "tec" | "equipa"; nome: string; sub: string; livre: boolean; quando?: string; tec: string; grupo: "Sugeridos" | "Equipas" | "Outros técnicos" }

const iniciais = (n: string) => n.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function EscolherQuem({ t, p, ocup, outras, dias, desligado, escolher }: {
  t: Tarefa; p: Plano; ocup: Ocupacao; outras: Tarefa[]; dias: Date[]; desligado?: boolean; escolher: (tec: string) => void;
}) {
  const id = useId();
  const equipas = useEquipasObra().filter((e) => e.ativa && e.membros.length);
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [criar, setCriar] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const procura = useRef<HTMLInputElement>(null);

  // quando fica livre quem está ocupado: o primeiro dia (até 60 dias úteis) em que a tarefa cabe
  const livreA = (tec: string): string | undefined => {
    for (let nd = t.dia + 1; nd < t.dia + 60; nd++) if (motivoOcupado(tec, { dia: nd, dur: t.dur }, p, ocup, outras) == null) return dias[nd] ? dataCurta(dias[nd]) : `daqui a ${nd - t.dia} dias úteis`;
    return undefined;
  };
  const opcoes = useMemo<Opcao[]>(() => {
    const doOficio = new Set(tecnicosDoOficio(t).map((x) => x.id));
    const tecs = TECS.map((x) => {
      const m = motivoOcupado(x.id, t, p, ocup, outras);
      return { id: x.id, tipo: "tec" as const, nome: x.n, sub: `${x.sk}${doOficio.has(x.id) ? "" : " · outro ofício"}`, livre: m == null, quando: m ? `${m}${livreA(x.id) ? ` · livre a ${livreA(x.id)}` : ""}` : undefined, tec: x.id,
        grupo: (doOficio.has(x.id) && m == null ? "Sugeridos" : "Outros técnicos") as Opcao["grupo"] };
    }).sort((a, b) => Number(b.livre) - Number(a.livre) || a.nome.localeCompare(b.nome));
    const eqs = equipas.map((e) => {
      const membros = e.membros.map((m) => TECS.find((x) => x.id === m)).filter((x): x is (typeof TECS)[number] => !!x);
      const quem = membros.find((x) => doOficio.has(x.id)) ?? membros[0];
      const ocupados = membros.filter((x) => motivoOcupado(x.id, t, p, ocup, outras) != null);
      return { id: `eq:${e.id}`, tipo: "equipa" as const, nome: e.nome, sub: membros.map((x) => x.n.split(" ")[0]).join(", "), livre: !ocupados.length,
        quando: ocupados.length ? `${ocupados.map((x) => x.n.split(" ")[0]).join(", ")} ocupad${ocupados.length === 1 ? "o" : "os"}` : undefined, tec: quem?.id ?? "", grupo: "Equipas" as const };
    }).filter((x) => x.tec);
    return [...tecs.filter((x) => x.grupo === "Sugeridos"), ...eqs, ...tecs.filter((x) => x.grupo !== "Sugeridos")];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, p, ocup, outras, equipas]);
  const filtradas = opcoes.filter((o) => !q.trim() || sem(`${o.nome} ${o.sub}`).includes(sem(q.trim())));
  const atual = TECS.find((x) => x.id === t.tec);
  const mAtual = t.tec ? motivoOcupado(t.tec, t, p, ocup, outras) : "sem técnico";

  useEffect(() => { if (aberto) { setQ(""); setAtivo(0); setCriar(false); setTimeout(() => procura.current?.focus(), 0); } }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    window.addEventListener("pointerdown", fora);
    return () => window.removeEventListener("pointerdown", fora);
  }, [aberto]);

  const tomar = (o: Opcao) => { if (o.tec && o.tec !== t.tec) escolher(o.tec); setAberto(false); };
  const teclas = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setAberto(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(filtradas.length - 1, a + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter" && filtradas[ativo]) { e.preventDefault(); tomar(filtradas[ativo]); }
  };

  return (
    <div ref={caixa} className="relative">
      <button type="button" disabled={desligado} aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto((x) => !x)}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border bg-background px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          aberto ? "border-primary ring-1 ring-primary" : "border-input hover:border-foreground/40", desligado && "cursor-default opacity-80")}>
        <span aria-hidden="true" className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold", atual ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{atual ? iniciais(atual.n) : "?"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{atual?.n ?? "Escolher quem faz"}</span>
          <span className={cn("block truncate text-sm", mAtual ? "text-amber-800 dark:text-amber-300" : "text-success")}>{atual ? `${atual.sk} · ${mAtual ?? "livre nestes dias"}` : "ninguém escolhido"}</span>
        </span>
        {!desligado && <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} aria-hidden="true" />}
      </button>

      {aberto && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
          {!criar ? <>
            <label className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input ref={procura} value={q} onChange={(e) => { setQ(e.target.value); setAtivo(0); }} onKeyDown={teclas} placeholder="Procurar pessoa, ofício ou equipa"
                role="combobox" aria-expanded aria-controls={`${id}-lista`} aria-activedescendant={filtradas[ativo] ? `${id}-${filtradas[ativo].id}` : undefined}
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
            </label>
            <ul id={`${id}-lista`} role="listbox" aria-label="Quem faz" className="max-h-80 overflow-y-auto py-1">
              {filtradas.map((o, i) => (
                <li key={o.id}>
                  {(i === 0 || filtradas[i - 1].grupo !== o.grupo) && <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{o.grupo}</p>}
                  <div id={`${id}-${o.id}`} role="option" aria-selected={o.tec === t.tec && o.tipo === "tec"} onPointerEnter={() => setAtivo(i)} onClick={() => tomar(o)}
                    className={cn("mx-1 flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2", i === ativo && "bg-muted")}>
                    <span aria-hidden="true" className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold", o.tipo === "equipa" ? "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" : "bg-primary/10 text-primary")}>
                      {o.tipo === "equipa" ? <Users className="h-4 w-4" /> : iniciais(o.nome)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{o.nome}</span>
                      <span className="block truncate text-sm text-muted-foreground">{o.sub}</span>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", o.livre ? "bg-success/15 text-success" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>
                      {o.livre ? "livre" : o.quando ?? "ocupado"}
                    </span>
                    {o.tec === t.tec && o.tipo === "tec" && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </div>
                </li>
              ))}
              {!filtradas.length && <li className="px-4 py-6 text-center text-[15px] text-muted-foreground">Ninguém com «{q}».</li>}
            </ul>
            <button type="button" onClick={() => setCriar(true)} className="flex min-h-12 w-full items-center gap-2 border-t border-border px-4 text-left text-[15px] font-medium text-primary hover:bg-primary/[0.05]">
              <Plus className="h-4 w-4" aria-hidden="true" />Criar uma equipa
            </button>
          </> : <CriarEquipa fechar={() => setCriar(false)} />}
        </div>
      )}
    </div>
  );
}

/** Uma equipa nova: o nome e quem vai sempre junto (quem já está noutra equipa não aparece). Grava como a área das Equipas de obra. */
function CriarEquipa({ fechar }: { fechar: () => void }) {
  const [nome, setNome] = useState("");
  const [membros, setMembros] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const ocupados = new Set(lerEquipasObra().filter((e) => e.ativa).flatMap((e) => e.membros));
  const livres = TECS.filter((x) => !ocupados.has(x.id));
  const gravar = async () => {
    setAGravar(true); setErro(null);
    const org = orgDoModoReal();
    const nova: EquipaObra = { id: `eq-${Date.now().toString(36)}`, nome: nome.trim(), membros, ativa: true };
    const e = await guardarEquipasObra(org ? supabase : null, org, [...lerEquipasObra(), nova]);
    setAGravar(false);
    if (e) setErro(e); else fechar();
  };
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">Nova equipa</p>
        <button type="button" aria-label="Voltar à lista" onClick={fechar} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Equipa do Diogo)" aria-label="Nome da equipa"
        className="h-12 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      <p className="text-sm text-muted-foreground">Quem vai sempre junto (quando vai um, vai a equipa toda):</p>
      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {livres.map((x) => {
          const on = membros.includes(x.id);
          return (
            <li key={x.id}>
              <button type="button" aria-pressed={on} onClick={() => setMembros((m) => (on ? m.filter((y) => y !== x.id) : [...m, x.id]))}
                className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-[15px]", on ? "border-primary bg-primary/[0.06]" : "border-transparent hover:bg-muted")}>
                <span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1 truncate">{x.n} <span className="text-muted-foreground">· {x.sk}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={fechar}>Cancelar</Button>
        <Button type="button" className="min-h-11" disabled={!nome.trim() || membros.length < 2 || aGravar} onClick={() => void gravar()}>{aGravar ? "A gravar…" : "Criar a equipa"}</Button>
      </div>
    </div>
  );
}
