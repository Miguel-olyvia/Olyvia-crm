// 11/11 (Rúben: «ver toda a informação do negócio, de todas as fases, num sítio só, em vez de ser tudo repartido por tabs laterais em cada
// uma. Se estiver na fase de Obra, em cima, por baixo do nome, ter a opção de ver tudo o que se passou nas fases anteriores, com tudo super
// organizado, dinâmico e bonito»). «Tudo do negócio»: por cima da página, uma linha do tempo pelas seis fases. Cada fase abre e fecha, com o
// que se respondeu (só os campos com valor), as conversas analisadas, as fotografias, a planta, as medidas, o orçamento e as versões, o
// contrato, a fatura e o pagamento, o plano e a obra, e o histórico dessa fase. A fase atual vem aberta e marcada; as futuras, esbatidas.
// Pesquisa no topo (procura em todos os campos e no histórico) e saltos de fase em fase. Só se lê: cada fase tem «Ir a esta fase».
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Camera, ChevronDown, Clock, FileSignature, FileText, Hammer, MessageSquare, Receipt, Ruler, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONTACTO, DECISAO, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PECAS_WC, PROPOSTA, efetivo, gruposArea, visivel, type Grupo } from "./campos";
import { mostra } from "./CamposFase";
import { FotosEtapa } from "./FotosEtapa";
import { InsightsConversa } from "./InsightsConversa";
import { lerInsights } from "./chamadaMotor";
import { FASES, LINHAS, TECS, camposMedida, eur, fotosPor, medida, nfmt, tot, versaoAtual, type Evento, type Negocio } from "./motor";
import { IconeFase, type Ctx } from "./pecas";
import { NaFrente } from "./NaFrente";
import { lerPlanta } from "./planta";
import { PlantaVista } from "@/pages/prototipo-estudio/PlantaVista";
import { dataCurta, diasDaObra } from "./planoObra";
import { inicioDoPlano } from "./preparacaoObra";
import { useReduzir, MOLA } from "./movimento";

interface Item { l: string; v: string }
interface Bloco { id: string; titulo: string; icone: ReactNode; itens: Item[]; extra?: ReactNode; resumo?: string; largo?: boolean }

// sem acentos e em minúsculas, letra a letra (o mesmo comprimento: o realce corta o texto original nos mesmos sítios)
const sem = (s: string) => s.split("").map((c) => c.normalize("NFD")[0] ?? c).join("").toLowerCase();
const datar = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split("-").reverse().join("/") : s ?? "");

/** As respostas de um grupo: só as preenchidas e visíveis, com o nome que a empresa deu ao campo. */
function respostas(g: Grupo, f: Record<string, string>): Item[] {
  return g.campos.filter((c) => !!f[c.k]?.trim() && visivel(c, f)).map((c) => ({ l: c.l, v: mostra(c, f[c.k]) }));
}

/** O histórico pelas fases: as entradas «Passou a …» marcam a mudança; as de antes da primeira marca vão pela palavra (a proposta, a
 *  fatura, o plano…) e, sem pista, para a primeira fase. */
export function historicoPorFase(hist: readonly Evento[]): Evento[][] {
  const out: Evento[][] = FASES.map(() => []);
  const cron = [...hist].reverse();
  let atual: number | null = null;
  for (const e of cron) {
    const m = /Passou (?:a|à|ao) (Por contactar|Contacto|Visita|Negócio|Financeiro|Obra)/.exec(e.t);
    if (m) atual = FASES.indexOf(m[1]);
    const n = atual ?? (/obra|tarefa|técnico|encomenda/i.test(e.t) ? 5 : /fatura|recibo|pagamento/i.test(e.t) ? 4
      : /proposta|orçamento|contrato|medidas|plano/i.test(e.t) ? 3 : /visita/i.test(e.t) ? 2 : /chamada|contact/i.test(e.t) ? 1 : 0);
    out[Math.max(0, n)].push(e);
  }
  return out.map((l) => l.reverse()); // o mais recente primeiro, como no resto da app
}

/** O que cada fase tem para ler. */
function blocosDaFase(ctx: Ctx, d: Negocio, n: number): Bloco[] {
  const { S } = ctx;
  const f = d.f ?? {};
  const E = (g: Grupo) => efetivo(S.campos, g);
  const grupo = (g: Grupo, icone: ReactNode, id: string): Bloco | null => {
    const e = E(g);
    if (e.oculto) return null;
    return { id, titulo: e.nome || g.titulo, icone, itens: respostas(e, f) };
  };
  const doGrupo = (gs: Grupo[], icone: ReactNode, pre: string) => gs.map((g, i) => grupo(g, icone, `${pre}${i}`)).filter((b): b is Bloco => !!b);
  const conversa = (k: "insights_chamada" | "insights_visita", tipo: "chamada" | "visita"): Bloco | null => {
    const x = lerInsights(f[k]);
    if (!x) return null;
    return { id: k, titulo: tipo === "chamada" ? "A chamada, analisada" : "A visita, analisada", icone: <MessageSquare className="h-4 w-4" />, itens: [], resumo: x.insights.resumo, largo: true,
      extra: <InsightsConversa dados={x} tipo={tipo} compacto /> };
  };
  const o = d.orc, p = d.obra.plano;
  switch (n) {
    case 0: return doGrupo(LEAD, <FileText className="h-4 w-4" />, "lead");
    case 1: return [...doGrupo(CONTACTO, <FileText className="h-4 w-4" />, "ct"), conversa("insights_chamada", "chamada")].filter((b): b is Bloco => !!b);
    case 2: {
      const nFotos = Object.values(fotosPor(d.visita)).reduce((a, x) => a + x, 0);
      const planta = lerPlanta(f.retif_planta) ?? lerPlanta(f.planta);
      const CM = camposMedida(LINHAS[d.linha]);
      const med: Item[] = CM.map(([k, l]) => {
        const v = medida(d.visita.med, k), r = f[`retif_${k}`];
        const rn = r != null && r !== "" ? Number(r) : null;
        return { l, v: rn != null && Math.abs(rn - v) > 0.001 ? `${nfmt(v)} na visita · ${nfmt(rn)} no local` : nfmt(v) };
      });
      return [
        ...(nFotos ? [{ id: "fotos", titulo: "Fotografias", icone: <Camera className="h-4 w-4" />, itens: [], resumo: `${nFotos} ${nFotos === 1 ? "fotografia" : "fotografias"}`, largo: true,
          extra: <div className="space-y-3"><FotosEtapa ctx={ctx} d={d} etapa="exterior" soVer simples /><FotosEtapa ctx={ctx} d={d} etapa="interior" soVer simples /><FotosEtapa ctx={ctx} d={d} etapa="area" soVer simples /></div> }] : []),
        ...(planta && planta.paredes.length >= 3 ? [{ id: "planta", titulo: "A planta", icone: <Ruler className="h-4 w-4" />, itens: [], resumo: f.retif_planta ? "corrigida no local" : "da visita",
          extra: <PlantaVista planta={planta} titulo={f.retif_planta ? "Corrigida no local" : "Da visita"} /> }] : []),
        ...(CM.length ? [{ id: "medidas", titulo: "Medidas", icone: <Ruler className="h-4 w-4" />, itens: [...med, ...(f.retif_notas ? [{ l: "Notas do supervisor", v: f.retif_notas }] : [])],
          resumo: f.retif_aceite ? `retificadas e aceites a ${datar(f.retif_aceite)}${f.retif_por ? `, por ${f.retif_por}` : ""}` : "as da visita" }] : []),
        ...[grupo(EXTERIOR, <FileText className="h-4 w-4" />, "ext"), grupo(INTERIOR, <FileText className="h-4 w-4" />, "int")].filter((b): b is Bloco => !!b),
        ...gruposArea(S.campos, f).map((g, i) => grupo(g, <FileText className="h-4 w-4" />, `area${i}`)).filter((b): b is Bloco => !!b),
        ...[grupo(PECAS_WC, <FileText className="h-4 w-4" />, "pecas"), grupo(DECISAO, <FileText className="h-4 w-4" />, "dec"), conversa("insights_visita", "visita")].filter((b): b is Bloco => !!b),
      ];
    }
    case 3: {
      if (!o) return [];
      const t = tot(d, S);
      const versoes: Item[] = (o.versoes ?? []).map((v) => ({ l: `Versão ${v.n}`, v: `${eur(v.total)} € s/ IVA · enviada ${datar(v.enviada)}${v.aceite ? ` · aceite ${datar(v.aceite)}` : ""}${v.motivos.length ? ` · ${v.motivos.join(", ")}` : ""}` }));
      const orc: Bloco = { id: "orc", titulo: "O orçamento e a proposta", icone: <FileText className="h-4 w-4" />, itens: [
        { l: `Proposta (versão ${versaoAtual(o)})`, v: `${eur(t.pf)} € s/ IVA` },
        ...(o.vendaDireta ? [{ l: "Tipo", v: "Venda direta" }] : []),
        { l: "Enviada", v: o.enviada ? datar(o.enviada) : "ainda não" },
        { l: "Aceite pelo cliente", v: o.aceite ? datar(o.aceite) : "ainda não" },
        ...versoes,
      ] };
      const prop = grupo(PROPOSTA[0], <FileText className="h-4 w-4" />, "prop");
      const ct = grupo(PROPOSTA[1], <FileSignature className="h-4 w-4" />, "contrato");
      const contrato: Bloco | null = o.vendaDireta ? null : { ...(ct ?? { id: "contrato", titulo: "Contrato", icone: <FileSignature className="h-4 w-4" />, itens: [] }),
        resumo: o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "à espera da assinatura" : "por gerar" };
      return [orc, prop, contrato].filter((b): b is Bloco => !!b);
    }
    case 4: {
      const fin: Bloco = { id: "fin", titulo: "A fatura e o pagamento", icone: <Receipt className="h-4 w-4" />, itens: [
        { l: "Fatura", v: d.fin.fatura ? `${d.fin.fatura.n} · ${datar(d.fin.fatura.q)}` : "por registar" },
        { l: "Pagamento", v: d.fin.pago ? (d.fin.recibo ? `validado · recibo ${d.fin.recibo.n} · ${datar(d.fin.recibo.q)}` : "validado") : "por receber" },
      ] };
      return [fin, ...doGrupo(FINANCEIRO, <FileText className="h-4 w-4" />, "fin")];
    }
    case 5: {
      const itens: Item[] = [];
      if (p) {
        const fim = Math.max(1, ...p.tasks.map((x) => x.dia + x.dur)), ini = inicioDoPlano(p), dias = ini ? diasDaObra(ini, fim) : [];
        const pessoas = new Set(p.tasks.map((x) => x.tec).filter(Boolean));
        itens.push({ l: "O plano", v: p.estado === "por aprovar" ? "por aprovar" : p.estado });
        if (ini) itens.push({ l: "Começa", v: dataCurta(ini) }, { l: "Fica pronta", v: dias[fim - 1] ? dataCurta(dias[fim - 1]) : "—" });
        itens.push({ l: "Tarefas", v: `${p.tasks.length} · ${fim} ${fim === 1 ? "dia útil" : "dias úteis"} · ${nfmt(p.tasks.reduce((a, x) => a + x.h, 0))} h` },
          { l: "Equipa", v: [...pessoas].map((id) => TECS.find((x) => x.id === id)?.n ?? "").filter(Boolean).join(", ") || "por escolher" });
        const feitas = p.tasks.filter((x) => x.exec?.estado === "validada" || x.exec?.estado === "feita").length;
        if (p.estado === "em curso" || p.estado === "concluída") itens.push({ l: "Feitas", v: `${feitas} de ${p.tasks.length}` });
      }
      if (d.obra.ec) itens.push({ l: "Encomenda de cliente", v: d.obra.ec.n });
      return [...(itens.length ? [{ id: "plano", titulo: "O plano e a obra", icone: <Hammer className="h-4 w-4" />, itens }] : []), ...doGrupo(OBRA, <FileText className="h-4 w-4" />, "obra")];
    }
  }
  return [];
}

/** O texto com o que se procura em realce. */
function Realce({ t, q }: { t: string; q: string }) {
  if (!q) return <>{t}</>;
  const i = sem(t).indexOf(sem(q));
  if (i < 0) return <>{t}</>;
  return <>{t.slice(0, i)}<mark className="rounded bg-primary/20 px-0.5 text-foreground">{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>;
}

export function TudoDoNegocio({ ctx, d, fechar, irPara }: { ctx: Ctx; d: Negocio; fechar: () => void; irPara: (fase: number) => void }) {
  const reduzir = useReduzir();
  const [q, setQ] = useState("");
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set([d.fase]));
  const [vista, setVista] = useState(d.fase); // a fase que está à vista (para o marcador na linha do tempo)
  const corpo = useRef<HTMLDivElement>(null);
  const secoes = useRef<(HTMLElement | null)[]>([]);
  const hist = useMemo(() => historicoPorFase(d.hist ?? []), [d.hist]);
  const fases = useMemo(() => FASES.map((nome, n) => ({ n, nome, blocos: blocosDaFase(ctx, d, n), hist: hist[n] })), [ctx, d, hist]); // eslint-disable-line react-hooks/exhaustive-deps
  const procura = q.trim();
  const bate = (s: string) => !procura || sem(s).includes(sem(procura));
  // o que fica com a pesquisa: os campos e as linhas do histórico que batem; um bloco sem campos fica se o título ou o resumo baterem
  const filtradas = fases.map((F) => {
    const blocos = F.blocos.map((b) => {
      if (!procura) return b;
      const itens = b.itens.filter((x) => bate(`${x.l} ${x.v}`));
      return itens.length || bate(`${b.titulo} ${b.resumo ?? ""}`) ? { ...b, itens: itens.length ? itens : b.itens } : null;
    }).filter((b): b is Bloco => !!b);
    const h = F.hist.filter((e) => bate(`${e.t} ${e.quem ?? ""}`));
    return { ...F, blocos, hist: h, achados: procura ? blocos.reduce((a, b) => a + Math.max(1, b.itens.filter((x) => bate(`${x.l} ${x.v}`)).length), 0) + h.length : 0 };
  });
  const total = filtradas.reduce((a, F) => a + F.achados, 0);
  const aberta = (n: number) => (procura ? filtradas[n].achados > 0 : abertas.has(n));
  const alternar = (n: number) => setAbertas((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const saltar = (n: number) => {
    setAbertas((s) => new Set(s).add(n));
    setVista(n);
    requestAnimationFrame(() => secoes.current[n]?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" }));
  };

  // a fase à vista acompanha o que se lê (o marcador da linha do tempo desliza): a última cujo topo já passou o cimo do painel
  useEffect(() => {
    const raiz = corpo.current;
    if (!raiz) return;
    let pedido = 0;
    const ver = () => {
      pedido = 0;
      const topo = raiz.getBoundingClientRect().top + 96;
      let n = 0;
      secoes.current.forEach((s, k) => { if (s && s.getBoundingClientRect().top <= topo) n = k; });
      setVista(n);
    };
    const agendar = () => { if (!pedido) pedido = requestAnimationFrame(ver); };
    raiz.addEventListener("scroll", agendar, { passive: true });
    return () => { raiz.removeEventListener("scroll", agendar); if (pedido) cancelAnimationFrame(pedido); };
  }, []);
  useEffect(() => { requestAnimationFrame(() => secoes.current[d.fase]?.scrollIntoView({ block: "start" })); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const estado = (n: number) => (n < d.fase ? "feita" : n === d.fase ? "agora" : "futura");

  return (
    <NaFrente>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="tudo-titulo" className="fixed inset-0 flex flex-col bg-background"
        initial={reduzir ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
        {/* ---------------------------------------------------------------- o cabeçalho: voltar, o nome e a pesquisa */}
        <header className="border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <Button type="button" variant="outline" className="min-h-11" onClick={fechar}><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />Voltar ao negócio</Button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Tudo do negócio</p>
              <h1 id="tudo-titulo" className="truncate text-xl font-semibold tracking-tight">{d.nome}{d.servico ? ` · ${d.servico}` : ""}</h1>
            </div>
            <label className="relative w-full sm:w-80">
              <span className="sr-only">Procurar em todas as fases</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar um campo ou um valor"
                className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
              {q && <button type="button" aria-label="Limpar a pesquisa" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>}
            </label>
          </div>
          {/* os saltos de fase em fase (no telemóvel, por cima; no computador também estão à esquerda) */}
          <nav aria-label="Saltar para uma fase" className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pb-3 sm:px-6 lg:hidden">
            {filtradas.map((F) => (
              <button key={F.n} type="button" onClick={() => saltar(F.n)} aria-current={vista === F.n ? "true" : undefined}
                className={cn("relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  vista === F.n ? "border-foreground bg-foreground text-background" : estado(F.n) === "futura" ? "border-dashed border-input text-muted-foreground/70" : "border-input text-foreground/80",
                  procura && !F.achados && "opacity-40")}>
                {F.nome}{procura && F.achados > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{F.achados}</span>}
              </button>
            ))}
          </nav>
          <p role="status" className="sr-only">{procura ? `${total} ${total === 1 ? "resultado" : "resultados"}` : ""}</p>
        </header>

        <div ref={corpo} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
            {/* ---------------------------------------------------------------- a linha do tempo (computador) */}
            <nav aria-label="As fases" className="hidden lg:block">
              <ol className="sticky top-6 space-y-1">
                {filtradas.map((F, i) => (
                  <li key={F.n} className="relative">
                    {i < FASES.length - 1 && (
                      <span aria-hidden="true" className="absolute left-[23px] top-[38px] h-[calc(100%-22px)] w-px bg-border">
                        <motion.span className="absolute inset-x-0 top-0 origin-top bg-primary" style={{ height: "100%" }} initial={reduzir ? false : { scaleY: 0 }}
                          animate={{ scaleY: F.n < d.fase ? 1 : 0 }} transition={{ duration: 0.5, delay: reduzir ? 0 : 0.08 * i }} />
                      </span>
                    )}
                    <button type="button" onClick={() => saltar(F.n)} aria-current={vista === F.n ? "true" : undefined}
                      className={cn("relative flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[15px] transition-colors", vista === F.n ? "font-semibold" : "hover:bg-muted/60",
                        estado(F.n) === "futura" && "text-muted-foreground/70", procura && !F.achados && "opacity-40")}>
                      {vista === F.n && <motion.span layoutId={`tudo-vista-${d.id}`} aria-hidden="true" className="absolute inset-0 rounded-xl bg-muted" transition={reduzir ? { duration: 0 } : MOLA} />}
                      <span className="relative"><IconeFase fase={F.n} tam="sm" className={cn(estado(F.n) === "futura" && "opacity-50 grayscale")} /></span>
                      <span className="relative min-w-0 flex-1">
                        <span className="block truncate">{F.nome}</span>
                        <span className="block text-xs font-normal text-muted-foreground">{estado(F.n) === "agora" ? "agora" : estado(F.n) === "feita" ? "feita" : "ainda não"}{procura && F.achados ? ` · ${F.achados}` : ""}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            {/* ---------------------------------------------------------------- as fases */}
            <div className="min-w-0 space-y-4">
              {procura && (
                <motion.p initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted-foreground" aria-hidden="true">
                  {total ? `${total} ${total === 1 ? "resultado" : "resultados"} para «${procura}»` : `Nada encontrado para «${procura}».`}
                </motion.p>
              )}
              {filtradas.map((F, i) => {
                const st = estado(F.n), on = aberta(F.n), nCampos = F.blocos.reduce((a, b) => a + b.itens.length, 0);
                return (
                  <motion.section key={F.n} ref={(el: HTMLElement | null) => { secoes.current[F.n] = el; }} data-fase={F.n} aria-labelledby={`tudo-fase-${F.n}`}
                    initial={reduzir ? false : { opacity: 0, y: 12 }} animate={{ opacity: st === "futura" || (procura && !F.achados) ? 0.55 : 1, y: 0 }} transition={{ duration: 0.3, delay: reduzir ? 0 : 0.04 * i }}
                    className={cn("scroll-mt-4 overflow-hidden rounded-3xl border bg-card", st === "agora" ? "border-primary/40 shadow-md ring-1 ring-primary/20" : "border-border")}>
                    <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                      <button type="button" onClick={() => !procura && alternar(F.n)} aria-expanded={on} aria-controls={`tudo-corpo-${F.n}`}
                        className="flex min-w-0 flex-1 basis-64 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <IconeFase fase={F.n} tam="md" className={cn(st === "futura" && "opacity-50 grayscale")} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span id={`tudo-fase-${F.n}`} className="text-lg font-semibold tracking-tight">{F.nome}</span>
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", st === "agora" ? "bg-primary text-primary-foreground" : st === "feita" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                              {st === "agora" ? "Agora" : st === "feita" ? "Feita" : "Ainda não"}
                            </span>
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {st === "futura" ? "O negócio ainda não chegou aqui." : `${nCampos} ${nCampos === 1 ? "resposta" : "respostas"}${F.blocos.some((b) => b.extra) ? " · " + F.blocos.filter((b) => b.extra).map((b) => b.titulo.toLowerCase()).join(", ") : ""}${F.hist.length ? ` · ${F.hist.length} no histórico` : ""}`}
                          </span>
                        </span>
                        <ChevronDown aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", on && "rotate-180")} />
                      </button>
                      {st !== "futura" && (
                        <Button type="button" variant="outline" size="sm" className="min-h-10 rounded-full" onClick={() => irPara(F.n)}>
                          Ir a esta fase<ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {on && (
                        <motion.div id={`tudo-corpo-${F.n}`} key="corpo" initial={reduzir ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: reduzir ? 0 : 0.25 }} className="overflow-hidden">
                          <div className="space-y-4 border-t border-border p-4 sm:p-5">
                            {!F.blocos.length && !F.hist.length && <p className="text-[15px] text-muted-foreground">{st === "futura" ? "Ainda nada." : "Nada registado nesta fase."}</p>}
                            {F.blocos.length > 0 && (
                              <div className="grid gap-3 md:grid-cols-2">
                                {F.blocos.map((b, j) => (
                                  <motion.div key={b.id} initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduzir ? 0 : 0.03 * j }}
                                    className={cn("min-w-0 rounded-2xl border border-border bg-background/60 p-4", (b.largo || b.itens.length > 6) && "md:col-span-2")}>
                                    <p className="flex items-center gap-2 text-[15px] font-semibold"><span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">{b.icone}</span><Realce t={b.titulo} q={procura} /></p>
                                    {b.resumo && <p className="mt-1 text-sm text-muted-foreground"><Realce t={b.resumo} q={procura} /></p>}
                                    {b.itens.length > 0 && (
                                      <dl className="mt-3 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                                        {b.itens.map((x, k) => (
                                          <div key={`${x.l}-${k}`} className="min-w-0">
                                            <dt className="text-xs font-medium text-muted-foreground"><Realce t={x.l} q={procura} /></dt>
                                            <dd className="break-words text-[15px] leading-snug"><Realce t={x.v} q={procura} /></dd>
                                          </div>
                                        ))}
                                      </dl>
                                    )}
                                    {b.extra && !procura && (
                                      <details className="group mt-3 [&_summary::-webkit-details-marker]:hidden">
                                        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/[0.06]">
                                          Ver<ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                                        </summary>
                                        <div className="mt-2">{b.extra}</div>
                                      </details>
                                    )}
                                    {!b.itens.length && !b.extra && <p className="mt-2 text-sm text-muted-foreground">Nada preenchido.</p>}
                                  </motion.div>
                                ))}
                              </div>
                            )}
                            {F.hist.length > 0 && (
                              <div>
                                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Clock className="h-4 w-4 text-primary" aria-hidden="true" />O que se passou</p>
                                <ol className="relative space-y-2 border-l border-border pl-4">
                                  {F.hist.slice(0, procura ? 50 : 12).map((e, k) => (
                                    <li key={k} className="relative text-sm">
                                      <span aria-hidden="true" className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card", e.k === "x" ? "bg-destructive" : e.k === "w" ? "bg-amber-500" : "bg-primary")} />
                                      <span className="text-[15px]"><Realce t={e.t} q={procura} /></span>
                                      <span className="block text-xs text-muted-foreground">{e.q}{e.quem ? ` · ${e.quem}` : ""}</span>
                                    </li>
                                  ))}
                                  {!procura && F.hist.length > 12 && <li className="text-xs text-muted-foreground">e mais {F.hist.length - 12} no histórico do negócio</li>}
                                </ol>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.section>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </NaFrente>
  );
}
