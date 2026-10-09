// O editor de campos: cada empresa adapta os formulários das fases ao seu setor,
// sem programar. Parte de um modelo de setor e ajusta: nome, opções,
// obrigatório, esconder, ordem e campos novos. Os campos que o motor usa
// (planeamento, sugestões) mudam de nome, mas não se apagam.
import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PROPOSTA, PAPEL_ROT,
  camposAjustados, chaveLivre, type AjusteGrupo, type Def, type Grupo, type Tipo,
} from "./campos";
import { FASES } from "./motor";
import { SETORES } from "./setores";
import { IconeFase, type Ctx } from "./pecas";

const GRUPOS: Grupo[][] = [LEAD, CONTACTO, [EXTERIOR, INTERIOR, AREA, ESCOLHAS], PROPOSTA, FINANCEIRO, OBRA];
const TIPOS: [Tipo, string][] = [["escolha", "Escolha"], ["sim_nao", "Sim ou não"], ["contador", "Contador"], ["numero", "Número"], ["texto", "Texto curto"], ["data", "Data"], ["texto_longo", "Nota"]];
const NOME_TIPO = Object.fromEntries(TIPOS) as Record<Tipo, string>;
const INP = "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";

export function CamposEditor(ctx: Ctx) {
  const { S, A, go, run } = ctx;
  const [fase, setFase] = useState(2);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const mexer = (g: Grupo, fn: (a: AjusteGrupo) => void) => run(() => { S.campos ??= {}; fn((S.campos[g.titulo] ??= {})); S.setor = "personalizado"; });
  const setorAtual = SETORES.find((x) => x.id === (S.setor || "remodelacao"));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("definicoes"))} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Definições
      </button>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Campos e formulários</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Adapte o que se pergunta em cada fase ao seu negócio. As mudanças aparecem logo nos negócios, e a regra de "não passa de fase sem preencher" segue o que marcar como obrigatório.
      </p>

      {/* Modelos por setor */}
      <section aria-labelledby="setor-t" className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h2 id="setor-t" className="text-lg font-semibold">Começar de um modelo de setor</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {S.setor === "personalizado" ? "Está a usar campos à medida." : `Está a usar o modelo ${setorAtual?.nome}.`} Escolher um modelo substitui os ajustes feitos.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {SETORES.map((x) => {
            const ativo = (S.setor || "remodelacao") === x.id;
            return (
              <button key={x.id} type="button" aria-pressed={ativo} onClick={() => (ativo ? null : setConfirmar(x.id))}
                className={cn("rounded-xl border p-4 text-left transition-colors", ativo ? "border-primary bg-primary/[0.06]" : "border-border hover:border-primary/50")}>
                <span className="block text-[15px] font-semibold">{x.nome}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{x.texto}</span>
              </button>
            );
          })}
        </div>
        {confirmar && (
          <div role="alertdialog" aria-label="Confirmar" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-muted/70 p-4 animate-in fade-in-0">
            <p className="flex-1 text-[15px]">Usar o modelo {SETORES.find((x) => x.id === confirmar)!.nome}? Os ajustes que fez perdem-se. Os valores já preenchidos nos negócios ficam.</p>
            <Button variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button onClick={() => { const x = SETORES.find((y) => y.id === confirmar)!; run(() => { S.campos = structuredClone(x.cfg); S.setor = x.id; }); setConfirmar(null); }}>Usar este modelo</Button>
          </div>
        )}
      </section>

      {/* Fases */}
      <div className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Fase">
        {FASES.map((f, i) => (
          <button key={f} type="button" role="tab" aria-selected={fase === i} onClick={() => setFase(i)}
            className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-[15px] transition-colors", fase === i ? "border-primary bg-card font-semibold shadow-[var(--shadow-sm)]" : "border-transparent text-muted-foreground hover:bg-card")}>
            <IconeFase fase={i} tam="sm" />{f}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {GRUPOS[fase].map((g) => <EditorGrupo key={g.titulo} S={S} g={g} mexer={mexer} />)}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        As visitas, as medidas e os serviços do Catálogo têm ecrãs próprios e não se mudam aqui. Na Olyvia, isto fica guardado por empresa; no protótipo, neste browser.
      </p>
    </div>
  );
}

function EditorGrupo({ S, g, mexer }: { S: Ctx["S"]; g: Grupo; mexer: (g: Grupo, fn: (a: AjusteGrupo) => void) => void }) {
  const a = S.campos?.[g.titulo] || {};
  const cs = camposAjustados(S.campos, g);
  const [novo, setNovo] = useState(false);
  const [abertoK, setAbertoK] = useState<string | null>(null);
  const mover = (k: string, dir: -1 | 1) => mexer(g, (x) => {
    const ks = cs.map((c) => c.k), i = ks.indexOf(k), j = i + dir;
    if (j < 0 || j >= ks.length) return;
    [ks[i], ks[j]] = [ks[j], ks[i]]; x.ordem = ks;
  });

  return (
    <section className={cn("rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]", a.oculto && "opacity-60")} aria-label={a.nome || g.titulo}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Nome do grupo</span>
          <input defaultValue={a.nome || g.titulo} key={a.nome || g.titulo} className={cn(INP, "h-11 border-transparent bg-transparent text-lg font-semibold hover:border-input")}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== (a.nome || g.titulo)) mexer(g, (x) => { x.nome = v === g.titulo ? undefined : v; }); }} />
        </label>
        <span className="text-sm text-muted-foreground">{cs.filter((c) => !c.escondido).length} campos</span>
        <Button variant="ghost" size="sm" onClick={() => mexer(g, (x) => { x.oculto = !x.oculto; })}>
          {a.oculto ? <><Eye className="mr-1.5 h-4 w-4" />Mostrar o grupo</> : <><EyeOff className="mr-1.5 h-4 w-4" />Esconder o grupo</>}
        </Button>
      </header>
      {!a.oculto && (
        <ul className="divide-y divide-border">
          {cs.map((c, i) => (
            <li key={c.k} className={cn("px-4 py-3 sm:px-5", c.escondido && "bg-muted/40")}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col">
                  <button type="button" aria-label={`Subir ${c.l}`} disabled={i === 0} onClick={() => mover(c.k, -1)} className="grid h-6 w-8 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Descer ${c.l}`} disabled={i === cs.length - 1} onClick={() => mover(c.k, 1)} className="grid h-6 w-8 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => setAbertoK(abertoK === c.k ? null : c.k)} className="min-w-0 flex-1 text-left" aria-expanded={abertoK === c.k}>
                  <span className={cn("block text-[15px] font-medium", c.escondido && "text-muted-foreground line-through")}>{c.l}</span>
                  <span className="block text-sm text-muted-foreground">
                    {NOME_TIPO[c.t] || c.t}{c.op ? ` · ${c.op.length} opções` : ""}{c.bloco ? ` · ${c.bloco}` : ""}
                    {c.papel && <span className="text-primary"> · {PAPEL_ROT[c.papel]}</span>}
                    {c.novo && <span className="text-teal-700"> · campo da empresa</span>}
                  </span>
                </button>
                <button type="button" role="switch" aria-checked={!!(c.obrigatorio ?? (!c.opcional && c.t !== "texto_longo"))} aria-label={`Obrigatório: ${c.l}`}
                  onClick={() => mexer(g, (x) => { x.obrig = { ...x.obrig, [c.k]: !(c.obrigatorio ?? (!c.opcional && c.t !== "texto_longo")) }; })}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted">
                  <span className={cn("relative h-5 w-9 rounded-full transition-colors", (c.obrigatorio ?? (!c.opcional && c.t !== "texto_longo")) ? "bg-primary" : "bg-input")}>
                    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", (c.obrigatorio ?? (!c.opcional && c.t !== "texto_longo")) ? "left-[18px]" : "left-0.5")} />
                  </span>
                  Obrigatório
                </button>
                {c.novo ? (
                  <Button variant="ghost" size="icon" aria-label={`Apagar ${c.l}`} onClick={() => mexer(g, (x) => { x.novos = (x.novos || []).filter((n) => n.k !== c.k); })}><Trash2 className="h-4 w-4" /></Button>
                ) : (
                  <Button variant="ghost" size="icon" aria-label={c.escondido ? `Mostrar ${c.l}` : `Esconder ${c.l}`}
                    onClick={() => mexer(g, (x) => { const o = new Set(x.ocultos || []); if (o.has(c.k)) o.delete(c.k); else o.add(c.k); x.ocultos = [...o]; })}>
                    {c.escondido ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {abertoK === c.k && (
                <div className="mt-3 grid gap-4 rounded-xl bg-muted/50 p-4 animate-in fade-in-0 slide-in-from-top-1 sm:ml-11">
                  <label className="grid gap-1.5 text-sm font-medium">Pergunta
                    <input defaultValue={c.l} key={c.l} className={INP}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.l) mexer(g, (x) => {
                        if (c.novo) x.novos = (x.novos || []).map((n) => (n.k === c.k ? { ...n, l: v } : n)); else x.rotulos = { ...x.rotulos, [c.k]: v };
                      }); }} />
                  </label>
                  {c.op && (
                    <div className="grid gap-2">
                      <span className="text-sm font-medium">Opções</span>
                      <Opcoes op={c.op} onSet={(op) => mexer(g, (x) => {
                        if (c.novo) x.novos = (x.novos || []).map((n) => (n.k === c.k ? { ...n, op } : n)); else x.opcoes = { ...x.opcoes, [c.k]: op };
                      })} />
                    </div>
                  )}
                  {c.papel && <p className="text-sm text-muted-foreground">Este campo é usado pela Olyvia ({PAPEL_ROT[c.papel]}). Pode mudar o nome e as opções ou escondê-lo, mas não apagá-lo.</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!a.oculto && (
        <div className="border-t border-border p-4 sm:px-5">
          {novo
            ? <NovoCampo g={g} cs={cs} onCancel={() => setNovo(false)} onAdd={(c) => { mexer(g, (x) => { x.novos = [...(x.novos || []), c]; }); setNovo(false); }} />
            : <button type="button" onClick={() => setNovo(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-medium text-primary hover:bg-primary/[0.06]"><Plus className="h-4 w-4" />Novo campo</button>}
        </div>
      )}
    </section>
  );
}

function Opcoes({ op, onSet }: { op: string[]; onSet: (op: string[]) => void }) {
  const [v, setV] = useState("");
  const juntar = () => { const x = v.trim(); if (x && !op.includes(x)) onSet([...op, x]); setV(""); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {op.map((o) => (
        <span key={o} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-input bg-card pl-3 pr-1 text-sm">
          {o}
          <button type="button" aria-label={`Tirar ${o}`} disabled={op.length <= 2} onClick={() => onSet(op.filter((x) => x !== o))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); juntar(); } }} placeholder="Nova opção"
          className="h-9 w-36 rounded-full border border-dashed border-input bg-card px-3 text-sm outline-none focus-visible:border-primary" />
        <Button size="sm" variant="ghost" onClick={juntar} disabled={!v.trim()}>Juntar</Button>
      </span>
    </div>
  );
}

function NovoCampo({ g, cs, onAdd, onCancel }: { g: Grupo; cs: Def[]; onAdd: (c: Def) => void; onCancel: () => void }) {
  const [l, setL] = useState("");
  const [t, setT] = useState<Tipo>("escolha");
  const [op, setOp] = useState<string[]>([]);
  const [opT, setOpT] = useState("");
  const [obrig, setObrig] = useState(true);
  const blocos = [...new Set(cs.map((c) => c.bloco).filter(Boolean))] as string[];
  const [bloco, setBloco] = useState(blocos[0] || "");
  const pronto = l.trim() && (t !== "escolha" || op.length >= 2);
  const criar = () => {
    if (!pronto) return;
    onAdd({ k: chaveLivre(l, cs.map((c) => c.k)), l: l.trim(), t, op: t === "escolha" ? op : undefined, novo: true, obrigatorio: obrig, bloco: bloco || undefined, min: t === "contador" ? 0 : undefined, max: t === "contador" ? 50 : undefined });
  };
  return (
    <div className="grid gap-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4 animate-in fade-in-0" role="group" aria-label={`Novo campo em ${g.titulo}`}>
      <label className="grid gap-1.5 text-sm font-medium">Pergunta<input autoFocus value={l} onChange={(e) => setL(e.target.value)} placeholder="Ex.: Tem garagem?" className={INP} /></label>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium" id="novo-tipo">Tipo de resposta</span>
        <div role="group" aria-labelledby="novo-tipo" className="flex flex-wrap gap-2">
          {TIPOS.map(([k, n]) => (
            <button key={k} type="button" aria-pressed={t === k} onClick={() => setT(k)}
              className={cn("min-h-10 rounded-lg border px-3 text-sm", t === k ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>{n}</button>
          ))}
        </div>
      </div>
      {t === "escolha" && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Opções (pelo menos 2)</span>
          <div className="flex flex-wrap items-center gap-2">
            {op.map((o) => <span key={o} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-input bg-card pl-3 pr-1 text-sm">{o}<button type="button" aria-label={`Tirar ${o}`} onClick={() => setOp(op.filter((x) => x !== o))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted"><X className="h-3.5 w-3.5" /></button></span>)}
            <input value={opT} onChange={(e) => setOpT(e.target.value)} placeholder="Escreva e carregue Enter"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const x = opT.trim(); if (x && !op.includes(x)) setOp([...op, x]); setOpT(""); } }}
              className="h-9 w-56 rounded-full border border-dashed border-input bg-card px-3 text-sm outline-none focus-visible:border-primary" />
          </div>
        </div>
      )}
      {blocos.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium" id="novo-bloco">Fica no bloco</span>
          <div role="group" aria-labelledby="novo-bloco" className="flex flex-wrap gap-2">
            {blocos.map((b) => <button key={b} type="button" aria-pressed={bloco === b} onClick={() => setBloco(b)} className={cn("min-h-10 rounded-lg border px-3 text-sm", bloco === b ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>{b}</button>)}
          </div>
        </div>
      )}
      <label className="inline-flex items-center gap-2 text-[15px]"><input type="checkbox" checked={obrig} onChange={(e) => setObrig(e.target.checked)} className="h-5 w-5 accent-[hsl(var(--primary))]" />Obrigatório para passar de fase</label>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={criar} disabled={!pronto}>Criar o campo</Button>
      </div>
    </div>
  );
}
