// 5/11 (Rúben, depois da visita real: «gostaram da planta inicial, mas agora temos mais ambições… cria um branch à parte, um layout só
// disso, com um catálogo fake; inova, inventa, no limits: um estúdio, o melhor do mercado»). O Estúdio do projeto, sem conta e sem base:
//  1. Antes: a planta como está (paredes e peças) e as alturas (o pé-direito e o teto falso);
//  2. Estilo: as cores do cliente, com exceções por peça («tudo cinza e preto, o móvel em madeira, a sanita branca»);
//  3. Depois: a mesma planta; tocar numa peça abre o catálogo filtrado pelo estilo; marcar o que fica, o que sai e o que entra;
//  4. 3D: o depois em volume, a rodar com o dedo;
//  5. Proposta: as necessidades e o orçamento saem das duas plantas; o comercial ajusta.
// «Mostrar ao cliente» abre a apresentação (tablet): o projeto mostra-se e não se envia (é propriedade da empresa); o projeto só vai para o
// portal depois de a proposta ser aceite. Tudo fica neste browser (localStorage).
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleDot, HardHat, Lock, Monitor, Paintbrush, Printer, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditorPlanta } from "@/emylia/EditorPlanta";
import { PECAS, areaChaoM2, areaParedesM2, cantos, type PecaPlanta, type Planta, type TipoPeca } from "@/emylia/planta";
import { ACOMPANHA, CORES, NOME_CATEGORIA, combina, coresPara, melhorPara, produto, produtosDe, type Categoria, type Cor, type Estilo, type Produto } from "./catalogoFake";
import { IVA, aplicarEstilo, alturaFinalCm, estadoDaPeca, necessidades, sairam, totais, type Linha, type Projeto } from "./necessidadesEstudio";
import { PROJETO_EXEMPLO, copiaPlanta, depoisDaVisita } from "./exemploEstudio";
import { Vista3D } from "./Vista3D";
import { PlantaVista } from "./PlantaVista";
import { alturasEmPalavras, materiais, tarefas } from "./fichaObra";
import type { Cena } from "./geometria3d";

import { CHAVE_ESTUDIO as CHAVE } from "./daVisita";
const PASSOS = ["Antes", "Estilo", "Depois", "3D", "Proposta", "Obra"] as const;
type Passo = (typeof PASSOS)[number];
const eur = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const CHIP = "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const chip = (on: boolean) => cn(CHIP, on ? "border-primary bg-primary/10 font-medium ring-1 ring-primary" : "border-input bg-background hover:bg-accent");
const INP = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";

/** As categorias com exceção de cor no estilo (as que o cliente costuma querer diferentes). */
const EXCECOES: Categoria[] = ["movel", "sanita", "base", "torneira", "revestimento", "pavimento"];
/** Cores e alturas no 3D de cada peça, sem produto escolhido. */
const SEM_PRODUTO: Record<TipoPeca, { cor: string; z0: number; z1: number }> = {
  base: { cor: "#f4f4f2", z0: 0, z1: 3 }, banheira: { cor: "#f4f4f2", z0: 0, z1: 55 }, sanita: { cor: "#f4f4f2", z0: 0, z1: 78 },
  bide: { cor: "#f4f4f2", z0: 0, z1: 40 }, movel: { cor: "#e8e3da", z0: 0, z1: 85 }, coluna: { cor: "#e8e3da", z0: 30, z1: 190 },
  espelho: { cor: "#cfe6ef", z0: 110, z1: 180 }, toalheiro: { cor: "#bfc3c7", z0: 90, z1: 170 }, porta: { cor: "#8a6a4a", z0: 0, z1: 205 },
  janela: { cor: "#bfe3f5", z0: 110, z1: 200 },
};

function lerGuardado(): Projeto {
  try {
    const t = localStorage.getItem(CHAVE);
    if (t) { const p = JSON.parse(t) as Projeto; if (p?.antes?.paredes && p.depois?.paredes) return p; }
  } catch { /* sem armazenamento: o exemplo */ }
  return PROJETO_EXEMPLO;
}

/** O 3D de uma planta: as paredes com a cor do revestimento, o chão com a do pavimento, e cada peça com a cor e a altura do produto. */
function cenaDe(pl: Planta, p: Projeto, comProdutos: boolean): Cena {
  return {
    chao: cantos(pl.paredes, pl.o).slice(0, -1),
    altura: alturaFinalCm(comProdutos ? p.alturas : { peDireito: p.alturas.peDireito, tetoFalso: null }),
    corParede: (comProdutos && produto(p.revestimento)?.hex) || "#e9e6df",
    corChao: (comProdutos && produto(p.pavimento)?.hex) || "#cdc6ba",
    caixas: pl.pecas.flatMap((pc) => {
      const prod = comProdutos ? produto(p.escolhas[pc.id]) : undefined, s = SEM_PRODUTO[pc.tipo];
      const caixa = { id: pc.id, x: pc.x, y: pc.y, w: pc.w, h: pc.h, z0: prod?.z0 ?? s.z0, z1: prod?.z1 ?? s.z1, cor: prod?.hex ?? s.cor, nome: prod?.n ?? PECAS[pc.tipo].n,
        vidro: pc.tipo === "janela", naParede: ["porta", "janela", "espelho", "toalheiro"].includes(pc.tipo) };
      const resguardo = comProdutos && pc.tipo === "base" ? produto(p.acompanha[pc.id]?.resguardo) : undefined;
      return resguardo ? [caixa, { ...ladoAberto(pc, pl), id: `${pc.id}-resguardo`, z0: 3, z1: 200, cor: "#cfe9f3", nome: resguardo.n, vidro: true }] : [caixa];
    }),
  };
}

/** O lado da base virado para o meio da divisão (onde fica o resguardo), como uma placa de 2 cm. */
function ladoAberto(pc: PecaPlanta, pl: Planta): { x: number; y: number; w: number; h: number } {
  const pts = cantos(pl.paredes, pl.o).slice(0, -1);
  const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
  const lados = [
    { d: Math.hypot(pc.x + pc.w / 2 - cx, pc.y - cy), r: { x: pc.x, y: pc.y, w: pc.w, h: 2 } },
    { d: Math.hypot(pc.x + pc.w / 2 - cx, pc.y + pc.h - cy), r: { x: pc.x, y: pc.y + pc.h - 2, w: pc.w, h: 2 } },
    { d: Math.hypot(pc.x - cx, pc.y + pc.h / 2 - cy), r: { x: pc.x, y: pc.y, w: 2, h: pc.h } },
    { d: Math.hypot(pc.x + pc.w - cx, pc.y + pc.h / 2 - cy), r: { x: pc.x + pc.w - 2, y: pc.y, w: 2, h: pc.h } },
  ];
  return lados.sort((a, b) => a.d - b.d)[0].r;
}

export default function EstudioProjeto() {
  const [p, setP] = useState<Projeto>(lerGuardado);
  const [passo, setPasso] = useState<Passo>("Antes");
  const [aberta, setAberta] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [aviso, setAviso] = useState("");
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* fica só em memória */ } }, [p]);

  const linhas = useMemo(() => necessidades(p), [p]);
  const t = totais(linhas);
  const escolher = (cat: Categoria) => melhorPara(cat, p.estilo)?.id;
  const mudarAntes = (antes: Planta) => setP((x) => ({ ...x, antes, depois: { ...x.depois, o: { ...antes.o }, paredes: antes.paredes.map((w) => ({ ...w })) } }));
  const mudarDepois = (depois: Planta) => setP((x) => ({ ...x, depois }));
  const pecaAberta = p.depois.pecas.find((x) => x.id === aberta) ?? null;
  const porEscolher = linhas.filter((l) => l.porEscolher && !l.fora).length;

  const ir = (q: Passo) => { setPasso(q); setAberta(null); window.scrollTo?.({ top: 0, behavior: "smooth" }); };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      {/* o cabeçalho: o projeto, os passos e a apresentação */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Estúdio · protótipo</p>
            <h1 className="truncate text-xl font-semibold tracking-tight">{p.nome ?? "Casa de banho do Bruno"}</h1>
          </div>
          <Button type="button" className="min-h-11" onClick={() => setMostrar(true)}><Monitor className="mr-2 h-4 w-4" aria-hidden="true" />Mostrar ao cliente</Button>
        </div>
        <nav aria-label="Passos do projeto" className="mx-auto max-w-7xl overflow-x-auto px-4 pb-3 sm:px-8">
          <ol className="flex min-w-max gap-2">
            {PASSOS.map((q, i) => (
              <li key={q}>
                <button type="button" aria-current={passo === q ? "step" : undefined} onClick={() => ir(q)}
                  className={cn("inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] transition-colors",
                    passo === q ? "bg-foreground text-background" : "bg-muted/70 text-foreground hover:bg-muted")}>
                  <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-semibold", passo === q ? "bg-background/20" : "bg-background")}>{i + 1}</span>{q}
                  {q === "Proposta" && porEscolher > 0 && <span className="rounded-full bg-warning/20 px-2 text-xs text-warning-foreground">{porEscolher} por escolher</span>}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {passo === "Antes" && <>
          <section aria-labelledby="t-antes" className="min-w-0 space-y-4">
            <h2 id="t-antes" className="text-2xl font-semibold tracking-tight">Como está hoje</h2>
            <EditorPlanta planta={p.antes} onMudar={mudarAntes} divisao="Casa de banho" />
          </section>
          <aside className="space-y-6">
            <Cartao titulo="Alturas">
              <Numero rotulo="Pé-direito atual" un="cm" valor={p.alturas.peDireito} onMudar={(n) => setP((x) => ({ ...x, alturas: { ...x.alturas, peDireito: n } }))} />
              <div className="space-y-2">
                <p className="text-sm font-medium">Teto falso</p>
                <div className="flex gap-2">
                  <button type="button" className={chip(p.alturas.tetoFalso !== null)} aria-pressed={p.alturas.tetoFalso !== null} onClick={() => setP((x) => ({ ...x, alturas: { ...x.alturas, tetoFalso: x.alturas.tetoFalso ?? 240 } }))}>Sim</button>
                  <button type="button" className={chip(p.alturas.tetoFalso === null)} aria-pressed={p.alturas.tetoFalso === null} onClick={() => setP((x) => ({ ...x, alturas: { ...x.alturas, tetoFalso: null } }))}>Não</button>
                </div>
                {p.alturas.tetoFalso !== null && <Numero rotulo="Altura do teto falso" un="cm" valor={p.alturas.tetoFalso} onMudar={(n) => setP((x) => ({ ...x, alturas: { ...x.alturas, tetoFalso: n } }))} />}
              </div>
              <Areas p={p} />
            </Cartao>
            <Seguinte onClick={() => ir("Estilo")}>Escolher o estilo</Seguinte>
          </aside>
        </>}

        {passo === "Estilo" && <>
          <section aria-labelledby="t-estilo" className="min-w-0 space-y-6">
            <div>
              <h2 id="t-estilo" className="text-2xl font-semibold tracking-tight">O estilo do cliente</h2>
              <p className="text-[15px] text-muted-foreground">As cores de tudo e as exceções. O catálogo filtra-se por aqui.</p>
            </div>
            <Cartao titulo="As cores de tudo">
              <Cores escolhidas={p.estilo.cores} onMudar={(cores) => setP((x) => ({ ...x, estilo: { ...x.estilo, cores } }))} />
            </Cartao>
            <Cartao titulo="Exceções">
              <ul className="divide-y divide-border">
                {EXCECOES.map((cat) => {
                  const exc = p.estilo.porCategoria[cat];
                  return (
                    <li key={cat} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[15px] font-medium">{NOME_CATEGORIA[cat]}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className={chip(!exc?.length)} aria-pressed={!exc?.length}
                          onClick={() => setP((x) => { const pc = { ...x.estilo.porCategoria }; delete pc[cat]; return { ...x, estilo: { ...x.estilo, porCategoria: pc } }; })}>Como o resto</button>
                        <Cores pequeno escolhidas={exc ?? []} onMudar={(cores) => setP((x) => ({ ...x, estilo: { ...x.estilo, porCategoria: { ...x.estilo.porCategoria, [cat]: cores } } }))} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Cartao>
          </section>
          <aside className="space-y-6">
            <Cartao titulo="O que isto escolhe">
              <ul className="space-y-2">
                {(["sanita", "base", "movel", "torneira", "revestimento", "pavimento"] as Categoria[]).map((cat) => {
                  const m = melhorPara(cat, p.estilo);
                  return <li key={cat} className="flex items-center gap-3 text-[15px]"><Amostra hex={m?.hex} /><span className="min-w-0"><span className="block text-xs text-muted-foreground">{NOME_CATEGORIA[cat]}</span>{m?.n ?? "Nada combina: escolhe-se à mão"}</span></li>;
                })}
              </ul>
            </Cartao>
            <Seguinte onClick={() => ir("Depois")}>Desenhar o depois</Seguinte>
          </aside>
        </>}

        {passo === "Depois" && <>
          <section aria-labelledby="t-depois" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="t-depois" className="text-2xl font-semibold tracking-tight">Como vai ficar</h2>
                <p className="text-[15px] text-muted-foreground">As paredes do antes. Toque numa peça para a trocar no catálogo; o que sai fica a tracejado.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={() => {
                  setP((x) => aplicarEstilo({ ...x, depois: depoisDaVisita(x.antes), escolhas: {}, acompanha: {} }, escolher, true));
                  setAviso("Como ficou combinado na visita: sai a banheira e o bidé; entra a base de 1,20 m e o toalheiro; tudo no estilo do cliente.");
                }}><Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />Como na visita</Button>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => { setP((x) => aplicarEstilo(x, escolher)); setAviso("O estilo do cliente foi aplicado às peças novas e trocadas, às paredes e ao chão."); }}>
                  <Paintbrush className="mr-1.5 h-4 w-4" aria-hidden="true" />Aplicar o estilo
                </Button>
              </div>
            </div>
            {aviso && <p role="status" className="rounded-xl bg-primary/[0.06] px-4 py-3 text-[15px]">{aviso}</p>}
            <EditorPlanta planta={p.depois} onMudar={mudarDepois} paredesFixas fantasmas={sairam(p)}
              tipos={["base", "banheira", "sanita", "bide", "movel", "coluna", "espelho", "toalheiro"]}
              aparencia={(pc) => { const prod = produto(p.escolhas[pc.id]); const e = estadoDaPeca(p, pc); return { cor: prod?.hex, rotulo: prod ? prod.colecao + " · " + PECAS[pc.tipo].n : undefined, destaque: e !== "fica" && !PECAS[pc.tipo].abertura }; }}
              aoTocarPeca={(pc) => setAberta(pc.id)} aoJuntarPeca={(pc) => setAberta(pc.id)}
              acoesDaPeca={(pc) => PECAS[pc.tipo].abertura ? null : <Button type="button" className="min-h-11" onClick={() => setAberta(pc.id)}>Escolher no catálogo</Button>} />
          </section>
          <aside className="space-y-6">
            {pecaAberta && !PECAS[pecaAberta.tipo].abertura
              ? <PainelPeca p={p} pc={pecaAberta} setP={setP} fechar={() => setAberta(null)} />
              : <PainelMateriais p={p} setP={setP} />}
            <Resumo t={t} porEscolher={porEscolher} />
            <Seguinte onClick={() => ir("3D")}>Ver em 3D</Seguinte>
          </aside>
        </>}

        {passo === "3D" && <>
          <section aria-labelledby="t-3d" className="min-w-0 space-y-4">
            <h2 id="t-3d" className="text-2xl font-semibold tracking-tight">Em 3D</h2>
            <AntesDepois3D p={p} />
          </section>
          <aside className="space-y-6">
            <Escolhidos p={p} />
            <Seguinte onClick={() => ir("Proposta")}>Ver a proposta</Seguinte>
          </aside>
        </>}

        {passo === "Proposta" && <>
          <section aria-labelledby="t-prop" className="min-w-0 space-y-4">
            <div>
              <h2 id="t-prop" className="text-2xl font-semibold tracking-tight">As necessidades e o orçamento</h2>
              <p className="text-[15px] text-muted-foreground">Saem das duas plantas. Mude a quantidade ou tire o que não entra; o que mudar fica marcado.</p>
            </div>
            <Linhas linhas={linhas} setP={setP} irParaPeca={(id) => { ir("Depois"); setTimeout(() => setAberta(id), 0); }} />
          </section>
          <aside className="space-y-6">
            <Resumo t={t} porEscolher={porEscolher} grande />
            <Button type="button" className="min-h-12 w-full text-base" onClick={() => setMostrar(true)}><Monitor className="mr-2 h-5 w-5" aria-hidden="true" />Mostrar ao cliente</Button>
            <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => ir("Obra")}><HardHat className="mr-2 h-4 w-4" aria-hidden="true" />A ficha para a obra</Button>
          </aside>
        </>}

        {passo === "Obra" && <FichaObra p={p} linhas={linhas} />}
      </div>

      <footer className="mx-auto max-w-7xl px-4 pb-10 sm:px-8">
        <button type="button" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => { setP(PROJETO_EXEMPLO); setPasso("Antes"); setAviso(""); }}><RotateCcw className="h-4 w-4" aria-hidden="true" />Recomeçar com o exemplo</button>
      </footer>

      {mostrar && <MostrarAoCliente p={p} t={t} fechar={() => setMostrar(false)} />}
    </main>
  );
}

// ---------------------------------------------------------------- peças pequenas

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <h3 className="text-[17px] font-semibold tracking-tight">{titulo}</h3>
      {children}
    </section>
  );
}
function Seguinte({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" className="min-h-12 w-full text-base" onClick={onClick}>{children}<ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Button>;
}
function Amostra({ hex, grande = false }: { hex?: string; grande?: boolean }) {
  return <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-lg border border-black/10 shadow-inner", grande ? "h-14 w-14" : "h-8 w-8")} style={{ background: hex ?? "repeating-linear-gradient(45deg,#eee,#eee 4px,#ddd 4px,#ddd 8px)" }} />;
}
function Numero({ rotulo, un, valor, onMudar }: { rotulo: string; un: string; valor: number; onMudar: (n: number) => void }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">{rotulo}
      <span className="flex items-center gap-2">
        <input key={valor} type="number" inputMode="numeric" min={150} max={500} defaultValue={valor} className={cn(INP, "w-32")}
          onBlur={(e) => { const n = Math.round(Number(e.target.value) || 0); if (n >= 150 && n !== valor) onMudar(n); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span className="text-muted-foreground">{un}</span>
      </span>
    </label>
  );
}
function Cores({ escolhidas, onMudar, pequeno = false }: { escolhidas: Cor[]; onMudar: (c: Cor[]) => void; pequeno?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Cores">
      {(Object.keys(CORES) as Cor[]).map((c) => {
        const on = escolhidas.includes(c);
        return (
          <button key={c} type="button" aria-pressed={on} className={cn(chip(on), pequeno && "px-3")}
            onClick={() => onMudar(on ? escolhidas.filter((x) => x !== c) : [...escolhidas, c])}>
            <span aria-hidden="true" className="h-5 w-5 rounded-full border border-black/15" style={{ background: CORES[c].hex }} />{CORES[c].n}
            {on && escolhidas.length > 1 && escolhidas[0] === c && <span className="text-xs text-muted-foreground">1.ª</span>}
          </button>
        );
      })}
    </div>
  );
}
function Areas({ p }: { p: Projeto }) {
  const chao = areaChaoM2(p.antes.paredes), altura = alturaFinalCm(p.alturas) / 100;
  const paredes = areaParedesM2(p.depois, altura);
  return chao === null ? <p className="text-sm text-muted-foreground">Feche a planta para ver os m².</p> : (
    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-[15px]">
      <div><dt className="text-xs text-muted-foreground">Chão</dt><dd className="font-semibold">{nf(chao)} m²</dd></div>
      <div><dt className="text-xs text-muted-foreground">Paredes até {p.alturas.tetoFalso ? "ao teto falso" : "ao teto"}</dt><dd className="font-semibold">{paredes === null ? "—" : `${nf(paredes)} m²`}</dd></div>
    </dl>
  );
}
function Resumo({ t, porEscolher, grande = false }: { t: ReturnType<typeof totais>; porEscolher: number; grande?: boolean }) {
  return (
    <section aria-label="Orçamento" className={cn("rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]", grande && "bg-foreground text-background")}>
      <p className={cn("text-sm", grande ? "text-background/70" : "text-muted-foreground")}>Orçamento, com IVA a {Math.round(IVA * 100)}%</p>
      <p className={cn("font-semibold tracking-tight", grande ? "text-4xl" : "text-3xl")}>{eur(t.comIva)}</p>
      <p className={cn("text-sm", grande ? "text-background/70" : "text-muted-foreground")}>{eur(t.semIva)} sem IVA{porEscolher ? ` · ${porEscolher} por escolher` : ""}</p>
      {grande && <p className="mt-3 text-xs text-background/60">Com IVA a 6% se a casa estiver numa área de reabilitação urbana: por confirmar.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- o catálogo de uma peça

function CartaoProduto({ prod, estilo, escolhido, onEscolher }: { prod: Produto; estilo: Estilo; escolhido: boolean; onEscolher: () => void }) {
  const c = combina(prod, estilo);
  return (
    <li>
      <button type="button" aria-pressed={escolhido} onClick={onEscolher}
        className={cn("flex w-full gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          escolhido ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-border bg-background hover:border-primary/50")}>
        <Amostra hex={prod.hex} grande />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug">{prod.n}</span>
          {prod.destaque && <span className="block text-xs text-muted-foreground">{prod.destaque}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <b>{eur(prod.preco)}{prod.un === "m²" ? "/m²" : ""}</b>
            <span className="text-muted-foreground">+ {eur(prod.inst)}{prod.un === "m²" ? "/m²" : ""} de mão de obra</span>
            {c === 2 && <span className="rounded-full bg-success/15 px-2 text-xs font-medium text-success">combina</span>}
            {c === 1 && <span className="rounded-full bg-muted px-2 text-xs">também combina</span>}
          </span>
        </span>
        {escolhido && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    </li>
  );
}

function ListaProdutos({ cat, estilo, escolhido, onEscolher }: { cat: Categoria; estilo: Estilo; escolhido?: string; onEscolher: (id: string) => void }) {
  const [todos, setTodos] = useState(false);
  const lista = produtosDe(cat, estilo, todos);
  const fora = produtosDe(cat, estilo, true).length - produtosDe(cat, estilo).length;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Filtrado por {coresPara(estilo, cat).map((c) => CORES[c].n.toLowerCase()).join(" e ") || "todas as cores"}.</p>
      {lista.length === 0 && <p className="text-sm">Nenhum produto combina com o estilo.</p>}
      <ul className="space-y-2">{lista.map((prod) => <CartaoProduto key={prod.id} prod={prod} estilo={estilo} escolhido={escolhido === prod.id} onEscolher={() => onEscolher(prod.id)} />)}</ul>
      {fora > 0 && <button type="button" className="min-h-11 text-sm text-primary underline-offset-4 hover:underline" onClick={() => setTodos((x) => !x)}>{todos ? "Só os que combinam" : `Ver também os outros ${fora}`}</button>}
    </div>
  );
}

function PainelPeca({ p, pc, setP, fechar }: { p: Projeto; pc: PecaPlanta; setP: React.Dispatch<React.SetStateAction<Projeto>>; fechar: () => void }) {
  const estado = estadoDaPeca(p, pc), doAntes = estado !== "nova";
  const escolher = (id: string) => setP((x) => {
    const prod = produto(id);
    // a peça fica com o tamanho do produto, na mesma orientação
    const deitada = pc.w < pc.h;
    const pecas = x.depois.pecas.map((y) => (y.id === pc.id && prod?.w && prod.h ? { ...y, w: deitada ? prod.h : prod.w, h: deitada ? prod.w : prod.h } : y));
    return { ...x, escolhas: { ...x.escolhas, [pc.id]: id }, depois: { ...x.depois, pecas } };
  });
  return (
    <section aria-labelledby="t-peca" className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{estado === "nova" ? "Peça nova" : estado === "troca" ? "Troca" : "Fica como está"}</p>
          <h3 id="t-peca" className="text-[17px] font-semibold tracking-tight">{PECAS[pc.tipo].n}</h3>
        </div>
        <Button type="button" variant="ghost" className="min-h-11" aria-label="Fechar o catálogo" onClick={fechar}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      {doAntes && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(estado === "fica")} aria-pressed={estado === "fica"}
            onClick={() => setP((x) => { const e = { ...x.escolhas }; delete e[pc.id]; return { ...x, escolhas: e }; })}><CircleDot className="h-4 w-4" aria-hidden="true" />Fica como está</button>
          <button type="button" className={chip(false)} onClick={() => { setP((x) => ({ ...x, depois: { ...x.depois, pecas: x.depois.pecas.filter((y) => y.id !== pc.id) } })); fechar(); }}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />Sai
          </button>
        </div>
      )}
      <ListaProdutos cat={pc.tipo} estilo={p.estilo} escolhido={p.escolhas[pc.id]} onEscolher={escolher} />
      {(ACOMPANHA[pc.tipo] ?? []).map((cat) => (
        <div key={cat} className="space-y-2 border-t border-border pt-4">
          <h4 className="text-[15px] font-semibold">{NOME_CATEGORIA[cat]}</h4>
          <ListaProdutos cat={cat} estilo={p.estilo} escolhido={p.acompanha[pc.id]?.[cat]}
            onEscolher={(id) => setP((x) => ({ ...x, acompanha: { ...x.acompanha, [pc.id]: { ...(x.acompanha[pc.id] ?? {}), [cat]: id } } }))} />
        </div>
      ))}
    </section>
  );
}

function PainelMateriais({ p, setP }: { p: Projeto; setP: React.Dispatch<React.SetStateAction<Projeto>> }) {
  return (
    <Cartao titulo="Paredes e chão">
      <p className="text-sm text-muted-foreground">Ou toque numa peça da planta para a trocar.</p>
      <div className="space-y-2">
        <h4 className="text-[15px] font-semibold">Revestimento{p.alturas.tetoFalso ? " (até ao teto falso)" : ""}</h4>
        <ListaProdutos cat="revestimento" estilo={p.estilo} escolhido={p.revestimento} onEscolher={(id) => setP((x) => ({ ...x, revestimento: id }))} />
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <h4 className="text-[15px] font-semibold">Pavimento</h4>
        <ListaProdutos cat="pavimento" estilo={p.estilo} escolhido={p.pavimento} onEscolher={(id) => setP((x) => ({ ...x, pavimento: id }))} />
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------- o 3D e a proposta

function AntesDepois3D({ p, escuro = false, sozinha = false }: { p: Projeto; escuro?: boolean; sozinha?: boolean }) {
  const [qual, setQual] = useState<"antes" | "depois">("depois");
  const cena = qual === "antes" ? cenaDe(p.antes, p, false) : cenaDe(p.depois, p, true);
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Antes ou depois" className={cn("inline-flex rounded-full p-1", escuro ? "bg-white/10" : "bg-muted")}>
        {(["antes", "depois"] as const).map((q) => (
          <button key={q} type="button" aria-pressed={qual === q} onClick={() => setQual(q)}
            className={cn("min-h-11 rounded-full px-5 text-[15px] font-medium transition-colors", qual === q ? (escuro ? "bg-white text-slate-950" : "bg-background shadow-sm") : (escuro ? "text-white/70" : "text-muted-foreground"))}>
            {q === "antes" ? "Antes" : "Depois"}
          </button>
        ))}
      </div>
      <Vista3D cena={cena} escuro={escuro} sozinha={sozinha} titulo={qual === "antes" ? "Como está hoje" : "Como vai ficar"} />
    </div>
  );
}

function Escolhidos({ p, escuro = false }: { p: Projeto; escuro?: boolean }) {
  const lista = [
    ...p.depois.pecas.map((pc) => produto(p.escolhas[pc.id])).filter((x): x is Produto => !!x),
    ...Object.values(p.acompanha).flatMap((a) => Object.values(a).map((id) => produto(id))).filter((x): x is Produto => !!x),
    ...[produto(p.revestimento), produto(p.pavimento)].filter((x): x is Produto => !!x),
  ];
  return (
    <section aria-label="O que foi escolhido" className={cn("space-y-3 rounded-2xl border p-5", escuro ? "border-white/10 bg-white/5" : "border-border bg-card shadow-[var(--shadow-sm)]")}>
      <h3 className="text-[17px] font-semibold tracking-tight">O que foi escolhido</h3>
      {lista.length === 0 ? <p className={cn("text-sm", escuro ? "text-white/60" : "text-muted-foreground")}>Ainda nada: escolha as peças no passo «Depois».</p> : (
        <ul className="space-y-2">
          {lista.map((x, i) => (
            <li key={x.id + i} className="flex items-center gap-3 text-[15px]">
              <Amostra hex={x.hex} />
              <span className="min-w-0"><span className={cn("block text-xs", escuro ? "text-white/60" : "text-muted-foreground")}>{NOME_CATEGORIA[x.cat]}</span>{x.n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Linhas({ linhas, setP, irParaPeca }: { linhas: Linha[]; setP: React.Dispatch<React.SetStateAction<Projeto>>; irParaPeca: (pecaId: string) => void }) {
  const grupos = ["Peças", "Materiais", "Trabalhos"] as const;
  const ajustar = (id: string, a: { q?: number; fora?: boolean }) => setP((x) => ({ ...x, ajustes: { ...x.ajustes, [id]: { ...(x.ajustes[id] ?? {}), ...a } } }));
  if (!linhas.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-[15px] text-muted-foreground">Sem necessidades: a planta do depois ainda é igual à do antes. Troque, tire ou junte peças, ou escolha o revestimento e o pavimento.</p>;
  return (
    <div className="space-y-6">
      {grupos.map((g) => {
        const ls = linhas.filter((l) => l.grupo === g);
        if (!ls.length) return null;
        return (
          <section key={g} aria-label={g} className="rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
            <h3 className="border-b border-border px-5 py-3 text-[15px] font-semibold">{g}</h3>
            <ul className="divide-y divide-border">
              {ls.map((l) => (
                <li key={l.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3", l.fora && "opacity-50")}>
                  <div className="min-w-[220px] flex-1">
                    <p className={cn("text-[15px] font-medium", l.fora && "line-through")}>{l.n}{l.ajustada && <span className="ml-2 rounded-full bg-primary/10 px-2 text-xs text-primary">ajustado</span>}</p>
                    <p className="text-xs text-muted-foreground">{l.porque}</p>
                    {l.porEscolher && <button type="button" className="min-h-11 text-sm text-primary underline-offset-4 hover:underline" onClick={() => irParaPeca(l.id.replace(/^prod-/, ""))}>Escolher no catálogo</button>}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="sr-only">Quantidade de {l.n}</span>
                    <input key={`${l.id}-${l.q}`} type="number" step="any" min={0} defaultValue={l.q} disabled={l.fora} className="h-10 w-20 rounded-lg border border-input bg-background px-2 text-right"
                      onBlur={(e) => { const q = Number(e.target.value); if (Number.isFinite(q) && q >= 0 && q !== l.q) ajustar(l.id, { q }); }} />
                    <span className="w-6 text-muted-foreground">{l.un}</span>
                  </label>
                  <span className="w-28 text-right text-[15px] font-semibold tabular-nums">{eur(l.total)}</span>
                  <Button type="button" variant="ghost" className="min-h-11" aria-label={l.fora ? `Repor ${l.n}` : `Tirar ${l.n}`} onClick={() => ajustar(l.id, { fora: !l.fora })}>
                    {l.fora ? "Repor" : <X className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- a apresentação ao cliente

function MostrarAoCliente({ p, t, fechar }: { p: Projeto; t: ReturnType<typeof totais>; fechar: () => void }) {
  const [aceite, setAceite] = useState(false);
  const [enviado, setEnviado] = useState("");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="t-cliente" className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Mudelar · projeto</p>
            <h2 id="t-cliente" className="text-2xl font-semibold tracking-tight sm:text-3xl">A sua casa de banho, como vai ficar</h2>
          </div>
          <button type="button" onClick={fechar} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-4 text-[15px] hover:bg-white/10">
            <X className="h-4 w-4" aria-hidden="true" />Fechar
          </button>
        </header>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <AntesDepois3D p={p} escuro sozinha />
          <div className="space-y-6">
            <section className="rounded-2xl bg-white p-6 text-slate-950">
              <p className="text-sm text-slate-500">Orçamento, chave na mão</p>
              <p className="text-4xl font-semibold tracking-tight">{eur(t.comIva)}</p>
              <p className="text-sm text-slate-500">com IVA · materiais, mão de obra, proteções e entulho</p>
            </section>
            <Escolhidos p={p} escuro />
          </div>
        </div>
        <section aria-label="Enviar" className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="flex items-start gap-3 text-[15px] text-white/80">
            <Lock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            O projeto é da Mudelar: mostra-se aqui e não se envia. Envia-se a proposta; o projeto vai para o portal do cliente quando a proposta for aceite.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-5 text-base font-medium text-slate-950 hover:bg-white/90"
              onClick={() => setEnviado("A proposta foi para o portal do cliente (simulação). O projeto fica guardado até ele aceitar.")}>
              <Send className="h-4 w-4" aria-hidden="true" />Enviar a proposta
            </button>
            <button type="button" aria-disabled={!aceite} className={cn("inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-base",
              aceite ? "border-white text-white hover:bg-white/10" : "cursor-not-allowed border-white/20 text-white/40")}
              onClick={() => { if (aceite) setEnviado("O projeto foi para o portal do cliente (simulação), com a proposta aceite."); }}>
              <Lock className="h-4 w-4" aria-hidden="true" />Enviar o projeto{aceite ? "" : " (depois de aceite)"}
            </button>
            <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="h-5 w-5 accent-white" />Simular: o cliente aceitou a proposta
            </label>
          </div>
          <p role="status" className="min-h-5 text-sm text-emerald-300">{enviado}</p>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- a ficha para a obra (operações)

function FichaObra({ p, linhas }: { p: Projeto; linhas: Linha[] }) {
  const ts = tarefas(p);
  const mats = materiais(linhas);
  const NOME = { retirar: "Retirar", mudar: "Mudar de sítio", instalar: "Instalar", fica: "Fica" } as const;
  const COR = { retirar: "bg-destructive/10 text-destructive", mudar: "bg-warning/15 text-warning-foreground", instalar: "bg-primary/10 text-primary", fica: "bg-muted text-muted-foreground" } as const;
  return (
    <section aria-labelledby="t-obra" className="min-w-0 space-y-6 lg:col-span-2 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="t-obra" className="text-2xl font-semibold tracking-tight">A ficha para a obra</h2>
          <p className="text-[15px] text-muted-foreground">O que a equipa precisa: as duas plantas, o que se retira e o que se instala onde, os materiais e as alturas.</p>
        </div>
        <Button type="button" variant="outline" className="min-h-11 print:hidden" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" aria-hidden="true" />Imprimir ou guardar em PDF</Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <PlantaVista planta={p.antes} titulo="Antes: como está hoje" />
        <PlantaVista planta={p.depois} titulo="Depois: como vai ficar (a tracejado, o que sai)" fantasmas={sairam(p)}
          cor={(pc) => produto(p.escolhas[pc.id])?.hex} rotulo={(pc) => produto(p.escolhas[pc.id])?.colecao} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Cartao titulo="Tarefas, pela ordem da obra">
          <ol className="space-y-2">
            {ts.filter((x) => x.tipo !== "fica").map((x, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-border p-3">
                <span className={cn("h-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", COR[x.tipo])}>{NOME[x.tipo]}</span>
                <span className="min-w-0 text-[15px]">
                  <b className="font-medium">{x.peca}</b>{x.produto ? `: ${x.produto}` : ""}
                  {x.onde && <span className="block text-sm text-muted-foreground">{x.onde}</span>}
                  {x.acompanha?.length ? <span className="block text-sm text-muted-foreground">Com {x.acompanha.join(" e ")}.</span> : null}
                </span>
              </li>
            ))}
          </ol>
          {ts.some((x) => x.tipo === "fica") && <p className="text-sm text-muted-foreground">Ficam como estão: {ts.filter((x) => x.tipo === "fica").map((x) => x.peca.toLowerCase()).join(", ")}.</p>}
        </Cartao>
        <div className="space-y-6">
          <Cartao titulo="Alturas">
            <ul className="space-y-1 text-[15px]">{alturasEmPalavras(p).map((x) => <li key={x}>{x}</li>)}</ul>
          </Cartao>
          <Cartao titulo="Materiais">
            {mats.length ? <ul className="space-y-2 text-[15px]">{mats.map((l) => <li key={l.id}><b className="font-medium">{nf(l.q)} {l.un}</b> de {l.n}<span className="block text-xs text-muted-foreground">{l.porque}</span></li>)}</ul>
              : <p className="text-sm text-muted-foreground">Sem revestimento nem pavimento escolhidos.</p>}
          </Cartao>
          <Cartao titulo="Paredes, para conferir">
            <p className="text-[15px]">{p.depois.paredes.map((w) => `${w.c} cm`).join(" · ")}</p>
          </Cartao>
        </div>
      </div>
    </section>
  );
}
