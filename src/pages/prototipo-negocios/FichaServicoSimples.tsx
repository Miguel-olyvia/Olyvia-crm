// A ficha do serviço no V1 (14/10/2026): uma página (não um modal), com "Voltar ao Catálogo".
// Uma coisa de cada vez: cabeçalho, Medida, Quem faz, Equipamentos, Consumíveis, Produtos ligados, Entulho
// e Custo e preço. As contas são as da V2 (v2/custosModelo.ts) e cada mudança passa para S.svc
// (aplicarTodos), por isso o orçamento usa o mesmo custo. Um só botão primário: "Guardar o preço".
// Revisto a 14/10 (pedido do Ruben): sem <select> nativos (segmentos para poucas opções, seletor com pesquisa
// para muitas, pecasFicha.tsx); equipamentos e consumíveis numa linha limpa cada um, com a conta numa só linha
// e o total do bloco; e a secção "Entulho" (se gera, de onde vem e a conta, entulho.ts e entulhoPadrao.ts).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Clock, Info, Package, Plus, TriangleAlert, UserX, Waypoints, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { itemCatalogo } from "./catalogo";
import { eur, nfmt, pct, r2, type Estado, type SvcId } from "./motor";
import {
  HOJE, JUSTIFICACOES, aplicarTodos, alertasServico, consumiveisDesatualizados, custoHoraPerfil, custoReceita, dataPT, margemSobrePreco,
  mediaHora, minimoServico, precoReceita, receitaDe, taxaEstrutura, type Custos, type ModoPreco, type ReceitaV2,
} from "./v2/custosModelo";
import { lerCustos, mudarCustos } from "./v2/custosStore";
import { caminho, consumivelDe, noDoServico, opcoesArvore, textoRegra, type Produto, type Regra } from "./v2/catalogoModelo";
import { mudarCatalogo, useCatalogo } from "./v2/catalogoStore";
import { ListaAlertas, Retirar } from "./v2/pecasCustos";
import { ICONES_SERVICO, IconeServico, Ilustracao } from "./ilustracoes";
import {
  ORIGENS_MEDIDA, REGRAS_QTD, UNIDADES_SERVICO, avisoMedida, chaveRegra, custoComOpcionais, entulhoFicha, exemploMedida, iconeDoServico, margemEmPalavras, medidaDe,
  medidaDoModelo, partesCusto, perguntasPossiveis, precoProduto, produtosQueTrazem, quebraEquip,
} from "./fichaServico";
import { ARTIGOS_DEM0, vSoltoDe, type ModoEntulho } from "./entulho";
import { entulhoDoProduto, m3PadraoDoNome, tipoDoTexto } from "./entulhoPadrao";
import { GatilhoCampo, NomeInline, NumeroInline, Segmentos, SeletorPesquisa } from "./pecasFicha";
import { normal } from "./catalogo";
import { FASES_OBRA, fasesDoServico, fasesPadrao, type FaseObra } from "./fasesObra";

const CARTAO = "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-6";
const ROT = "text-[15px] font-medium";
const NOTA = "text-[15px] text-muted-foreground";
const NOVA = "animate-in fade-in-0 slide-in-from-top-1 duration-200";
/** As partes do custo: cinzentos do mais escuro ao mais claro (a cor fica para o acento). */
const TONS = ["bg-foreground/75", "bg-foreground/50", "bg-foreground/30", "bg-foreground/15"];
const UNS_CONS = ["un", "kg", "m", "m²", "ml", "l", "kit", "tubo", "saco", "pç"];
const m3t = (x: number) => String(Math.round(x * 1000) / 1000).replace(".", ",");

function Seccao({ id, titulo, total, desc, children }: { id: string; titulo: string; total?: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn(CARTAO, "mt-6")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="text-xl font-semibold tracking-tight">{titulo}</h2>
        {total != null && <span className="text-[16px] font-medium tabular-nums" data-testid={`total-${id}`}>{total}</span>}
      </div>
      {desc && <p className={cn(NOTA, "mt-1")}>{desc}</p>}
      {children}
    </section>
  );
}

/** Escolha em botões (rádio), alvos de 44 px. */
function Opcoes<T extends string | null>({ nome, rotulo, v, opcoes, onSet, desativado }: {
  nome: string; rotulo: string; v: T; opcoes: { k: T; t: string }[]; onSet: (k: T) => void; desativado?: boolean;
}) {
  return (
    <fieldset className="mt-4" disabled={desativado}>
      <legend className={ROT}>{rotulo}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <label key={String(o.k)} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-[15px] transition-colors focus-within:ring-2 focus-within:ring-primary/30",
            v === o.k ? "border-primary bg-primary/10 font-medium" : "border-input bg-card hover:bg-muted", desativado && "cursor-not-allowed opacity-60")}>
            <input type="radio" name={nome} checked={v === o.k} onChange={() => onSet(o.k)} className="sr-only" />{o.t}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** O botão discreto que abre um seletor ("+ Juntar equipamento"). */
const Juntar = ({ t }: { t: string }) => <span className="inline-flex items-center gap-1.5 px-1 font-medium text-primary"><Plus className="h-4 w-4" aria-hidden="true" />{t}</span>;

type PropsFicha = {
  S: Estado; C: Custos; run: (fn: () => void) => void; sid: SvcId; voltar: () => void; anunciar: (msg: string) => void;
  /** Abre o mapa das ligações (separador Ligações) centrado num serviço ou produto. Sem ele, não há o botão. */
  verLigacoes?: (r: { t: "svc" | "prod"; id: string }) => void;
};

/** A ficha; sem receita (serviço que não está em uso nem no Catálogo) mostra só o aviso e o "Voltar". */
export function FichaServicoSimples(p: PropsFicha) {
  if (receitaDe(p.C, p.sid, p.S.svc[p.sid] ?? null, p.S.cfg.alvo)) return <Ficha {...p} />;
  return (
    <article aria-labelledby="ficha-t">
      <button type="button" onClick={p.voltar} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-[15px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />Voltar ao Catálogo
      </button>
      <h1 id="ficha-t" className="mt-3 text-3xl font-semibold tracking-tight">Serviço sem ficha</h1>
      <p className={cn(NOTA, "mt-2")}>Este serviço ({p.sid}) já não está no Catálogo.</p>
    </article>
  );
}

const MODOS: { k: ModoEntulho; t: string; d: string }[] = [
  { k: "nao", t: "Não gera", d: "Não entra na conta do entulho." },
  { k: "artigo", t: "Do artigo de demolição", d: "Horas, m³ e peso do artigo (fórmula da Mudelar)." },
  { k: "produto", t: "Do produto que sai", d: "O m³ do produto trocado na visita × a quantidade." },
  { k: "m3", t: "m³ por unidade", d: "Um volume fixo por unidade do serviço." },
];

function Ficha({ S, C, run, sid, voltar, anunciar, verLigacoes }: PropsFicha) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const K = useCatalogo();
  useEffect(() => { titulo.current?.focus(); }, [sid]);
  const s = S.svc[sid] ?? null, cat = itemCatalogo(sid);
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
  // a última linha juntada (para a animação curta)
  const [nova, setNova] = useState<string | null>(null);

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
  const partes = partesCusto(c, S.cfg.estrutura);
  const regraAtual = K.qtdDe?.[sid];
  const regras: { t: string; r: Regra }[] = regraAtual && !REGRAS_QTD.some((x) => chaveRegra(x.r) === chaveRegra(regraAtual)) ? [...REGRAS_QTD, { t: textoRegra(regraAtual), r: regraAtual }] : REGRAS_QTD;
  const ramo = K.exigeProduto?.[sid];
  const ramoNome = ramo ? (K.arvore.find((x) => x.id === ramo)?.n ?? "") : "";
  const ent = entulhoFicha(K, sid, nome, un, medida);
  const artigos = (K.artigosDem ?? ARTIGOS_DEM0).filter((a) => a.ativo);

  /** Muda de onde vem o entulho: o artigo de demolição só fica no modo "artigo". */
  const mudarEntulho = (mo: ModoEntulho) => {
    mudarCatalogo((k) => {
      k.entulhoServico ??= {};
      if (mo === "artigo") {
        k.artigoDoServico ??= {};
        const t = tipoDoTexto(nome);
        k.artigoDoServico[sid] ??= (artigos.find((a) => t && normal(a.descricao).includes(normal(t.nome))) ?? artigos[0])?.codigo;
        k.entulhoServico[sid] = { modo: "artigo" };
        return;
      }
      if (k.artigoDoServico) delete k.artigoDoServico[sid];
      const antes = k.entulhoServico[sid];
      k.entulhoServico[sid] = mo === "m3" ? { modo: "m3", ...(antes?.m3 ? { m3: antes.m3, ...(antes.kg != null ? { kg: antes.kg } : {}) } : m3PadraoDoNome(nome)) } : { modo: mo };
    });
    anunciar(`Entulho: ${MODOS.find((x) => x.k === mo)!.t.toLowerCase()}`);
  };
  // as fases da obra (14/10): várias podem estar ligadas; sem escolha guardada, as das regras
  const fasesGuardadas = K.fasesServico?.[sid];
  const fases = fasesDoServico(K, sid, nome, oficio), sugeridas = fasesPadrao(nome, oficio);
  const [avisoFase, setAvisoFase] = useState(false);
  const mudarFase = (f: FaseObra) => {
    const ligada = fases.includes(f);
    if (ligada && fases.length === 1) { setAvisoFase(true); anunciar("Pelo menos uma fase fica ligada"); return; }
    setAvisoFase(false);
    const novas = (ligada ? fases.filter((x) => x !== f) : [...fases, f]).sort((a, b) => a - b);
    mudarCatalogo((k) => { k.fasesServico = { ...(k.fasesServico ?? {}), [sid]: novas }; });
    anunciar(`Fases: ${novas.join(", ")}`);
  };
  const reporFases = () => { setAvisoFase(false); mudarCatalogo((k) => { if (k.fasesServico) delete k.fasesServico[sid]; }); anunciar("Fases repostas: a sugestão pelo nome do serviço"); };
  const fasesMudadas = !!fasesGuardadas?.length && fasesGuardadas.slice().sort((a, b) => a - b).join() !== sugeridas.join();
  const totalEntulho = ent.e.modo === "nao" || !ent.conta ? "não gera" : `${m3t(ent.conta.m3 / (ent.q || 1))} m³/${un}`;

  return (
    <article aria-labelledby="ficha-t">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-[15px] font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />Voltar ao Catálogo
        </button>
        {verLigacoes && (
          <button type="button" onClick={() => verLigacoes({ t: "svc", id: sid })} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-medium text-muted-foreground hover:text-foreground">
            <Waypoints className="h-5 w-5" aria-hidden="true" />Ver ligações
          </button>
        )}
      </div>

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

      {/* ---------------------------------------------------------- fases da obra */}
      <Seccao id="fa-t" titulo="Fases da obra" desc="Em que fases da obra este serviço acontece. Pode ser mais do que uma.">
        <div role="group" aria-labelledby="fa-t" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FASES_OBRA.map((f) => {
            const on = fases.includes(f.n);
            return (
              <button key={f.n} type="button" aria-pressed={on} title={f.nome} onClick={() => mudarFase(f.n)}
                className={cn("flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  on ? "border-primary bg-primary/[0.06]" : "border-input bg-card hover:bg-muted/60")}>
                <span className={cn("text-[14px] tabular-nums", on ? "text-primary" : "text-muted-foreground")}>Fase {f.n}</span>
                <span className={cn("text-[15px] leading-snug", on && "font-medium")}>{f.curto}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-x-4" aria-live="polite">
          {avisoFase ? <p className="flex items-center gap-2 text-[15px]"><TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Pelo menos uma fase fica ligada: o serviço tem de acontecer em alguma fase da obra.</p>
            : !fasesGuardadas?.length ? <p className={cn(NOTA, "text-[14px]")} data-testid="fases-sugeridas">Sugerido pelo nome do serviço.</p> : <span />}
          {fasesMudadas && (
            <button type="button" onClick={reporFases} className="inline-flex min-h-11 items-center px-1 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Repor a sugestão</button>
          )}
        </div>
      </Seccao>

      {/* ---------------------------------------------------------- quem faz */}
      <Seccao id="mo-t" titulo="Quem faz" total={`${eur(c.mo)} €/${un}`} desc={`Os passos, o tipo de técnico e as horas por ${un}. O custo/hora vem do salário (Técnicos).`}>
        <ul className="mt-3 divide-y divide-border">
          {rec.mo.map((p) => {
            const pf = C.perfis.find((x) => x.id === p.perfil), eh = pf ? custoHoraPerfil(pf, C.par) : null;
            return (
              <li key={p.id} className={cn("py-3", nova === p.id && NOVA)}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="min-w-0 flex-[1_1_12rem]"><NomeInline rotulo="Passo" v={p.n} onSet={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.n = v; }, "Passo renomeado")} /></span>
                  <SeletorPesquisa rotulo={`Tipo de técnico de ${p.n}`} atual={p.perfil} className="w-full sm:w-60"
                    gatilho={<GatilhoCampo>{pf?.n ?? "Escolher técnico"}</GatilhoCampo>}
                    opcoes={C.perfis.map((x) => { const h = custoHoraPerfil(x, C.par); return { v: x.id, t: x.n, valor: h == null ? "sem salário" : `${eur(h)} €/h` }; })}
                    onEscolher={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.perfil = v; }, "Técnico mudado")} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className={cn(NOTA, "flex flex-wrap items-center gap-x-1.5 tabular-nums")}>
                    <span>{eur(eh ?? media)} €/h ×</span>
                    <NumeroInline rotulo={`Horas por ${un} de ${p.n}`} v={p.h} onSet={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.h = v; }, "Horas mudadas")} />
                    <span>h/{un} =</span><span className="font-medium text-foreground">{eur(p.h * (eh ?? media))} €/{un}</span>
                  </p>
                  <Retirar rotulo={`Retirar o passo ${p.n}`} onClick={() => editar((r) => { r.mo = r.mo.filter((x) => x.id !== p.id); }, `Passo ${p.n} retirado`)} />
                </div>
                {eh == null && <p className="mt-1 flex items-center gap-2 text-[15px]"><UserX className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Técnico sem custo/hora: usa a média dos técnicos ({eur(media)} €/h).</p>}
              </li>
            );
          })}
          {!rec.mo.length && <li className={cn(NOTA, "py-3")}>Sem passos: o serviço não tem mão de obra.</li>}
        </ul>
        <button type="button" className="mt-1 inline-flex min-h-11 items-center rounded-lg text-[15px]" onClick={() => { const id = nid("p", rec.mo); setNova(id); editar((r) => { r.mo.push({ id, n: "Novo passo", perfil: r.mo[0]?.perfil ?? C.perfis[0].id, h: 0.5 }); }, "Passo juntado"); }}>
          <Juntar t="Juntar passo" />
        </button>
      </Seccao>

      {/* ---------------------------------------------------------- equipamentos */}
      <Seccao id="eq-t" titulo="Equipamentos" total={`${eur(c.eq)} €/${un}`} desc={`Horas de uso por ${un} × €/h do equipamento.`}>
        {rec.equip.length > 0 ? (
          <ul className="mt-3 divide-y divide-border" aria-label="Equipamentos do serviço">
            {rec.equip.map((u) => {
              const e = C.equip.find((x) => x.id === u.equip), q = e ? quebraEquip(e) : null;
              return (
                <li key={u.id} className={cn("py-2.5", nova === u.id && NOVA)}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:grid md:grid-cols-[1.25rem_minmax(0,1fr)_19rem_5.75rem]">
                    <Wrench className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-[1_1_10rem] px-1.5 text-[15px]">{e?.n ?? "Equipamento retirado"}</span>
                    <span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[15px] tabular-nums text-muted-foreground">
                      {q && <span>{eur(q.total)} €/h ×</span>}
                      <NumeroInline w="w-14" rotulo={`Horas por ${un} de ${e?.n ?? "equipamento"}`} v={u.h} onSet={(v) => editar((r) => { r.equip.find((x) => x.id === u.id)!.h = v; }, "Horas de uso mudadas")} />
                      <span>h/{un} =</span>
                      <span className="text-right font-medium md:min-w-[5rem] text-foreground">{eur((q?.total ?? 0) * u.h)} €/{un}</span>
                    </span>
                    <span className="ml-auto flex justify-end md:ml-0"><Retirar rotulo={`Retirar ${e?.n ?? "equipamento"}`} onClick={() => editar((r) => { r.equip = r.equip.filter((x) => x.id !== u.id); }, `${e?.n ?? "Equipamento"} retirado`)} /></span>
                  </div>
                  {q && (
                    <details className="ml-8">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center text-[14px] text-muted-foreground hover:text-foreground sm:min-h-8">De onde vem o €/h</summary>
                      <p className="pb-1 text-[14px] tabular-nums text-muted-foreground">{q.texto} (compra − valor residual) ÷ vida útil + manutenção ÷ horas de uso por ano</p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className={cn(NOTA, "mt-3")}>Não usa equipamento próprio, só ferramenta de mão.</p>}
        <SeletorPesquisa rotulo="Juntar equipamento" gatilho={<Juntar t="Juntar equipamento" />} className="mt-1" placeholder="Nome do equipamento"
          opcoes={C.equip.filter((e) => !rec.equip.some((u) => u.equip === e.id)).map((e) => ({ v: e.id, t: e.n, valor: `${eur(quebraEquip(e).total)} €/h`, icone: <Wrench className="h-5 w-5" /> }))}
          onEscolher={(id) => { const e = C.equip.find((x) => x.id === id); if (!e) return; const nId = nid("e", rec.equip); setNova(nId); editar((r) => { r.equip.push({ id: nId, equip: e.id, h: 0.5 }); }, `${e.n} juntado`); }} />
      </Seccao>

      {/* ---------------------------------------------------------- consumíveis */}
      <Seccao id="co-t" titulo="Consumíveis" total={`${eur(c.cons)} €/${un}`}
        desc={<>Quantidade por {un} × preço. Os <b className="font-medium text-foreground">opcionais</b> ficam fora do custo; liga-se na obra quando se usam.</>}>
        {rec.cons.length > 0 ? (
          <>
          <div className="mt-3 hidden gap-x-3 text-[14px] text-muted-foreground md:grid md:grid-cols-[1.25rem_minmax(0,1fr)_19rem_5.75rem]" aria-hidden="true">
            <span /><span className="px-1.5">Consumível</span><span className="text-right">Por {un} × preço</span><span className="pl-1">Opcional</span>
          </div>
          <ul className="mt-1 divide-y divide-border" aria-label="Consumíveis do serviço">
            {rec.cons.map((x) => {
              const velho = velhos.has(x.id);
              return (
                <li key={x.id} className={cn("py-2.5", nova === x.id && NOVA)}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:grid md:grid-cols-[1.25rem_minmax(0,1fr)_19rem_5.75rem]">
                    <Package className={cn("h-5 w-5 shrink-0 text-muted-foreground", x.opcional && "opacity-50")} aria-hidden="true" />
                    <span className={cn("min-w-0 flex-[1_1_10rem]", x.opcional && "opacity-60")}>
                      <NomeInline rotulo="Consumível" v={x.n} onSet={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.n = v; }, "Consumível renomeado")} />
                      <span className="-mt-1.5 block px-1.5 text-[14px] text-muted-foreground">{x.fornecedor}</span>
                    </span>
                    <span className={cn("flex items-center justify-end gap-1.5 whitespace-nowrap text-[15px] tabular-nums text-muted-foreground", x.opcional && "opacity-60")}>
                      <NumeroInline w="w-14" rotulo={`Quantidade por ${un} de ${x.n}`} v={x.q} onSet={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.q = v; }, "Quantidade mudada")} />
                      <SeletorPesquisa rotulo={`Unidade de ${x.n}`} atual={x.un} className="px-1 text-muted-foreground"
                        gatilho={<span className="underline decoration-dotted underline-offset-4">{x.un}</span>}
                        opcoes={(UNS_CONS.includes(x.un) ? UNS_CONS : [x.un, ...UNS_CONS]).map((u) => ({ v: u, t: u }))}
                        onEscolher={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.un = v; }, "Unidade mudada")} />
                      <span>×</span>
                      <NumeroInline rotulo={`Preço de ${x.n}`} w="w-16" v={x.preco} onSet={(v) => editar((r) => { const y = r.cons.find((z) => z.id === x.id)!; y.preco = v; y.data = HOJE; }, "Preço do consumível atualizado")} />
                      <span>€ =</span>
                      <span className={cn("text-right font-medium md:min-w-[5rem]", x.opcional ? "text-muted-foreground line-through decoration-1" : "text-foreground")}>{eur(x.q * x.preco)} €/{un}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-0.5 md:col-start-4 md:row-start-1 md:ml-0">
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-[14px] text-muted-foreground">
                        <Switch checked={!!x.opcional} aria-label={`Opcional: ${x.n}`} title="Opcional (fora do custo)"
                          onCheckedChange={() => editar((r) => { const y = r.cons.find((z) => z.id === x.id)!; y.opcional = !y.opcional || undefined; }, x.opcional ? `${x.n} entra no custo` : `${x.n} passa a opcional`)} />
                        <span aria-hidden="true" className="md:sr-only">Opcional</span>
                      </label>
                      <Retirar rotulo={`Retirar ${x.n}`} onClick={() => editar((r) => { r.cons = r.cons.filter((y) => y.id !== x.id); }, `${x.n} retirado`)} />
                    </span>
                  </div>
                  {(x.opcional || velho) && (
                    <p className="ml-8 flex flex-wrap gap-x-3 text-[14px] text-muted-foreground">
                      {x.opcional && <span>fora do custo</span>}
                      {velho && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-warning" aria-hidden="true" />preço de {dataPT(x.data)}, desatualizado</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          </>
        ) : <p className={cn(NOTA, "mt-3")}>Sem consumíveis na receita.</p>}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
          <span className="flex flex-wrap items-center gap-x-4">
            <SeletorPesquisa rotulo="Juntar consumível" gatilho={<Juntar t="Juntar consumível" />} placeholder="Nome, marca ou referência"
              opcoes={K.produtos.filter((p) => !rec.cons.some((x) => x.n === p.n)).map((p) => ({ v: p.id, t: p.n, sub: [p.marca, p.sku].filter(Boolean).join(" · ") || p.fornecedor, procura: `${p.sku ?? ""} ${p.sub ?? ""}`, valor: `${eur(p.custo)} €/${p.un}`, icone: <Ilustracao k={p.img ?? "generico"} className="h-9 w-9" /> }))}
              onEscolher={(id) => { const p = K.produtos.find((y) => y.id === id); if (!p) return; const nId = nid("c", rec.cons); setNova(nId); editar((r) => { r.cons.push(consumivelDe(p, nId, 1)); }, `${p.n} juntado`); }} />
            <button type="button" className="inline-flex min-h-11 items-center px-1 text-[15px] text-muted-foreground hover:text-foreground"
              onClick={() => { const nId = nid("c", rec.cons); setNova(nId); editar((r) => { r.cons.push({ id: nId, n: "Novo consumível", q: 1, un: "un", preco: 1, fornecedor: "Por escolher", data: HOJE }); }, "Consumível juntado"); }}>
              ou escrever à mão
            </button>
          </span>
          <span className="text-[15px] tabular-nums">Total <b className="font-semibold">{eur(c.cons)} €/{un}</b></span>
        </div>
        {c.consOpc > 0 && <p className={cn(NOTA, "mt-1 text-right")} data-testid="opcionais">Com os opcionais: mais {eur(c.consOpc)} €/{un} ({eur(custoComOpcionais(c))} € de custo).</p>}
      </Seccao>

      {/* ---------------------------------------------------------- produtos ligados */}
      <Seccao id="pr-lig-t" titulo="Produtos ligados" desc="Os produtos que, escolhidos na visita, trazem este serviço; e se a visita obriga a escolher um.">
        {ligados.length ? (
          <ul className="mt-3 divide-y divide-border">
            {ligados.slice(0, 12).map((p) => (
              <li key={p.id} className="flex min-h-14 items-center gap-3 py-1.5">
                <Ilustracao k={p.img ?? "generico"} className="h-10 w-10" />
                <span className="min-w-0 flex-1">
                  {verLigacoes
                    ? <button type="button" onClick={() => verLigacoes({ t: "prod", id: p.id })} aria-label={`${p.n}: ver ligações`} className="block min-h-11 text-left text-[15px] font-medium text-primary underline-offset-4 hover:underline sm:min-h-0">{p.n}</button>
                    : <span className="block text-[15px]">{p.n}</span>}
                  <span className={cn(NOTA, "block text-[14px]")}>{[p.marca, p.sku].filter(Boolean).join(" · ")}{p.marca || p.sku ? " · " : ""}1 {p.un} traz {nfmt(p.fatorServico ?? 1)} {un}</span>
                </span>
                <span className="shrink-0 text-[15px] tabular-nums">{eur(precoProduto(p, S.cfg.alvo))} €</span>
                <Retirar rotulo={`Desligar ${p.n}`} onClick={() => { mudarCatalogo((k) => { const y = k.produtos.find((z) => z.id === p.id); if (y) { delete y.servico; delete y.fatorServico; } }); anunciar(`${p.n} já não traz este serviço`); }} />
              </li>
            ))}
            {ligados.length > 12 && <li className={cn(NOTA, "py-2")}>E mais {ligados.length - 12} (ver em Ligações).</li>}
          </ul>
        ) : <p className={cn(NOTA, "mt-3")}>Nenhum produto traz este serviço.</p>}
        <SeletorPesquisa rotulo="Ligar um produto" gatilho={<Juntar t="Ligar um produto" />} placeholder="Nome, marca ou referência"
          opcoes={K.produtos.filter((p) => p.servico !== sid).map((p) => ({ v: p.id, t: p.n, sub: [p.marca, p.sku].filter(Boolean).join(" · ") || p.fornecedor, procura: `${p.sku ?? ""} ${p.sub ?? ""}`, valor: `${eur(precoProduto(p, S.cfg.alvo))} €`, icone: <Ilustracao k={p.img ?? "generico"} className="h-9 w-9" /> }))}
          onEscolher={(id) => { const p = K.produtos.find((y) => y.id === id); if (!p) return; mudarCatalogo((k) => { const y = k.produtos.find((z) => z.id === id); if (y) { y.servico = sid; y.fatorServico = 1; } }); anunciar(`${p.n} passa a trazer este serviço`); }} />

        <h3 className="mt-6 text-base font-semibold">Na visita</h3>
        <div className="mt-2 grid max-w-md gap-1">
          <span className={ROT} id={`ramo-${sid}`}>Obriga a escolher um produto de</span>
          <SeletorPesquisa rotulo="Obriga a escolher um produto de" atual={ramo ?? ""} className="w-full" placeholder="Ofício ou sub"
            gatilho={<GatilhoCampo>{ramo ? caminho(K.arvore, ramo) : "Não obriga (serviço sem produto)"}</GatilhoCampo>}
            max={60} opcoes={[{ v: "", t: "Não obriga (serviço sem produto)" }, ...opcoesArvore(K.arvore)]}
            onEscolher={(v) => { mudarCatalogo((k) => { k.exigeProduto ??= {}; k.qtdDe ??= {}; if (v) { k.exigeProduto[sid] = v; k.qtdDe[sid] ??= { k: "fixo", q: 1 }; } else delete k.exigeProduto[sid]; }); anunciar(v ? `Obriga a escolher produto de ${caminho(K.arvore, v)}` : "Já não obriga a produto"); }} />
        </div>
        {ramo && (
          <>
            <Segmentos nome={`perg-${sid}`} rotulo="Pergunta antes" v={K.perguntaManter?.[sid] ?? ""}
              opcoes={[{ k: "", t: "Sem pergunta (obriga sempre)" }, ...perguntasPossiveis(K.perguntaManter?.[sid], ramoNome).map((t) => ({ k: t, t }))]}
              onSet={(v) => { mudarCatalogo((k) => { k.perguntaManter ??= {}; if (v) k.perguntaManter[sid] = v; else delete k.perguntaManter[sid]; }); anunciar(v ? `Pergunta: ${v}` : "Sem pergunta"); }} />
            <Segmentos nome={`qtd-${sid}`} rotulo="Quantidade do produto" v={regraAtual ? chaveRegra(regraAtual) : chaveRegra(REGRAS_QTD[0].r)}
              opcoes={regras.map((x) => ({ k: chaveRegra(x.r), t: x.t }))}
              onSet={(v) => { const r = regras.find((x) => chaveRegra(x.r) === v); if (r) { mudarCatalogo((k) => { k.qtdDe ??= {}; k.qtdDe[sid] = r.r; }); anunciar(`Quantidade: ${r.t}`); } }} />
            <p className={cn(NOTA, "mt-2")}>Com «Sim» à pergunta não é preciso produto; com «Não» (ou sem pergunta) a visita só fecha com um produto de {caminho(K.arvore, ramo)}.</p>
          </>
        )}
      </Seccao>

      {/* ---------------------------------------------------------- entulho */}
      <Seccao id="ent-t" titulo="Entulho" total={totalEntulho} desc="Se o serviço gera entulho e de onde vem. Entra na linha «Demolição e remoção de entulho» do orçamento (o cliente vê uma só linha).">
        <Segmentos nome={`ent-${sid}`} rotulo="De onde vem o entulho" oculto v={ent.e.modo} opcoes={MODOS} onSet={mudarEntulho} />

        {ent.e.modo === "artigo" && (
          <div className="mt-4 grid max-w-xl grid-cols-[minmax(0,1fr)] gap-1">
            <span className={ROT}>Artigo de demolição</span>
            <SeletorPesquisa rotulo="Artigo de demolição" atual={K.artigoDoServico?.[sid]} className="w-full" placeholder="Descrição ou código"
              gatilho={<GatilhoCampo>{ent.artigo ? `${ent.artigo.descricao} (${ent.artigo.unidade})` : "Escolher o artigo"}</GatilhoCampo>}
              opcoes={artigos.map((a) => ({ v: a.codigo, t: a.descricao, sub: `${a.codigo} · ${nfmt(a.tempo)} h/${a.unidade}`, valor: `${m3t(vSoltoDe(a))} m³/${a.unidade}` }))}
              onEscolher={(v) => { mudarCatalogo((k) => { k.artigoDoServico ??= {}; k.artigoDoServico[sid] = v; k.entulhoServico ??= {}; k.entulhoServico[sid] = { modo: "artigo" }; }); anunciar(`Usa o artigo ${v}`); }} />
            {ent.artigo && ent.artigo.unidade !== un && <p className={NOTA}>A unidade do artigo ({ent.artigo.unidade}) não é a do serviço ({un}): usa-se a quantidade da linha tal como está.</p>}
          </div>
        )}

        {ent.e.modo === "produto" && (
          <div className="mt-4">
            <p className={ROT}>O que sai, por produto</p>
            {ligados.length ? (
              <ul className="mt-1 divide-y divide-border" aria-label="Entulho dos produtos ligados">
                {[...ligados].sort((a, b) => Number(entulhoDoProduto(b).m3 > 0) - Number(entulhoDoProduto(a).m3 > 0)).slice(0, 6).map((p: Produto) => {
                  const en = entulhoDoProduto(p);
                  const por = (m3: number, kg: number | undefined) => { mudarCatalogo((k) => { const y = k.produtos.find((z) => z.id === p.id); if (y) y.entulho = { m3, ...(kg ? { kg } : {}) }; }); anunciar(`${p.n}: ${m3t(m3)} m³${kg ? ` e ${nfmt(kg)} kg` : ""}`); };
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <Ilustracao k={p.img ?? "generico"} className="h-9 w-9" />
                      <span className="min-w-0 flex-[1_1_10rem] text-[15px]">{p.n}{en.doTipo && <span className="block text-[14px] text-muted-foreground">valor do tipo: {en.tipo}</span>}</span>
                      <span className="flex items-center gap-1.5 text-[15px] tabular-nums text-muted-foreground">
                        <NumeroInline rotulo={`m³ de ${p.n}`} v={en.m3} onSet={(v) => por(v, en.kg)} /><span>m³</span>
                        <NumeroInline rotulo={`kg de ${p.n}`} v={en.kg ?? 0} onSet={(v) => por(en.m3, v || undefined)} /><span>kg</span>
                      </span>
                    </li>
                  );
                })}
                {ligados.length > 6 && <li className={cn(NOTA, "py-2 text-[14px]")}>E mais {ligados.length - 6}: cada um com o seu valor ou o do tipo.</li>}
              </ul>
            ) : <p className={cn(NOTA, "mt-1")}>Sem produtos ligados: vale o tipo do serviço{ent.produto ? ` (${ent.produto.tipo}, ${m3t(ent.produto.m3)} m³${ent.produto.kg ? ` e ${ent.produto.kg} kg` : ""})` : ""}.</p>}
            <p className={cn(NOTA, "mt-1 text-[14px]")}>Na visita, «O cliente mantém…?» → Não: sai o produto que se troca. Se mantém, não há entulho.</p>
          </div>
        )}

        {ent.e.modo === "m3" && (
          <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[15px] tabular-nums">
            <NumeroInline rotulo={`m³ por ${un}`} v={ent.e.m3 ?? 0} onSet={(v) => { mudarCatalogo((k) => { k.entulhoServico ??= {}; k.entulhoServico[sid] = { ...ent.e, modo: "m3", m3: v }; }); anunciar(`${m3t(v)} m³ por ${un}`); }} />
            <span>m³ e</span>
            <NumeroInline rotulo={`kg por ${un}`} v={ent.e.kg ?? 0} onSet={(v) => { mudarCatalogo((k) => { k.entulhoServico ??= {}; const e = { ...ent.e, modo: "m3" as const }; if (v > 0) e.kg = v; else delete e.kg; k.entulhoServico[sid] = e; }); anunciar(v > 0 ? `${nfmt(v)} kg por ${un}` : "Peso pelo volume"); }} />
            <span>kg por {un}</span>
            <span className="text-[14px] text-muted-foreground">(0 kg: o peso sai do volume × 1,4 t/m³)</span>
          </p>
        )}

        <div className="mt-4 rounded-xl bg-muted/50 px-4 py-3" aria-live="polite" data-testid="conta-entulho">
          {ent.conta ? (
            <>
              <p className="text-[14px] text-muted-foreground">Exemplo com {nfmt(ent.q)} {un} · {ent.de}</p>
              <p className="mt-0.5 text-[16px] tabular-nums">{ent.conta.texto}</p>
              <p className="mt-0.5 text-[14px] text-muted-foreground">Com os parâmetros de produção, rés-do-chão ou com elevador.{ent.e.modo !== "artigo" ? " Sem horas de demolição: a mão de obra já está no serviço." : ""}</p>
            </>
          ) : <p className="text-[15px] text-muted-foreground">{ent.e.modo === "nao" ? "Não gera entulho: não entra na conta da demolição." : "Falta o volume: escolha o artigo ou escreva o m³."}</p>}
        </div>
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
            <tr className="border-b border-border"><th scope="row" className="py-2 text-left font-semibold">Custo por {un}</th><td /><td className="py-2 text-right font-semibold tabular-nums">{eur(c.total)} €</td></tr>
            <tr>
              <th scope="row" className="py-2 text-left font-normal text-muted-foreground">Entulho <span className="block text-[14px]">vai na linha da demolição, à parte</span></th>
              <td /><td className="py-2 text-right tabular-nums text-muted-foreground">{ent.custoUn > 0 ? `≈ ${eur(ent.custoUn)} €` : "—"}</td>
            </tr>
          </tbody>
        </table>

        <Segmentos nome={`modo-${sid}`} rotulo="Como se chega ao preço" v={modo} opcoes={[{ k: "tabela" as ModoPreco, t: "Tabela" }, { k: "margem" as ModoPreco, t: "Custo + margem" }]}
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
          <Segmentos nome={`just-${sid}`} rotulo="Porquê abaixo da margem-alvo?" v={rec.justificacao ?? ""}
            opcoes={[...JUSTIFICACOES.map((t) => ({ k: t as string, t })), { k: "", t: "Sem justificação" }]}
            onSet={(v) => editar((r) => { r.justificacao = v || undefined; }, v ? "Justificação registada" : "Justificação retirada", false)} />
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
