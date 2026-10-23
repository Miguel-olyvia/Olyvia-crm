// O editor de campos: cada empresa adapta os formulários das fases ao seu setor,
// sem programar. Parte de um modelo de setor e ajusta: nome, opções,
// obrigatório, esconder, ordem e campos novos. Os campos que o motor usa
// (planeamento, sugestões) mudam de nome, mas não se apagam.
// 13/10/2026: segue as regras de desenho (a fase escolhe-se num grupo de opções em vez
// de separadores, os modelos são linhas, alvos de 44 px, texto a 15 px, nada de cartões
// dentro de cartões). As duas partes (`ModelosSetor` e `EditorFases`) também se usam
// dentro das Definições da V2.
import { useId, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PROPOSTA, PAPEL_ROT,
  camposAjustados, chaveLivre, type AjusteGrupo, type Def, type Grupo, type Tipo,
} from "./campos";
import { FASES } from "./motor";
import { SETORES, type Setor } from "./setores";
import { IconeFase, type Ctx } from "./pecas";

const GRUPOS: Grupo[][] = [LEAD, CONTACTO, [EXTERIOR, INTERIOR, AREA, ESCOLHAS], PROPOSTA, FINANCEIRO, OBRA];
const TIPOS: [Tipo, string][] = [["escolha", "Escolha"], ["varios", "Escolha múltipla"], ["sim_nao", "Sim ou não"], ["contador", "Contador"], ["numero", "Número"], ["texto", "Texto curto"], ["data", "Data"], ["texto_longo", "Nota"]];
const NOME_TIPO = Object.fromEntries(TIPOS) as Record<Tipo, string>;
const INP = "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const ESCOLHA = "inline-flex min-h-11 items-center rounded-lg border px-3 text-[15px]";
const ESCOLHA_ON = "border-primary bg-primary text-primary-foreground";
const ESCOLHA_OFF = "border-input bg-card";
const BTN = "h-11 px-4 text-[15px]";

export function CamposEditor(ctx: Ctx) {
  const { A, go } = ctx;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("definicoes"))} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Definições
      </button>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Campos e formulários</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Adapte o que se pergunta em cada fase ao seu negócio. As mudanças aparecem logo nos negócios, e a regra de "não passa de fase sem preencher" segue o que marcar como obrigatório.
      </p>

      <section aria-labelledby="setor-t" className="mt-8">
        <h2 id="setor-t" className="text-lg font-semibold">Começar de um modelo de setor</h2>
        <ModelosSetor {...ctx} />
      </section>

      <EditorFases {...ctx} />
      <p className="mt-6 text-[15px] text-muted-foreground">
        As visitas, as medidas e os serviços do Catálogo têm ecrãs próprios e não se mudam aqui. Na Olyvia, isto fica guardado por empresa; no protótipo, neste browser.
      </p>
    </div>
  );
}

/** Os modelos de setor, um por linha. Escolher um pede confirmação na própria página (os ajustes perdem-se). */
export function ModelosSetor({ S, run, setores = SETORES, onAplicado }: Pick<Ctx, "S" | "run"> & { setores?: Setor[]; onAplicado?: (id: string) => void }) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const atual = S.setor || "remodelacao";
  const setorAtual = setores.find((x) => x.id === atual);
  const alvo = setores.find((x) => x.id === confirmar);
  return (
    <>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {S.setor === "personalizado" ? "Está a usar campos à medida." : `Está a usar o modelo ${setorAtual?.nome ?? ""}.`} Escolher um modelo substitui os ajustes feitos.
      </p>
      <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]" aria-label="Modelos de setor">
        {setores.map((x) => {
          const ativo = atual === x.id;
          return (
            <li key={x.id}>
              <button type="button" aria-pressed={ativo} onClick={() => setConfirmar(ativo ? null : x.id)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[15px]", ativo && "font-semibold")}>{x.nome}</span>
                  <span className="block text-[15px] text-muted-foreground">{x.texto}</span>
                </span>
                {ativo && <span className="inline-flex shrink-0 items-center gap-1.5 text-[15px] text-muted-foreground"><Check className="h-4 w-4 text-primary" aria-hidden="true" />Em uso</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {alvo && (
        <div role="group" aria-label="Confirmar o modelo" className="mt-3 flex flex-wrap items-center gap-3 border-l-2 border-primary py-2 pl-4 animate-in fade-in-0">
          <p className="flex-1 text-[15px]">Usar o modelo {alvo.nome}? Os ajustes que fez perdem-se. Os valores já preenchidos nos negócios ficam.</p>
          <Button variant="ghost" className={BTN} onClick={() => setConfirmar(null)}>Cancelar</Button>
          <Button variant="outline" className={BTN} onClick={() => { run(() => { S.campos = structuredClone(alvo.cfg); S.setor = alvo.id; }); onAplicado?.(alvo.id); setConfirmar(null); }}>Usar este modelo</Button>
        </div>
      )}
    </>
  );
}

/** A fase escolhe-se num grupo de opções (rádio) e os grupos dessa fase aparecem por baixo. */
export function EditorFases({ S, run, nomes = FASES }: Pick<Ctx, "S" | "run"> & { nomes?: readonly string[] }) {
  const [fase, setFase] = useState(2);
  const nome = useId();
  const mexer = (g: Grupo, fn: (a: AjusteGrupo) => void) => run(() => { S.campos ??= {}; fn((S.campos[g.titulo] ??= {})); S.setor = "personalizado"; });
  return (
    <>
      <fieldset className="mt-8">
        <legend className="text-[15px] font-medium">Fase</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FASES.map((f, i) => (
            <label key={f} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[15px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40",
              fase === i ? "border-primary bg-card font-semibold shadow-[var(--shadow-sm)]" : "border-input bg-card text-muted-foreground hover:text-foreground")}>
              <input type="radio" name={nome} value={i} checked={fase === i} onChange={() => setFase(i)} className="sr-only" />
              <IconeFase fase={i} tam="sm" />{nomes[i] || f}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 space-y-6">
        {GRUPOS[fase].map((g) => <EditorGrupo key={g.titulo} S={S} g={g} mexer={mexer} />)}
      </div>
    </>
  );
}

const obrigOn = (c: Def) => !!(c.obrigatorio ?? (!c.opcional && c.t !== "texto_longo"));

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
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Nome do grupo</span>
          <input defaultValue={a.nome || g.titulo} key={a.nome || g.titulo} className={cn(INP, "border-transparent bg-transparent text-lg font-semibold hover:border-input")}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== (a.nome || g.titulo)) mexer(g, (x) => { x.nome = v === g.titulo ? undefined : v; }); }} />
        </label>
        <span className="text-[15px] text-muted-foreground">{cs.filter((c) => !c.escondido).length} campos</span>
        <Button variant="ghost" className={BTN} onClick={() => mexer(g, (x) => { x.oculto = !x.oculto; })}>
          {a.oculto ? <><Eye className="h-4 w-4" />Mostrar o grupo</> : <><EyeOff className="h-4 w-4" />Esconder o grupo</>}
        </Button>
      </header>
      {!a.oculto && (
        <ul className="divide-y divide-border">
          {cs.map((c, i) => (
            <li key={c.k} className={cn("px-4 py-2 sm:px-5", c.escondido && "bg-muted/40")}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex">
                  <button type="button" aria-label={`Subir ${c.l}`} disabled={i === 0} onClick={() => mover(c.k, -1)} className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Descer ${c.l}`} disabled={i === cs.length - 1} onClick={() => mover(c.k, 1)} className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => setAbertoK(abertoK === c.k ? null : c.k)} className="min-h-11 min-w-0 flex-1 text-left" aria-expanded={abertoK === c.k}>
                  <span className={cn("block text-[15px] font-medium", c.escondido && "text-muted-foreground line-through")}>{c.l}</span>
                  <span className="block text-[15px] text-muted-foreground">
                    {NOME_TIPO[c.t] || c.t}{c.op ? ` · ${c.op.length} opções` : ""}{c.bloco ? ` · ${c.bloco}` : ""}
                    {c.papel && ` · ${PAPEL_ROT[c.papel]}`}
                    {c.novo && " · campo da empresa"}
                  </span>
                </button>
                <button type="button" role="switch" aria-checked={obrigOn(c)} aria-label={`Obrigatório: ${c.l}`}
                  onClick={() => mexer(g, (x) => { x.obrig = { ...x.obrig, [c.k]: !obrigOn(c) }; })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] text-muted-foreground hover:bg-muted">
                  <span className={cn("relative h-5 w-9 rounded-full transition-colors", obrigOn(c) ? "bg-primary" : "bg-input")}>
                    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", obrigOn(c) ? "left-[18px]" : "left-0.5")} />
                  </span>
                  Obrigatório
                </button>
                {c.novo ? (
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Apagar ${c.l}`} onClick={() => mexer(g, (x) => { x.novos = (x.novos || []).filter((n) => n.k !== c.k); })}><Trash2 className="h-4 w-4" /></Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={c.escondido ? `Mostrar ${c.l}` : `Esconder ${c.l}`}
                    onClick={() => mexer(g, (x) => { const o = new Set(x.ocultos || []); if (o.has(c.k)) o.delete(c.k); else o.add(c.k); x.ocultos = [...o]; })}>
                    {c.escondido ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {abertoK === c.k && (
                <div className="mb-2 mt-2 grid gap-4 border-l-2 border-border pl-4 animate-in fade-in-0 slide-in-from-top-1 sm:ml-[5.5rem]">
                  <label className="grid gap-1.5 text-[15px] font-medium">Pergunta
                    <input defaultValue={c.l} key={c.l} className={INP}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.l) mexer(g, (x) => {
                        if (c.novo) x.novos = (x.novos || []).map((n) => (n.k === c.k ? { ...n, l: v } : n)); else x.rotulos = { ...x.rotulos, [c.k]: v };
                      }); }} />
                  </label>
                  {c.op && (
                    <div className="grid gap-2">
                      <span className="text-[15px] font-medium">Opções</span>
                      <Opcoes op={c.op} onSet={(op) => mexer(g, (x) => {
                        if (c.novo) x.novos = (x.novos || []).map((n) => (n.k === c.k ? { ...n, op } : n)); else x.opcoes = { ...x.opcoes, [c.k]: op };
                      })} />
                    </div>
                  )}
                  {c.papel && <p className="text-[15px] text-muted-foreground">Este campo é usado pela Olyvia ({PAPEL_ROT[c.papel]}). Pode mudar o nome e as opções ou escondê-lo, mas não apagá-lo.</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!a.oculto && (
        <div className="border-t border-border px-4 py-2 sm:px-5">
          {novo
            ? <NovoCampo g={g} cs={cs} onCancel={() => setNovo(false)} onAdd={(c) => { mexer(g, (x) => { x.novos = [...(x.novos || []), c]; }); setNovo(false); }} />
            : <button type="button" onClick={() => setNovo(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-medium hover:bg-muted"><Plus className="h-4 w-4 text-primary" aria-hidden="true" />Novo campo</button>}
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
        <span key={o} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-input bg-card pl-3 pr-0.5 text-[15px]">
          {o}
          <button type="button" aria-label={`Tirar ${o}`} disabled={op.length <= 2} onClick={() => onSet(op.filter((x) => x !== o))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-30"><X className="h-4 w-4" /></button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); juntar(); } }} placeholder="Nova opção" aria-label="Nova opção"
          className="h-11 w-40 rounded-full border border-dashed border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary" />
        <Button variant="ghost" className={BTN} onClick={juntar} disabled={!v.trim()}>Juntar</Button>
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
  const id = useId();
  const pronto = l.trim() && ((t !== "escolha" && t !== "varios") || op.length >= 2);
  const criar = () => {
    if (!pronto) return;
    onAdd({ k: chaveLivre(l, cs.map((c) => c.k)), l: l.trim(), t, op: t === "escolha" || t === "varios" ? op : undefined, novo: true, obrigatorio: obrig, bloco: bloco || undefined, min: t === "contador" ? 0 : undefined, max: t === "contador" ? 50 : undefined });
  };
  return (
    <div className="grid gap-4 py-3 animate-in fade-in-0" role="group" aria-label={`Novo campo em ${g.titulo}`}>
      <label className="grid gap-1.5 text-[15px] font-medium">Pergunta<input autoFocus value={l} onChange={(e) => setL(e.target.value)} placeholder="Ex.: Tem garagem?" className={INP} /></label>
      <div className="grid gap-1.5">
        <span className="text-[15px] font-medium" id={`${id}-tipo`}>Tipo de resposta</span>
        <div role="group" aria-labelledby={`${id}-tipo`} className="flex flex-wrap gap-2">
          {TIPOS.map(([k, n]) => (
            <button key={k} type="button" aria-pressed={t === k} onClick={() => setT(k)} className={cn(ESCOLHA, t === k ? ESCOLHA_ON : ESCOLHA_OFF)}>{n}</button>
          ))}
        </div>
      </div>
      {(t === "escolha" || t === "varios") && (
        <div className="grid gap-1.5">
          <span className="text-[15px] font-medium">Opções (pelo menos 2)</span>
          <div className="flex flex-wrap items-center gap-2">
            {op.map((o) => <span key={o} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-input bg-card pl-3 pr-0.5 text-[15px]">{o}<button type="button" aria-label={`Tirar ${o}`} onClick={() => setOp(op.filter((x) => x !== o))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button></span>)}
            <input value={opT} onChange={(e) => setOpT(e.target.value)} placeholder="Escreva e carregue Enter" aria-label="Nova opção"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const x = opT.trim(); if (x && !op.includes(x)) setOp([...op, x]); setOpT(""); } }}
              className="h-11 w-60 rounded-full border border-dashed border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary" />
          </div>
        </div>
      )}
      {blocos.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-[15px] font-medium" id={`${id}-bloco`}>Fica no bloco</span>
          <div role="group" aria-labelledby={`${id}-bloco`} className="flex flex-wrap gap-2">
            {blocos.map((b) => <button key={b} type="button" aria-pressed={bloco === b} onClick={() => setBloco(b)} className={cn(ESCOLHA, bloco === b ? ESCOLHA_ON : ESCOLHA_OFF)}>{b}</button>)}
          </div>
        </div>
      )}
      <label className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" checked={obrig} onChange={(e) => setObrig(e.target.checked)} className="h-5 w-5 accent-[hsl(var(--primary))]" />Obrigatório para passar de fase</label>
      <div className="flex gap-2">
        <Button variant="ghost" className={BTN} onClick={onCancel}>Cancelar</Button>
        <Button variant="outline" className={BTN} onClick={criar} disabled={!pronto}>Criar o campo</Button>
      </div>
    </div>
  );
}
