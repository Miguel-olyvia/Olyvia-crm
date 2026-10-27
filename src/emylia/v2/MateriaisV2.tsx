// Materiais e consumíveis da V2: uma lista com custo, unidade, marca, fornecedor preferido,
// classificação e a data do preço (que dá o "Preço desatualizado"). Unidade, marca e fornecedor
// escolhem-se de uma lista com "criar ao escrever". Mudar o custo põe a data de hoje e leva o
// preço às receitas que usam o material (pelo nome). Material novo na linha, em ≈4 toques.
import { memo, useEffect, useRef, useState } from "react";
import { Clock, PackagePlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHIP } from "../FiltrosPopover";
import { CATALOGO, itemCatalogo, normal } from "../catalogo";
import { numero } from "../pecas";
import { eur, type Estado } from "../motor";
import { aplicarTodos, dataPT, listaCatalogo, type Custos } from "./custosModelo";
import { lerCustos, mudarCustos } from "./custosStore";
import { caminho, criarProduto, garantirValor, mudarCusto, opcoesArvore, produtoDesatualizado, propagarProduto, type Catalogo, type Produto } from "./catalogoModelo";
import { lerCatalogo, mudarCatalogo, porCatalogo } from "./catalogoStore";
import { CAMPO, Escolha, NumeroCelula, Retirar, TextoCelula } from "./pecasCustos";
import { Combo, type SecaoCat } from "./pecasCatalogo";

const TH = "px-2 py-2 text-left text-[15px] font-medium text-muted-foreground";
const TD = "px-2 py-1.5 align-middle";

// memo: só se redesenha quando os custos, o catálogo ou o editor aberto mudam (não a cada chip da lista de serviços)
export const MateriaisV2 = memo(function MateriaisV2({ S, C, K, run, editor, setEditor, anunciar }: SecaoCat & { S: Estado; C: Custos; K: Catalogo; run: (fn: () => void) => void }) {
  const [q, setQ] = useState("");
  const [soVelhos, setSoVelhos] = useState(false);
  const [todos, setTodos] = useState(false);

  // em que receitas e pacotes entra cada material (pelo nome nas receitas, pelo id nos pacotes)
  const recs = listaCatalogo(S, C);
  const usos = (p: Produto) => {
    const r = recs.filter((i) => i.rec.cons.some((c) => normal(c.n) === normal(p.n))).length;
    const k = K.pacotes.filter((P) => P.linhas.some((l) => l.t === "mat" && l.refs.includes(p.id))).length;
    return [r && `${r} ${r === 1 ? "receita" : "receitas"}`, k && `${k} ${k === 1 ? "pacote" : "pacotes"}`].filter(Boolean).join(" · ") || "Não usado";
  };
  const velho = (p: Produto) => produtoDesatualizado(p, C.par.mesesDesatualizado);
  const qq = normal(q.trim());
  // os produtos do catálogo da Mudelar (com referência, 14/10) são milhares: só aparecem a pesquisar
  const pesquisados = (qq ? K.produtos : K.produtos.filter((p) => !p.sku)).filter((p) => !qq || [p.n, p.marca, p.fornecedor, p.sku ?? "", caminho(K.arvore, p.no)].some((x) => normal(x).includes(qq)));
  const filtrados = pesquisados.filter((p) => !soVelhos || velho(p));
  // sem pesquisa nem filtro mostram-se os primeiros 10 (a lista fica leve); a pesquisar, os primeiros 50; "Mostrar todos" abre o resto
  const corte = qq ? 50 : 10;
  const curta = !todos && !soVelhos && filtrados.length > corte;
  const lista = curta ? filtrados.slice(0, corte) : filtrados;

  /** Muda um material; se mudou o custo, o nome ou a unidade, leva-o às receitas. Com "Anular". */
  const mudar = (id: string, fn: (p: Produto, k: Catalogo) => Produto, msg: string) => {
    const antesK = lerCatalogo(), antesC = lerCustos(), velhoP = antesK.produtos.find((p) => p.id === id)!;
    const novoK = mudarCatalogo((k) => { const i = k.produtos.findIndex((p) => p.id === id); k.produtos[i] = fn(k.produtos[i], k); });
    const novo = novoK.produtos.find((p) => p.id === id)!;
    let n = 0;
    if (novo.custo !== velhoP.custo || novo.n !== velhoP.n || novo.un !== velhoP.un || novo.fornecedor !== velhoP.fornecedor) {
      mudarCustos((c) => { const r = propagarProduto(S, c, novo, velhoP.n); n = Object.keys(r).length; Object.assign(c.receitas, r); });
      run(() => aplicarTodos(S, lerCustos()));
    }
    anunciar(n ? `${msg}. Atualizado em ${n} ${n === 1 ? "receita" : "receitas"}` : msg, () => { porCatalogo(antesK); mudarCustos(() => antesC); run(() => aplicarTodos(S, lerCustos())); });
  };
  /** Escolher numa lista com "criar ao escrever": o valor novo entra na lista. */
  const lista_ = (campo: "unidades" | "marcas" | "fornecedores", k: Catalogo, v: string) => { const g = garantirValor(k[campo], v); k[campo] = g.lista; return g.v; };
  const retirar = (p: Produto) => {
    const antes = lerCatalogo();
    mudarCatalogo((k) => { k.produtos = k.produtos.filter((x) => x.id !== p.id); });
    anunciar(`${p.n} retirado`, () => porCatalogo(antes));
  };
  const arvoreOp = [{ v: "", t: "Sem classificação" }, ...opcoesArvore(K.arvore)];
  // os serviços que um produto pode trazer: os em uso e os do Catálogo real
  const nomeSvc = (sid: string) => S.svc[sid]?.n ?? itemCatalogo(sid)?.n ?? sid;
  const svcOp = [{ v: "", t: "Nenhum (só vendido)" }, ...[...Object.keys(S.svc), ...CATALOGO.map((c) => c.id).filter((id) => !S.svc[id])].map((sid) => ({ v: sid, t: nomeSvc(sid) }))];
  const nVelhos = pesquisados.filter(velho).length;

  return (
    <section id="cat-materiais" aria-labelledby="mt-t" className="scroll-mt-6">
      <h2 id="mt-t" className="text-2xl font-semibold tracking-tight">Materiais e consumíveis</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        O custo de compra, a unidade, a marca e o fornecedor preferido. Mudar o custo põe a data de hoje e atualiza as receitas que usam o material;
        ao fim de {C.par.mesesDesatualizado} meses o preço fica desatualizado.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-md">
          <span className="sr-only">Procurar material</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar material, marca ou fornecedor" className={cn(CAMPO, "w-full pl-10")} />
        </label>
        <button type="button" aria-pressed={soVelhos} onClick={() => setSoVelhos(!soVelhos)} className={cn(CHIP(soVelhos), "inline-flex items-center gap-2")}>
          <Clock className={cn("h-4 w-4", !soVelhos && "text-warning")} aria-hidden="true" />Materiais com preço desatualizado <span className="tabular-nums opacity-70">{nVelhos}</span>
        </button>
      </div>
      <p className="mt-3 text-[15px] text-muted-foreground" aria-live="polite">{filtrados.length} de {K.produtos.length} materiais{curta ? ` · a mostrar os primeiros ${lista.length}` : ""}</p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[1380px] border-collapse">
          <caption className="sr-only">Materiais e consumíveis, com custo, unidade, marca, fornecedor e data do preço</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={TH}>Material</th><th scope="col" className={TH}>Classificação</th><th scope="col" className={cn(TH, "text-right")}>Custo €</th>
              <th scope="col" className={TH}>Unidade</th><th scope="col" className={TH}>Marca</th><th scope="col" className={TH}>Fornecedor preferido</th>
              <th scope="col" className={TH}>Serviço que traz</th>
              <th scope="col" className={TH}>Preço de</th><th scope="col" className={TH}><span className="sr-only">Retirar</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const v = velho(p);
              return (
                <tr key={p.id} className="border-b border-border">
                  <td className={TD}>
                    <TextoCelula rotulo="Material" v={p.n} onSet={(n) => mudar(p.id, (x) => ({ ...x, n }), "Material renomeado")} />
                    <span className="mt-0.5 block text-[15px] text-muted-foreground">{usos(p)}</span>
                  </td>
                  <td className={TD}>
                    {/* escolher a classificação: um editor na linha de cada vez (a lista fica leve) */}
                    {editor === `mat:cl:${p.id}`
                      ? <Escolha rotulo={`Classificação de ${p.n}`} w="w-56" v={p.no ?? ""} opcoes={arvoreOp} onSet={(no) => { mudar(p.id, (x) => ({ ...x, no: no || null }), `${p.n}: ${caminho(K.arvore, no || null)}`); setEditor(null); }} />
                      : <button type="button" aria-label={`Classificação de ${p.n}: ${caminho(K.arvore, p.no)}. Mudar`} onClick={() => setEditor(`mat:cl:${p.id}`)}
                          className="min-h-11 rounded-lg px-1 text-left text-[15px] underline-offset-4 hover:underline">{caminho(K.arvore, p.no)}</button>}
                  </td>
                  <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Custo de ${p.n}`} v={p.custo} onSet={(n) => mudar(p.id, (x) => mudarCusto(x, n), `Custo de ${p.n}: ${eur(n)} €`)} /></td>
                  <td className={TD}><Combo rotulo={`Unidade de ${p.n}`} w="w-28" v={p.un} lista={K.unidades} onSet={(u, novo) => mudar(p.id, (x, k) => ({ ...x, un: lista_("unidades", k, u) }), novo ? `Unidade «${u}» criada` : "Unidade mudada")} /></td>
                  <td className={TD}><Combo rotulo={`Marca de ${p.n}`} v={p.marca} lista={K.marcas} onSet={(m, novo) => mudar(p.id, (x, k) => ({ ...x, marca: lista_("marcas", k, m) }), novo ? `Marca «${m}» criada` : "Marca mudada")} /></td>
                  <td className={TD}><Combo rotulo={`Fornecedor de ${p.n}`} w="w-44" v={p.fornecedor} lista={K.fornecedores} onSet={(f, novo) => mudar(p.id, (x, k) => ({ ...x, fornecedor: lista_("fornecedores", k, f) }), novo ? `Fornecedor «${f}» criado` : "Fornecedor mudado")} /></td>
                  <td className={TD}>
                    {/* o serviço que o produto traz na visita (e quanto por unidade): um editor na linha de cada vez */}
                    {editor === `mat:svc:${p.id}`
                      ? <span className="flex items-center gap-2">
                          <Escolha rotulo={`Serviço que ${p.n} traz`} w="w-56" v={p.servico ?? ""} opcoes={p.servico && !svcOp.some((o) => o.v === p.servico) ? [...svcOp, { v: p.servico, t: nomeSvc(p.servico) }] : svcOp}
                            onSet={(s) => mudar(p.id, (x) => { const y = { ...x }; if (s) { y.servico = s; y.fatorServico ??= 1; } else { delete y.servico; delete y.fatorServico; } return y; }, s ? `${p.n} traz ${nomeSvc(s)}` : `${p.n}: só o produto`)} />
                          {p.servico && <NumeroCelula rotulo={`Fator do serviço de ${p.n}`} w="w-16" v={p.fatorServico ?? 1} onSet={(f) => mudar(p.id, (x) => ({ ...x, fatorServico: f }), `${nomeSvc(p.servico!)} × ${String(f).replace(".", ",")} por ${p.un}`)} />}
                          <Button variant="ghost" className="min-h-11" onClick={() => setEditor(null)}>Feito</Button>
                        </span>
                      : <button type="button" aria-label={`Serviço que ${p.n} traz: ${p.servico ? nomeSvc(p.servico) : "nenhum"}. Mudar`} onClick={() => setEditor(`mat:svc:${p.id}`)}
                          className="min-h-11 rounded-lg px-1 text-left text-[15px] underline-offset-4 hover:underline">
                          {p.servico ? `${nomeSvc(p.servico)} × ${String(p.fatorServico ?? 1).replace(".", ",")}` : <span className="text-muted-foreground">Nenhum (só vendido)</span>}
                        </button>}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-[15px] tabular-nums text-muted-foreground")}>
                    <span className="inline-flex items-center gap-1.5">{v && <Clock className="h-4 w-4 text-warning" aria-hidden="true" />}{dataPT(p.data)}{v && <span className="sr-only"> (desatualizado)</span>}</span>
                  </td>
                  <td className={TD}><Retirar rotulo={`Retirar ${p.n}`} onClick={() => retirar(p)} /></td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={9} className="px-3 py-4 text-[15px] text-muted-foreground">Nada com esse nome ou filtro.</td></tr>}
          </tbody>
        </table>
      </div>

      {curta && <Button variant="ghost" className="mt-2 min-h-11 text-[15px]" onClick={() => setTodos(true)}>Mostrar todos os {filtrados.length} materiais</Button>}
      {editor === "mat:novo"
        ? <NovoMaterial K={K} fechar={() => setEditor(null)} anunciar={anunciar} />
        : <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => setEditor("mat:novo")}><PackagePlus className="h-4 w-4" aria-hidden="true" />Novo material</Button>}
    </section>
  );
});

/** O material novo, na linha: nome, custo, unidade e marca (com "criar ao escrever"), classificação. */
function NovoMaterial({ K, fechar, anunciar }: { K: Catalogo; fechar: () => void; anunciar: SecaoCat["anunciar"] }) {
  const [n, setN] = useState(""), [custo, setCusto] = useState(""), [un, setUn] = useState("un"), [marca, setMarca] = useState(""), [no, setNo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const juntar = () => {
    const r = criarProduto(lerCatalogo(), { n, custo: custo.trim() ? numero(custo) : NaN, un, marca, no: no || null });
    if ("erro" in r) { setErro(r.erro); return; }
    const antes = lerCatalogo();
    mudarCatalogo(() => r.K);
    fechar();
    anunciar(`Material «${n.trim()}» juntado`, () => porCatalogo(antes));
  };
  return (
    <form role="group" aria-label="Novo material" className="mt-3 border-l-2 border-border pl-4" onSubmit={(e) => { e.preventDefault(); juntar(); }}
      onKeyDown={(e) => { if (e.key === "Escape") fechar(); }}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5"><span className="text-[15px] font-medium">Nome</span>
          <input ref={ref} type="text" value={n} onChange={(e) => { setN(e.target.value); setErro(null); }} className={cn(CAMPO, "w-64")} /></label>
        <label className="grid gap-1.5"><span className="text-[15px] font-medium">Custo €</span>
          <input type="text" inputMode="decimal" value={custo} onChange={(e) => { setCusto(e.target.value); setErro(null); }} className={cn(CAMPO, "w-28 text-right tabular-nums")} /></label>
        <div className="grid gap-1.5"><span className="text-[15px] font-medium" aria-hidden="true">Unidade</span>
          <Combo rotulo="Unidade" w="w-28" v={un} lista={K.unidades} onSet={(v) => setUn(v)} /></div>
        <div className="grid gap-1.5"><span className="text-[15px] font-medium" aria-hidden="true">Marca</span>
          <Combo rotulo="Marca" v={marca} lista={K.marcas} onSet={(v) => setMarca(v)} placeholder="Escolher ou escrever" /></div>
        <div className="grid gap-1.5"><span className="text-[15px] font-medium" aria-hidden="true">Classificação</span>
          <Escolha rotulo="Classificação" w="w-56" v={no} opcoes={[{ v: "", t: "Sem classificação" }, ...opcoesArvore(K.arvore)]} onSet={setNo} /></div>
        <Button type="submit" variant="outline" className="min-h-11 text-[15px]">Juntar material</Button>
        <Button type="button" variant="ghost" className="min-h-11 text-[15px]" onClick={fechar}>Cancelar</Button>
      </div>
      <p className="mt-2 min-h-6 text-[15px]" aria-live="polite">{erro}</p>
    </form>
  );
}
