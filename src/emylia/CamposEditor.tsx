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
import { FASES, type Estado } from "./motor";
import { SETORES, type Setor } from "./setores";
import { IconeFase, type Ctx } from "./pecas";
import type { LigacaoFase } from "@/hooks/pessoas/workflow/useLigacoesFase";

/** Os formulários (distintos, pelo id) que enviam respostas para uma pergunta (ou, sem `chave`, para qualquer pergunta do grupo). */
export function formulariosDe(ligacoes: readonly LigacaoFase[] | undefined, grupo: string, chave?: string): string[] {
  const vistos = new Map<string, string>();
  for (const l of ligacoes ?? []) {
    if (l.grupo !== grupo || (chave !== undefined && l.chave !== chave)) continue;
    vistos.set(l.form_id || l.form_nome, l.form_nome || l.field_label);
  }
  return [...vistos.values()];
}
const nForms = (n: number) => (n === 1 ? "1 formulário" : `${n} formulários`);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** A confirmação inline (como «Confirmar o modelo»): diz o que se perde e deixa cancelar. */
function ConfirmarAlteracao({ texto, ok, onOk, onCancel }: { texto: string; ok: string; onOk: () => void; onCancel: () => void }) {
  return (
    <div role="group" aria-label="Confirmar a alteração" className="flex flex-wrap items-center gap-3 border-l-2 border-primary py-2 pl-4 animate-in fade-in-0">
      <p className="flex-1 text-[15px]">{texto}</p>
      <Button variant="ghost" className={BTN} autoFocus onClick={onCancel}>Cancelar</Button>
      <Button variant="outline" className={BTN} onClick={onOk}>{ok}</Button>
    </div>
  );
}

/** 3/11 (Rúben): o editor só precisa dos ajustes; assim usa-se também fora do protótipo (Pessoas › Workflow › Campos das fases). */
type AjustesS = Pick<Estado, "campos" | "setor">;

const GRUPOS: Grupo[][] = [LEAD, CONTACTO, [EXTERIOR, INTERIOR, AREA, ESCOLHAS], PROPOSTA, FINANCEIRO, OBRA];
// 4/11 (Rúben): o texto longo (a caixa maior) chamava-se «Nota» e não se encontrava: fica ao lado do texto curto
const TIPOS: [Tipo, string][] = [["escolha", "Escolha"], ["varios", "Escolha múltipla"], ["sim_nao", "Sim ou não"], ["contador", "Contador"], ["numero", "Número"], ["texto", "Texto curto"], ["texto_longo", "Texto longo (caixa maior)"], ["data", "Data"]];
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
        <h2 id="setor-t" className="text-xl font-semibold tracking-tight">Começar de um modelo de setor</h2>
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
export function ModelosSetor({ S, run, setores = SETORES, onAplicado, ligacoes }: Pick<Ctx, "S" | "run"> & { setores?: Setor[]; onAplicado?: (id: string) => void; ligacoes?: LigacaoFase[] }) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const atual = S.setor || "remodelacao";
  const setorAtual = setores.find((x) => x.id === atual);
  const alvo = setores.find((x) => x.id === confirmar);
  const totalLigados = new Set((ligacoes ?? []).map((l) => l.form_id || l.form_nome)).size;
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
          <p className="flex-1 text-[15px]">Usar o modelo {alvo.nome}? Os ajustes que fez perdem-se. Os valores já preenchidos nos negócios ficam.{totalLigados > 0 && ` Há ${nForms(totalLigados)} a enviar respostas para perguntas das fases: as que o modelo não tiver deixam de ser sugeridas.`}</p>
          <Button variant="ghost" className={BTN} onClick={() => setConfirmar(null)}>Cancelar</Button>
          <Button variant="outline" className={BTN} onClick={() => { run(() => { S.campos = structuredClone(alvo.cfg); S.setor = alvo.id; }); onAplicado?.(alvo.id); setConfirmar(null); }}>Usar este modelo</Button>
        </div>
      )}
    </>
  );
}

/** A fase escolhe-se num grupo de opções (rádio) e os grupos dessa fase aparecem por baixo. */
export function EditorFases({ S, run, nomes = FASES, ligacoes }: { S: AjustesS; run: Ctx["run"]; nomes?: readonly string[]; ligacoes?: LigacaoFase[] }) {
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
        {GRUPOS[fase].map((g) => <EditorGrupo key={g.titulo} S={S} g={g} mexer={mexer} ligacoes={ligacoes} />)}
      </div>
    </>
  );
}

const obrigOn = (c: Def) => !!(c.obrigatorio ?? (!c.opcional && c.t !== "texto_longo"));

function EditorGrupo({ S, g, mexer, ligacoes }: { S: AjustesS; g: Grupo; mexer: (g: Grupo, fn: (a: AjusteGrupo) => void) => void; ligacoes?: LigacaoFase[] }) {
  const a = S.campos?.[g.titulo] || {};
  const cs = camposAjustados(S.campos, g);
  const [novo, setNovo] = useState(false);
  const [abertoK, setAbertoK] = useState<string | null>(null);
  // a ligação campo do formulário -> pergunta é por grupo (título estável) e chave: renomear não a parte, apagar ou esconder sim
  const [confirma, setConfirma] = useState<{ texto: string; ok: string; fazer: () => void } | null>(null);
  const pedir = (n: number, texto: string, ok: string, fazer: () => void) => { if (n === 0) fazer(); else setConfirma({ texto, ok, fazer }); };
  const aoApagar = (c: Def, fazer: () => void) => {
    const n = formulariosDe(ligacoes, g.titulo, c.k).length;
    pedir(n, `Esta pergunta recebe respostas de ${nForms(n)}. Se a apagar, deixam de ser sugeridas.`, "Apagar a pergunta", fazer);
  };
  const aoEsconder = (c: Def, fazer: () => void) => {
    const n = formulariosDe(ligacoes, g.titulo, c.k).length;
    pedir(n, `Esta pergunta recebe respostas de ${nForms(n)}. Escondida, deixam de ser sugeridas.`, "Esconder a pergunta", fazer);
  };
  const aoEsconderGrupo = () => {
    const n = formulariosDe(ligacoes, g.titulo).length;
    pedir(n, `Este grupo recebe respostas de ${nForms(n)}. Escondido, deixam de ser sugeridas.`, "Esconder o grupo", () => mexer(g, (x) => { x.oculto = true; }));
  };
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
        <Button variant="ghost" className={BTN} onClick={() => { if (a.oculto) mexer(g, (x) => { x.oculto = false; }); else aoEsconderGrupo(); }}>
          {a.oculto ?<><Eye className="h-4 w-4" />Mostrar o grupo</> : <><EyeOff className="h-4 w-4" />Esconder o grupo</>}
        </Button>
      </header>
      {confirma && (
        <div className="px-4 py-2 sm:px-5">
          <ConfirmarAlteracao texto={confirma.texto} ok={confirma.ok} onCancel={() => setConfirma(null)} onOk={() => { const f = confirma.fazer; setConfirma(null); f(); }} />
        </div>
      )}
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
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Apagar ${c.l}`} onClick={() => aoApagar(c, () => mexer(g, (x) => { x.novos = (x.novos || []).filter((n) => n.k !== c.k); }))}><Trash2 className="h-4 w-4" /></Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={c.escondido ? `Mostrar ${c.l}` : `Esconder ${c.l}`}
                    onClick={() => {
                      const alternar = () => mexer(g, (x) => { const o = new Set(x.ocultos || []); if (o.has(c.k)) o.delete(c.k); else o.add(c.k); x.ocultos = [...o]; });
                      if (c.escondido) alternar(); else aoEsconder(c, alternar);
                    }}>
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
                      <Opcoes op={c.op} varios={c.t === "varios"} alvosDe={(o) => alvosDaOpcao(ligacoes, g.titulo, c.k, o)} onSet={(op) => mexer(g, (x) => {
                        if (c.novo) x.novos = (x.novos || []).map((n) => (n.k === c.k ? { ...n, op } : n)); else x.opcoes = { ...x.opcoes, [c.k]: op };
                      })} />
                    </div>
                  )}
                  {c.op && (c.t === "escolha" || c.t === "varios") && (
                    <Detalhe op={c.op} on={c.detalhe ?? []} onSet={(detalhe) => mexer(g, (x) => {
                      if (c.novo) x.novos = (x.novos || []).map((n) => (n.k === c.k ? { ...n, detalhe } : n)); else x.detalhes = { ...x.detalhes, [c.k]: detalhe };
                    })} />
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

/** 4/11 (Rúben): as opções que, escolhidas, abrem uma caixa para escrever mais detalhe (ex.: «Outro»). */
function Detalhe({ op, on, onSet }: { op: string[]; on: string[]; onSet: (detalhe: string[]) => void }) {
  const rot = useId();
  return (
    <div className="grid gap-2">
      <span id={rot} className="text-[15px] font-medium">Pedir mais detalhe</span>
      <p className="text-sm text-muted-foreground">Quando se escolhe uma destas opções, aparece uma caixa para escrever (ex.: em «Outro», qual).</p>
      <div role="group" aria-labelledby={rot} className="flex flex-wrap gap-2">
        {op.map((o) => {
          const ligado = on.includes(o);
          return (
            <button key={o} type="button" aria-pressed={ligado} onClick={() => onSet(ligado ? on.filter((x) => x !== o) : [...on, o])}
              className={cn(ESCOLHA, "gap-1.5", ligado ? ESCOLHA_ON : ESCOLHA_OFF)}>
              {ligado && <Check className="h-4 w-4" aria-hidden="true" />}{o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Os rótulos dos campos de formulário cuja tabela de correspondência aponta para esta opção. */
function alvosDaOpcao(ligacoes: readonly LigacaoFase[] | undefined, grupo: string, chave: string, opcao: string): string[] {
  const alvo = semAcento(opcao);
  return (ligacoes ?? [])
    .filter((l) => l.grupo === grupo && l.chave === chave && Object.values(l.valores ?? {}).some((v) => typeof v === "string" && semAcento(v) === alvo))
    .map((l) => l.field_label || l.form_nome);
}

const AVISO_VIRGULA = "Numa pergunta de escolha múltipla a opção não pode ter vírgula: as respostas guardam-se separadas por vírgulas.";

function Opcoes({ op, onSet, varios = false, alvosDe }: { op: string[]; onSet: (op: string[]) => void; varios?: boolean; alvosDe?: (opcao: string) => string[] }) {
  const [v, setV] = useState("");
  const [recusa, setRecusa] = useState(false);
  const [tirar, setTirar] = useState<{ opcao: string; alvos: string[] } | null>(null);
  const juntar = () => {
    const x = v.trim();
    if (varios && x.includes(",")) { setRecusa(true); return; }
    setRecusa(false);
    if (x && !op.includes(x)) onSet([...op, x]);
    setV("");
  };
  const pedirTirar = (o: string) => {
    const alvos = alvosDe?.(o) ?? [];
    if (alvos.length === 0) onSet(op.filter((x) => x !== o)); else setTirar({ opcao: o, alvos });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {op.map((o) => (
        <span key={o} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-input bg-card pl-3 pr-0.5 text-[15px]">
          {o}
          <button type="button" aria-label={`Tirar ${o}`} disabled={op.length <= 2} onClick={() => pedirTirar(o)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-30"><X className="h-4 w-4" /></button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <input value={v} onChange={(e) => { setV(e.target.value); setRecusa(false); }} aria-invalid={recusa || undefined} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); juntar(); } }} placeholder="Nova opção" aria-label="Nova opção"
          className="h-11 w-40 rounded-full border border-dashed border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary" />
        <Button variant="ghost" className={BTN} onClick={juntar} disabled={!v.trim()}>Juntar</Button>
      </span>
      <p role="status" aria-live="polite" className={cn("basis-full text-[15px] text-destructive", !recusa && "sr-only")}>{recusa ? AVISO_VIRGULA : ""}</p>
      {tirar && (
        <div className="basis-full">
          <ConfirmarAlteracao
            texto={`A opção “${tirar.opcao}” é o destino de uma correspondência em ${tirar.alvos.join(", ")}. Se a tirar, essas respostas deixam de ser sugeridas.`}
            ok="Tirar a opção" onCancel={() => setTirar(null)}
            onOk={() => { const o = tirar.opcao; setTirar(null); onSet(op.filter((x) => x !== o)); }}
          />
        </div>
      )}
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
  const [recusa, setRecusa] = useState(false);
  const pronto = l.trim() && ((t !== "escolha" && t !== "varios") || op.length >= 2) && !(t === "varios" && op.some((o) => o.includes(",")));
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
            <input value={opT} onChange={(e) => { setOpT(e.target.value); setRecusa(false); }} placeholder="Escreva e carregue Enter" aria-label="Nova opção" aria-invalid={recusa || undefined}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const x = opT.trim();
                if (t === "varios" && x.includes(",")) { setRecusa(true); return; }
                if (x && !op.includes(x)) setOp([...op, x]);
                setOpT("");
              }}
              className="h-11 w-60 rounded-full border border-dashed border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary" />
          </div>
          <p role="status" aria-live="polite" className={cn("text-[15px] text-destructive", !(recusa || (t === "varios" && op.some((o) => o.includes(",")))) && "sr-only")}>
            {recusa || (t === "varios" && op.some((o) => o.includes(","))) ? AVISO_VIRGULA : ""}
          </p>
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
