// A área de Clientes do V1 (21/10/2026): a lista dos clientes e, ao escolher um, a página dele na mesma vista, sem diálogos:
// os negócios (vários por cliente, com "Novo negócio" guiado), os dados do cliente e o histórico de todos os negócios.
// A lógica está em clientesV1Docs.ts; as ações (novoNegocioCliente, editarCliente) no motor.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur } from "./motor";
import {
  FILTROS_CLIENTE, GRUPOS_CLIENTE, clientesV1, estadoNegocio, fichaCliente, filtrarClientes, historicoCliente, iniciais, moradasObra, valorDe,
  type Cliente, type FiltroCliente, type GrupoCliente,
} from "./clientesV1Docs";
import { CHIP_FILTRO } from "./LeadsSimples";
import { IconeFase, Progresso, teclasTablist, type Ctx } from "./pecas";

type Sep = "negocios" | "dados" | "historico";
const SEPS: { id: Sep; nome: string }[] = [{ id: "negocios", nome: "Negócios" }, { id: "dados", nome: "Dados do cliente" }, { id: "historico", nome: "Histórico" }];

/** O que a página lembra quando se abre um negócio e se volta (a página desmonta). */
let memoria: { sel: string | null; sep: Sep; filtro: FiltroCliente; q: string; negocio: number | null } = { sel: null, sep: "negocios", filtro: "todos", q: "", negocio: null };
export function esquecerClientes(): void { memoria = { sel: null, sep: "negocios", filtro: "todos", q: "", negocio: null }; }
/** O menu "Clientes" leva sempre à lista (não ao último cliente aberto). */
export function listaClientes(): void { memoria = { ...memoria, sel: null, sep: "negocios", negocio: null }; }
/** O cliente de onde se abriu este negócio (o "voltar" da página do negócio leva de volta a ele), ou null. */
export function clienteDeOrigem(dealId: number | null): string | null { return dealId !== null && memoria.negocio === dealId ? memoria.sel : null; }

const CARTAO = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
const euros = (v: number) => eur(v) + " €";

function Avatar({ nome, grande }: { nome: string; grande?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary", grande ? "h-14 w-14 text-lg" : "h-11 w-11 text-[15px]")}>
      {iniciais(nome)}
    </span>
  );
}

export function ClientesV1(ctx: Ctx) {
  const { S } = ctx;
  const [sel, setSelE] = useState(memoria.sel);
  const [filtro, setFiltroE] = useState(memoria.filtro);
  const [q, setQE] = useState(memoria.q);
  const setSel = (v: string | null) => { setSelE(v); memoria = { ...memoria, sel: v, ...(v === null ? { sep: "negocios" as Sep } : {}) }; };
  const setFiltro = (v: FiltroCliente) => { setFiltroE(v); memoria = { ...memoria, filtro: v }; };
  const setQ = (v: string) => { setQE(v); memoria = { ...memoria, q: v }; };

  const todos = clientesV1(S);
  const escolhido = sel ? todos.find((c) => c.nome === sel) : undefined;
  if (escolhido) return <PaginaCliente {...ctx} c={escolhido} voltar={() => setSel(null)} renomeado={(n) => setSel(n)} />;

  const visiveis = filtrarClientes(todos, filtro, q);
  const emCurso = todos.reduce((a, c) => a + c.emCurso.length, 0);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>
      <p className="mt-1 text-base text-muted-foreground">
        {todos.length} clientes · {emCurso} {emCurso === 1 ? "negócio em curso" : "negócios em curso"}. Uma pessoa passa a cliente quando assina o primeiro contrato.
      </p>

      <div className="mt-6 grid gap-3">
        <label className="relative block">
          <span className="sr-only">Procurar</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" placeholder="Procurar nome, telefone ou trabalho" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Mostrar">
          {FILTROS_CLIENTE.map(({ id, nome }) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)} className={CHIP_FILTRO(filtro === id)}>
              {nome} <span className="tabular-nums opacity-70">{filtrarClientes(todos, id, q).length}</span>
            </button>
          ))}
        </div>
      </div>

      {!visiveis.length ? (
        <div role="status" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-base">Nenhum cliente encontrado.</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => { setQ(""); setFiltro("todos"); }}>Limpar pesquisa e filtros</Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3" aria-label="Clientes">
          {visiveis.map((c) => (
            <li key={c.nome} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              <button type="button" onClick={() => setSel(c.nome)}
                className="group flex min-h-11 w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <Avatar nome={c.nome} />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{c.nome}</span>
                  <span className="block text-[15px] text-muted-foreground">{[c.localidade, c.tel].filter(Boolean).join(" · ")}</span>
                  <span className="mt-1 block text-[15px]">
                    {c.negocios.length} {c.negocios.length === 1 ? "negócio" : "negócios"}
                    {c.obraEmCurso ? " · obra em curso" : c.emCurso.length ? ` · ${c.emCurso.length} em curso` : ""}
                  </span>
                </span>
                <span className="hidden shrink-0 text-right sm:block">
                  <span className="block text-base font-semibold tabular-nums">{euros(c.valor)}</span>
                  <span className="block text-[15px] text-muted-foreground">{c.desde ? `cliente desde ${c.desde}` : ""}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ a página do cliente */
function PaginaCliente({ S, A, run, go, c, voltar, renomeado }: Ctx & { c: Cliente; voltar: () => void; renomeado: (n: string) => void }) {
  const [sep, setSepE] = useState<Sep>(memoria.sep);
  const setSep = (v: Sep) => { setSepE(v); memoria = { ...memoria, sep: v }; };
  const [novo, setNovo] = useState(false);
  const ficha = fichaCliente(S, c.nome, c.negocios);
  const tel = ficha.tel.replace(/\D/g, "");
  const topo = useRef<HTMLDivElement>(null);
  useEffect(() => { topo.current?.scrollIntoView({ block: "start" }); }, []);
  const abrirNovo = () => { setSep("negocios"); setNovo(true); };
  const abrir = (id: number) => go(() => { memoria = { ...memoria, negocio: id }; A.abrir(id); })();

  return (
    <div ref={topo} className="mx-auto w-full max-w-3xl scroll-mt-4 px-4 pb-24 pt-6 sm:px-8">
      <button type="button" onClick={voltar} className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Clientes
      </button>

      <header className="mt-2 flex flex-wrap items-center gap-4 animate-in fade-in-0 duration-300">
        <Avatar nome={c.nome} grande />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{c.nome}</h1>
          <p className="mt-0.5 text-[15px] text-muted-foreground">{[ficha.tipo_cliente, ficha.localidade, c.desde && `cliente desde ${c.desde}`].filter(Boolean).join(" · ")}</p>
        </div>
        {!novo && <Button size="lg" className="min-h-11 w-full sm:w-auto" onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Novo negócio</Button>}
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {tel && <a href={`tel:${tel}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-4 text-[15px] hover:bg-muted/50"><Phone className="h-4 w-4" aria-hidden="true" />{ficha.tel}</a>}
        {tel && <a href={`https://wa.me/351${tel}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-4 text-[15px] hover:bg-muted/50"><MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp</a>}
        {ficha.email && <a href={`mailto:${ficha.email}`} className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-4 text-[15px] hover:bg-muted/50"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{ficha.email}</span></a>}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {([
          ["Negócios", String(c.negocios.length)],
          ["Em curso", String(c.emCurso.length)],
          ["Ganho, com IVA", euros(c.valor)],
        ] as const).map(([l, v]) => (
          <div key={l} className={cn(CARTAO, "p-4", l.startsWith("Ganho") && "col-span-2 sm:col-span-1")}>
            <dt className="text-[15px] text-muted-foreground">{l}</dt>
            <dd className="mt-1 whitespace-nowrap text-xl font-semibold tabular-nums sm:text-2xl">{v}</dd>
          </div>
        ))}
      </dl>

      <div role="tablist" aria-label="Cliente" className="mt-8 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SEPS.map((s, i) => (
          <button key={s.id} id={`cli-${s.id}`} role="tab" type="button" aria-selected={sep === s.id} aria-controls="cli-painel" tabIndex={sep === s.id ? 0 : -1}
            onClick={() => setSep(s.id)} onKeyDown={(e) => teclasTablist(e, i, SEPS.map((x) => x.id), "cli", setSep)}
            className={cn("min-h-11 shrink-0 border-b-2 px-3 text-[15px] transition-colors", sep === s.id ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {s.nome}{s.id === "negocios" ? ` (${c.negocios.length})` : ""}
          </button>
        ))}
      </div>

      <div id="cli-painel" role="tabpanel" aria-labelledby={`cli-${sep}`} className="pt-6">
        {sep === "negocios" && (
          <>
            {novo && <NovoNegocio c={c} S={S} fechar={() => setNovo(false)} criar={(pedido, obra) => run(() => { A.novoNegocioCliente(c.nome, null, pedido, obra); memoria = { ...memoria, sep: "negocios", negocio: S.deal }; })} />}
            <ListaNegocios titulo="Em curso" ns={c.emCurso} S={S} abrir={abrir} vazio={novo ? null : <SemCurso abrir={abrirNovo} />} />
            <ListaNegocios titulo="Concluídos" ns={c.concluidos} S={S} abrir={abrir} />
            {c.perdidos.length > 0 && (
              <details className="group mt-8">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  Perdidos ({c.perdidos.length})<ArrowRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                </summary>
                <ListaNegocios ns={c.perdidos} S={S} abrir={abrir} />
              </details>
            )}
          </>
        )}
        {sep === "dados" && (
          <div className="space-y-8">
            {GRUPOS_CLIENTE.map((g) => (
              <GrupoDados key={g.titulo} g={g} ficha={ficha} gravar={(k, v) => run(() => { A.editarCliente(c.nome, k, v); if (k === "nome" && v.trim() && !S.deals.some((d) => d.nome === c.nome)) renomeado(v.trim()); })} />
            ))}
            <section aria-labelledby="cli-moradas">
              <h2 id="cli-moradas" className="text-xl font-semibold tracking-tight">Moradas das obras</h2>
              <ul className={cn(CARTAO, "mt-3 divide-y divide-border px-4 sm:px-5")}>
                {moradasObra(c).map((m) => (
                  <li key={m.morada + m.localidade} className="flex items-start gap-3 py-4">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium">{[m.morada, [m.cp, m.localidade].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span>
                      <span className="block text-[15px] text-muted-foreground">{m.negocios.map((d) => d.servico).join(" · ")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        {sep === "historico" && <Historico c={c} abrir={abrir} />}
      </div>
    </div>
  );
}

function SemCurso({ abrir }: { abrir: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
      <p className="text-[15px]">Nenhum negócio em curso. Quando o cliente pedir outro trabalho, crie-o aqui: os dados dele já vão preenchidos.</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={abrir}>Novo negócio</Button>
    </div>
  );
}

function ListaNegocios({ titulo, ns, S, abrir, vazio }: { titulo?: string; ns: Ctx["S"]["deals"]; S: Ctx["S"]; abrir: (id: number) => void; vazio?: ReactNode }) {
  if (!ns.length && !vazio) return null;
  return (
    <section className={titulo ? "mt-8 first:mt-0" : "mt-3"} aria-label={titulo}>
      {titulo && <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>}
      {!ns.length ? <div className="mt-3">{vazio}</div> : (
        <ul className="mt-3 space-y-3">
          {ns.map((d) => {
            const v = valorDe(d, S);
            return (
              <li key={d.id} className={cn("animate-in fade-in-0 slide-in-from-bottom-1 duration-300", d.fresh && "zoom-in-95")}>
                <button type="button" onClick={() => abrir(d.id)}
                  className={cn("group grid w-full gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", d.perdido && "opacity-75")}>
                  <span className="flex items-center gap-3">
                    <IconeFase fase={d.fase} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold">{d.servico}</span>
                      <span className="block text-[15px] text-muted-foreground">{estadoNegocio(d)}</span>
                    </span>
                    {v != null && <span className="shrink-0 text-base font-semibold tabular-nums">{euros(v)}</span>}
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
                  </span>
                  {!d.perdido && <Progresso fase={d.fase >= 5 && d.obra.plano?.estado === "concluída" ? 6 : d.fase} />}
                  <span className="text-[15px] text-muted-foreground">N.º {d.id} · desde {d.quando}{d.local ? " · " + d.local : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ novo negócio, em três perguntas */

function NovoNegocio({ c, S, fechar, criar }: { c: Cliente; S: Ctx["S"]; fechar: () => void; criar: (pedido: string, obra: { morada: string; cp: string; localidade: string }) => void }) {
  const moradas = moradasObra(c);
  const [onde, setOnde] = useState<number | "outra" | null>(moradas.length === 1 ? 0 : null);
  const [outra, setOutra] = useState({ morada: "", cp: "", localidade: "" });
  const [pedido, setPedido] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  const obra = onde === "outra" ? outra : onde != null ? moradas[onde] : null;
  const pronto = !!obra && !!(obra.morada.trim() || obra.localidade.trim());
  const opcao = (sim: boolean) => cn("flex min-h-11 items-center gap-3 rounded-xl border p-4 text-left text-[15px] transition-colors", sim ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input bg-card hover:border-foreground/40");
  const visto = (sim: boolean) => <span className={cn("ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full border", sim ? "border-primary bg-primary text-primary-foreground" : "border-input")} aria-hidden="true">{sim && <Check className="h-3.5 w-3.5" />}</span>;
  const ficha = fichaCliente(S, c.nome, c.negocios);

  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); if (pronto) criar(pedido, obra!); }}
      className={cn(CARTAO, "mb-8 grid gap-6 p-5 animate-in fade-in-0 slide-in-from-top-2 duration-300 sm:p-6")} aria-label="Novo negócio">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Novo negócio para {c.nome}</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">O email, o NIF e as preferências de contacto já vão preenchidos. Entra como lead.</p>
      </div>

      {/* 27/10: sem "Que trabalho?": a linha sai da divisão escolhida na visita */}
      <fieldset>
        <legend className="text-[15px] font-medium">1. Onde é a obra?</legend>
        <div className="mt-2 grid gap-2">
          {moradas.map((m, i) => (
            <button key={i} type="button" aria-pressed={onde === i} onClick={() => setOnde(i)} className={opcao(onde === i)}>
              <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">{[m.morada, m.localidade].filter(Boolean).join(", ")}<span className="block text-muted-foreground">{m.negocios.map((d) => d.servico).join(" · ")}</span></span>
              {visto(onde === i)}
            </button>
          ))}
          <button type="button" aria-pressed={onde === "outra"} onClick={() => { setOnde("outra"); if (!outra.localidade) setOutra({ ...outra, localidade: ficha.localidade }); }} className={opcao(onde === "outra")}>
            <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />Outra morada{visto(onde === "outra")}
          </button>
          {onde === "outra" && (
            <div className="grid gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-200 sm:grid-cols-[2fr_1fr_1fr]">
              {([["morada", "Rua e número"], ["cp", "Código postal"], ["localidade", "Localidade"]] as const).map(([k, l]) => (
                <label key={k} className="grid gap-1 text-[15px]">
                  <span className="text-muted-foreground">{l}</span>
                  <input value={outra[k]} onChange={(e) => setOutra({ ...outra, [k]: e.target.value })} autoFocus={k === "morada"}
                    className="h-11 rounded-lg border border-input bg-card px-3 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      <label className={cn("grid gap-2 transition-opacity", !obra && "opacity-50")}>
        <span className="text-[15px] font-medium">2. O que pediu? <span className="font-normal text-muted-foreground">(pode ficar para a chamada)</span></span>
        <textarea value={pedido} onChange={(e) => setPedido(e.target.value)} rows={2} disabled={!obra} placeholder="Ex.: trocar a banheira por duche"
          className="rounded-lg border border-input bg-card px-3 py-2.5 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="min-h-11" disabled={!pronto}>Criar negócio e abrir</Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={fechar}>Cancelar</Button>
        {!pronto && <span className="text-[15px] text-muted-foreground" aria-live="polite">Escolha a morada da obra.</span>}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ dados do cliente */
function GrupoDados({ g, ficha, gravar }: { g: GrupoCliente; ficha: Record<string, string>; gravar: (k: string, v: string) => void }) {
  const [edita, setEdita] = useState(false);
  const id = "cli-g-" + g.titulo.replace(/\W+/g, "-").toLowerCase();
  return (
    <section aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-xl font-semibold tracking-tight">{g.titulo}</h2>
        <Button type="button" variant="ghost" className="min-h-11" aria-pressed={edita} onClick={() => setEdita(!edita)}>
          {edita ? <><Check className="mr-2 h-4 w-4" aria-hidden="true" />Feito</> : <><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Editar</>}
        </Button>
      </div>
      {g.nota && <p className="text-[15px] text-muted-foreground">{g.nota}</p>}
      <dl className={cn(CARTAO, "mt-3 divide-y divide-border px-4 sm:px-5")}>
        {g.campos.map((f) => (
          <div key={f.k} className="grid gap-1 py-3.5 sm:grid-cols-[13rem_1fr] sm:items-center sm:gap-4">
            <dt className="text-[15px] text-muted-foreground">{f.l}</dt>
            <dd className="min-w-0 text-[15px]">
              {!edita ? (ficha[f.k] ? <span className={cn("break-words", f.t === "longo" && "whitespace-pre-line")}>{ficha[f.k]}</span> : <span className="text-muted-foreground">—</span>)
                : f.t === "escolha" ? (
                  <span className="flex flex-wrap gap-2" role="group" aria-label={f.l}>
                    {f.op!.map((o) => (
                      <button key={o} type="button" aria-pressed={ficha[f.k] === o} onClick={() => gravar(f.k, o)}
                        className={cn("min-h-11 rounded-full border px-4 transition-colors", ficha[f.k] === o ? "border-foreground bg-foreground text-background" : "border-input bg-card hover:border-foreground/40")}>{o}</button>
                    ))}
                  </span>
                ) : f.t === "longo" ? (
                  <textarea key={ficha[f.k]} defaultValue={ficha[f.k]} rows={3} aria-label={f.l} onBlur={(e) => { if (e.target.value !== ficha[f.k]) gravar(f.k, e.target.value); }}
                    className="w-full rounded-lg border border-input bg-card px-3 py-2.5 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
                ) : (
                  <input key={ficha[f.k]} defaultValue={ficha[f.k]} aria-label={f.l} placeholder={f.ph} type={f.tipo ?? "text"} inputMode={f.tipo === "tel" ? "tel" : undefined}
                    onBlur={(e) => { if (e.target.value !== ficha[f.k]) gravar(f.k, e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
                )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ histórico */
function Historico({ c, abrir }: { c: Cliente; abrir: (id: number) => void }) {
  const [tudo, setTudo] = useState(false);
  const h = historicoCliente(c);
  const vis = tudo ? h : h.slice(0, 8);
  if (!h.length) return <p className="text-[15px] text-muted-foreground">Ainda sem registos.</p>;
  return (
    <>
      <ol className="relative ml-2 border-l border-border">
        {vis.map((e, i) => (
          <li key={i} className="relative pb-5 pl-6 last:pb-0">
            <span className={cn("absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full", e.k === "x" ? "bg-destructive" : e.k === "w" ? "bg-warning" : "bg-primary")} aria-hidden="true" />
            <p className="text-[15px]">{e.t}</p>
            <p className="text-[15px] text-muted-foreground">
              {e.q} · <button type="button" onClick={() => abrir(e.negocio.id)} className="underline-offset-4 hover:text-foreground hover:underline">{e.negocio.servico}</button>
            </p>
          </li>
        ))}
      </ol>
      {h.length > vis.length && <Button type="button" variant="outline" className="mt-6 min-h-11" onClick={() => setTudo(true)}>Ver tudo ({h.length})</Button>}
    </>
  );
}
