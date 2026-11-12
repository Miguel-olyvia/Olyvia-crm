// 5/11 (Rúben: «no estilo ele vai buscar ao catálogo produtos, cada produto com a sua cor; recomenda logo: se houver por exemplo uma
// sanita, pergunta se queremos trocar; se sim, selecionar; ou adicionar outros produtos… tudo dinâmico e animado»). O passo «Estilo»:
//  1. as cores do cliente (e as exceções por peça);
//  2. cada peça que há hoje: «Trocar a sanita?» Fica, Trocar (abre o recomendado do catálogo, já escolhido) ou Tirar;
//  3. as paredes e o chão;
//  4. juntar produtos novos por categoria: ficam «por colocar» e o passo «Depois» pede o sítio de cada um.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Plus, Sparkles, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PECAS, tiposDaDivisao, type PecaPlanta, type TipoPeca } from "@/emylia/planta";
import { ACOMPANHA, NOME_CATEGORIA, SERVICOS, melhorPara, produto, type Categoria } from "./catalogoFake";
import { decidir, decisaoDe, escolherProduto, juntarPorColocar, juntarServico, mudarQtdServico, qtdSugerida, tirarServico, type Decisao, type Projeto, totais } from "./necessidadesEstudio";
import { juntarSugestoes, recusarSugestao, sugestoesDeServicos, type Sugestao } from "./sugestoesServicos";
import { Cartao, Cores, ListaProdutos, Resumo, Seguinte, chip, eur, nf } from "./pecasEstudio";
import { Ilustracao } from "./Ilustracao";
import { Combinacoes, OuvidoDoCliente, useEstiloOuvido } from "./EstiloOuvido";
import type { Cor } from "./catalogoFake";

type SetP = React.Dispatch<React.SetStateAction<Projeto>>;
const FEMININO: TipoPeca[] = ["base", "banheira", "sanita", "bancada", "placa", "maquina"];
/** As categorias com exceção de cor no estilo (as que o cliente costuma querer diferentes). */
const EXCECOES: Categoria[] = ["movel", "sanita", "base", "torneira", "revestimento", "pavimento"];
const DECISOES: { d: Decisao; n: string }[] = [{ d: "fica", n: "Fica" }, { d: "troca", n: "Trocar" }, { d: "tira", n: "Tirar" }];

/** O que vai com a peça (a coluna e o resguardo da base, a torneira do móvel), com o recomendado do estilo. */
const acompanhaRecomendado = (tipo: TipoPeca, p: Projeto): Partial<Record<Categoria, string>> =>
  Object.fromEntries((ACOMPANHA[tipo] ?? []).map((cat) => [cat, melhorPara(cat, p.estilo)?.id]).filter(([, id]) => !!id));

export function PassoEstilo({ p, setP, t, porEscolher, seguinte }: { p: Projeto; setP: SetP; t: ReturnType<typeof totais>; porEscolher: number; seguinte: () => void }) {
  const reduzir = useReducedMotion();
  const [cat, setCat] = useState<TipoPeca | null>(null);
  const [juntado, setJuntado] = useState("");
  const hoje = p.antes.pecas.filter((x) => !PECAS[x.tipo].abertura);
  const porColocar = p.porColocar ?? [];
  // 12/11: o que o cliente disse das cores (ao vivo) e as combinações para a cor principal
  const { ouvido, pedidos, aOuvir } = useEstiloOuvido(p);
  const [corEscolhida, setCorEscolhida] = useState<Cor | undefined>(undefined);
  const corBase = corEscolhida ?? ouvido?.estilo.cores[0] ?? p.estilo.cores[0];
  // mexer nas cores à mão: o que o cliente disser a seguir fica como sugestão
  const mudarEstilo = (f: (e: Projeto["estilo"]) => Projeto["estilo"]) => setP((x) => ({ ...x, estilo: f(x.estilo), estiloManual: true }));

  return (
    <>
      <section aria-labelledby="t-estilo" className="min-w-0 space-y-8">
        <div>
          <h2 id="t-estilo" className="text-2xl font-semibold tracking-tight">O estilo e as peças</h2>
          <p className="text-[15px] text-muted-foreground">A Olyvia vai buscar ao catálogo o que combina com o cliente. Decida peça a peça; o que juntar fica por colocar na planta.</p>
        </div>

        <OuvidoDoCliente p={p} setP={setP} ouvido={ouvido} pedidos={pedidos} aOuvir={aOuvir} />

        <Cartao titulo="As cores do cliente">
          <Cores escolhidas={p.estilo.cores} onMudar={(cores) => { setCorEscolhida(cores[0]); mudarEstilo((e) => ({ ...e, cores })); }} />
          <details className="group rounded-xl border border-border p-3">
            <summary className="min-h-11 cursor-pointer content-center text-[15px] font-medium">Exceções por peça{Object.keys(p.estilo.porCategoria).length ? ` (${Object.keys(p.estilo.porCategoria).length})` : ""}</summary>
            <ul className="divide-y divide-border pt-2">
              {EXCECOES.map((c) => {
                const exc = p.estilo.porCategoria[c];
                return (
                  <li key={c} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[15px] font-medium">{NOME_CATEGORIA[c]}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={chip(!exc?.length)} aria-pressed={!exc?.length}
                        onClick={() => mudarEstilo((e) => { const pc = { ...e.porCategoria }; delete pc[c]; return { ...e, porCategoria: pc }; })}>Como o resto</button>
                      <Cores pequeno escolhidas={exc ?? []} onMudar={(cores) => mudarEstilo((e) => ({ ...e, porCategoria: { ...e.porCategoria, [c]: cores } }))} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        </Cartao>

        <Combinacoes p={p} setP={setP} cor={corBase} evitar={ouvido?.evitar ?? []} />

        <section aria-labelledby="t-hoje" className="space-y-3">
          <h3 id="t-hoje" className="text-[17px] font-semibold tracking-tight">O que há hoje</h3>
          {hoje.length === 0 && <p className="rounded-2xl border border-dashed border-border p-5 text-[15px] text-muted-foreground">A planta do antes não tem peças. Junte-as no passo «Antes», ou junte produtos novos em baixo.</p>}
          <ul className="space-y-3">
            {hoje.map((pc, i) => (
              <motion.li key={pc.id} initial={reduzir ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduzir ? 0 : i * 0.05, duration: 0.2 }}>
                <CartaoDecisao p={p} setP={setP} pc={pc} />
              </motion.li>
            ))}
          </ul>
        </section>

        <Cartao titulo="Paredes e chão">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-[15px] font-semibold">Revestimento{p.alturas.tetoFalso ? " (até ao teto falso)" : ""}</h4>
              <ListaProdutos cat="revestimento" estilo={p.estilo} escolhido={p.revestimento} limite={3} onEscolher={(id) => setP((x) => ({ ...x, revestimento: id }))} />
            </div>
            <div className="space-y-2">
              <h4 className="text-[15px] font-semibold">Pavimento</h4>
              <ListaProdutos cat="pavimento" estilo={p.estilo} escolhido={p.pavimento} limite={3} onEscolher={(id) => setP((x) => ({ ...x, pavimento: id }))} />
            </div>
          </div>
        </Cartao>

        <Cartao titulo="Juntar produtos novos">
          <div role="group" aria-label="Categorias" className="flex flex-wrap gap-2">
            {tiposDaDivisao(p.divisao).map((tp) => (
              <button key={tp} type="button" aria-pressed={cat === tp} className={chip(cat === tp)} onClick={() => setCat((x) => (x === tp ? null : tp))}>
                <Ilustracao cat={tp} tamanho={24} />{PECAS[tp].n}
              </button>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {cat && (
              <motion.div key={cat} initial={reduzir ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduzir ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }} className="overflow-hidden">
                <ListaProdutos cat={cat} estilo={p.estilo} limite={4} acao="Juntar" onEscolher={(id) => {
                  setP((x) => juntarPorColocar(x, { tipo: cat, produto: id, acompanha: acompanhaRecomendado(cat, x) }));
                  setJuntado(`${produto(id)?.n ?? PECAS[cat].n}: por colocar na planta.`);
                }} />
              </motion.div>
            )}
          </AnimatePresence>
          <p role="status" className="min-h-5 text-sm text-success">{juntado}</p>
          {porColocar.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <h4 className="text-[15px] font-semibold">Por colocar na planta ({porColocar.length})</h4>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {porColocar.map((x) => {
                    const prod = produto(x.produto);
                    return (
                      <motion.li key={x.id} initial={reduzir ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={reduzir ? undefined : { opacity: 0, x: 24 }}
                        transition={{ duration: 0.18 }} className="flex items-center gap-3 rounded-xl border border-border bg-background p-2">
                        <Ilustracao cat={x.tipo} hex={prod?.hex} tamanho={40} />
                        <span className="min-w-0 flex-1 text-[15px]">{prod?.n ?? PECAS[x.tipo].n}
                          {Object.values(x.acompanha ?? {}).length > 0 && <span className="block text-xs text-muted-foreground">Com {Object.values(x.acompanha ?? {}).map((id) => produto(id)?.n).filter(Boolean).join(" e ")}</span>}
                        </span>
                        <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-full hover:bg-muted" aria-label={`Tirar ${prod?.n ?? PECAS[x.tipo].n}`}
                          onClick={() => setP((y) => ({ ...y, porColocar: (y.porColocar ?? []).filter((z) => z.id !== x.id) }))}><X className="h-4 w-4" aria-hidden="true" /></button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>
          )}
        </Cartao>

        <Servicos p={p} setP={setP} />
      </section>

      <aside className="space-y-6 lg:sticky lg:top-36 lg:self-start">
        <Resumo t={t} porEscolher={porEscolher} />
        <AvisoSugestoes p={p} setP={setP} />
        <Seguinte onClick={seguinte}>{porColocar.length ? `Pôr na planta (${porColocar.length} por colocar)` : "Ver na planta"}</Seguinte>
      </aside>
    </>
  );
}

/** Uma peça de hoje: «Trocar a sanita?» com Fica, Trocar e Tirar; ao trocar, o catálogo recomendado abre, com o melhor já escolhido. */
function CartaoDecisao({ p, setP, pc }: { p: Projeto; setP: SetP; pc: PecaPlanta }) {
  const reduzir = useReducedMotion();
  const d = decisaoDe(p, pc.id), prod = produto(p.escolhas[pc.id]);
  const nome = PECAS[pc.tipo].n.toLowerCase(), art = FEMININO.includes(pc.tipo) ? "a" : "o";
  const decidirAqui = (nova: Decisao) => setP((x) => {
    const r = decidir(x, pc.id, nova, melhorPara(pc.tipo, x.estilo)?.id);
    if (nova !== "troca") return r;
    const rec = acompanhaRecomendado(pc.tipo, x);
    return { ...r, acompanha: { ...r.acompanha, [pc.id]: { ...rec, ...(r.acompanha[pc.id] ?? {}) } } };
  });
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-[var(--shadow-sm)] transition-colors", d === "troca" ? "border-primary/40" : d === "tira" ? "border-destructive/30" : "border-border")}>
      <div className="flex flex-wrap items-center gap-3">
        <Ilustracao cat={pc.tipo} hex={prod?.hex} />
        <div className="min-w-[160px] flex-1">
          <p className="text-[15px] font-semibold">Trocar {art} {nome}?</p>
          <p className="text-sm text-muted-foreground">{d === "troca" ? `Fica com: ${prod?.n ?? "por escolher"}` : d === "tira" ? "Sai na obra." : "Fica como está."}</p>
        </div>
        <div role="group" aria-label={`O que fazer com ${art} ${nome}`} className="relative inline-flex rounded-full bg-muted p-1">
          {DECISOES.map((x) => (
            <button key={x.d} type="button" aria-pressed={d === x.d} onClick={() => decidirAqui(x.d)}
              className={cn("relative min-h-10 rounded-full px-4 text-[15px] font-medium transition-colors", d === x.d ? (x.d === "tira" ? "text-destructive" : "text-foreground") : "text-muted-foreground hover:text-foreground")}>
              {d === x.d && <motion.span layoutId={`decisao-${pc.id}`} className="absolute inset-0 rounded-full bg-background shadow-sm" transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 35 }} />}
              <span className="relative">{x.n}</span>
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {d === "troca" && (
          <motion.div key="troca" initial={reduzir ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduzir ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.24 }} className="overflow-hidden">
            <div className="space-y-4 pt-4">
              <ListaProdutos cat={pc.tipo} estilo={p.estilo} escolhido={p.escolhas[pc.id]} limite={3}
                onEscolher={(id) => setP((x) => escolherProduto(x, pc.id, id))} />
              {(ACOMPANHA[pc.tipo] ?? []).map((c) => (
                <div key={c} className="space-y-2 border-t border-border pt-3">
                  <h4 className="flex items-center gap-2 text-[15px] font-semibold"><Plus className="h-4 w-4 text-primary" aria-hidden="true" />{NOME_CATEGORIA[c]}</h4>
                  <ListaProdutos cat={c} estilo={p.estilo} escolhido={p.acompanha[pc.id]?.[c]} limite={2}
                    onEscolher={(id) => setP((x) => ({ ...x, acompanha: { ...x.acompanha, [pc.id]: { ...(x.acompanha[pc.id] ?? {}), [c]: id } } }))} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 6/11 (Rúben: «os serviços sugeridos automaticamente com base nos produtos escolhidos»): no topo, o que as peças escolhidas pedem,
 *  cada um com o porquê e a quantidade; junta-se com um toque (ou todos) ou diz-se «agora não». Em baixo, os juntos e os outros. */
function Servicos({ p, setP }: { p: Projeto; setP: SetP }) {
  const reduzir = useReducedMotion();
  const sugestoes = sugestoesDeServicos(p);
  const sugeridos = new Set(sugestoes.map((x) => x.sv.id));
  const escolhidos = new Map((p.servicos ?? []).map((x) => [x.id, x.q]));
  // os juntos primeiro; os que estão sugeridos já aparecem em cima
  const lista = SERVICOS.filter((sv) => !sugeridos.has(sv.id)).sort((a, b) => Number(escolhidos.has(b.id)) - Number(escolhidos.has(a.id)));
  const total = sugestoes.reduce((t, x) => t + x.q * x.sv.preco, 0);
  return (
    <div id="t-servicos" className="scroll-mt-40">
    <Cartao titulo="Serviços">
      <p className="text-sm text-muted-foreground">Os trabalhos que se juntam às peças. A quantidade vem da planta; mude-a se for preciso.</p>
      <AnimatePresence initial={false}>
        {sugestoes.length > 0 && (
          <motion.div key="sugestoes" initial={reduzir ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduzir ? undefined : { opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />Sugeridos pelas peças escolhidas</h4>
                {sugestoes.length > 1 && (
                  <button type="button" className={cn(chip(true), "min-h-11")} onClick={() => setP((x) => juntarSugestoes(x, sugestoesDeServicos(x)))}>
                    <Plus className="h-4 w-4" aria-hidden="true" />Juntar os {sugestoes.length} · {eur(total)}
                  </button>
                )}
              </div>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {sugestoes.map((sg) => <LinhaSugestao key={sg.sv.id} sg={sg} reduzir={!!reduzir}
                    juntar={() => setP((x) => juntarSugestoes(x, sugestoesDeServicos(x).filter((y) => y.sv.id === sg.sv.id)))}
                    recusar={() => setP((x) => recusarSugestao(x, sg.sv.id))} />)}
                </AnimatePresence>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ul className="space-y-2">
        {lista.map((sv) => {
          const q = escolhidos.get(sv.id), dentro = q !== undefined;
          return (
            <motion.li key={sv.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors", dentro ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-background")}>
              <span aria-hidden="true" className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", dentro ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {dentro ? <Check className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
              </span>
              <span className="min-w-[200px] flex-1">
                <span className="block text-[15px] font-medium">{sv.n}</span>
                <span className="block text-xs text-muted-foreground">{sv.desc} {eur(sv.preco)}/{sv.un}{!dentro && sv.un !== "un" ? ` · aqui, ${nf(qtdSugerida(sv, p))} ${sv.un}` : ""}</span>
              </span>
              {dentro ? (
                <span className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm"><span className="sr-only">Quantidade de {sv.n}</span>
                    <input key={`${sv.id}-${q}`} type="number" step="any" min={0} defaultValue={q} className="h-10 w-20 rounded-lg border border-input bg-background px-2 text-right"
                      onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n !== q) setP((x) => mudarQtdServico(x, sv.id, n)); }} />
                    <span className="w-6 text-muted-foreground">{sv.un}</span>
                  </label>
                  <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-full hover:bg-muted" aria-label={`Tirar ${sv.n}`} onClick={() => setP((x) => tirarServico(x, sv.id))}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <button type="button" className={cn(chip(false), "border-primary/40 text-primary")} onClick={() => setP((x) => juntarServico(x, sv.id))}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Juntar
                </button>
              )}
            </motion.li>
          );
        })}
      </ul>
    </Cartao>
    </div>
  );
}

function LinhaSugestao({ sg, reduzir, juntar, recusar }: { sg: Sugestao; reduzir: boolean; juntar: () => void; recusar: () => void }) {
  return (
    <motion.li initial={reduzir ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduzir ? undefined : { opacity: 0, x: 24 }}
      transition={{ duration: 0.2 }} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-3">
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></span>
      <span className="min-w-[200px] flex-1">
        <span className="block text-[15px] font-medium">{sg.sv.n} <span className="font-normal text-muted-foreground">· {nf(sg.q)} {sg.sv.un} · {eur(sg.q * sg.sv.preco)}</span></span>
        {sg.porque.map((x) => <span key={x} className="block text-xs text-muted-foreground">{x}</span>)}
      </span>
      <span className="flex items-center gap-1">
        <button type="button" className="min-h-11 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted" onClick={recusar}>Agora não</button>
        <button type="button" className={cn(chip(false), "border-primary/40 text-primary")} onClick={juntar} aria-label={`Juntar ${sg.sv.n}`}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar
        </button>
      </span>
    </motion.li>
  );
}

/** Ao lado do orçamento: quando um produto escolhido pede serviços novos, a Olyvia avisa (e junta com um toque). */
function AvisoSugestoes({ p, setP }: { p: Projeto; setP: SetP }) {
  const reduzir = useReducedMotion();
  const sugestoes = sugestoesDeServicos(p);
  const ids = sugestoes.map((x) => x.sv.id).join(",");
  // o serviço que acabou de aparecer (para dizer qual foi)
  const antes = useRef<Set<string> | null>(null);
  const [novo, setNovo] = useState<Sugestao | null>(null);
  useEffect(() => {
    const agora = new Set(sugestoes.map((x) => x.sv.id));
    if (antes.current) { const n = sugestoes.find((x) => !antes.current!.has(x.sv.id)); setNovo(n ?? null); }
    antes.current = agora;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- muda quando muda a lista
  }, [ids]);
  return (
    <AnimatePresence initial={false}>
      {sugestoes.length > 0 && (
        <motion.section key="aviso" aria-label="Serviços sugeridos" initial={reduzir ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={reduzir ? undefined : { opacity: 0, y: -8 }}
          className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4">
          <p className="flex items-start gap-2 text-[15px]"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span><b className="font-semibold">{sugestoes.length} {sugestoes.length === 1 ? "serviço sugerido" : "serviços sugeridos"}</b> pelas peças escolhidas.</span>
          </p>
          <p role="status" className="text-xs text-muted-foreground">
            <AnimatePresence mode="wait" initial={false}>
              {novo && <motion.span key={novo.sv.id} className="block" initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Novo: {novo.sv.n}. {novo.porque[novo.porque.length - 1]}</motion.span>}
            </AnimatePresence>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cn(chip(true), "min-h-11")} onClick={() => setP((x) => juntarSugestoes(x, sugestoesDeServicos(x)))}>
              <Plus className="h-4 w-4" aria-hidden="true" />{sugestoes.length === 1 ? "Juntar" : "Juntar todos"}
            </button>
            <button type="button" className={cn(chip(false), "min-h-11")} onClick={() => document.getElementById("t-servicos")?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" })}>Ver</button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
