// A ficha do produto (29/10): como a do serviço, uma página no lugar da lista (?produto=…), com "Voltar ao Catálogo".
// Preço (custo, PVP e margem sobre a venda), os fornecedores ligados (o preferido com estrela) e "Ligar a artigo do fornecedor",
// que procura no catálogo do fornecedor no portal e liga como em Compras (fichaProduto.ts). Sem página real (o protótipo) só mostra o preço.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Link2, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { eur, pct, type SvcId } from "./motor";
import type { Produto } from "./v2/catalogoModelo";
import { dataPT } from "./v2/custosModelo";
import { margemEmPalavras } from "./fichaServico";
import { BarraMargem } from "./CriarNoCatalogo";
import type { CrmCatalogItem, CrmCatalogList, FreeSupplierRow } from "@/components/supplier-portal-crm/types";
import {
  definirPreferido, definirPvp, eUuid, lerNumero, lerFornecedoresOrg, lerFornecedoresProduto, ligarArtigo, margemProduto, moeda, procurarArtigos, unidadeDaLigacao,
  type FichaProdutoReal, type FornecedorLigado,
} from "./fichaProdutoDados";

const CARTAO = "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-6";
const NOTA = "text-[15px] text-muted-foreground";
const ENTRADA_TXT = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const LINK = "inline-flex min-h-11 items-center gap-1.5 text-left text-[15px] font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60";

function Seccao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn(CARTAO, "mt-6")}>
      <h2 id={id} className="text-xl font-semibold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

type Props = {
  p: Produto | undefined; min: number; alvo: number; voltar: () => void; anunciar: (msg: string) => void;
  nomeServico: (sid: SvcId) => string; onAbrirServico: (sid: SvcId) => void; real?: FichaProdutoReal;
};

export function FichaProduto({ p, min, alvo, voltar, anunciar, nomeServico, onAbrirServico, real }: Props) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);
  const topo = (
    <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-[15px] font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />Voltar ao Catálogo
    </button>
  );
  if (!p) {
    return (
      <article aria-labelledby="ficha-t">
        {topo}
        <h1 id="ficha-t" ref={titulo} tabIndex={-1} className="mt-3 text-3xl font-semibold tracking-tight outline-none">Produto sem ficha</h1>
        <p className={cn(NOTA, "mt-2")}>Este produto já não está no Catálogo.</p>
      </article>
    );
  }
  return (
    <article aria-labelledby="ficha-t">
      {topo}
      <header className="mt-3">
        <p className={NOTA}>{[p.marca, p.sku ? `ref. ${p.sku}` : "", `unidade: ${p.un}`].filter(Boolean).join(" · ")}</p>
        <h1 id="ficha-t" ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">{p.n}</h1>
        {p.servico && (
          <button type="button" onClick={() => onAbrirServico(p.servico!)} className={LINK}>Traz: {nomeServico(p.servico)}</button>
        )}
      </header>

      {/* 29/10: a chave inclui o PVP: depois de gravar e reler, o campo volta ao que ficou na base */}
      <Preco key={`${p.id}:${p.pvp ?? ""}`} p={p} min={min} alvo={alvo} real={real} anunciar={anunciar} />

      {real && eUuid(p.id)
        ? <Fornecedores key={p.id} p={p} real={real} anunciar={anunciar} />
        : <Seccao id="fp-forn" titulo="Fornecedores"><p className={cn(NOTA, "mt-3")}>{p.fornecedor || "Sem fornecedor indicado."}</p></Seccao>}
    </article>
  );
}

/* ------------------------------------------------------------------ preço */
// 29/10 (regra do Rafael): o custo vem só do catálogo do fornecedor (aqui só se lê); o PVP é nosso e a margem acompanha.
// Gravar vai direto a cat_definir_pvp (não pelo autosave do Catálogo, que também grava custo).
const texto = (v: number | undefined) => (v == null ? "" : String(v).replace(".", ","));

function Preco({ p, min, alvo, real, anunciar }: { p: Produto; min: number; alvo: number; real?: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const pode = !!real && real.podeEditar && real.podeMudarPrecos && eUuid(p.id);
  const [t, setT] = useState(texto(p.pvp));
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const lido = lerNumero(t);
  const invalido = lido != null && (Number.isNaN(lido) || lido <= 0);
  // pré-visualização: o que está escrito (válido), vazio = sem PVP; inválido = fica o atual
  const prev: Produto = invalido ? p : lido == null ? { ...p, pvp: undefined } : { ...p, pvp: lido };
  const { venda, m, semPvp } = margemProduto(prev, alvo);
  const baixa = m < min / 100 - 0.005;
  const cor = baixa ? "text-destructive" : m < alvo / 100 - 0.005 ? "text-warning" : "text-success";
  const mudou = !invalido && (lido ?? null) !== (p.pvp ?? null);
  const avisos = !semPvp && !invalido ? [venda < p.custo ? "Abaixo do custo: vende-se com prejuízo." : baixa ? `Abaixo da margem mínima (${min}%).` : ""].filter(Boolean) : [];

  const gravar = async (v: number | null) => {
    if (!real) return;
    setAGravar(true); setErro(null);
    const r = await definirPvp(p.id, v);
    if (!r.ok || !r.v.ok) { setAGravar(false); setErro(r.ok ? "Não foi possível gravar o PVP." : r.erro); return; }
    anunciar(v == null ? `PVP de ${p.n} limpo: o preço volta a custo + ${alvo}%.` : `PVP de ${p.n}: ${eur(v)} €/${p.un}.`);
    try { await real.recarregar(); } catch { /* fica o que está */ }
    setAGravar(false);
  };

  return (
    <Seccao id="fp-preco" titulo="Preço">
      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div><dt className={NOTA}>Custo por {p.un}</dt><dd className="text-2xl font-semibold tabular-nums">{eur(p.custo)} €</dd>{p.data && <dd className={NOTA}>de {dataPT(p.data)}</dd>}</div>
        <div><dt className={NOTA}>{semPvp ? "Preço" : "PVP"} por {p.un}</dt><dd className="text-2xl font-semibold tabular-nums" data-testid="venda-produto">{eur(venda)} €</dd></div>
        <div>
          <dt className={NOTA}>Margem</dt>
          <dd className={cn("text-2xl font-semibold tabular-nums", cor)} data-testid="margem-produto">{pct(m)}</dd>
          <dd className={NOTA}>{margemEmPalavras(m, min, alvo)} · mínimo {min}%</dd>
        </div>
      </dl>
      <BarraMargem m={m} min={min} alvo={alvo} />
      <p className={cn(NOTA, "mt-3")}>
        {semPvp ? `Sem PVP: custo + ${alvo}% de margem (alvo).` : "Margem = (PVP − custo) ÷ PVP."}
        {p.fornecedor ? ` Fornecedor: ${p.fornecedor}.` : ""} O custo vem do fornecedor.
      </p>
      {pode && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1"><span className="text-[15px] font-medium">PVP (€/{p.un}, sem IVA)</span>
            <input type="text" inputMode="decimal" value={t} onChange={(e) => { setT(e.target.value); setErro(null); }} placeholder="vazio = custo + alvo"
              aria-label="PVP" aria-invalid={invalido} disabled={aGravar} className={cn(ENTRADA_TXT, "w-44 tabular-nums")} />
          </label>
          <Button className="min-h-11 text-[15px]" disabled={aGravar || !mudou || lido == null} onClick={() => void gravar(lido as number)}>
            {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Guardar PVP
          </Button>
          <Button variant="outline" className="min-h-11 text-[15px]" disabled={aGravar || p.pvp == null} onClick={() => { setT(""); void gravar(null); }}>Limpar PVP</Button>
        </div>
      )}
      {pode && invalido && <p className="mt-2 text-[15px] text-destructive" role="alert">O PVP tem de ser um número maior que 0.</p>}
      {pode && avisos.map((a) => <p key={a} className="mt-2 text-[15px] text-warning" role="status">{a}</p>)}
      {erro && <p className="mt-2 text-[15px] text-destructive" role="alert">{erro}</p>}
    </Seccao>
  );
}

/* ------------------------------------------------------------------ fornecedores ligados */
type Leitura = { k: "a-ler" } | { k: "erro"; t: string } | { k: "ok"; L: FornecedorLigado[] };

function Fornecedores({ p, real, anunciar }: { p: Produto; real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const [l, setL] = useState<Leitura>({ k: "a-ler" });
  const [aMudar, setAMudar] = useState<string | null>(null);
  const [ligar, setLigar] = useState<{ q: string } | null>(null);
  const ler = useCallback(async () => {
    const r = await lerFornecedoresProduto(p.id);
    setL(r.ok ? { k: "ok", L: r.v } : { k: "erro", t: r.erro });
  }, [p.id]);
  useEffect(() => { void ler(); }, [ler]);
  /** Depois de mexer: relê a ficha e o Catálogo (o custo do produto pode ter mudado). */
  const reler = async () => { await ler(); try { await real.recarregar(); } catch { /* fica o que está */ } };

  const preferir = async (f: FornecedorLigado) => {
    setAMudar(f.item_supplier_id);
    const r = await definirPreferido(f.item_supplier_id);
    setAMudar(null);
    if (!r.ok) { anunciar(`Não mudou o preferido: ${r.erro}`); return; }
    if (!r.v.ok) { anunciar(`Não mudou o preferido${r.v.motivo ? `: ${r.v.motivo}` : "."}`); return; }
    anunciar(r.v.custo_aplicado ? `${f.supplier_name} é o preferido; o custo do produto passou a ser o dele.` : `${f.supplier_name} é o preferido. O custo não mudou${r.v.motivo ? `: ${r.v.motivo}` : "."}`);
    await reler();
  };

  const L = l.k === "ok" ? l.L : [];
  const livre = l.k === "ok" && !L.length && p.fornecedor ? p.fornecedor : "";
  return (
    <>
      <Seccao id="fp-forn" titulo="Fornecedores ligados">
        {l.k === "a-ler" && <p className={cn(NOTA, "mt-3")}>A ler…</p>}
        {l.k === "erro" && <p className={cn(NOTA, "mt-3")} role="alert">{l.t}</p>}
        {l.k === "ok" && !L.length && <p className={cn(NOTA, "mt-3")}>Nenhum fornecedor ligado.</p>}
        {livre && (
          <p className="mt-2 text-[15px]">
            Fornecedor indicado: <span className="font-medium">{livre}</span>
            {real.podeEditar && <> — <button type="button" className={LINK} onClick={() => setLigar({ q: livre })}>ligar ao artigo do portal</button></>}
          </p>
        )}
        {L.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium"><span className="sr-only">Preferido</span></th>
                  <th className="py-2 pr-3 font-medium">Fornecedor</th>
                  <th className="py-2 pr-3 font-medium">Ref.</th>
                  <th className="py-2 pr-3 text-right font-medium">Preço</th>
                  <th className="py-2 pr-3 text-right font-medium">Prazo</th>
                  <th className="py-2 text-right font-medium">Embalagem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {L.map((f) => (
                  <tr key={f.item_supplier_id} className={cn(!f.is_active && "text-muted-foreground")}>
                    <td className="py-1 pr-2">
                      {f.is_preferred
                        ? <span className="grid h-11 w-11 place-items-center" title="Preferido"><Star className="h-5 w-5 fill-primary text-primary" aria-hidden="true" /><span className="sr-only">Preferido</span></span>
                        : real.podeEditar && real.podeMudarPrecos && f.is_active
                          ? <button type="button" disabled={!!aMudar} onClick={() => void preferir(f)} aria-label={`Tornar ${f.supplier_name} o preferido`} title="Tornar o preferido"
                              className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60">
                              {aMudar === f.item_supplier_id ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Star className="h-5 w-5" aria-hidden="true" />}
                            </button>
                          : null}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{f.supplier_name}</span>{!f.is_active && " (inativo)"}
                      {f.catalogo && <span className={cn(NOTA, "block")}>portal: {f.catalogo.nome}</span>}
                    </td>
                    <td className="py-2 pr-3">{f.supplier_sku || f.catalogo?.supplier_ref || "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{moeda(f.purchase_price, f.currency, eur)}{f.preco_data && <span className={cn(NOTA, "block")}>{dataPT(f.preco_data.slice(0, 10))}</span>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.lead_time_days != null ? `${f.lead_time_days} d` : "—"}</td>
                    <td className="py-2 text-right tabular-nums">{f.catalogo?.units_per_pack ? `× ${f.catalogo.units_per_pack}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {real.podeEditar && !ligar && (
          <button type="button" className={cn(LINK, "mt-3")} onClick={() => setLigar({ q: livre })}><Link2 className="h-4 w-4" aria-hidden="true" />Ligar a artigo do fornecedor</button>
        )}
      </Seccao>
      {real.podeEditar && ligar && <Ligar p={p} real={real} q0={ligar.q} fechar={() => setLigar(null)} anunciar={anunciar} ligado={reler} />}
    </>
  );
}

/* ------------------------------------------------------------------ ligar a um artigo do portal */
function Ligar({ p, real, q0, fechar, anunciar, ligado }: { p: Produto; real: FichaProdutoReal; q0: string; fechar: () => void; anunciar: (msg: string) => void; ligado: () => Promise<void> }) {
  const [forns, setForns] = useState<{ id: string; name: string }[] | null>(null);
  const [erroForn, setErroForn] = useState<string | null>(null);
  const [qf, setQf] = useState(q0);
  const [forn, setForn] = useState<{ id: string; name: string } | null>(null);
  const [qa, setQa] = useState("");
  const [lista, setLista] = useState<CrmCatalogList | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [aProcurar, setAProcurar] = useState(false);
  const [aplicarPreco, setAplicarPreco] = useState(true);
  const [aLigar, setALigar] = useState<string | null>(null);
  const [escolher, setEscolher] = useState<{ item: CrmCatalogItem; rows: FreeSupplierRow[]; sel: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void lerFornecedoresOrg(real.org).then((r) => { if (!vivo) return; if (r.ok) setForns(r.v); else setErroForn(r.erro); });
    return () => { vivo = false; };
  }, [real.org]);
  // um só fornecedor com o nome indicado: fica escolhido
  useEffect(() => {
    if (!forns || forn || !q0) return;
    const iguais = forns.filter((f) => f.name.trim().toLowerCase() === q0.trim().toLowerCase());
    if (iguais.length === 1) setForn(iguais[0]);
  }, [forns, q0]); // eslint-disable-line react-hooks/exhaustive-deps

  const procurar = useCallback(async (sid: string, q: string) => {
    setAProcurar(true);
    const r = await procurarArtigos(sid, q);
    setAProcurar(false);
    if (r.ok) { setLista(r.v); setErroLista(null); } else { setLista(null); setErroLista(r.erro); }
  }, []);
  useEffect(() => {
    if (!forn) return undefined;
    const t = window.setTimeout(() => void procurar(forn.id, qa), 300);
    return () => window.clearTimeout(t);
  }, [forn, qa, procurar]);

  const opcaoPreco = !!lista?.can_view_pricing && !!lista?.can_manage_prices;
  const feito = async (item: CrmCatalogItem, uomId: string | null) => {
    if (!forn) return;
    setALigar(item.id); setErro(null);
    const r = await ligarArtigo({ supplierId: forn.id, item, productId: p.id, uomId, aplicarPreco: opcaoPreco && aplicarPreco });
    setALigar(null);
    if (!r.ok) {
      setErro(r.erro);
      // as permissões mudaram desde a leitura: relê (can_manage_prices esconde a opção)
      if (r.semPermPreco) void procurar(forn.id, qa);
      return;
    }
    setEscolher(null);
    anunciar(r.frase);
    await ligado();
    fechar();
  };
  const ligarItem = async (item: CrmCatalogItem) => {
    if (!forn) return;
    setALigar(item.id); setErro(null);
    const u = await unidadeDaLigacao(p.id, forn.id);
    setALigar(null);
    if (!u.ok) { setErro(u.erro); return; }
    if ("escolher" in u.v) { setEscolher({ item, rows: u.v.escolher, sel: null }); return; }
    await feito(item, u.v.uomId);
  };

  const qq = qf.trim().toLowerCase();
  const fornsVis = (forns ?? []).filter((f) => !qq || f.name.toLowerCase().includes(qq)).slice(0, 8);
  return (
    <Seccao id="fp-ligar" titulo="Ligar a artigo do fornecedor">
      {!forn ? (
        <div className="mt-3">
          <label className="grid gap-1"><span className="text-[15px] font-medium">Fornecedor</span>
            <input type="search" value={qf} onChange={(e) => setQf(e.target.value)} placeholder="Nome do fornecedor" className={ENTRADA_TXT} aria-label="Procurar fornecedor" />
          </label>
          {erroForn && <p className="mt-2 text-[15px] text-destructive" role="alert">{erroForn}</p>}
          {!forns && !erroForn && <p className={cn(NOTA, "mt-2")}>A ler os fornecedores…</p>}
          {forns && (
            <ul className="mt-2 divide-y divide-border">
              {fornsVis.map((f) => (
                <li key={f.id}><button type="button" onClick={() => setForn(f)} className="flex min-h-11 w-full items-center text-left text-[15px] hover:underline">{f.name}</button></li>
              ))}
              {!fornsVis.length && <li className={cn(NOTA, "py-2")}>Nenhum fornecedor com esse nome.</li>}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-[15px]">Fornecedor: <span className="font-medium">{forn.name}</span>{" "}
            <button type="button" className={LINK} onClick={() => { setForn(null); setLista(null); setEscolher(null); setErro(null); }}>mudar</button></p>
          <label className="mt-2 grid gap-1"><span className="text-[15px] font-medium">Artigo no catálogo do fornecedor</span>
            <input type="search" value={qa} onChange={(e) => setQa(e.target.value)} placeholder="Ref., código de barras ou nome" className={ENTRADA_TXT} aria-label="Procurar artigo do fornecedor" />
          </label>
          {opcaoPreco && (
            <label className="mt-3 flex min-h-11 items-center gap-2 text-[15px]">
              <Checkbox checked={aplicarPreco} onCheckedChange={(v) => setAplicarPreco(v === true)} aria-label="Usar o preço do catálogo" />
              Usar o preço do catálogo (preço deste fornecedor e, se for o preferido, custo do produto)
            </label>
          )}
          {aProcurar && <p className={cn(NOTA, "mt-2")}>A procurar…</p>}
          {erroLista && <p className="mt-2 text-[15px] text-destructive" role="alert">{erroLista}</p>}
          {lista && !lista.linked_account && <p className={cn(NOTA, "mt-2")}>Este fornecedor ainda não tem catálogo no portal.</p>}
          {lista && lista.linked_account && !lista.can_link && <p className={cn(NOTA, "mt-2")}>Sem permissão para ligar artigos.</p>}
          {lista && lista.linked_account && (
            <ul className="mt-2 divide-y divide-border">
              {lista.items.map((it) => {
                const jaAqui = it.links?.some((x) => x.product_id === p.id);
                return (
                  <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 flex-1 text-[15px]">
                      <span className="block font-medium">{it.name}</span>
                      <span className={cn(NOTA, "block")}>
                        {[`ref. ${it.supplier_ref}`, it.barcode, lista.can_view_pricing && it.base_price != null ? moeda(it.base_price, it.currency, eur) : "", it.units_per_pack ? `× ${it.units_per_pack}` : "",
                          it.is_linked && !jaAqui ? `ligado a ${it.links.map((x) => x.product_name).join(", ")}` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {jaAqui ? <span className={NOTA}>Já ligado</span>
                      : lista.can_link && (
                        <Button variant="outline" className="min-h-11 text-[15px]" disabled={!!aLigar} onClick={() => void ligarItem(it)} aria-label={`Ligar ${it.supplier_ref}`}>
                          {aLigar === it.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="mr-1 h-4 w-4" aria-hidden="true" />}Ligar
                        </Button>
                      )}
                  </li>
                );
              })}
              {!lista.items.length && <li className={cn(NOTA, "py-2")}>Nenhum artigo com esse nome.</li>}
            </ul>
          )}
          {escolher && (
            <fieldset className="mt-4 rounded-xl border border-border p-3">
              <legend className="px-1 text-[15px] font-medium">Este produto tem várias ligações a {forn.name}: qual fica com o artigo {escolher.item.supplier_ref}?</legend>
              {escolher.rows.map((r) => (
                <label key={r.id} className="flex min-h-11 items-center gap-2 text-[15px]">
                  <input type="radio" name="fp-linha" checked={escolher.sel === r.id} onChange={() => setEscolher({ ...escolher, sel: r.id })} />
                  {[r.uom_code ?? "sem unidade", r.supplier_sku ? `ref. ${r.supplier_sku}` : "", r.purchase_price != null ? moeda(r.purchase_price, r.currency, eur) : ""].filter(Boolean).join(" · ")}
                </label>
              ))}
              <Button className="mt-2 min-h-11 text-[15px]" disabled={!escolher.sel || !!aLigar}
                onClick={() => { const r = escolher.rows.find((x) => x.id === escolher.sel); if (r) void feito(escolher.item, r.uom_id); }}>Ligar</Button>
            </fieldset>
          )}
        </div>
      )}
      {erro && <p className="mt-3 text-[15px] text-destructive" role="alert">{erro}</p>}
      <button type="button" className={cn(LINK, "mt-3")} onClick={fechar}>Cancelar</button>
    </Seccao>
  );
}
