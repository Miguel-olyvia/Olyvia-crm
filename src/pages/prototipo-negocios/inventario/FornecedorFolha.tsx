// A ficha de um fornecedor (folha lateral): Resumo (SLA e encomendas), Dados, Artigos e preços (com o preferido), Preços por aprovar e Portal (catálogo por ligar).
import { useState } from "react";
import { Star } from "lucide-react";
import { Kpi } from "./kpiInv";
import { CHIP } from "../FiltrosPopover";
import { adicionarArtigo, decidirPreco, definirFornecedorAtivo, definirPreferido, desligarCatalogo, dispensarCatalogo, eliminarFornecedor, ligarCatalogo, removerArtigo, restaurarFornecedor } from "./cadastros";
import { eur, falhar, fmtD, fmtDT, fornecedor, nomeProd, pct, produto } from "./base";
import { useCtxInv } from "./ctxInv";
import { AbasFolha, Confirmar, Folha } from "./DialogosInv";
import { margem, portalTexto, precosPorAprovar, slaStats } from "./fornecedores";
import { opcoesProdutos } from "./opcoes";
import { Dados, Lista, Nota, Pri, Sec, Selo, Texto, Vazio } from "./pecasInv";
import { poOpen, poStatus, poStatusLabel, poTotals } from "./po";
import { TabelaInv } from "./TabelaInv";
import type { Artigo, Inventario, ItemCatalogo } from "./tipos";

type TabF = "resumo" | "dados" | "artigos" | "precos" | "portal";

function Resumo({ id }: { id: string }) {
  const { db, abrir } = useCtxInv();
  const s = fornecedor(db, id), sl = slaStats(db, id);
  const pos = db.pos.filter((p) => p.sup === id && !p.deleted).sort((a, b) => (b.date > a.date ? 1 : -1));
  const tab = (l: typeof pos) => <TabelaInv rolar titulo="Encomendas" chave={(p) => p.id} linhas={l} abrir={(p) => abrir({ t: "po", id: p.id })} colunas={[
    { id: "i", titulo: "Nº", celula: (p) => p.id }, { id: "d", titulo: "Data", celula: (p) => fmtD(p.date) }, { id: "e", titulo: "Entrega", celula: (p) => fmtD(p.due) },
    { id: "s", titulo: "Estado", celula: (p) => poStatusLabel[poStatus(p)] }, { id: "v", titulo: "Valor", direita: true, celula: (p) => eur(poTotals(p).total) }]} />;
  return (
    <div className="grid gap-4">
      <div className="kpis">
        <Kpi rotulo="Recebidas" valor={String(sl.rec)} nota="histórico" /><Kpi tom="ok" rotulo="Dentro do SLA" valor={String(sl.inn)} nota={`prazo ${s?.sla} dias`} /><Kpi rotulo="Fora do SLA" valor={String(sl.out)} />
        <Kpi rotulo="% cumprimento" valor={pct(sl.pct)} /><Kpi rotulo="Atraso médio" valor={`${(Math.round(sl.avg * 10) / 10).toString().replace(".", ",")} dias`} />
      </div>
      <h3 className="text-base font-semibold">POs abertas ({pos.filter(poOpen).length})</h3>
      {pos.filter(poOpen).length ? tab(pos.filter(poOpen)) : <p className="text-[15px] text-muted-foreground">Sem encomendas em aberto.</p>}
      <h3 className="text-base font-semibold">Últimas encomendas</h3>
      {pos.length ? tab(pos.slice(0, 6)) : <p className="text-[15px] text-muted-foreground">Sem encomendas.</p>}
    </div>
  );
}

function Artigos({ id }: { id: string }) {
  const { db, agir } = useCtxInv();
  const [n, setN] = useState({ sku: "", ref: "", packN: "1", unit: "Unidade", price: "", moq: "1", lead: "", erro: "" });
  const [rem, setRem] = useState<Artigo | null>(null);
  const its = db.items.filter((i) => i.sup === id);
  const m = (p: Partial<typeof n>): void => setN((x) => ({ ...x, ...p, erro: "" }));
  const juntar = (): void => {
    const r = agir((d) => adicionarArtigo(d, id, { sku: n.sku, ref: n.ref, packN: Number(n.packN), unitLabel: n.unit, price: n.price === "" ? null : Number(n.price), moq: Number(n.moq), lead: Number(n.lead) }), "Artigo adicionado.");
    if (r.ok) setN({ sku: "", ref: "", packN: "1", unit: "Unidade", price: "", moq: "1", lead: "", erro: "" }); else setN((x) => ({ ...x, erro: r.erro }));
  };
  return (
    <div className="grid gap-4">
      <p className="text-[15px] text-muted-foreground">A estrela marca o preferido (recebe os rascunhos automáticos). O preço é por embalagem; o stock conta sempre em unidades.</p>
      {its.length === 0 ? <Vazio titulo="Sem artigos" texto="Adicione abaixo ou ligue do catálogo do portal." /> : (
        <TabelaInv rolar titulo="Artigos do fornecedor" chave={(i) => i.id} linhas={its}
          colunas={[
            { id: "ref", titulo: "Ref. fornecedor", celula: (i) => <>{i.ref}{i.pref ? " · preferido" : ""}</> }, { id: "p", titulo: "Produto", celula: (i) => <>{nomeProd(db, i.sku)} · {i.sku}</> },
            { id: "u", titulo: "Unidade / embalagem", celula: (i) => <>{i.unitLabel}<span className="block text-muted-foreground">{i.packN} {produto(db, i.sku)?.unit} por embalagem</span></> },
            { id: "pr", titulo: "Preço", direita: true, celula: (i) => <>{eur(i.price)}{i.packN > 1 ? <span className="block text-muted-foreground">{eur(i.price / i.packN)}/un</span> : null}</> },
            { id: "m", titulo: "MOQ", direita: true, celula: (i) => i.moq }, { id: "l", titulo: "Prazo", direita: true, celula: (i) => `${i.lead} d` },
          ]}
          acoes={(i) => <><Sec aria-pressed={i.pref} aria-label={i.pref ? `${i.ref} é o preferido` : `Marcar ${i.ref} como preferido`} disabled={i.pref} onClick={() => agir((d) => definirPreferido(d, i.id), "Fornecedor preferido atualizado.")}><Star className="mr-1.5 h-4 w-4 text-amber-700" aria-hidden="true" />{i.pref ? "Preferido" : "Preferido?"}</Sec><Sec onClick={() => setRem(i)}>Remover</Sec></>} />
      )}
      <fieldset className="grid gap-3 border-t border-border pt-3"><legend className="text-base font-semibold">Adicionar artigo</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Lista rotulo="Produto" valor={n.sku} aoMudar={(v) => m({ sku: v })} opcoes={[["", "Escolher produto…"], ...opcoesProdutos(db, false)]} obrigatorio />
          <Texto rotulo="Ref. fornecedor" valor={n.ref} aoMudar={(v) => m({ ref: v })} obrigatorio />
          <Texto rotulo="Unidades por embalagem" tipo="number" valor={n.packN} aoMudar={(v) => m({ packN: v })} atributos={{ min: 1, step: 1 }} />
          <Texto rotulo="Embalagem" valor={n.unit} aoMudar={(v) => m({ unit: v })} />
          <Texto rotulo="Preço por embalagem" tipo="number" valor={n.price} aoMudar={(v) => m({ price: v })} atributos={{ min: 0, step: 0.01 }} obrigatorio />
          <Texto rotulo="MOQ" tipo="number" valor={n.moq} aoMudar={(v) => m({ moq: v })} atributos={{ min: 1, step: 1 }} />
        </div>
        {n.erro && <Nota tom="bad" alerta>{n.erro}</Nota>}
        <div><Sec onClick={juntar}>Adicionar artigo</Sec></div>
      </fieldset>
      {rem && <Confirmar aberto aoFechar={() => setRem(null)} titulo={`Remover artigo ${rem.ref}`} ok="Remover" perigo texto={<p>O artigo deixa de estar disponível para encomendas.</p>} aoConfirmar={() => agir((d) => removerArtigo(d, rem.id), "Artigo removido.")} />}
    </div>
  );
}

function Precos({ id }: { id: string }) {
  const { db, agir } = useCtxInv();
  const [rej, setRej] = useState<string | null>(null);
  const lista = precosPorAprovar(db, id), decididos = db.prices.filter((c) => c.sup === id && c.state !== "pending");
  const it = (c: { itemId: string }): Artigo | undefined => db.items.find((x) => x.id === c.itemId);
  return (
    <div className="grid gap-4">
      {lista.length === 0 ? <Vazio titulo="Sem preços por aprovar" texto="Quando o fornecedor submeter novos preços no portal, aparecem aqui." /> : (
        <TabelaInv rolar titulo="Preços por aprovar" chave={(c) => c.id} linhas={lista}
          colunas={[
            { id: "p", titulo: "Produto", celula: (c) => <>{nomeProd(db, it(c)?.sku ?? "")} · {it(c)?.ref}</> },
            { id: "a", titulo: "Atual → novo", direita: true, celula: (c) => <>{eur(c.cur)} → <b>{eur(c.nw)}</b></> },
            { id: "d", titulo: "Dif. %", direita: true, celula: (c) => { const d = ((c.nw - c.cur) / c.cur) * 100; return <Selo tom={d > 5 ? "bad" : d > 0 ? "warn" : "ok"}>{d > 0 ? "+" : ""}{pct(d)}</Selo>; } },
            { id: "pf", titulo: "Custo muda?", celula: (c) => (it(c)?.pref ? "Sim · preferido" : "Não") },
            { id: "mg", titulo: "Margem atual → nova", direita: true, celula: (c) => { const i = it(c), p = i && produto(db, i.sku); if (!i || !p) return "—"; return `${pct(margem(p.sale, p.cost))} → ${pct(margem(p.sale, i.pref ? c.nw / i.packN : p.cost))}`; } },
          ]}
          acoes={(c) => <><Sec onClick={() => agir((d) => decidirPreco(d, c.id, true), "Preço aceite.")}>Aceitar</Sec><Sec onClick={() => setRej(c.id)}>Recusar</Sec></>} />
      )}
      {decididos.length > 0 && (
        <details className="text-[15px]"><summary className="min-h-11 cursor-pointer">Decididos ({decididos.length})</summary>
          <ul className="grid gap-1 py-2">{decididos.map((c) => <li key={c.id}>{c.state === "accepted" ? "Aceite" : "Recusado"} · {it(c)?.ref} {eur(c.cur)} → {eur(c.nw)}{c.note ? ` · «${c.note}»` : ""}</li>)}</ul></details>
      )}
      {rej && <Confirmar aberto aoFechar={() => setRej(null)} titulo="Recusar alteração de preço" ok="Recusar" perigo motivo="Nota para o fornecedor" texto={<p>O fornecedor vê a recusa e a nota no portal. O preço atual mantém-se.</p>} aoConfirmar={(m) => agir((d) => decidirPreco(d, rej, false, m), "Alteração recusada.")} />}
    </div>
  );
}

function Portal({ id }: { id: string }) {
  const { db, agir } = useCtxInv();
  const [vista, setVista] = useState<"unlinked" | "linked" | "dismissed" | "all">("unlinked");
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const s = fornecedor(db, id);
  const cat = db.catalog.filter((c) => c.sup === id && (vista === "all" || c.state === vista));
  const exatas = db.catalog.filter((c) => c.sup === id && c.state === "unlinked" && c.sug?.conf === "Exata");
  const n = (k: typeof vista): number => db.catalog.filter((c) => c.sup === id && (k === "all" || c.state === k)).length;
  const alvo = (c: ItemCatalogo): string => escolha[c.id] ?? c.sug?.sku ?? "";
  return (
    <div className="grid gap-4">
      <Dados itens={[["Estado", s ? portalTexto(s) : ""], ["NIF", s?.nif ?? ""], ["Utilizadores ativos", s?.portalUsers ?? 0], ["Último acesso", fmtDT(s?.lastAccess)], ["Artigos no catálogo", n("all")], ["Dados confirmados", s?.dataConfirmed ? "Sim" : "Ainda não"]]} />
      <h3 className="text-base font-semibold">Catálogo do fornecedor</h3>
      <p className="text-[15px] text-muted-foreground">O fornecedor carrega o catálogo no portal; aqui liga cada artigo a um produto. Ligar cria o artigo em «Artigos e preços».</p>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Catálogo">
        {([["unlinked", "Por ligar"], ["linked", "Ligados"], ["dismissed", "Dispensados"], ["all", "Todos"]] as const).map(([k, nome]) => <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)} className={CHIP(vista === k)}>{nome} <span className="tabular-nums opacity-70">{n(k)}</span></button>)}
        <Sec className="ml-auto" disabled={!exatas.length} onClick={() => agir((d: Inventario) => { for (const c of d.catalog.filter((x) => x.sup === id && x.state === "unlinked" && x.sug?.conf === "Exata")) ligarCatalogo(d, c.id, (c.sug as { sku: string }).sku); }, "Sugestões exatas aceites.")}>Aceitar sugestões exatas ({exatas.length})</Sec>
      </div>
      {cat.length === 0 ? <Vazio titulo="Nada nesta vista" /> : (
        <TabelaInv rolar titulo="Catálogo do portal" chave={(c) => c.id} linhas={cat}
          colunas={[
            { id: "r", titulo: "Ref.", celula: (c) => c.ref }, { id: "a", titulo: "Artigo", celula: (c) => <>{c.name}<span className="block text-muted-foreground">{c.unitLabel}</span></> }, { id: "p", titulo: "Preço", direita: true, celula: (c) => eur(c.price) },
            { id: "l", titulo: "Produto / sugestão", celula: (c) => (c.state === "linked" ? <>Ligado a {nomeProd(db, c.link ?? "")}</> : c.state === "dismissed" ? "Dispensado" : (
              <Lista rotulo="Produto a ligar" valor={alvo(c)} aoMudar={(v) => setEscolha((e) => ({ ...e, [c.id]: v }))} opcoes={[["", c.sug ? "Escolher…" : "Sem sugestão — escolher…"], ...opcoesProdutos(db, false)]} ajuda={c.sug ? `Sugestão ${c.sug.conf.toLowerCase()}` : undefined} />)) },
          ]}
          acoes={(c) => c.state === "unlinked" ? <><Sec onClick={() => agir((d) => { if (!alvo(c)) falhar("Escolha o produto a ligar."); ligarCatalogo(d, c.id, alvo(c)); }, "Artigo ligado.")}>Ligar</Sec><Sec onClick={() => agir((d) => dispensarCatalogo(d, c.id), "Artigo dispensado.")}>Dispensar</Sec></>
            : c.state === "linked" ? <Sec onClick={() => agir((d) => desligarCatalogo(d, c.id), "Artigo desligado.")}>Desligar</Sec> : <Sec onClick={() => agir((d) => desligarCatalogo(d, c.id), "Artigo reposto como por ligar.")}>Repor</Sec>} />
      )}
    </div>
  );
}

export function FornecedorFolha({ id, tabInicial, aoFechar }: { id: string; tabInicial?: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const [tab, setTab] = useState<TabF>((tabInicial as TabF) || "resumo");
  const [elim, setElim] = useState(false);
  const s = fornecedor(db, id);
  if (!s) return null;
  const dadosAba = (
    <div className="grid gap-4">
      <Dados itens={[["Empresa", s.company], ["Código", s.code], ["Contacto", s.contact], ["Email", s.email], ["Telefone", s.phone], ["NIF", s.nif], ["Prazo SLA", `${s.sla} dias`], ["Morada", `${s.addr}, ${s.city}`], ["País", s.country]]} />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]"><input type="checkbox" checked={s.active} onChange={(e) => agir((d) => definirFornecedorAtivo(d, id, e.target.checked), e.target.checked ? "Fornecedor ativo." : "Fornecedor inativo.")} className="h-5 w-5 accent-foreground" />Fornecedor ativo</label>
      <Nota tom="info">A edição completa dos dados e o convite ao portal não foram portados: este ecrã mostra os dados de exemplo.</Nota>
    </div>
  );
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={s.name} subtitulo="Compras › Fornecedor"
      selos={<><Selo>{s.code}</Selo><Selo tom={s.active ? "ok" : "neu"}>{s.active ? "Ativo" : "Inativo"}</Selo><Selo tom={s.portal === "active" ? "ok" : "info"}>{portalTexto(s)}</Selo>{s.deleted && <Selo>Eliminado</Selo>}</>}
      abas={<AbasFolha<TabF> rotulo="Partes da ficha" atual={tab} escolher={setTab} abas={[["resumo", "Resumo"], ["dados", "Dados"], ["artigos", "Artigos e preços", db.items.filter((i) => i.sup === id).length], ["precos", "Preços por aprovar", precosPorAprovar(db, id).length], ["portal", "Portal"]]} />}
      rodape={s.deleted ? <><Sec onClick={aoFechar}>Fechar</Sec><Pri onClick={() => agir((d) => restaurarFornecedor(d, id), "Fornecedor restaurado.")}>Restaurar</Pri></> : <><Sec className="mr-auto" onClick={() => setElim(true)}>Eliminar</Sec><Sec onClick={aoFechar}>Fechar</Sec></>}>
      <div role="tabpanel" aria-labelledby={`fa-${tab}`} className="grid gap-3">
        {tab === "resumo" && <Resumo id={id} />}{tab === "dados" && dadosAba}{tab === "artigos" && <Artigos id={id} />}{tab === "precos" && <Precos id={id} />}{tab === "portal" && <Portal id={id} />}
      </div>
      {elim && <Confirmar aberto aoFechar={() => setElim(false)} titulo={`Eliminar ${s.name}`} ok="Eliminar" perigo texto={<p>O fornecedor fica oculto (pode restaurar com «Ver eliminados»). Não se elimina com encomendas em aberto.</p>} aoConfirmar={() => { const r = agir((d) => eliminarFornecedor(d, id), "Fornecedor eliminado."); if (r.ok) aoFechar(); return r; }} />}
    </Folha>
  );
}
