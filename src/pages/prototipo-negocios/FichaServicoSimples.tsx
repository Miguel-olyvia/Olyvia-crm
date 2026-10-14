// A ficha do serviço no V1 (14/10/2026): uma página (não um modal), com "Voltar ao Catálogo".
// Uma coisa de cada vez: cabeçalho, Medida, Quem faz, Equipamentos, Consumíveis, Produtos ligados
// e Custo e preço. As contas são as da V2 (v2/custosModelo.ts) e cada mudança passa para S.svc
// (aplicarTodos), por isso o orçamento usa o mesmo custo. Um só botão primário: "Guardar o preço".
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Clock, Info, Plus, Search, TriangleAlert, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO } from "./catalogo";
import { eur, nfmt, pct, r2, type Estado, type SvcId } from "./motor";
import {
  HOJE, JUSTIFICACOES, aplicarTodos, alertasServico, consumiveisDesatualizados, custoHoraPerfil, custoReceita, dataPT, margemSobrePreco,
  mediaHora, minimoServico, precoReceita, receitaDe, taxaEstrutura, type Custos, type ModoPreco, type ReceitaV2,
} from "./v2/custosModelo";
import { lerCustos, mudarCustos } from "./v2/custosStore";
import { caminho, consumivelDe, noDoServico, opcoesArvore, textoRegra, type Produto, type Regra } from "./v2/catalogoModelo";
import { mudarCatalogo, useCatalogo } from "./v2/catalogoStore";
import { Escolha, ListaAlertas, NumeroCelula, Retirar, TextoCelula } from "./v2/pecasCustos";
import { ICONES_SERVICO, IconeServico, Ilustracao } from "./ilustracoes";
import {
  ORIGENS_MEDIDA, REGRAS_QTD, UNIDADES_SERVICO, avisoMedida, chaveRegra, exemploMedida, iconeDoServico, margemEmPalavras, medidaDe, medidaDoModelo,
  perguntasPossiveis, pesquisarProdutos, precoProduto, produtosQueTrazem, quebraEquip,
} from "./fichaServico";

const CARTAO = "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-6";
const ROT = "text-[15px] font-medium";
const NOTA = "text-[15px] text-muted-foreground";
/** As partes do custo: cinzentos do mais escuro ao mais claro (a cor fica para o acento). */
const TONS = ["bg-foreground/75", "bg-foreground/50", "bg-foreground/30", "bg-foreground/15"];

function Seccao({ id, titulo, total, desc, children }: { id: string; titulo: string; total?: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn(CARTAO, "mt-6")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="text-xl font-semibold tracking-tight">{titulo}</h2>
        {total != null && <span className="text-[16px] font-medium tabular-nums">{total}</span>}
      </div>
      {desc && <p className={cn(NOTA, "mt-1")}>{desc}</p>}
      {children}
    </section>
  );
}

/** Escolha em botões (rádio com aspeto de pastilha), alvos de 44 px. */
function Opcoes<T extends string | null>({ nome, rotulo, v, opcoes, onSet, desativado }: {
  nome: string; rotulo: string; v: T; opcoes: { k: T; t: string }[]; onSet: (k: T) => void; desativado?: boolean;
}) {
  return (
    <fieldset className="mt-4" disabled={desativado}>
      <legend className={ROT}>{rotulo}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <label key={String(o.k)} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px] transition-colors",
            v === o.k ? "border-primary bg-primary/10 font-medium" : "border-input bg-card hover:bg-muted", desativado && "cursor-not-allowed opacity-60")}>
            <input type="radio" name={nome} checked={v === o.k} onChange={() => onSet(o.k)} className="sr-only" />{o.t}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Interruptor acessível (role="switch"). */
function Interruptor({ on, rotulo, onClick, texto }: { on: boolean; rotulo: string; onClick: () => void; texto: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={rotulo} onClick={onClick} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-[15px]">
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-input")} aria-hidden="true">
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
      {texto}
    </button>
  );
}

/** Procurar um produto (escala para milhares: só mostra os 6 primeiros que batem). */
function ProcurarProduto({ rotulo, produtos, onEscolher, margem }: { rotulo: string; produtos: Produto[]; onEscolher: (p: Produto) => void; margem: number }) {
  const [q, setQ] = useState("");
  const L = q.trim() ? pesquisarProdutos(produtos, q).slice(0, 6) : [];
  return (
    <div className="mt-4">
      <label className="relative block max-w-md">
        <span className={ROT}>{rotulo}</span>
        <Search className="pointer-events-none absolute bottom-3.5 left-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca ou referência"
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      </label>
      {q.trim() && (
        <ul className="mt-2 max-w-md divide-y divide-border border-y border-border" aria-label={`Resultados: ${rotulo}`}>
          {L.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onEscolher(p); setQ(""); }} className="flex min-h-14 w-full items-center gap-3 py-2 text-left hover:bg-muted/60">
                <Ilustracao k={p.img ?? "generico"} className="h-10 w-10" />
                <span className="min-w-0 flex-1"><span className="block truncate text-[15px]">{p.n}</span><span className="block truncate text-[15px] text-muted-foreground">{[p.marca, p.sku].filter(Boolean).join(" · ") || p.fornecedor}</span></span>
                <span className="shrink-0 text-[15px] tabular-nums">{eur(precoProduto(p, margem))} €</span>
              </button>
            </li>
          ))}
          {!L.length && <li className={cn(NOTA, "py-3")}>Nenhum produto com esse nome.</li>}
        </ul>
      )}
    </div>
  );
}

export function FichaServicoSimples({ S, C, run, sid, voltar, anunciar }: {
  S: Estado; C: Custos; run: (fn: () => void) => void; sid: SvcId; voltar: () => void; anunciar: (msg: string) => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const K = useCatalogo();
  useEffect(() => { titulo.current?.focus(); }, [sid]);
  const s = S.svc[sid] ?? null, cat = CATALOGO.find((x) => x.id === sid);
  const rec = receitaDe(C, sid, s, S.cfg.alvo)!;
  const un = s?.un ?? cat?.un ?? "un", nome = s?.n ?? cat?.n ?? sid, oficio = cat?.cat ?? s?.perfil ?? "";
  const c = custoReceita(rec, C, S.cfg.estrutura), preco = precoReceita(rec, c.total), min = minimoServico(C, sid, S.cfg.min);
  const m = margemSobrePreco(preco, c.total);
  const A = alertasServico({ rec, c, preco, un, min, alvo: S.cfg.alvo, mesesDesatualizado: C.par.mesesDesatualizado });
  const no = noDoServico(K, sid, oficio);
  const sku = (cat as { sku?: string } | undefined)?.sku;
  const icone = iconeDoServico(K, sid, nome, oficio);
  const medida = medidaDe(rec, sid, un), doModelo = medidaDoModelo(sid);

  // O preço é um rascunho até "Guardar o preço" (o único botão primário da página).
  const [modo, setModo] = useState<ModoPreco>(rec.modo);
  const [margem, setMargem] = useState(rec.margem);
  const [tabela, setTabela] = useState(String(r2(rec.modo === "tabela" ? rec.precoTabela : preco)).replace(".", ","));
  const tabelaN = parseFloat(tabela.replace(",", "."));
  const novoPreco = modo === "tabela" ? tabelaN : r2(c.total / (1 - margem / 100));
  const mudou = !isNaN(novoPreco) && novoPreco > 0 && (modo !== rec.modo || r2(novoPreco) !== r2(preco) || (modo === "margem" && margem !== rec.margem));

  /** Muda a receita (como editada, quando mexe no custo) e passa os custos para os serviços em uso. */
  const editar = (fn: (r: ReceitaV2) => void, msg: string, receita = true) => {
    mudarCustos((cc) => {
      const r = structuredClone(receitaDe(cc, sid, S.svc[sid] ?? null, S.cfg.alvo)!);
      fn(r);
      if (receita) r.origem = "editada";
      cc.receitas[sid] = r;
    });
    run(() => aplicarTodos(S, lerCustos()));
    const novo = custoReceita(lerCustos().receitas[sid], lerCustos(), S.cfg.estrutura);
    anunciar(`${msg}. Custo por ${un}: ${eur(novo.total)} €.`);
  };
  const guardarPreco = () => {
    if (!mudou) return;
    const p = r2(novoPreco);
    editar((r) => {
      r.modo = modo; r.margem = margem; r.precoTabela = p;
      r.hist.unshift({ data: HOJE, preco: p, nota: modo === "tabela" ? "Preço de tabela" : `Custo + ${margem}% de margem` });
    }, `Preço guardado: ${eur(p)} €/${un}`, false);
  };
  const nid = (pref: string, L: { id: string }[]) => pref + (Math.max(0, ...L.map((x) => Number(x.id.replace(/\D/g, "")) || 0)) + 1);
  const media = mediaHora(C);
  const velhos = new Set(consumiveisDesatualizados(rec, C.par.mesesDesatualizado).map((x) => x.id));
  const ligados = produtosQueTrazem(K, sid);
  const partes = [
    { n: "Mão de obra", v: c.mo }, { n: "Equipamentos", v: c.eq }, { n: "Consumíveis", v: c.cons },
    ...(S.cfg.estrutura ? [{ n: "Estrutura", v: c.estr }] : []),
  ];
  const regraAtual = K.qtdDe?.[sid];
  const regras: { t: string; r: Regra }[] = regraAtual && !REGRAS_QTD.some((x) => chaveRegra(x.r) === chaveRegra(regraAtual)) ? [...REGRAS_QTD, { t: textoRegra(regraAtual), r: regraAtual }] : REGRAS_QTD;
  const ramo = K.exigeProduto?.[sid];
  const ramoNome = ramo ? (K.arvore.find((x) => x.id === ramo)?.n ?? "") : "";

  return (
    <article aria-labelledby="ficha-t">
      <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-[15px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />Voltar ao Catálogo
      </button>

      {/* ---------------------------------------------------------- cabeçalho */}
      <header className="mt-3 flex items-start gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><IconeServico k={icone} className="h-7 w-7" /></span>
        <div className="min-w-0">
          <p className={NOTA}>{no ? caminho(K.arvore, no) : oficio}{sku ? ` · SKU ${sku}` : ""}{s ? " · em uso" : " · ainda não usado"}</p>
          <h1 id="ficha-t" ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">{nome}</h1>
        </div>
      </header>
      <dl className="mt-5 grid grid-cols-3 gap-3">
        <div><dt className={NOTA}>Preço por {un}</dt><dd className="text-2xl font-semibold tabular-nums">{eur(preco)} €</dd></div>
        <div><dt className={NOTA}>Custo por {un}</dt><dd className="text-2xl font-semibold tabular-nums">{eur(c.total)} €</dd></div>
        <div>
          <dt className={NOTA}>Margem</dt>
          <dd className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
            {m < min / 100 && <TriangleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />}{pct(m)}
          </dd>
          <dd className={NOTA}>{margemEmPalavras(m, min, S.cfg.alvo)} · mínimo {min}%</dd>
        </div>
      </dl>
      {A.length > 0 && <div className="mt-5"><ListaAlertas A={A} /></div>}
      <details className="mt-4">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-medium text-muted-foreground hover:text-foreground">Mudar o ícone</summary>
        <div role="group" aria-label="Ícone do serviço" className="mt-2 flex flex-wrap gap-1.5">
          {ICONES_SERVICO.map((k) => (
            <button key={k} type="button" aria-pressed={icone === k} aria-label={`Ícone: ${k}`} title={k}
              onClick={() => { mudarCatalogo((kk) => { kk.icone = { ...(kk.icone ?? {}), [sid]: k }; }); anunciar(`Ícone mudado`); }}
              className={cn("grid h-11 w-11 place-items-center rounded-xl border", icone === k ? "border-primary bg-primary/10 text-primary" : "border-input bg-card text-muted-foreground hover:bg-muted")}>
              <IconeServico k={k} />
            </button>
          ))}
        </div>
      </details>

      {/* ---------------------------------------------------------- medida */}
      <Seccao id="med-t" titulo="Medida" desc="Em que unidade se vende e de onde vem a quantidade quando se faz a visita.">
        <Opcoes nome={`un-${sid}`} rotulo="Unidade" v={un} desativado={!s}
          opcoes={(UNIDADES_SERVICO as readonly string[]).includes(un) ? UNIDADES_SERVICO.map((k) => ({ k, t: k })) : [{ k: un, t: un }, ...UNIDADES_SERVICO.map((k) => ({ k, t: k }))]}
          onSet={(v) => { if (!s) return; run(() => { S.svc[sid].un = v; }); anunciar(`Unidade: ${v}`); }} />
        {!s && <p className={cn(NOTA, "mt-2")}>A unidade vem do Catálogo da Mudelar; muda-se depois de o serviço entrar em uso.</p>}
        <Opcoes nome={`med-${sid}`} rotulo="A quantidade vem de" v={medida} opcoes={ORIGENS_MEDIDA}
          onSet={(k) => editar((r) => { r.medida = k; }, `A quantidade vem de: ${ORIGENS_MEDIDA.find((o) => o.k === k)!.t.toLowerCase()}`, false)} />
        <p className="mt-4 flex items-start gap-2 text-[16px]" data-testid="exemplo-medida">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{exemploMedida(medida, un)}
        </p>
        {avisoMedida(medida, un) && <p className={cn(NOTA, "mt-2 flex items-start gap-2")}><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />{avisoMedida(medida, un)}</p>}
        {doModelo && doModelo !== medida && (
          <p className={cn(NOTA, "mt-2")}>No modelo do pacote, este serviço ainda conta por {ORIGENS_MEDIDA.find((o) => o.k === doModelo)!.t.toLowerCase()}: a escolha vale para quando se junta à visita.</p>
        )}
      </Seccao>

      {/* ---------------------------------------------------------- quem faz */}
      <Seccao id="mo-t" titulo="Quem faz" total={`${eur(c.mo)} €/${un}`} desc={`Os passos, o tipo de técnico e as horas por ${un}. O custo/hora vem do salário (Técnicos).`}>
        <ul className="mt-3 divide-y divide-border">
          {rec.mo.map((p) => {
            const pf = C.perfis.find((x) => x.id === p.perfil), eh = pf ? custoHoraPerfil(pf, C.par) : null;
            return (
              <li key={p.id} className="py-3">
                <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_8rem_auto]">
                  <label className="col-span-2 grid gap-1 sm:col-span-1"><span className={ROT}>Passo</span>
                    <TextoCelula rotulo="Passo" v={p.n} onSet={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.n = v; }, "Passo renomeado")} /></label>
                  <label className="col-span-2 grid gap-1 sm:col-span-1"><span className={ROT}>Tipo de técnico</span>
                    <Escolha rotulo={`Tipo de técnico de ${p.n}`} v={p.perfil} opcoes={C.perfis.map((x) => ({ v: x.id, t: x.n }))} onSet={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.perfil = v; }, "Técnico mudado")} /></label>
                  <label className="grid gap-1"><span className={ROT}>Horas por {un}</span>
                    <NumeroCelula rotulo={`Horas por ${un} de ${p.n}`} w="w-full" v={p.h} onSet={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.h = v; }, "Horas mudadas")} /></label>
                  <Retirar rotulo={`Retirar o passo ${p.n}`} onClick={() => editar((r) => { r.mo = r.mo.filter((x) => x.id !== p.id); }, `Passo ${p.n} retirado`)} />
                </div>
                <p className={cn(NOTA, "mt-2 tabular-nums")}>{pf?.n ?? "Técnico"} a {eur(eh ?? media)} €/h × {nfmt(p.h)} h = <span className="text-foreground">{eur(p.h * (eh ?? media))} €</span></p>
                {eh == null && <p className="mt-1 flex items-center gap-2 text-[15px]"><UserX className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Técnico sem custo/hora: usa a média dos técnicos ({eur(media)} €/h).</p>}
              </li>
            );
          })}
          {!rec.mo.length && <li className={cn(NOTA, "py-3")}>Sem passos: o serviço não tem mão de obra.</li>}
        </ul>
        <Button variant="outline" className="mt-2 min-h-11 text-[15px]" onClick={() => editar((r) => { r.mo.push({ id: nid("p", r.mo), n: "Novo passo", perfil: r.mo[0]?.perfil ?? C.perfis[0].id, h: 0.5 }); }, "Passo juntado")}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar passo
        </Button>
      </Seccao>

      {/* ---------------------------------------------------------- equipamentos */}
      <Seccao id="eq-t" titulo="Equipamentos" total={`${eur(c.eq)} €/${un}`} desc={`Horas de uso por ${un} × €/h do equipamento: (compra − valor residual) ÷ vida útil + manutenção do ano ÷ horas de uso do ano.`}>
        {rec.equip.length > 0 ? (
          <ul className="mt-3 divide-y divide-border">
            {rec.equip.map((u) => {
              const e = C.equip.find((x) => x.id === u.equip), q = e ? quebraEquip(e) : null;
              return (
                <li key={u.id} className="py-3">
                  <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                    <label className="col-span-2 grid gap-1 sm:col-span-1"><span className={ROT}>Equipamento</span>
                      <Escolha rotulo="Equipamento" v={u.equip} opcoes={C.equip.map((x) => ({ v: x.id, t: x.n }))} onSet={(v) => editar((r) => { r.equip.find((x) => x.id === u.id)!.equip = v; }, "Equipamento mudado")} /></label>
                    <label className="grid gap-1"><span className={ROT}>Horas por {un}</span>
                      <NumeroCelula rotulo={`Horas por ${un} de ${e?.n ?? "equipamento"}`} w="w-full" v={u.h} onSet={(v) => editar((r) => { r.equip.find((x) => x.id === u.id)!.h = v; }, "Horas de uso mudadas")} /></label>
                    <Retirar rotulo={`Retirar ${e?.n ?? "equipamento"}`} onClick={() => editar((r) => { r.equip = r.equip.filter((x) => x.id !== u.id); }, `${e?.n ?? "Equipamento"} retirado`)} />
                  </div>
                  {q && <p className={cn(NOTA, "mt-2 tabular-nums")}>{q.texto}</p>}
                  {q && <p className={cn(NOTA, "tabular-nums")}>{eur(q.total)} €/h × {nfmt(u.h)} h = <span className="text-foreground">{eur(q.total * u.h)} €</span></p>}
                </li>
              );
            })}
          </ul>
        ) : <p className={cn(NOTA, "mt-3")}>Não usa equipamento próprio, só ferramenta de mão.</p>}
        <label className="mt-3 grid max-w-md gap-1"><span className={ROT}>Juntar equipamento</span>
          <Escolha rotulo="Juntar equipamento" v="" opcoes={[{ v: "", t: "Escolher do Catálogo de equipamentos…" }, ...C.equip.filter((e) => !rec.equip.some((u) => u.equip === e.id)).map((e) => ({ v: e.id, t: `${e.n} · ${eur(quebraEquip(e).total)} €/h` }))]}
            onSet={(id) => { const e = C.equip.find((x) => x.id === id); if (e) editar((r) => { r.equip.push({ id: nid("e", r.equip), equip: e.id, h: 0.5 }); }, `${e.n} juntado`); }} />
        </label>
      </Seccao>

      {/* ---------------------------------------------------------- consumíveis */}
      <Seccao id="co-t" titulo="Consumíveis" total={`${eur(c.cons)} €/${un}`}
        desc={<>Quantidade por {un} × preço. Os <b className="font-medium text-foreground">opcionais</b> não entram no custo; liga-se na obra quando se usam. Ao fim de {C.par.mesesDesatualizado} meses o preço fica desatualizado.</>}>
        {rec.cons.length > 0 ? (
          <ul className="mt-3 divide-y divide-border">
            {rec.cons.map((x) => {
              const velho = velhos.has(x.id);
              return (
                <li key={x.id} className="py-3">
                  <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_auto]">
                    <label className="col-span-2 grid gap-1 sm:col-span-1"><span className={ROT}>Consumível</span>
                      <TextoCelula rotulo="Consumível" v={x.n} onSet={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.n = v; }, "Consumível renomeado")} /></label>
                    <label className="grid gap-1"><span className={ROT}>Por {un}</span>
                      <NumeroCelula rotulo={`Quantidade por ${un} de ${x.n}`} w="w-full" v={x.q} onSet={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.q = v; }, "Quantidade mudada")} /></label>
                    <label className="grid gap-1"><span className={ROT}>Unidade</span>
                      <Escolha rotulo={`Unidade de ${x.n}`} v={x.un} opcoes={["un", "kg", "m", "m²", "ml", "l", "kit", "tubo", "saco", "pç"].includes(x.un) ? ["un", "kg", "m", "m²", "ml", "l", "kit", "tubo", "saco", "pç"] : [x.un, "un", "kg", "m", "m²", "ml", "l", "kit", "tubo", "saco", "pç"]}
                        onSet={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.un = v; }, "Unidade mudada")} /></label>
                    <label className="grid gap-1"><span className={ROT}>Preço €</span>
                      <NumeroCelula rotulo={`Preço de ${x.n}`} w="w-full" v={x.preco} onSet={(v) => editar((r) => { const y = r.cons.find((z) => z.id === x.id)!; y.preco = v; y.data = HOJE; }, "Preço do consumível atualizado")} /></label>
                    <Retirar rotulo={`Retirar ${x.n}`} onClick={() => editar((r) => { r.cons = r.cons.filter((y) => y.id !== x.id); }, `${x.n} retirado`)} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className={cn(NOTA, "flex flex-wrap items-center gap-x-1.5 tabular-nums")}>
                      <span>{x.fornecedor} · preço de {dataPT(x.data)}</span>
                      {velho && <span className="inline-flex items-center gap-1 text-foreground"><Clock className="h-4 w-4 text-warning" aria-hidden="true" />desatualizado</span>}
                      <span>· {nfmt(x.q)} × {eur(x.preco)} € = <span className={x.opcional ? "" : "text-foreground"}>{eur(x.q * x.preco)} €</span>{x.opcional ? " (fora do custo)" : ""}</span>
                    </p>
                    <Interruptor on={!!x.opcional} rotulo={`Opcional: ${x.n}`} texto="Opcional"
                      onClick={() => editar((r) => { const y = r.cons.find((z) => z.id === x.id)!; y.opcional = !y.opcional || undefined; }, x.opcional ? `${x.n} entra no custo` : `${x.n} passa a opcional`)} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className={cn(NOTA, "mt-3")}>Sem consumíveis na receita.</p>}
        {c.consOpc > 0 && <p className="mt-2 text-[15px]" data-testid="opcionais">Se usar os opcionais: mais {eur(c.consOpc)} €/{un} ({eur(c.total + c.consOpc)} € de custo).</p>}
        <ProcurarProduto rotulo="Juntar da lista de produtos" margem={S.cfg.alvo} produtos={K.produtos.filter((p) => !rec.cons.some((x) => x.n === p.n))}
          onEscolher={(p) => editar((r) => { r.cons.push(consumivelDe(p, nid("c", r.cons), 1)); }, `${p.n} juntado`)} />
        <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => editar((r) => { r.cons.push({ id: nid("c", r.cons), n: "Novo consumível", q: 1, un: "un", preco: 1, fornecedor: "Por escolher", data: HOJE }); }, "Consumível juntado")}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar consumível à mão
        </Button>
      </Seccao>

      {/* ---------------------------------------------------------- produtos ligados */}
      <Seccao id="pr-lig-t" titulo="Produtos ligados" desc="Os produtos que, escolhidos na visita, trazem este serviço; e se a visita obriga a escolher um.">
        {ligados.length ? (
          <ul className="mt-3 divide-y divide-border">
            {ligados.map((p) => (
              <li key={p.id} className="flex min-h-16 items-center gap-3 py-2">
                <Ilustracao k={p.img ?? "generico"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{p.n}</span>
                  <span className={cn(NOTA, "block")}>{[p.marca, p.sku].filter(Boolean).join(" · ")}{p.marca || p.sku ? " · " : ""}1 {p.un} traz {nfmt(p.fatorServico ?? 1)} {un}</span>
                </span>
                <span className="shrink-0 text-[15px] tabular-nums">{eur(precoProduto(p, S.cfg.alvo))} €</span>
                <Retirar rotulo={`Desligar ${p.n}`} onClick={() => { mudarCatalogo((k) => { const y = k.produtos.find((z) => z.id === p.id); if (y) { delete y.servico; delete y.fatorServico; } }); anunciar(`${p.n} já não traz este serviço`); }} />
              </li>
            ))}
          </ul>
        ) : <p className={cn(NOTA, "mt-3")}>Nenhum produto traz este serviço.</p>}
        <ProcurarProduto rotulo="Ligar um produto" margem={S.cfg.alvo} produtos={K.produtos.filter((p) => p.servico !== sid)}
          onEscolher={(p) => { mudarCatalogo((k) => { const y = k.produtos.find((z) => z.id === p.id); if (y) { y.servico = sid; y.fatorServico = 1; } }); anunciar(`${p.n} passa a trazer este serviço`); }} />

        <h3 className="mt-6 text-base font-semibold">Na visita</h3>
        <label className="mt-2 grid max-w-md gap-1"><span className={ROT}>Obriga a escolher um produto de</span>
          <Escolha rotulo="Obriga a escolher um produto de" v={ramo ?? ""} opcoes={[{ v: "", t: "Não obriga (serviço sem produto)" }, ...opcoesArvore(K.arvore)]}
            onSet={(v) => { mudarCatalogo((k) => { k.exigeProduto ??= {}; k.qtdDe ??= {}; if (v) { k.exigeProduto[sid] = v; k.qtdDe[sid] ??= { k: "fixo", q: 1 }; } else delete k.exigeProduto[sid]; }); anunciar(v ? `Obriga a escolher produto de ${caminho(K.arvore, v)}` : "Já não obriga a produto"); }} />
        </label>
        {ramo && (
          <>
            <label className="mt-3 grid max-w-md gap-1"><span className={ROT}>Pergunta antes</span>
              <Escolha rotulo="Pergunta antes de obrigar ao produto" v={K.perguntaManter?.[sid] ?? ""}
                opcoes={[{ v: "", t: "Sem pergunta (obriga sempre)" }, ...perguntasPossiveis(K.perguntaManter?.[sid], ramoNome).map((t) => ({ v: t, t }))]}
                onSet={(v) => { mudarCatalogo((k) => { k.perguntaManter ??= {}; if (v) k.perguntaManter[sid] = v; else delete k.perguntaManter[sid]; }); anunciar(v ? `Pergunta: ${v}` : "Sem pergunta"); }} />
            </label>
            <label className="mt-3 grid max-w-md gap-1"><span className={ROT}>Quantidade do produto</span>
              <Escolha rotulo="Quantidade do produto" v={regraAtual ? chaveRegra(regraAtual) : chaveRegra(REGRAS_QTD[0].r)} opcoes={regras.map((x) => ({ v: chaveRegra(x.r), t: x.t }))}
                onSet={(v) => { const r = regras.find((x) => chaveRegra(x.r) === v); if (r) { mudarCatalogo((k) => { k.qtdDe ??= {}; k.qtdDe[sid] = r.r; }); anunciar(`Quantidade: ${r.t}`); } }} />
            </label>
            <p className={cn(NOTA, "mt-2")}>Com «Sim» à pergunta não é preciso produto; com «Não» (ou sem pergunta) a visita só fecha com um produto de {caminho(K.arvore, ramo)}.</p>
          </>
        )}
      </Seccao>

      {/* ---------------------------------------------------------- custo e preço */}
      <Seccao id="cp-t" titulo="Custo e preço" total={`${eur(c.total)} €/${un}`}>
        {c.total > 0 && (
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {partes.map((p, i) => <span key={p.n} className={TONS[i]} style={{ width: `${(p.v / c.total) * 100}%` }} />)}
          </div>
        )}
        <table className="mt-3 w-full border-collapse text-[15px]">
          <caption className="sr-only">O custo por {un}, por partes</caption>
          <tbody>
            {partes.map((p, i) => (
              <tr key={p.n} className="border-b border-border">
                <th scope="row" className="py-2 text-left font-normal"><span className="inline-flex items-center gap-2"><i className={cn("h-2.5 w-2.5 rounded-full", TONS[i])} aria-hidden="true" />{p.n}</span>
                  {p.n === "Estrutura" && <span className={cn(NOTA, "block")}>{nfmt(c.h)} h × {eur(taxaEstrutura(C))} €/h</span>}</th>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{c.total > 0 ? pct(p.v / c.total) : "—"}</td>
                <td className="w-28 py-2 text-right tabular-nums">{eur(p.v)} €</td>
              </tr>
            ))}
            <tr><th scope="row" className="py-2 text-left font-semibold">Custo por {un}</th><td /><td className="py-2 text-right font-semibold tabular-nums">{eur(c.total)} €</td></tr>
          </tbody>
        </table>

        <Opcoes nome={`modo-${sid}`} rotulo="Como se chega ao preço" v={modo} opcoes={[{ k: "tabela" as ModoPreco, t: "Tabela" }, { k: "margem" as ModoPreco, t: "Custo + margem" }]}
          onSet={(v) => { setModo(v); if (v === "tabela") setTabela(String(r2(preco)).replace(".", ",")); }} />
        <div className="mt-4 flex flex-wrap items-end gap-4">
          {modo === "tabela" ? (
            <label className="grid gap-1.5">
              <span className={ROT}>Preço de tabela (€/{un})</span>
              <input type="text" inputMode="decimal" value={tabela} onChange={(e) => setTabela(e.target.value)} className="h-11 w-36 rounded-lg border border-input bg-card px-3 text-right text-[15px] tabular-nums outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
            </label>
          ) : (
            <div>
              <span className={ROT} id={`mg-${sid}`}>Margem sobre o preço</span>
              <div role="group" aria-labelledby={`mg-${sid}`} className="mt-1.5 inline-flex items-center rounded-lg border border-input bg-card p-0.5">
                <button type="button" aria-label="Menos" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => setMargem((x) => Math.max(0, x - 1))}>−</button>
                <output className="w-16 text-center text-[16px] font-medium tabular-nums">{margem}%</output>
                <button type="button" aria-label="Mais" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => setMargem((x) => Math.min(90, x + 1))}>+</button>
              </div>
            </div>
          )}
          <p className="min-h-11 text-[15px] text-muted-foreground" aria-live="polite">
            {!isNaN(novoPreco) && novoPreco > 0 ? <>Fica {eur(novoPreco)} €/{un} · margem {pct(margemSobrePreco(novoPreco, c.total))}</> : "Escreva um preço."}
          </p>
        </div>
        <Button size="lg" className="mt-4 min-h-11 w-full text-[15px] sm:w-auto" disabled={!mudou} onClick={guardarPreco}>Guardar o preço</Button>

        {(A.some((a) => a.id === "justificacao") || rec.justificacao) && (
          <label className="mt-6 grid max-w-md gap-1.5">
            <span className={ROT}>Porquê abaixo da margem-alvo?</span>
            <Escolha rotulo="Justificação da margem" v={rec.justificacao ?? ""} opcoes={[{ v: "", t: "Escolher…" }, ...JUSTIFICACOES]}
              onSet={(v) => editar((r) => { r.justificacao = v || undefined; }, v ? "Justificação registada" : "Justificação retirada", false)} />
          </label>
        )}

        <h3 className="mt-8 text-base font-semibold">Histórico de preços</h3>
        {rec.hist.length ? (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {rec.hist.map((h, i) => (
              <li key={i} className="flex min-h-11 items-center justify-between gap-3 py-2 text-[15px]">
                <span><span className="tabular-nums">{dataPT(h.data)}</span><span className="text-muted-foreground"> · {h.nota}</span></span>
                <span className="tabular-nums">{eur(h.preco)} €/{un}</span>
              </li>
            ))}
          </ul>
        ) : <p className={cn(NOTA, "mt-2")}>Ainda sem preço guardado: o preço sai do custo + {rec.margem}% de margem.</p>}
        <p className={cn(NOTA, "mt-3")}>Exemplo: o que se muda nesta ficha dura até recarregar a página.</p>
      </Seccao>
    </article>
  );
}
