// 26/11 (Rúben: «faz isso ao máximo detalhe, super bonito e detalhado»). /relatorios/olyvia: os relatórios da Olyvia (negócios, obras e o
// orçamento de um negócio), no ecrã, em PDF e em Excel. Leem a base de conhecimento com a RLS de quem abre. O chat e a voz dão ligações
// para aqui (?tipo=…&numero=…&formato=pdf|excel: com formato, o ficheiro descarrega-se logo ao abrir).
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, Download, FileSpreadsheet, FileText, HardHat, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyOpcional } from "@/contexts/CompanyContext";
import { SinalAoVivo } from "@/emylia/SinalAoVivo";
import { FILTROS_NEGOCIOS, docNegocios, docObra, docObras, docOrcamento, eur, type Coluna, type DocRelatorio, type FiltroNegocios, type LinhaBase, type Seccao, type TipoRelatorio } from "@/emylia/relatorios/relatoriosOlyvia";
import { exportarRelatorio } from "@/emylia/relatorios/exportarRelatorio";

const TIPOS: { k: TipoRelatorio; rot: string; Icone: typeof BarChart3 }[] = [
  { k: "negocios", rot: "Negócios", Icone: BarChart3 },
  { k: "obras", rot: "Obras", Icone: HardHat },
  { k: "orcamento", rot: "Orçamento", Icone: Receipt },
];
const celula = (c: Coluna, v: string | number | undefined) => (typeof v === "number" ? (c.dinheiro ? eur(v) : v.toLocaleString("pt-PT")) : v ?? "");

function Kpis({ s }: { s: Extract<Seccao, { k: "kpis" }> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {s.itens.map((k) => (
        <div key={k.rot} className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
          <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", k.tom === "bom" ? "bg-success" : k.tom === "atencao" ? "bg-amber-500" : "bg-primary")} />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.rot}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", k.tom === "bom" ? "text-success" : k.tom === "atencao" ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>{k.valor}</p>
          {k.nota && <p className="mt-0.5 text-sm text-muted-foreground">{k.nota}</p>}
        </div>
      ))}
    </div>
  );
}

function Barras({ s }: { s: Extract<Seccao, { k: "barras" }> }) {
  const parado = useReducedMotion();
  const max = Math.max(1, ...s.itens.map((x) => x.valor));
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold">{s.titulo}</h2>
      {s.nota && <p className="text-sm text-muted-foreground">{s.nota}</p>}
      <ul className="mt-4 space-y-2.5">
        {s.itens.map((b, i) => (
          <li key={b.rot} className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate">{b.rot}</span>
            <span className="h-3 overflow-hidden rounded-full bg-primary/10">
              <motion.span className="block h-full rounded-full bg-gradient-to-r from-primary to-primary/70" initial={parado ? false : { width: 0 }}
                animate={{ width: `${b.valor > 0 ? Math.max(2, (100 * b.valor) / max) : 0}%` }} transition={{ duration: 0.7, delay: i * 0.05, ease: "easeOut" }} />
            </span>
            <span className="text-right font-medium tabular-nums">{b.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tabela({ s }: { s: Extract<Seccao, { k: "tabela" }> }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold">{s.titulo}</h2>
      {s.nota && <p className="text-sm text-muted-foreground">{s.nota}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              {s.colunas.map((c) => <th key={c.t} scope="col" className={cn("bg-primary/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary", c.dir && "text-right")}>{c.t}</th>)}
            </tr>
          </thead>
          <tbody>
            {s.linhas.map((l, r) => (
              <tr key={r} className="border-b border-border/60 odd:bg-transparent even:bg-primary/[0.03]">
                {s.colunas.map((c, i) => <td key={i} className={cn("px-3 py-2", c.dir && "text-right tabular-nums")}>{celula(c, l[i])}</td>)}
              </tr>
            ))}
          </tbody>
          {s.total && (
            <tfoot>
              <tr className="border-t-2 border-primary/40 font-semibold">
                {s.colunas.map((c, i) => <td key={i} className={cn("px-3 py-2", c.dir && "text-right tabular-nums")}>{celula(c, s.total![i])}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function Texto({ s }: { s: Extract<Seccao, { k: "texto" }> }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold">{s.titulo}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-foreground/90">{s.paragrafos.map((p, i) => <p key={i}>{p}</p>)}</div>
    </section>
  );
}

export function VistaRelatorio({ doc }: { doc: DocRelatorio }) {
  return (
    <div className="space-y-5">
      {doc.seccoes.map((s, i) => s.k === "kpis" ? <Kpis key={i} s={s} /> : s.k === "barras" ? <Barras key={i} s={s} /> : s.k === "tabela" ? <Tabela key={i} s={s} /> : <Texto key={i} s={s} />)}
    </div>
  );
}

export default function RelatoriosOlyvia() {
  const [params, setParams] = useSearchParams();
  const empresa = useCompanyOpcional();
  const org = empresa?.activeCompany?.id ?? null, nomeOrg = empresa?.activeCompany?.name ?? "";
  // 27/11: também «obra» (o plano de uma obra, aberto pelo separador Obras) e o filtro dos negócios (?filtro=obra_por_iniciar…)
  const tipo = (TIPOS.some((t) => t.k === params.get("tipo")) || params.get("tipo") === "obra" ? params.get("tipo") : "negocios") as TipoRelatorio;
  const f0 = params.get("filtro");
  const filtro = (f0 && (FILTROS_NEGOCIOS.some((f) => f.k === f0) || /^fase:\d$/.test(f0)) ? f0 : null) as FiltroNegocios | null;
  const numero = Number(params.get("numero")) || null;
  const [linhas, setLinhas] = useState<LinhaBase[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGerar, setAGerar] = useState<"pdf" | "excel" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // o aviso do ficheiro descarregado é deste relatório: sai quando se muda de separador ou de negócio
  useEffect(() => setAviso(null), [tipo, numero]);

  useEffect(() => {
    if (!org) return;
    let vivo = true;
    setLinhas(null); setErro(null);
    void supabase.from("olyvia_conhecimento" as never).select("tipo, numero, titulo, texto, dados, atualizado_em").eq("organization_id", org).neq("tipo", "guia").limit(4000)
      .then(({ data, error }) => { if (!vivo) return; if (error) setErro(error.message); else setLinhas((data ?? []) as unknown as LinhaBase[]); });
    return () => { vivo = false; };
  }, [org]);

  const obrasL = useMemo(() => (linhas ?? []).filter((x) => x.tipo === "obra" && x.numero != null).sort((a, b) => b.numero! - a.numero!), [linhas]);
  const orcamentos = useMemo(() => (linhas ?? []).filter((x) => x.tipo === "orcamento" && x.numero != null).sort((a, b) => b.numero! - a.numero!), [linhas]);
  const doc = useMemo<DocRelatorio | null>(() => {
    if (!linhas) return null;
    if (tipo === "obras") return docObras(linhas, nomeOrg);
    if (tipo === "obra") {
      const o = obrasL.find((x) => x.numero === numero) ?? (numero ? null : obrasL[0] ?? null);
      return o ? docObra(o, nomeOrg) : null;
    }
    if (tipo === "orcamento") {
      const o = orcamentos.find((x) => x.numero === numero) ?? (numero ? null : orcamentos[0] ?? null);
      if (!o) return null;
      return docOrcamento(o, linhas.find((x) => x.tipo === "custos" && x.numero === o.numero) ?? null, nomeOrg);
    }
    return docNegocios(linhas, nomeOrg, filtro);
  }, [linhas, tipo, numero, orcamentos, obrasL, nomeOrg, filtro]);

  const gerar = async (formato: "pdf" | "excel") => {
    if (!doc) return;
    setAGerar(formato);
    try { await exportarRelatorio(doc, formato); setAviso(`${formato === "pdf" ? "O PDF" : "O Excel"} foi descarregado: ${doc.nomeFicheiro}.${formato === "pdf" ? "pdf" : "xlsx"}`); }
    catch (e) { setAviso(`Não foi possível gerar o ficheiro: ${(e as Error).message}`); }
    finally { setAGerar(null); }
  };
  // ?formato=pdf|excel (a ligação do chat): descarrega uma vez, logo que o relatório está pronto
  // 26/11: lê-se a cada mudança do endereço (com a página já aberta, o botão do chat só muda o endereço), não só ao abrir
  const formatoPedido = params.get("formato");
  const tratado = useRef<string | null>(null);
  useEffect(() => {
    const f = formatoPedido;
    if (f !== "pdf" && f !== "excel") { tratado.current = null; return; }
    if (!doc) return;
    const chave = `${params.toString()}`;
    if (tratado.current === chave) return;
    tratado.current = chave;
    void gerar(f);
    const p = new URLSearchParams(params); p.delete("formato"); setParams(p, { replace: true });
  }, [doc, formatoPedido]); // eslint-disable-line react-hooks/exhaustive-deps

  const ir = (k: TipoRelatorio, n?: number | null, fl?: string | null) => { const p = new URLSearchParams({ tipo: k }); if (n) p.set("numero", String(n)); if (fl) p.set("filtro", fl); setParams(p); };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#3b22b3] via-[#4b2fc9] to-[#7c5ce0] p-6 text-white shadow-lg sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80"><SinalAoVivo rotulo="Dados ao vivo" tamanho={12} cor="bg-white/85" />Relatórios da Olyvia</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{doc?.titulo ?? "Relatórios"}</h1>
        <p className="mt-1 text-white/85">{doc?.subtitulo ?? nomeOrg}</p>
        {doc?.atualizado && <p className="mt-3 text-sm text-white/70">Dados atualizados a {new Date(doc.atualizado).toLocaleString("pt-PT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={!doc || !!aGerar} onClick={() => void gerar("pdf")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#3b22b3] shadow-sm transition hover:bg-white/90 disabled:opacity-60">
            <FileText className="h-4 w-4" aria-hidden="true" />{aGerar === "pdf" ? "A gerar o PDF…" : "Descarregar PDF"}
          </button>
          <button type="button" disabled={!doc || !!aGerar} onClick={() => void gerar("excel")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/50 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />{aGerar === "excel" ? "A gerar o Excel…" : "Descarregar Excel"}
          </button>
        </div>
      </header>

      <nav aria-label="Tipo de relatório" className="mt-5 flex flex-wrap items-center gap-2">
        {TIPOS.map(({ k, rot, Icone }) => (
          <button key={k} type="button" aria-pressed={tipo === k || (k === "obras" && tipo === "obra")} onClick={() => ir(k, k === "orcamento" ? numero : null)}
            className={cn("inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition", tipo === k || (k === "obras" && tipo === "obra") ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card hover:bg-accent")}>
            <Icone className="h-4 w-4" aria-hidden="true" />{rot}
          </button>
        ))}
        {tipo === "negocios" && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mostrar</span>
            <select value={filtro ?? ""} onChange={(e) => ir("negocios", null, e.target.value || null)} className="min-h-10 max-w-[18rem] rounded-xl border border-border bg-card px-3">
              <option value="">Todos os negócios</option>
              {FILTROS_NEGOCIOS.map((f) => <option key={f.k} value={f.k}>{f.rot}</option>)}
            </select>
          </label>
        )}
        {(tipo === "obras" || tipo === "obra") && obrasL.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Obra</span>
            <select value={tipo === "obra" ? String((obrasL.find((x) => x.numero === numero) ?? obrasL[0]).numero) : ""} onChange={(e) => (e.target.value ? ir("obra", Number(e.target.value)) : ir("obras"))}
              className="min-h-10 max-w-[18rem] rounded-xl border border-border bg-card px-3">
              <option value="">Todas as obras</option>
              {obrasL.map((o) => <option key={o.numero} value={String(o.numero)}>{o.titulo.replace(/^Obra\s*/, "")}</option>)}
            </select>
          </label>
        )}
        {tipo === "orcamento" && orcamentos.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Negócio</span>
            <select value={String((orcamentos.find((x) => x.numero === numero) ?? orcamentos[0]).numero)} onChange={(e) => ir("orcamento", Number(e.target.value))}
              className="min-h-10 max-w-[18rem] rounded-xl border border-border bg-card px-3">
              {orcamentos.map((o) => <option key={o.numero} value={String(o.numero)}>{o.titulo.replace(/^Orçamento\s*/, "")}</option>)}
            </select>
          </label>
        )}
      </nav>

      {aviso && <p role="status" className="mt-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"><Download className="h-4 w-4" aria-hidden="true" />{aviso}</p>}

      <main className="mt-5">
        {!org ? <p className="text-muted-foreground">Escolhe primeiro a empresa.</p>
          : erro ? <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-destructive">Não foi possível ler os dados: {erro}</p>
          : !linhas ? <p className="flex items-center gap-2 text-muted-foreground"><SinalAoVivo rotulo="A carregar" tamanho={14} intenso />A preparar o relatório…</p>
          : !doc ? <p className="rounded-2xl border border-border bg-card p-5 text-muted-foreground">{tipo === "orcamento" ? (numero ? `Não encontrei o orçamento do negócio ${numero} (ou não o podes ver).` : "Ainda não há orçamentos na base de conhecimento.") : "Ainda não há dados."} A base atualiza-se de 10 em 10 minutos na página dos Negócios e de 15 em 15 no servidor.</p>
          : <VistaRelatorio doc={doc} />}
      </main>
    </div>
  );
}
