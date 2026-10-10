// A página de Leads na proposta simples: uma lista curta por urgência e, ao escolher uma lead,
// a ficha na mesma página (negócios, informação, submissões e histórico), sem diálogos.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Euro, FileCheck2, FileSignature, FileText, Mail, MessageCircle, Phone, Plus, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur } from "./motor";
import {
  ESTADO_SUBMISSAO, FILTROS_LEAD, atrasada, etapaDe, filtrarLeads, historicoDe, infoLead, itensNegocios, leadsDe, localDe, proximoDe, submissoesExemplo, tempoDesde,
  type FiltroLead, type InfoLead, type ItemNegocio, type Pessoa, type Submissao,
} from "./leadsDocs";
import { FASE_COR, FASE_ICONE, Chip, fazer, type Ctx } from "./pecas";

type Separador = "negocios" | "info" | "submissoes" | "historico";
const SEPARADORES: { id: Separador; nome: string }[] = [
  { id: "negocios", nome: "Negócios" }, { id: "info", nome: "Informação" }, { id: "submissoes", nome: "Submissões" }, { id: "historico", nome: "Histórico" },
];

const ICONE_TIPO: Record<string, { i: LucideIcon; cor: string }> = {
  Lead: { i: FASE_ICONE[0], cor: FASE_COR[0] }, Contacto: { i: FASE_ICONE[1], cor: FASE_COR[1] }, Visita: { i: FASE_ICONE[2], cor: FASE_COR[2] },
  Orçamento: { i: FileText, cor: FASE_COR[0] }, Proposta: { i: FileCheck2, cor: FASE_COR[3] }, "Proposta conjunta": { i: FileCheck2, cor: FASE_COR[3] },
  Contrato: { i: FileSignature, cor: FASE_COR[2] }, Financeiro: { i: Euro, cor: FASE_COR[4] },
};
const CHIP_PEQ = "h-7 w-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4";
const LINK = "inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-[15px] text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const soDigitos = (t: string): string => t.replace(/\D/g, "");

/** O que a página lembra quando se abre um negócio e se volta: vive fora do componente porque a página desmonta. */
interface Memoria { sel: string | null; sep: Separador; filtro: FiltroLead; soMinhas: boolean; q: string }
const MEMORIA_VAZIA: Memoria = { sel: null, sep: "negocios", filtro: "todas", soMinhas: false, q: "" };
let memoria: Memoria = MEMORIA_VAZIA;
const lembrar = (m: Partial<Memoria>): void => { memoria = { ...memoria, ...m }; };
/** Esquece tudo (por exemplo quando a demonstração é reposta). */
export function esquecerLeads(): void { memoria = MEMORIA_VAZIA; }

export function LeadsSimples({ S, A, go }: Ctx) {
  const [sel, setSelEstado] = useState<string | null>(memoria.sel);
  const [filtro, setFiltroEstado] = useState<FiltroLead>(memoria.filtro);
  const [soMinhas, setSoMinhasEstado] = useState(memoria.soMinhas);
  const [q, setQEstado] = useState(memoria.q);
  const setSel = (v: string | null) => { setSelEstado(v); lembrar(v === null ? { sel: null, sep: "negocios" } : { sel: v }); };
  const setFiltro = (v: FiltroLead) => { setFiltroEstado(v); lembrar({ filtro: v }); };
  const setSoMinhas = (v: boolean) => { setSoMinhasEstado(v); lembrar({ soMinhas: v }); };
  const setQ = (v: string) => { setQEstado(v); lembrar({ q: v }); };
  const todas = leadsDe(S);
  const escolhida = sel ? todas.find((p) => p.nome === sel) : undefined;

  if (escolhida) return <FichaLead S={S} A={A} go={go} p={escolhida} voltar={() => setSel(null)} />;

  const visiveis = filtrarLeads(todas, filtro, soMinhas, q);
  const limpar = () => { setQ(""); setFiltro("todas"); setSoMinhas(false); };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-base text-muted-foreground">{todas.length} pessoas ainda sem contrato · {todas.filter(atrasada).length} atrasadas</p>
        </div>
        <Button size="lg" className="min-h-11" onClick={go(() => A.novo())}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead</Button>
      </header>

      <div className="mt-6 grid gap-3">
        <label className="relative block">
          <span className="sr-only">Procurar</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" placeholder="Procurar nome, telefone ou serviço" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Mostrar">
          {FILTROS_LEAD.map(({ id, nome }) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
              className={cn("min-h-11 shrink-0 rounded-full border px-4 text-[15px] transition-colors", filtro === id ? "border-foreground bg-foreground text-background" : "border-input bg-card hover:border-foreground/40")}>
              {nome} <span className="tabular-nums opacity-70">{filtrarLeads(todas, id, soMinhas, q).length}</span>
            </button>
          ))}
          <button type="button" aria-pressed={soMinhas} onClick={() => setSoMinhas(!soMinhas)}
            className={cn("min-h-11 shrink-0 rounded-full border px-4 text-[15px] transition-colors", soMinhas ? "border-foreground bg-foreground text-background" : "border-input bg-card hover:border-foreground/40")}>
            Só as minhas
          </button>
        </div>
      </div>

      {!visiveis.length ? (
        <div role="status" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-base">Nenhuma lead encontrada.</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={limpar}>Limpar pesquisa e filtros</Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3" aria-label="Leads">
          {visiveis.map((p) => <LinhaLead key={p.nome} p={p} S={S} abrir={() => setSel(p.nome)} />)}
        </ul>
      )}
    </div>
  );
}

function LinhaLead({ p, S, abrir }: { p: Pessoa; S: Ctx["S"]; abrir: () => void }) {
  const d = p.principal, nx = proximoDe(p, S), late = atrasada(p), tempo = tempoDesde(d.quando);
  const loc = localDe(d);
  return (
    <li>
      <button type="button" onClick={abrir}
        className="group block min-h-11 w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <span className="flex items-start justify-between gap-3">
          <span className="block text-base font-semibold text-foreground">{p.nome}</span>
          {late && <span className="inline-flex shrink-0 items-center gap-1.5 text-[15px] font-medium text-foreground"><AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />Atrasada</span>}
        </span>
        <span className="mt-0.5 block text-[15px] text-muted-foreground">{d.servico}{loc ? " · " + loc : ""}</span>
        <span className="mt-0.5 block text-[15px] text-muted-foreground">{d.origem}{tempo ? " · " + tempo : ""}</span>
        <span className="mt-2 block text-[15px] font-medium text-foreground">
          {nx.t}
          {!nx.wait && !nx.done && <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ a ficha */

function FichaLead({ S, A, go, p, voltar }: Pick<Ctx, "S" | "A" | "go"> & { p: Pessoa; voltar: () => void }) {
  const [sep, setSepEstado] = useState<Separador>(memoria.sep);
  const setSep = (v: Separador) => { setSepEstado(v); lembrar({ sep: v }); };
  const d = p.principal, nx = proximoDe(p, S), info = infoLead(p);
  const email = d.f.email;
  const wa = soDigitos(d.tel);
  const teclaSeparador = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = SEPARADORES.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    const id = SEPARADORES[j].id;
    setSep(id);
    document.getElementById(`lead-tab-${id}`)?.focus();
  };
  // Cada perderSim leva a vista para Negócios; no fim volta-se à lista de leads.
  const perder = () => { for (const x of p.negocios) A.perderSim(x.id); A.nav("leads"); voltar(); };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8">
      <button type="button" onClick={go(() => { A.perderNao(); voltar(); })}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar às leads
      </button>

      <header className="mt-2">
        <h1 className="text-3xl font-semibold tracking-tight">{p.nome}</h1>
        <p className="mt-1 text-base text-muted-foreground">{etapaDe(p)} · {d.origem}{tempoDesde(d.quando) ? " · chegou " + tempoDesde(d.quando) : ""}</p>
        <div className="mt-3 flex flex-wrap gap-x-4">
          {wa && <a className={LINK} href={`tel:${wa}`}><Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Ligar</a>}
          {wa && <a className={LINK} href={`https://wa.me/${wa.startsWith("351") ? wa : "351" + wa}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />WhatsApp</a>}
          {email && <a className={LINK} href={`mailto:${email}`}><Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Email</a>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="lg" className="min-h-11" onClick={go(() => (nx.act ? fazer(A, nx.act, d.id) : A.abrir(d.id)))}>
            {nx.btn || "Abrir negócio"}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
          <p className="text-[15px] text-muted-foreground">Próximo passo: {nx.t}</p>
        </div>
      </header>

      <div className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Ficha da lead">
        {SEPARADORES.map(({ id, nome }, i) => (
          <button key={id} type="button" role="tab" id={`lead-tab-${id}`} aria-selected={sep === id} aria-controls="lead-painel" tabIndex={sep === id ? 0 : -1}
            onClick={() => setSep(id)} onKeyDown={(e) => teclaSeparador(e, i)}
            className={cn("min-h-11 shrink-0 rounded-lg px-4 text-[15px]", sep === id ? "bg-foreground text-background" : "bg-muted text-foreground")}>
            {nome}
          </button>
        ))}
      </div>

      <div id="lead-painel" role="tabpanel" aria-labelledby={`lead-tab-${sep}`} tabIndex={0} className="mt-5 focus-visible:outline-none">
        {sep === "negocios" && <Negocios itens={itensNegocios(S, p)} abrir={(id) => go(() => A.abrir(id))} />}
        {sep === "info" && (
          <Informacao info={info} nome={p.nome} abertos={p.negocios.length} confirmar={S.confirmPerda === d.id}
            perder={go(() => A.perder(d.id))} cancelar={go(() => A.perderNao())} confirmarSim={go(perder)} />
        )}
        {sep === "submissoes" && <Submissoes subs={submissoesExemplo(S, p)} />}
        {sep === "historico" && <Historico p={p} />}
      </div>
    </div>
  );
}

function Negocios({ itens, abrir }: { itens: ItemNegocio[]; abrir: (id: number) => () => void }) {
  return (
    <ul className="space-y-3" aria-label="Negócios desta pessoa">
      {itens.map((it) => {
        const ic = ICONE_TIPO[it.tipo] || ICONE_TIPO.Lead;
        return (
          <li key={it.id}>
            <button type="button" onClick={abrir(it.negocioId)}
              className="group block min-h-11 w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <span className="mb-2 flex items-center gap-2 text-[15px] text-muted-foreground">
                <Chip icone={ic.i} cor={ic.cor} className={CHIP_PEQ} />
                <span>{it.tipo}</span>
                {it.demo && <span className="ml-auto text-[15px]">exemplo</span>}
              </span>
              <span className="block text-base font-semibold text-foreground">{it.servico}</span>
              {it.linhas.length > 0 && (
                <span className="mt-2 block divide-y divide-border border-y border-border text-[15px]">
                  {it.linhas.map((l) => <span key={l.rotulo} className="flex justify-between gap-2 py-1.5"><span>{l.rotulo}</span><span className="tabular-nums">{eur(l.valor)} €</span></span>)}
                </span>
              )}
              {it.valor !== null && <span className="mt-2 block text-base font-medium tabular-nums text-foreground">{it.conjunta ? "Total " : ""}{eur(it.valor)} €</span>}
              <span className="mt-2 block text-[15px] font-medium text-foreground">
                {it.proximo}
                <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Lista({ titulo, campos }: { titulo: string; campos: { rotulo: string; valor: string }[] }) {
  if (!campos.length) return null;
  return (
    <section aria-label={titulo} className="border-t border-border pt-4">
      <h2 className="text-[16px] font-semibold">{titulo}</h2>
      <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[11rem_1fr]">
        {campos.map((c) => (
          <div key={c.rotulo} className="contents"><dt className="text-muted-foreground">{c.rotulo}</dt><dd className="text-foreground">{c.valor}</dd></div>
        ))}
      </dl>
    </section>
  );
}

interface InformacaoProps {
  info: InfoLead; nome: string; abertos: number; confirmar: boolean;
  perder: () => void; cancelar: () => void; confirmarSim: () => void;
}

function Informacao({ info, nome, abertos, confirmar, perder, cancelar, confirmarSim }: InformacaoProps) {
  const botaoPerder = useRef<HTMLButtonElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  const jaConfirmou = useRef(false);
  // Ao aparecer a confirmação o foco vai para "Cancelar"; ao fechá-la sem perder, volta ao botão de origem.
  useEffect(() => {
    if (confirmar) botaoCancelar.current?.focus();
    else if (jaConfirmou.current) botaoPerder.current?.focus();
    jaConfirmou.current = confirmar;
  }, [confirmar]);
  const negocios = abertos === 1 ? "o negócio aberto" : `os ${abertos} negócios abertos`;
  return (
    <div className="grid gap-5">
      <Lista titulo="Contacto" campos={info.contacto} />
      <Lista titulo="Local" campos={info.local} />
      <Lista titulo="Origem" campos={info.origem} />
      <Lista titulo="Responsável" campos={[{ rotulo: "Comercial", valor: info.comercial }]} />
      {info.notas && (
        <section aria-label="Notas" className="border-t border-border pt-4">
          <h2 className="text-[16px] font-semibold">Notas</h2>
          <p className="mt-2 text-[15px]">{info.notas}</p>
        </section>
      )}
      <div className="border-t border-border pt-4">
        {confirmar ? (
          <div role="alertdialog" aria-labelledby="lead-perda-texto" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 animate-in fade-in-0">
            <p id="lead-perda-texto" className="flex-1 text-[15px]">
              Marcar {nome} como perdida? Perdem-se {negocios}. Sai das leads, mas fica no histórico.
              {abertos > 1 ? " Cada negócio tem o seu aviso com “Anular”." : ""}
            </p>
            <Button ref={botaoCancelar} type="button" variant="outline" className="min-h-11" aria-label={`Cancelar e manter ${nome} nas leads`} onClick={cancelar}>Cancelar</Button>
            <Button type="button" variant="destructive" className="min-h-11" aria-label={`Sim, marcar ${nome} como perdida e perder ${negocios}`} onClick={confirmarSim}>Sim, marcar como perdida</Button>
          </div>
        ) : (
          <Button ref={botaoPerder} type="button" variant="outline" className="min-h-11" onClick={perder}>Marcar como perdida</Button>
        )}
      </div>
    </div>
  );
}

function Submissoes({ subs }: { subs: Submissao[] }) {
  return (
    <ul className="space-y-3" aria-label="Submissões de formulário">
      {subs.map((s) => (
        <li key={s.id} className="rounded-xl border border-border bg-card p-4">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px]">
            <span className="text-base font-semibold text-foreground">{s.formulario}</span>
            <span className="text-muted-foreground">{s.quando}</span>
          </p>
          <p className="mt-1 text-[15px] font-medium text-foreground">{ESTADO_SUBMISSAO[s.estado]}</p>
          {s.motivo && <p className="text-[15px] text-muted-foreground">{s.motivo}</p>}
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[9rem_1fr]">
            {s.campos.map((c) => (
              <div key={c.rotulo} className="contents"><dt className="text-muted-foreground">{c.rotulo}</dt><dd className="text-foreground">{c.valor}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-[15px] text-muted-foreground">Origem: {s.origem} · {s.utm} · exemplo</p>
        </li>
      ))}
    </ul>
  );
}

function Historico({ p }: { p: Pessoa }) {
  const ev = historicoDe(p);
  if (!ev.length) return <p className="text-[15px] text-muted-foreground">Ainda não há eventos registados.</p>;
  return (
    <ol className="divide-y divide-border text-[15px]" aria-label="Histórico">
      {ev.map((e, i) => (
        <li key={i} className="flex justify-between gap-3 py-2.5"><span className="text-foreground">{e.t}</span><span className="shrink-0 text-muted-foreground">{e.q}</span></li>
      ))}
    </ol>
  );
}
