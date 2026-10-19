// As secções do Inventário do V1 (19/10/2026): Stock, Obras, Encomendas a fornecedores, Fornecedores, Movimentos e Carrinhas.
// Página larga (max-w-6xl): no computador as listas são tabelas com colunas (a partir de lg); no telemóvel, linhas com o valor por baixo do nome (L4, L5).
import { useState, type ReactNode } from "react";
import { AlertCircle, Mail, Phone, Plus, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normal } from "./catalogo";
import { reporCarrinha } from "./inventarioV1Acoes";
import {
  armazemInv, carrinhasInv, contagemAberta, contarMovimentos, diaRelativo, dia, encomendasInv, eur, fornecedoresInv, movimentosInv, nfmtSinal, obrasInv, plural, qtd, reposicaoCarrinha, valorStock,
  type MaterialInv, type MovInv, type ObraInv, type PoInv, type TipoLivro,
} from "./inventarioV1Docs";
import {
  BLOCO, CabSecao, Erro, FILA, Feito, FILTRO, Iniciais, IconeMov, LIGACAO, LINHA, LISTA, SECOES, SETA, TABELA, TD, TH, TIPO_MOV, CAMPO, type Comum,
} from "./InventarioV1Pecas";

/** A pesquisa (C10): ícone, rótulo para leitores de ecrã e um exemplo. */
function Procurar({ q, setQ, exemplo }: { q: string; setQ: (v: string) => void; exemplo: string }) {
  return (
    <label className="relative block w-full lg:w-80">
      <span className="sr-only">Procurar</span>
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={exemplo} className={cn(CAMPO, "pl-10")} />
    </label>
  );
}
const busca = (q: string, ...t: string[]): boolean => !q.trim() || normal(t.join(" ")).includes(normal(q.trim()));

/** Uma linha de tabela que abre a ficha: a linha toda reage ao clique; o nome é o botão (teclado e leitores de ecrã). */
function Tr({ id, abrir, children }: { id: string; abrir: () => void; children: ReactNode }) {
  return <tr className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40" onClick={abrir} data-linha={id}>{children}</tr>;
}
const Nome = ({ id, abrir, children }: { id: string; abrir: () => void; children: ReactNode }) => (
  <button id={id} type="button" onClick={(e) => { e.stopPropagation(); abrir(); }} className="text-left font-medium underline-offset-4 hover:underline">{children}</button>
);

export function Secao(c: Comum) {
  const x = SECOES.find((y) => y.id === c.sec)!;
  const acoes: Partial<Record<typeof c.sec, ReactNode>> = {
    stock: <>
      <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => c.ir({ k: "contagem" })}>{contagemAberta(c.db) ? "Continuar a contagem" : "Contar o armazém"}</Button>
      <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => c.ir({ k: "novoMat" })}><Plus className="h-4 w-4" aria-hidden="true" />Novo material</Button>
    </>,
    encomendas: <Button className="min-h-11 w-full sm:w-auto" onClick={() => c.ir({ k: "novaPo" })}><Plus className="h-4 w-4" aria-hidden="true" />Nova encomenda</Button>,
    fornecedores: <Button className="min-h-11 w-full sm:w-auto" onClick={() => c.ir({ k: "novoForn" })}><Plus className="h-4 w-4" aria-hidden="true" />Novo fornecedor</Button>,
  };
  return (
    <>
      <CabSecao titulo={c.titulo} h={x.t} sub={x.sub} acoes={acoes[c.sec]} />
      <Feito msg={c.msg} />
      {c.sec === "stock" && <StockSecao {...c} />}
      {c.sec === "obras" && <ObrasSecao {...c} />}
      {c.sec === "encomendas" && <EncomendasSecao {...c} />}
      {c.sec === "fornecedores" && <FornecedoresSecao {...c} />}
      {c.sec === "movimentos" && <MovimentosSecao {...c} />}
      {c.sec === "carrinhas" && <CarrinhasSecao {...c} />}
    </>
  );
}

/* ---------------------------------------------------------------- Stock */

type FiltroStock = "todos" | "baixo" | "obras";
function StockSecao({ ctx, db, ir }: Comum) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<FiltroStock>("todos");
  const todos = armazemInv(ctx.S, db);
  const passa = (m: MaterialInv, k: FiltroStock) => (k === "baixo" ? m.baixo : k === "obras" ? m.reservado > 0 : true);
  const L = todos.filter((m) => passa(m, f) && busca(q, m.n, m.cat));
  const cats = [...new Set(L.map((m) => m.cat))];
  const abrir = (m: MaterialInv) => ir({ k: "material", sku: m.sku }, "m-" + m.sku);
  return (
    <>
      <dl className={cn("mt-6 grid grid-cols-2 sm:grid-cols-4", BLOCO)}>
        {([["Materiais", String(todos.length)], ["Valor em stock", eur(valorStock(db))], ["Guardados para obras", String(todos.filter((m) => m.reservado > 0).length)], ["Abaixo do mínimo", String(todos.filter((m) => m.baixo).length)]] as [string, string][]).map(([t, v], i) => (
          <div key={t} className={cn("p-4 sm:p-5", i % 2 === 1 && "border-l border-border", i >= 2 && "border-t border-border sm:border-t-0", i === 2 && "sm:border-l")}>
            <dt className="text-[15px] text-muted-foreground">{t}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Mostrar" className={FILA}>
          {([["todos", "Todos"], ["baixo", "Abaixo do mínimo"], ["obras", "Guardados para obras"]] as [FiltroStock, string][]).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)} className={FILTRO(f === k)}>{t} <span className="ml-1.5 tabular-nums opacity-80">{todos.filter((m) => passa(m, k)).length}</span></button>
          ))}
        </div>
        <Procurar q={q} setQ={setQ} exemplo="Procurar material (ex.: cerâmico, silicone)" />
      </div>
      <p className="sr-only" aria-live="polite">{plural(L.length, "material", "materiais")}</p>
      {L.length === 0 && <p className="mt-6 text-[15px] text-muted-foreground">{q.trim() ? "Nenhum material com esse nome." : "Nenhum material neste filtro."}</p>}
      {cats.map((c) => {
        const M = L.filter((m) => m.cat === c);
        return (
          <section key={c} aria-labelledby={"cat-" + c} className="mt-8">
            <h2 id={"cat-" + c} className="text-lg font-semibold">{c} <span className="font-normal text-muted-foreground">· {M.length}</span></h2>
            {/* computador: tabela */}
            <div className={cn("mt-3", TABELA)}>
              <table className="w-full text-[15px]">
                <thead><tr><th className={TH}>Material</th><th className={cn(TH, "text-right")}>No armazém</th><th className={cn(TH, "text-right")}>Para obras</th><th className={cn(TH, "text-right")}>Livre</th><th className={cn(TH, "text-right")}>A chegar</th><th className={cn(TH, "text-right")}>Mínimo</th></tr></thead>
                <tbody>
                  {M.map((m) => (
                    <Tr key={m.sku} id={m.sku} abrir={() => abrir(m)}>
                      <td className={TD}>
                        <span className="flex items-center gap-2">{m.baixo && <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}<Nome id={"m-" + m.sku} abrir={() => abrir(m)}>{m.n}</Nome>{m.baixo && <span className="sr-only"> (abaixo do mínimo)</span>}</span>
                        {m.loc && <span className="block text-sm text-muted-foreground">prateleira {m.loc}</span>}
                      </td>
                      <td className={cn(TD, "text-right font-semibold tabular-nums")}>{qtd(m.qty, m.un)}</td>
                      <td className={cn(TD, "text-right tabular-nums", !m.reservado && "text-muted-foreground")}>{m.reservado ? qtd(m.reservado, m.un) : "—"}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{qtd(Math.max(0, m.livre), m.un)}</td>
                      <td className={cn(TD, "text-right tabular-nums", !m.aChegar && "text-muted-foreground")}>{m.aChegar ? qtd(m.aChegar, m.un) : "—"}</td>
                      <td className={cn(TD, "text-right tabular-nums text-muted-foreground")}>{m.rop ? qtd(m.rop, m.un) : "sem mínimo"}</td>
                    </Tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* telemóvel: linhas */}
            <ul className={cn("mt-3 lg:hidden", LISTA)}>
              {M.map((m) => (
                <li key={m.sku}>
                  <button type="button" onClick={() => abrir(m)} className={cn(LINHA, "flex-wrap sm:flex-nowrap")}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium group-hover:underline">{m.n}</span>
                      <span className="block text-[15px] text-muted-foreground">{m.reservado > 0 ? `${qtd(m.reservado, m.un)} para obras` : "nada para obras"}{m.aChegar > 0 ? ` · ${qtd(m.aChegar, m.un)} a chegar` : ""}</span>
                      {m.baixo && <span className="mt-0.5 flex items-center gap-1.5 text-[15px]"><AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Abaixo do mínimo ({qtd(m.rop, m.un)})</span>}
                    </span>
                    <span className="flex basis-full flex-wrap items-baseline gap-x-3 sm:block sm:basis-auto sm:shrink-0 sm:text-right">
                      <span className="block text-[17px] font-semibold tabular-nums">{qtd(m.qty, m.un)}</span>
                      <span className="block text-sm tabular-nums text-muted-foreground">{qtd(Math.max(0, m.livre), m.un)} livres</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------- Obras */

/** O cartão de uma obra: quem, onde, quando, e uma barra com o material pronto ou já na obra. */
function CartaoObra({ o, ir }: { o: ObraInv; ir: Comum["ir"] }) {
  const prontos = o.tot.prontos + o.tot.naObra, total = o.tot.materiais;
  return (
    <li>
      <button id={"o-" + o.id} type="button" onClick={() => ir({ k: "obra", id: o.id }, "o-" + o.id)}
        className={cn("group flex h-full w-full flex-col p-5 text-left transition-shadow hover:shadow-[var(--shadow-md)]", BLOCO)}>
        <span className="flex items-start gap-3">
          <Iniciais nome={o.nome} />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold group-hover:underline">{o.nome}</span>
            <span className="block text-[15px] text-muted-foreground">{o.sub}</span>
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-sm text-muted-foreground">{o.quando}</span>
        </span>
        {total > 0 && (
          <span className="mt-4 block">
            <span className="flex items-baseline justify-between text-sm"><span className="text-muted-foreground">Material pronto ou na obra</span><span className="font-medium tabular-nums">{prontos} de {total}</span></span>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full origin-left rounded-full bg-primary transition-transform duration-500" style={{ transform: `scaleX(${total ? prontos / total : 0})` }} /></span>
          </span>
        )}
        <span className="mt-3 flex items-start gap-1.5 text-[15px]">{o.atencao && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}{o.frase}</span>
      </button>
    </li>
  );
}

function ObrasSecao({ ctx, db, ir }: Comum) {
  const O = obrasInv(ctx.S, db), abertas = O.filter((o) => o.estado !== "concluida"), acabadas = O.filter((o) => o.estado === "concluida");
  const [ver, setVer] = useState(false);
  const GRELHA = "grid gap-4 md:grid-cols-2";
  return (
    <>
      {abertas.length === 0
        ? <p className="mt-6 text-[15px] text-muted-foreground">Ainda não há obras. Aparecem quando o cliente assina o contrato.</p>
        : <ul className={cn("mt-6", GRELHA)}>{abertas.map((o) => <CartaoObra key={o.id} o={o} ir={ir} />)}</ul>}
      {acabadas.length > 0 && (
        <>
          <Button variant="ghost" className="mt-4 min-h-11" aria-expanded={ver} onClick={() => setVer(!ver)}>{ver ? "Esconder as obras acabadas" : `Ver as obras acabadas (${acabadas.length})`}</Button>
          {ver && <ul className={cn("mt-2", GRELHA)}>{acabadas.map((o) => <CartaoObra key={o.id} o={o} ir={ir} />)}</ul>}
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Encomendas */

const ESTADO_PO: Record<PoInv["estado"], string> = {
  "por aprovar": "por aprovar", "no fornecedor": "no fornecedor", confirmada: "data confirmada", "chegou em parte": "chegou uma parte", recebida: "recebida", cancelada: "cancelada",
};
function TabelaPo({ L, ir }: { L: PoInv[]; ir: Comum["ir"] }) {
  const abrir = (p: PoInv) => ir({ k: "po", id: p.id }, "p-" + p.id);
  return (
    <>
      <div className={cn("mt-3", TABELA)}>
        <table className="w-full text-[15px]">
          <thead><tr><th className={TH}>Fornecedor</th><th className={TH}>Para</th><th className={TH}>O que se pediu</th><th className={cn(TH, "text-right")}>Valor</th><th className={TH}>Estado</th><th className={TH}>Entrega</th></tr></thead>
          <tbody>
            {L.map((p) => (
              <Tr key={p.id} id={p.id} abrir={() => abrir(p)}>
                <td className={TD}><Nome id={"p-" + p.id} abrir={() => abrir(p)}>{p.forn}</Nome><span className="block text-sm text-muted-foreground">{p.id}</span></td>
                <td className={TD}>{p.para}</td>
                <td className={cn(TD, "text-muted-foreground")}>{p.linhas[0]?.n}{p.linhas.length > 1 ? ` e mais ${p.linhas.length - 1}` : ""}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{eur(p.total)}</td>
                <td className={TD}><span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-sm">{p.atrasada && <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />}{p.atrasada ? "atrasada" : ESTADO_PO[p.estado]}</span></td>
                <td className={cn(TD, "tabular-nums text-muted-foreground")}>{p.estado === "recebida" ? "—" : dia(p.prometida ?? p.prevista)}{p.prometida ? "" : p.estado === "recebida" ? "" : " (prevista)"}</td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={cn("mt-3 lg:hidden", LISTA)}>
        {L.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => abrir(p)} className={LINHA}>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium group-hover:underline">{p.forn}</span>
                <span className="block text-[15px] text-muted-foreground">{p.para} · {p.resumo}</span>
                <span className="mt-0.5 flex items-start gap-1.5 text-[15px]">{p.atrasada && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}{p.frase}</span>
              </span>
              {SETA}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function EncomendasSecao({ ctx, db, ir }: Comum) {
  const G = encomendasInv(ctx.S, db);
  const [todas, setTodas] = useState(false);
  const grupo = (id: string, t: string, L: PoInv[], vazio: string) => (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-lg font-semibold">{t} <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
      {L.length ? <TabelaPo L={L} ir={ir} /> : <p className="mt-2 text-[15px] text-muted-foreground">{vazio}</p>}
    </section>
  );
  return (
    <>
      {grupo("enc-aprovar", "Por aprovar", G.porAprovar, "Nenhuma. As encomendas das obras nascem aqui, por aprovar, quando falta material no armazém.")}
      {grupo("enc-caminho", "A caminho", G.aCaminho, "Nada a caminho.")}
      {G.recebidas.length > 0 && (
        <section aria-labelledby="enc-recebidas" className="mt-8">
          <h2 id="enc-recebidas" className="text-lg font-semibold">Recebidas <span className="font-normal text-muted-foreground">· {G.recebidas.length}</span></h2>
          <TabelaPo L={todas ? G.recebidas : G.recebidas.slice(0, 5)} ir={ir} />
          {G.recebidas.length > 5 && <Button variant="outline" className="mt-3 min-h-11" aria-expanded={todas} onClick={() => setTodas(!todas)}>{todas ? "Mostrar menos" : `Mostrar mais ${G.recebidas.length - 5}`}</Button>}
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Fornecedores */

function FornecedoresSecao({ ctx, db, ir }: Comum) {
  const [q, setQ] = useState("");
  const F = fornecedoresInv(ctx.S, db).filter((s) => busca(q, s.nome, s.cidade, ...s.artigos.map((a) => a.n)));
  return (
    <>
      <div className="mt-6"><Procurar q={q} setQ={setQ} exemplo="Procurar fornecedor ou material" /></div>
      <p className="sr-only" aria-live="polite">{plural(F.length, "fornecedor", "fornecedores")}</p>
      {F.length === 0 && <p className="mt-6 text-[15px] text-muted-foreground">Nenhum fornecedor com esse nome ou material.</p>}
      <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {F.map((s) => (
          <li key={s.id} className={cn("flex flex-col p-5", BLOCO)}>
            <button id={"f-" + s.id} type="button" onClick={() => ir({ k: "forn", id: s.id }, "f-" + s.id)} className="group flex items-start gap-3 text-left">
              <Iniciais nome={s.nome} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold group-hover:underline">{s.nome}</span>
                <span className="block text-[15px] text-muted-foreground">{s.cidade || "—"} · {s.portal ? "encomendas pelo portal" : "encomendas por email"}</span>
              </span>
            </button>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl bg-muted/50 text-center">
              <div className="px-2 py-2.5"><dt className="text-sm text-muted-foreground">Entrega</dt><dd className="text-base font-semibold tabular-nums">{plural(s.prazo, "dia", "dias")}</dd></div>
              <div className="px-2 py-2.5"><dt className="text-sm text-muted-foreground">Em aberto</dt><dd className="text-base font-semibold tabular-nums">{s.abertas.length}</dd></div>
              <div className="px-2 py-2.5"><dt className="text-sm text-muted-foreground">Materiais</dt><dd className="text-base font-semibold tabular-nums">{s.artigos.length}</dd></div>
            </dl>
            {s.precos.length > 0 && <p className="mt-3 flex items-start gap-1.5 text-[15px]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />{plural(s.precos.length, "preço novo", "preços novos")} por rever</p>}
            <div className="mt-auto flex flex-wrap gap-x-5 pt-3">
              {s.telefone && <a href={"tel:" + s.telefone.replace(/\s/g, "")} className={LIGACAO}><Phone className="h-4 w-4" aria-hidden="true" />Ligar<span className="sr-only"> a {s.nome}</span></a>}
              {s.email && <a href={"mailto:" + s.email} className={LIGACAO}><Mail className="h-4 w-4" aria-hidden="true" />Email<span className="sr-only"> para {s.nome}</span></a>}
              <button type="button" onClick={() => ir({ k: "novaPo", sup: s.id })} className={LIGACAO}><Truck className="h-4 w-4" aria-hidden="true" />Encomendar<span className="sr-only"> a {s.nome}</span></button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------------------------------------------------------------- Movimentos */

/** O livro de movimentos: agrupado por dia; tabela no computador, linhas com o ícone do tipo no telemóvel. `comMaterial`: a coluna do material (no livro todo). */
export function Livro({ L, comMaterial, irMaterial }: { L: MovInv[]; comMaterial: boolean; irMaterial?: (sku: string) => void }) {
  const dias = [...new Set(L.map((m) => m.iso))];
  const rotuloDia = (iso: string) => { const r = diaRelativo(iso); return r === dia(iso) ? r.replace(/^./, (c) => c.toUpperCase()) : `${r.replace(/^./, (c) => c.toUpperCase())} · ${dia(iso)}`; };
  if (!L.length) return <p className="mt-4 text-[15px] text-muted-foreground">Ainda não há movimentos.</p>;
  return (
    <>
      <div className={cn("mt-4", TABELA)}>
        <table className="w-full text-[15px]">
          <thead><tr><th className={TH}>O quê</th>{comMaterial && <th className={TH}>Material</th>}<th className={cn(TH, "text-right")}>Quantidade</th><th className={TH}>De onde ou para onde</th><th className={TH}>Armazém</th><th className={cn(TH, "text-right")}>Fica</th></tr></thead>
          {dias.map((d) => (
            <tbody key={d}>
              <tr className="border-t border-border bg-muted/40"><th colSpan={comMaterial ? 6 : 5} scope="colgroup" className="px-5 py-2 text-left text-sm font-medium">{rotuloDia(d)}</th></tr>
              {L.filter((m) => m.iso === d).map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className={TD}><span className="flex items-center gap-3"><IconeMov tipo={m.tipo} className="h-8 w-8" />{m.rotulo}</span></td>
                  {comMaterial && <td className={TD}>{irMaterial ? <button type="button" onClick={() => irMaterial(m.sku)} className="text-left font-medium underline-offset-4 hover:underline">{m.n}</button> : m.n}</td>}
                  <td className={cn(TD, "whitespace-nowrap text-right font-semibold tabular-nums")}>{nfmtSinal(m.qtd)} {m.un}</td>
                  <td className={cn(TD, "text-muted-foreground")}>{m.onde || "—"}</td>
                  <td className={cn(TD, "text-muted-foreground")}>{m.local}</td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums text-muted-foreground")}>{m.saldo} {m.un}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className="mt-4 grid gap-6 lg:hidden">
        {dias.map((d) => (
          <section key={d} aria-label={rotuloDia(d)}>
            <h3 className="text-sm font-medium text-muted-foreground">{rotuloDia(d)}</h3>
            <ul className={cn("mt-2", LISTA)}>
              {L.filter((m) => m.iso === d).map((m) => (
                <li key={m.id} className="flex min-h-16 items-center gap-3 py-3">
                  <IconeMov tipo={m.tipo} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{comMaterial ? m.n : m.rotulo}</span>
                    <span className="block text-sm text-muted-foreground">{[comMaterial ? m.rotulo : "", m.onde, m.local !== "Armazém Central" ? m.local : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-semibold tabular-nums">{nfmtSinal(m.qtd)} {m.un}</span>
                    <span className="block text-sm tabular-nums text-muted-foreground">fica {m.saldo}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function MovimentosSecao({ ctx, db, ir }: Comum) {
  const [tipo, setTipo] = useState<TipoLivro | "">("");
  const [q, setQ] = useState("");
  const [n, setN] = useState(40);
  const todos = movimentosInv(ctx.S, db, null, 100000, tipo || undefined).filter((m) => busca(q, m.n, m.onde, m.local));
  const L = todos.slice(0, n);
  return (
    <>
      {/* os três tipos: escolher um filtra o livro (tocar outra vez mostra todos) */}
      <div role="group" aria-label="Mostrar" className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        {(Object.keys(TIPO_MOV) as TipoLivro[]).map((k) => (
          <button key={k} type="button" aria-pressed={tipo === k} onClick={() => { setTipo(tipo === k ? "" : k); setN(40); }}
            className={cn("flex min-w-0 flex-col items-start gap-2 rounded-2xl border bg-card p-3 text-left shadow-[var(--shadow-sm)] transition-colors sm:flex-row sm:items-center sm:gap-3 sm:p-4", tipo === k ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
            <IconeMov tipo={k} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm text-muted-foreground sm:text-[15px]">{TIPO_MOV[k].t}</span><span className="block text-xl font-semibold tabular-nums sm:text-2xl">{contarMovimentos(db, k)}</span></span>
            {tipo === k && <span className="hidden text-sm text-primary sm:inline">a mostrar</span>}
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[15px] text-muted-foreground" aria-live="polite">{tipo ? `${TIPO_MOV[tipo].t}: ` : ""}{plural(todos.length, "movimento", "movimentos")}, os mais recentes primeiro</p>
        <Procurar q={q} setQ={setQ} exemplo="Procurar material ou obra" />
      </div>
      <Livro L={L} comMaterial irMaterial={(sku) => ir({ k: "material", sku })} />
      {todos.length > n && <Button variant="outline" className="mt-4 min-h-11" onClick={() => setN(n + 40)}>Mostrar mais 40 (faltam {todos.length - n})</Button>}
    </>
  );
}

/* ---------------------------------------------------------------- Carrinhas */

function CarrinhasSecao({ db, feito }: Comum) {
  const C = carrinhasInv(db);
  const [erro, setErro] = useState("");
  return (
    <>
      {erro && <div className="mt-4"><Erro>{erro}</Erro></div>}
      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {C.map((c) => {
          const baixos = c.linhas.filter((l) => l.baixo).length;
          return (
            <li key={c.id} className={cn("p-5", BLOCO)} aria-labelledby={"car-" + c.id}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Truck className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <h2 id={"car-" + c.id} className="text-base font-semibold">{c.nome}</h2>
                  <span className="block text-[15px] text-muted-foreground">{c.quem} · {plural(c.linhas.length, "material", "materiais")}</span>
                </span>
                {baixos > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-sm"><AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />{baixos} a repor</span>}
              </div>
              <ul className="mt-4 divide-y divide-border border-t border-border">
                {c.linhas.map((l) => {
                  const rep = l.baixo ? reposicaoCarrinha(db, c.id, l.sku) : 0;
                  return (
                    <li key={l.sku} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px]">{l.n}</span>
                        {l.baixo && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />mínimo {qtd(l.min, l.un)}</span>}
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">{qtd(l.qty, l.un)}</span>
                      {l.baixo && (rep > 0
                        ? <Button variant="outline" className="min-h-11" onClick={() => { const r = reporCarrinha(c.id, l.sku, rep); if (r.ok) { setErro(""); feito(r.valor); } else setErro(r.erro); }}>Repor {qtd(rep, l.un)}</Button>
                        : <span className="basis-full text-sm text-muted-foreground">sem livre no Armazém Central para repor</span>)}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
}
