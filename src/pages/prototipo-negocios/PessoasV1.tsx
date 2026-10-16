// Proposta de 16/10/2026: Pessoas no V1, numa só página e sem separadores (ver docs-design/proposta-v1-pessoas.md).
// A lista tem pesquisa e três grupos; a ficha é uma página com o que fazer agora (um primário), os negócios, o histórico e os dados.
// Sem dashboard, sem filtros em popover, sem painel lateral: o que é de gestão fica para a Direção, o resto para o Hoje.
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Mail, MessageCircle, Phone, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GRUPOS_V1, contagensV1, fichaV1, listaV1, pessoaV1, type GrupoV1, type LinhaV1 } from "./pessoasV1Docs";
import { fazer, type Ctx } from "./pecas";

/** O que a página lembra quando se abre um negócio e se volta (a página desmonta). */
interface Memoria { sel: string | null; grupo: GrupoV1; q: string }
const VAZIA: Memoria = { sel: null, grupo: "curso", q: "" };
let memoria: Memoria = VAZIA;
export function esquecerPessoasV1(): void { memoria = VAZIA; }

const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
const soDigitos = (t: string): string => t.replace(/\D/g, "");

export function PessoasV1({ S, A, go }: Ctx) {
  const [sel, setSelE] = useState<string | null>(memoria.sel);
  const [grupo, setGrupoE] = useState<GrupoV1>(memoria.grupo);
  const [q, setQE] = useState(memoria.q);
  const setSel = (v: string | null) => { setSelE(v); memoria = { ...memoria, sel: v }; };
  const setGrupo = (v: GrupoV1) => { setGrupoE(v); memoria = { ...memoria, grupo: v }; };
  const setQ = (v: string) => { setQE(v); memoria = { ...memoria, q: v }; };

  const p = sel ? pessoaV1(S, sel) : undefined;
  if (p) return <FichaV1Pagina ctx={{ S, A, go }} nome={p.nome} voltar={() => setSel(null)} />;

  const n = contagensV1(S), linhas = listaV1(S, grupo, q), procura = q.trim() !== "";
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pessoas</h1>
          <p className="mt-1 text-base text-muted-foreground">{n.curso} em curso · {n.clientes} clientes</p>
        </div>
        <Button size="lg" className="min-h-11" onClick={go(() => A.novo())}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead</Button>
      </header>

      <label className="relative mt-6 block">
        <span className="sr-only">Procurar</span>
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" placeholder="Procurar nome, telefone, serviço ou localidade" value={q} onChange={(e) => setQ(e.target.value)}
          className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      </label>

      {/* três grupos, em segmentos (C4); com pesquisa procura-se em todos e os segmentos saem */}
      {!procura && (
        <div role="group" aria-label="Mostrar" className="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-input">
          {GRUPOS_V1.map((g, i) => (
            <button key={g.id} type="button" aria-pressed={grupo === g.id} onClick={() => setGrupo(g.id)}
              className={cn("min-h-11 px-2 text-[15px] transition-colors", i > 0 && "border-l border-input",
                grupo === g.id ? "bg-foreground font-semibold text-background" : "bg-card hover:bg-muted")}>
              {g.nome} <span className="tabular-nums opacity-70">{n[g.id]}</span>
            </button>
          ))}
        </div>
      )}

      <p className="sr-only" aria-live="polite">{linhas.length} pessoas</p>
      {linhas.length === 0
        ? <p className="mt-6 text-[15px] text-muted-foreground">{procura ? "Ninguém com esse nome, telefone ou serviço." : grupo === "perdidas" ? "Nenhuma pessoa perdida." : "Ninguém aqui. As leads novas aparecem em \"Em curso\"."}</p>
        : <ul className={cn("mt-6", LISTA)}>{linhas.map((l) => <Linha key={l.nome} l={l} procura={procura} abrir={() => setSel(l.nome)} />)}</ul>}
    </div>
  );
}

function Linha({ l, procura, abrir }: { l: LinhaV1; procura: boolean; abrir: () => void }) {
  return (
    <li>
      <button type="button" onClick={abrir} className="group flex min-h-16 w-full items-center gap-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-2">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-foreground">
            {l.nome}
            {(procura || l.papel === "Cliente") && <span className="font-normal text-muted-foreground"> · {l.papel}</span>}
            {l.exemplo && <span className="font-normal text-muted-foreground"> · exemplo</span>}
          </span>
          <span className="block text-[15px] text-muted-foreground">{l.oQue}</span>
          <span className={cn("mt-0.5 flex items-center gap-1.5 text-[15px]", l.atrasada ? "text-destructive" : "text-foreground")}>
            {l.atrasada && <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {l.atrasada ? "Atrasada · " : ""}{l.proximo}
          </span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function FichaV1Pagina({ ctx: { S, A, go }, nome, voltar }: { ctx: Pick<Ctx, "S" | "A" | "go">; nome: string; voltar: () => void }) {
  const p = pessoaV1(S, nome)!;
  const f = fichaV1(S, p);
  const [tudo, setTudo] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, [nome]);
  const hist = tudo ? f.historico : f.historico.slice(0, 4);
  const tel = soDigitos(f.tel);
  const contacto = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-4 text-[15px] hover:border-foreground/40";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      {/* R2 cabeçalho */}
      <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Pessoas
      </button>
      <h1 ref={titulo} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight outline-none">{f.nome}</h1>
      <p className="mt-1 text-base text-muted-foreground">{f.sub}{f.exemplo ? " · exemplo" : ""}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tel && <a href={"tel:" + tel} className={contacto}><Phone className="h-4 w-4" aria-hidden="true" />Ligar</a>}
        {tel && <a href={"https://wa.me/351" + tel.slice(-9)} target="_blank" rel="noreferrer" className={contacto}><MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp</a>}
        {f.email && <a href={"mailto:" + f.email} className={contacto}><Mail className="h-4 w-4" aria-hidden="true" />Email</a>}
      </div>

      {/* R3 o que fazer agora: uma frase e um primário */}
      <section aria-labelledby="agora" className="mt-8 rounded-2xl border border-primary/25 bg-card p-5 shadow-[var(--shadow-md)] sm:p-6">
        <h2 id="agora" className="text-sm font-medium text-primary">O que fazer agora</h2>
        <p className={cn("mt-2 text-xl font-semibold", f.agora.atrasada && "flex items-center gap-2")}>
          {f.agora.atrasada && <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />}
          {f.agora.t}{f.agora.atrasada && <span className="text-base font-normal text-destructive"> · atrasada</span>}
        </p>
        {f.agora.sub && <p className="mt-1 text-base text-muted-foreground">{f.agora.sub}</p>}
        {f.agora.de && <p className="mt-1 text-base text-muted-foreground">Este passo é de {f.agora.de}.</p>}
        {f.agora.id !== null && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {f.agora.btn && f.agora.act && <Button size="lg" onClick={go(() => fazer(A, f.agora.act!, f.agora.id!))}>{f.agora.btn}</Button>}
            <Button size="lg" variant={f.agora.btn ? "ghost" : "outline"} onClick={go(() => A.abrir(f.agora.id!))}>Abrir o negócio</Button>
          </div>
        )}
      </section>

      {/* R4 os negócios: uma lista, cada um abre a sua página */}
      <section aria-labelledby="negs" className="mt-10">
        <h2 id="negs" className="text-lg font-semibold">Negócios</h2>
        <ul className={cn("mt-3", LISTA)}>
          {f.negocios.map((n) => {
            const corpo = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">{n.titulo}</span>
                  <span className="block text-[15px] text-muted-foreground">{n.estado}{n.nota ? " · " + n.nota : ""}{n.abre === null ? " · exemplo" : ""}</span>
                </span>
                <span className="shrink-0 text-right text-[15px] font-medium tabular-nums">{n.valor}</span>
              </>
            );
            return (
              <li key={n.id}>
                {n.abre === null
                  ? <div className="flex min-h-16 items-center gap-4 py-3 sm:px-2">{corpo}</div>
                  : (
                    <button type="button" onClick={go(() => A.abrir(n.abre!))} className="group flex min-h-16 w-full items-center gap-4 py-3 text-left hover:bg-muted/50 sm:px-2">
                      {corpo}<ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                    </button>
                  )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="hist" className="mt-10">
        <h2 id="hist" className="text-lg font-semibold">Histórico</h2>
        {f.historico.length === 0
          ? <p className="mt-3 text-[15px] text-muted-foreground">Ainda nada. As chamadas, emails e notas aparecem aqui.</p>
          : (
            <ul className={cn("mt-3", LISTA)}>
              {hist.map((h) => (
                <li key={h.id} className="flex min-h-14 flex-wrap items-baseline gap-x-3 py-3 sm:px-2">
                  <span className="min-w-0 flex-1 text-[15px]">{h.titulo}{h.detalhe ? <span className="text-muted-foreground"> · {h.detalhe}</span> : null}</span>
                  <span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">{h.q}</span>
                </li>
              ))}
            </ul>
          )}
        {f.historico.length > 4 && (
          <button type="button" aria-expanded={tudo} onClick={() => setTudo(!tudo)} className="mt-2 min-h-11 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
            {tudo ? "Mostrar menos" : `Ver tudo (${f.historico.length})`}
          </button>
        )}
      </section>

      <section aria-labelledby="dados" className="mt-10">
        <h2 id="dados" className="text-lg font-semibold">Dados</h2>
        <dl className={cn("mt-3", LISTA)}>
          {f.dados.map((x) => (
            <div key={x.rotulo} className="flex min-h-14 flex-wrap items-baseline gap-x-4 py-3 sm:px-2">
              <dt className="w-28 shrink-0 text-[15px] text-muted-foreground">{x.rotulo}</dt>
              <dd className="min-w-0 flex-1 text-[15px]">{x.valor}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
