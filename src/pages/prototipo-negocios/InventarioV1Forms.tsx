// Os passos guiados do Inventário do V1 (19/10/2026): contar o armazém (um material de cada vez), fazer uma encomenda,
// criar um material e criar um fornecedor. Um só primário em cada ecrã; os erros ficam no campo (aria-invalid) e o foco vai lá (R6).
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContadorQtd } from "./ContadorQtd";
import type { Resultado } from "./inventario/loja";
import {
  acabarContagem, comecarContagem, contar, desistirContagem, novaEncomenda, novoFornecedor, novoMaterial, validarFornecedor, validarMaterial,
  type DadosFornV1, type DadosMaterial,
} from "./inventarioV1Acoes";
import { armazemInv, categoriasArmazem, contagemAberta, eur, linhasContagem, nfmtSinal, nomeCategoria, plural, porUn, qtd } from "./inventarioV1Docs";
import { BLOCO, CAMPO, Campo, Confirmar, Erro, Escolhas, LIGACAO_RARA, LISTA, Voltar, ligar, nomeSec, type Comum } from "./InventarioV1Pecas";

const H1 = "mt-2 text-3xl font-semibold tracking-tight outline-none";
const focarErro = () => setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 30);
const numero = (s: string): number | null => { const n = parseFloat(s.replace(",", ".")); return Number.isNaN(n) ? null : n; };

/* ---------------------------------------------------------------- contar o armazém */

export function ContagemV1(c: Comum) {
  const aberta = contagemAberta(c.db);
  return aberta ? <Contar key={aberta.id} {...c} id={aberta.id} /> : <ComecarContagem {...c} />;
}

function ComecarContagem({ ctx, db, voltar, feito, titulo, sec }: Comum) {
  const [cat, setCat] = useState("");
  const [erro, setErro] = useState("");
  const cats = categoriasArmazem(db);
  const n = (k: string) => armazemInv(ctx.S, db).filter((m) => !k || m.cat === nomeCategoria(k)).length;
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className={H1}>Contar o armazém</h1>
      <p className="mt-1 max-w-2xl text-base text-muted-foreground">Conta-se um material de cada vez, na prateleira. No fim vê as diferenças e corrige o stock de uma vez; até lá, o stock não muda e pode parar e continuar depois.</p>
      <div className={cn("mt-8 grid gap-5 p-5 sm:p-6", BLOCO)}>
        <Escolhas rotulo="O que contar" valor={cat || "__todos"} mudar={(v) => setCat(v === "__todos" ? "" : v)}
          opcoes={[{ v: "__todos", t: `Tudo (${n("")})` }, ...cats.map((x) => ({ v: x, t: `${nomeCategoria(x)} (${n(x)})` }))]} />
        {erro && <Erro>{erro}</Erro>}
        <div><Button size="lg" className="w-full sm:w-auto" onClick={() => { const r = comecarContagem(cat); if (r.ok) { setErro(""); feito(`Contagem começada: ${plural(n(cat), "material", "materiais")} por contar.`); } else setErro(r.erro); }}>Começar a contagem</Button></div>
      </div>
    </>
  );
}

function Contar({ db, voltar, feito, titulo, sec, id }: Comum & { id: string }) {
  const c = db.counts.find((x) => x.id === id)!;
  const L = linhasContagem(db, c);
  const [i, setI] = useState(() => { const k = L.findIndex((l) => l.contado == null); return k < 0 ? L.length : k; });
  const atual = L[i];
  const [v, setV] = useState(atual ? atual.contado ?? atual.esperado : 0);
  const [desistir, setDesistir] = useState(false);
  const [erro, setErro] = useState("");
  const nome = useRef<HTMLParagraphElement>(null);
  useEffect(() => { const l = L[i]; if (l) setV(l.contado ?? l.esperado); nome.current?.focus({ preventScroll: true }); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const feitas = L.filter((l) => l.contado != null).length;
  const seguinte = () => {
    const r = contar(id, atual.idx, v);
    if (!r.ok) { setErro(r.erro); return; }
    setErro("");
    const k = L.findIndex((l, j) => j > i && l.contado == null);
    setI(k < 0 ? L.length : k);
  };
  const fim = i >= L.length;
  const porContar = L.filter((l) => l.contado == null);
  const difs = L.filter((l) => l.dif);
  const correr = (r: Resultado<string>) => { if (r.ok) { feito(r.valor); voltar(); } else setErro(r.erro); };
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className={H1}>Contar o armazém</h1>
      <p className="mt-1 text-base text-muted-foreground">{c.cat ? nomeCategoria(c.cat) : "Todos os materiais"} · começada {c.started.slice(8, 10)}/{c.started.slice(5, 7)} · o stock só muda no fim</p>
      <div className="mt-6" role="progressbar" aria-label="Materiais contados" aria-valuemin={0} aria-valuemax={L.length} aria-valuenow={feitas} aria-valuetext={`${feitas} de ${L.length}`}>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contados</span><span className="font-medium tabular-nums">{feitas} de {L.length}</span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left rounded-full bg-primary transition-transform duration-500" style={{ transform: `scaleX(${L.length ? feitas / L.length : 0})` }} /></div>
      </div>

      {!fim ? (
        <section aria-label="Material a contar" className={cn("mt-6 p-5 sm:p-6", BLOCO)}>
          <p className="text-sm text-muted-foreground">Material {i + 1} de {L.length}{atual.loc ? ` · prateleira ${atual.loc}` : ""}</p>
          <p ref={nome} tabIndex={-1} className="mt-1 text-2xl font-semibold outline-none">{atual.n}</p>
          <p className="mt-1 text-[15px] text-muted-foreground">O sistema diz {qtd(atual.esperado, atual.un)}. Conte e acerte, se for diferente.</p>
          <div className="mt-5"><ContadorQtd id={"cont-" + atual.idx} valor={v} un={atual.un} nome={atual.n} min={0} onMudar={(x) => setV(Math.round(x))} /></div>
          {v !== atual.esperado && <p className="mt-3 flex items-center gap-2 text-[15px]"><AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" />Diferença de {nfmtSinal(v - atual.esperado)} {atual.un}</p>}
          {erro && <div className="mt-3"><Erro>{erro}</Erro></div>}
          <div className="mt-6 flex items-center gap-3">
            <Button variant="ghost" size="lg" className="w-12 px-0" aria-label="Material anterior" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></Button>
            <Button size="lg" className="flex-1 sm:flex-none" onClick={seguinte}>{L.some((l, j) => j > i && l.contado == null) ? "Seguinte" : "Ver as diferenças"}</Button>
          </div>
        </section>
      ) : porContar.length ? (
        <section aria-label="Falta contar" className={cn("mt-6 p-5", BLOCO)}>
          <p className="text-lg">Falta contar {plural(porContar.length, "material", "materiais")}.</p>
          <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={() => setI(porContar[0].idx)}>Contar {porContar[0].n.toLowerCase()}</Button>
        </section>
      ) : (
        <section aria-labelledby="cont-fim" className={cn("mt-6 p-5 sm:p-6", BLOCO)}>
          <h2 id="cont-fim" className="text-xl font-semibold">{difs.length ? `${plural(difs.length, "diferença", "diferenças")} para corrigir` : "Tudo certo"}</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">{difs.length ? "Ao acabar, o stock passa a ser o que contou. Cada correção fica no livro de movimentos." : "O que contou bate com o sistema. Ao acabar, a contagem fica registada."}</p>
          {difs.length > 0 && (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {difs.map((l) => (
                <li key={l.idx} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <button type="button" onClick={() => setI(l.idx)} className="min-w-0 flex-1 text-left text-[15px] font-medium underline-offset-4 hover:underline">{l.n}</button>
                  <span className="text-[15px] tabular-nums text-muted-foreground">sistema {qtd(l.esperado, l.un)} · contado {qtd(l.contado!, l.un)}</span>
                  <span className="w-20 text-right text-[15px] font-semibold tabular-nums">{nfmtSinal(l.dif!)} {l.un}</span>
                </li>
              ))}
            </ul>
          )}
          {erro && <div className="mt-3"><Erro>{erro}</Erro></div>}
          <Button size="lg" className="mt-6 w-full sm:w-auto" onClick={() => correr(acabarContagem(id))}>{difs.length ? "Corrigir o stock e acabar" : "Acabar a contagem"}</Button>
        </section>
      )}

      <div className="mt-4">
        <button type="button" className={LIGACAO_RARA} aria-expanded={desistir} onClick={() => setDesistir(!desistir)}>Desistir da contagem</button>
        {desistir && <Confirmar texto="Desistir da contagem? O que contou perde-se e o stock não muda." sim="Desistir" aoNao={() => setDesistir(false)} aoSim={() => correr(desistirContagem(id))} />}
      </div>

      <section aria-labelledby="cont-todos" className="mt-10">
        <h2 id="cont-todos" className="text-lg font-semibold">Todos os materiais desta contagem</h2>
        <ul className={cn("mt-3 sm:columns-2 sm:gap-8", LISTA)}>
          {L.map((l) => (
            <li key={l.idx} className="break-inside-avoid">
              <button type="button" onClick={() => setI(l.idx)} aria-current={l.idx === i ? "step" : undefined} className={cn("flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-muted/50", l.idx === i && "font-semibold")}>
                <span aria-hidden="true" className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border", l.contado != null ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{l.contado != null && <Check className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1 text-[15px]">{l.n}<span className="sr-only">{l.contado == null ? " (por contar)" : l.dif ? ` (diferença ${nfmtSinal(l.dif)})` : " (certo)"}</span></span>
                {l.dif ? <span className="shrink-0 text-sm font-medium tabular-nums">{nfmtSinal(l.dif)} {l.un}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- fazer uma encomenda */

export function NovaEncomendaV1({ ctx, db, voltar, feito, titulo, sec, sup: sup0 }: Comum & { sup?: string }) {
  const [sup, setSup] = useState(sup0 ?? "");
  const M = armazemInv(ctx.S, db);
  const artigos = db.items.filter((i) => i.sup === sup);
  const sugestao = (sku: string): number => { const m = M.find((x) => x.sku === sku); return m?.baixo ? Math.max(1, Math.max(m.rop * 2, m.min) - Math.max(0, m.livre) - m.aChegar) : 0; };
  const [q, setQ] = useState<Record<string, number>>({});
  const [erro, setErro] = useState("");
  const mudarForn = (s: string) => { setSup(s); setErro(""); setQ(Object.fromEntries(db.items.filter((i) => i.sup === s).map((i) => [i.sku, sugestao(i.sku)]))); };
  useEffect(() => { if (sup0) mudarForn(sup0); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const forn = db.suppliers.filter((s) => !s.deleted && s.active && db.items.some((i) => i.sup === s.id));
  const total = artigos.reduce((a, i) => a + (q[i.sku] ?? 0) * (i.price / i.packN), 0);
  const n = artigos.filter((i) => (q[i.sku] ?? 0) > 0).length;
  const enviar = () => {
    if (!sup) { setErro("Escolha o fornecedor."); focarErro(); return; }
    const r = novaEncomenda(sup, artigos.map((i) => ({ sku: i.sku, q: q[i.sku] ?? 0 })));
    if (r.ok) { feito(r.valor); voltar(); } else setErro(r.erro);
  };
  const nomeSup = db.suppliers.find((s) => s.id === sup)?.name;
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className={H1}>Nova encomenda</h1>
      <p className="mt-1 max-w-2xl text-base text-muted-foreground">Para o Armazém Central. Os materiais abaixo do mínimo já vêm com a quantidade sugerida. Ao enviar, segue para o fornecedor.</p>
      <div className={cn("mt-8 p-5 sm:p-6", BLOCO)}>
        <Escolhas rotulo="Fornecedor" opcoes={forn.map((s) => ({ v: s.id, t: s.name }))} valor={sup} mudar={mudarForn} erro={erro && !sup ? erro : undefined} />
      </div>
      {sup && (
        <section aria-labelledby="np-mat" className="mt-8">
          <h2 id="np-mat" className="text-lg font-semibold">O que pedir a {nomeSup}</h2>
          <ul className={cn("mt-3", LISTA)}>
            {artigos.map((i) => {
              const m = M.find((x) => x.sku === i.sku), un = m?.un ?? "un";
              return (
                <li key={i.id} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:px-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium">{m?.n ?? i.sku}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-[15px] text-muted-foreground">
                      <span className="tabular-nums">{eur(i.price / i.packN)}/{porUn(un)}</span>
                      {m && <span>· há {qtd(Math.max(0, m.livre), un)} livres</span>}
                      {m?.baixo && <span className="inline-flex items-center gap-1 text-foreground"><AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" />abaixo do mínimo</span>}
                    </span>
                  </span>
                  <ContadorQtd id={"np-" + i.id} valor={q[i.sku] ?? 0} un={un} nome={m?.n ?? i.sku} min={0} onMudar={(x) => { setErro(""); setQ((y) => ({ ...y, [i.sku]: Math.round(x) })); }} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {/* o primário fixo em baixo, com o total (L10) */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex flex-wrap items-center gap-3 border-t border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md md:mx-0 md:px-0">
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold tabular-nums">{eur(total)}</span>
          <span className="block text-sm text-muted-foreground">{n ? plural(n, "material", "materiais") : "Nenhum material escolhido"} · sem IVA</span>
        </span>
        {erro && sup && <span className="basis-full sm:order-first sm:basis-auto"><Erro>{erro}</Erro></span>}
        <Button size="lg" onClick={enviar}>Enviar a encomenda</Button>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- um material novo */

const UNIDADES = ["un", "m", "m²", "sacos", "rolos", "kit", "L"];
export function NovoMaterialV1({ db, ir, voltar, feito, titulo, sec }: Comum) {
  const [d, setD] = useState<DadosMaterial>({ nome: "", cat: "", un: "", sup: "", preco: null, minimo: 0, qty: 0 });
  const [preco, setPreco] = useState("");
  const [e, setE] = useState<ReturnType<typeof validarMaterial>>({});
  const muda = <K extends keyof DadosMaterial>(k: K, v: DadosMaterial[K]) => { setD((x) => ({ ...x, [k]: v })); setE((x) => ({ ...x, [k]: undefined })); };
  const cats = [...new Set([...categoriasArmazem(db), "Consumíveis", "Canalização", "Elétrico", "Ferramentas"])];
  const criar = () => {
    const x = { ...d, preco: numero(preco) };
    const er = validarMaterial(db, x);
    if (Object.keys(er).length) { setE(er); focarErro(); return; }
    const r = novoMaterial(x);
    if (r.ok) { feito(`${x.nome.trim()} criado no Armazém Central.`); ir({ k: "material", sku: r.valor }); } else setE({ nome: r.erro });
  };
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className={H1}>Novo material</h1>
      <p className="mt-1 max-w-2xl text-base text-muted-foreground">Um material que se guarda no Armazém Central. Fica ligado ao fornecedor a quem se compra.</p>
      <div className={cn("mt-8 grid gap-6 p-5 sm:p-6", BLOCO)}>
        <Campo id="nm-nome" rotulo="Nome" erro={e.nome}><input autoComplete="off" value={d.nome} onChange={(ev) => muda("nome", ev.target.value)} placeholder="Ex.: Silicone sanitário transparente" {...ligar("nm-nome", e.nome)} className={CAMPO} /></Campo>
        <Escolhas rotulo="Categoria" opcoes={cats.map((c) => ({ v: c, t: nomeCategoria(c) }))} valor={d.cat} mudar={(v) => muda("cat", v)} erro={e.cat} />
        <Escolhas rotulo="Unidade" opcoes={UNIDADES.map((u) => ({ v: u, t: u }))} valor={d.un} mudar={(v) => muda("un", v)} erro={e.un} />
        <Escolhas rotulo="Fornecedor" opcoes={db.suppliers.filter((s) => !s.deleted && s.active).map((s) => ({ v: s.id, t: s.name }))} valor={d.sup} mudar={(v) => muda("sup", v)} erro={e.sup} />
        <Campo id="nm-preco" rotulo="Preço de compra" nota={`(em € por ${d.un || "unidade"}, sem IVA)`} erro={e.preco}>
          <input inputMode="decimal" value={preco} onChange={(ev) => { setPreco(ev.target.value.replace(/[^\d,.]/g, "")); setE((x) => ({ ...x, preco: undefined })); }} {...ligar("nm-preco", e.preco)} className={cn(CAMPO, "text-right sm:w-40")} />
        </Campo>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-1.5"><span className="text-[15px] font-medium">Quanto há agora no armazém</span><ContadorQtd id="nm-qty" valor={d.qty} un={d.un || "un"} nome="o material novo" min={0} onMudar={(x) => muda("qty", Math.round(x))} /></div>
          <div className="grid gap-1.5"><span className="text-[15px] font-medium">Mínimo <span className="font-normal text-muted-foreground">(0 é sem mínimo)</span></span><ContadorQtd id="nm-min" valor={d.minimo} un={d.un || "un"} nome="o mínimo" min={0} onMudar={(x) => muda("minimo", Math.round(x))} /></div>
        </div>
        <div className="border-t border-border pt-5"><Button size="lg" className="w-full sm:w-auto" onClick={criar}>Criar o material</Button></div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- um fornecedor novo */

const PRAZOS = [1, 2, 3, 5, 7, 10];
export function NovoFornecedorV1({ db, ir, voltar, feito, titulo, sec }: Comum) {
  const [d, setD] = useState<DadosFornV1>({ nome: "", email: "", telefone: "", cidade: "", prazo: 0 });
  const [e, setE] = useState<ReturnType<typeof validarFornecedor>>({});
  const muda = <K extends keyof DadosFornV1>(k: K, v: DadosFornV1[K]) => { setD((x) => ({ ...x, [k]: v })); setE((x) => ({ ...x, [k]: undefined })); };
  const criar = () => {
    const er = validarFornecedor(db, d);
    if (!d.prazo) er.prazo = "Escolha o prazo de entrega.";
    if (Object.keys(er).length) { setE(er); focarErro(); return; }
    const r = novoFornecedor(d);
    if (r.ok) { feito(`${d.nome.trim()} criado. Junte os materiais que lhe compra.`); ir({ k: "forn", id: r.valor }); } else setE({ nome: r.erro });
  };
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className={H1}>Novo fornecedor</h1>
      <p className="mt-1 max-w-2xl text-base text-muted-foreground">Recebe as encomendas por email. Depois de criado, junta-se o que lhe compra, com o preço.</p>
      <div className={cn("mt-8 grid gap-6 p-5 sm:p-6", BLOCO)}>
        <Campo id="nf-nome" rotulo="Nome" erro={e.nome}><input autoComplete="organization" value={d.nome} onChange={(ev) => muda("nome", ev.target.value)} {...ligar("nf-nome", e.nome)} className={CAMPO} /></Campo>
        <div className="grid gap-6 sm:grid-cols-2">
          <Campo id="nf-email" rotulo="Email das encomendas" erro={e.email}><input type="email" inputMode="email" autoComplete="email" value={d.email} onChange={(ev) => muda("email", ev.target.value)} {...ligar("nf-email", e.email)} className={CAMPO} /></Campo>
          <Campo id="nf-tel" rotulo="Telefone" nota="(opcional)"><input inputMode="tel" autoComplete="tel" value={d.telefone} onChange={(ev) => muda("telefone", ev.target.value)} className={CAMPO} /></Campo>
        </div>
        <Campo id="nf-cidade" rotulo="Cidade" nota="(opcional)"><input value={d.cidade} onChange={(ev) => muda("cidade", ev.target.value)} className={cn(CAMPO, "sm:w-80")} /></Campo>
        <Escolhas rotulo="Entrega em" opcoes={PRAZOS.map((p) => ({ v: String(p), t: plural(p, "dia", "dias") }))} valor={d.prazo ? String(d.prazo) : ""} mudar={(v) => muda("prazo", Number(v))} erro={e.prazo} />
        <div className="border-t border-border pt-5"><Button size="lg" className="w-full sm:w-auto" onClick={criar}>Criar o fornecedor</Button></div>
      </div>
    </>
  );
}

