// 12/11 (Rúben: «falta no estúdio da gestão da obra também os documentos enviados ao cliente, ter também a parte do 3D para ver»).
// Dois separadores do Estúdio da obra:
//  · Documentos: o que foi para o portal do cliente (documentosObra.ts), quando e em que estado; abrir cada um por cima (o «voltar» fecha,
//    ?doc=) e reenviar o acesso ao cliente com esse documento (pede confirmação; numa conta real, a permissão do portal);
//  · 3D: o projeto do Estúdio do projeto em volume (obra3d.ts), só para ver: o que está feito a cores, o que falta transparente.
import { Component, Suspense, lazy, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Box, Check, FileText, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio, Plano } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { podeNeg } from "../permissoes";
import { modoReal, emailDaFicha } from "../acessosPortal";
import { usePodeAcessoPortal } from "../AcessoPortalNegocio";
import { ContratoDoc, FaturaDoc, Partilhar, PropostaDoc } from "../DocsCliente";
import { AutoRececaoDoc } from "../AutoRececao";
import { usePainelUrl } from "../usarParamUrl";
import { Vista3D } from "@/pages/prototipo-estudio/Vista3D";
import { documentosEnviados, type DocEnviado, type TomDoc } from "./enviadosAoCliente";
import { antesDoArranque } from "./ComandoObra";
import { comNomesDoContrato, extrasDoContrato, obraEm3D, obraEm3DComModelos, obraEm3DNoDia, pedidosDosExtras, tarefaDaPeca } from "./obra3d";
import { COR_FASE, FASES_OBRA } from "../fasesObra";
import { dataCurta } from "../planoObra";
import { materiaisPorFase } from "../obraOps";
import { useInventario } from "../inventario/loja";
import type { Inventario } from "../inventario/tipos";
import { resumoEcNegocio } from "../inventario/ponteNegocios";
import { nomeTec } from "../AcompanhamentoObra";
import { ROTULO_VIVO, estadoVivo, nomeCurtoTarefa } from "./planoVivo";
import { cenaDe } from "@/pages/prototipo-estudio/cenaDoProjeto";
import { PlantaVista } from "@/pages/prototipo-estudio/PlantaVista";
import { projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import { sairam } from "@/pages/prototipo-estudio/necessidadesEstudio";
import { ouvirProdutosReais, produto, versaoProdutosReais } from "@/pages/prototipo-estudio/catalogoFake";
import { produtosPedidosDoProjeto, useLerProdutos } from "@/pages/prototipo-estudio/produtosDoProjeto";
import { PECAS } from "../planta";

const TOM: Record<TomDoc, string> = {
  ok: "bg-success/15 text-success", espera: "bg-warning/15 text-amber-800 dark:text-amber-300", mau: "bg-destructive/10 text-destructive", neutro: "bg-muted text-muted-foreground",
};

/* ================================================================== os documentos enviados ao cliente */
export function DocumentosDaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const L = documentosEnviados(d, ctx.S);
  if (!L.length) return <p className="rounded-xl bg-muted/50 px-4 py-3 text-[15px] text-muted-foreground">Ainda nada foi enviado ao cliente.</p>;
  return (
    <section aria-label="Documentos enviados ao cliente" className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold">Enviados ao cliente</h2>
        <p className="text-sm text-muted-foreground">O que o cliente tem no portal, do primeiro ao último. Toque para abrir.</p>
      </div>
      <ul className="space-y-2">{L.map((x) => <LinhaDoc key={x.id} ctx={ctx} d={d} x={x} />)}</ul>
    </section>
  );
}

function LinhaDoc({ ctx, d, x }: { ctx: Ctx; d: Negocio; x: DocEnviado }) {
  const [aberto, setAberto] = usePainelUrl("doc", x.id);
  const [confirmar, setConfirmar] = useState(false);
  const planeia = podeNeg(ctx.S.role, "obra.planear");
  return (
    <li className="rounded-xl bg-card ring-1 ring-border transition-colors hover:bg-muted/40 hover:ring-foreground/30">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2 pr-3">
        <button type="button" onClick={() => setAberto(true)} aria-label={`${x.titulo} ${x.numero}: ${x.estado}. Abrir`}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{x.titulo}</span>
            <span className="block text-sm text-muted-foreground">{x.numero}{x.quando ? ` · enviado ${/^\d/.test(x.quando) ? "a " : ""}${x.quando}` : ""}</span>
          </span>
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", TOM[x.tom])}>{x.estado}</span>
        </button>
        {planeia && x.tom !== "neutro" && !confirmar && <Button type="button" size="sm" variant="ghost" className="min-h-10 rounded-full" onClick={() => setConfirmar(true)}><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Reenviar</Button>}
      </div>
      {confirmar && (modoReal() ? <ReenviarReal ctx={ctx} d={d} x={x} fechar={() => setConfirmar(false)} /> : <Reenviar ctx={ctx} d={d} x={x} pode fechar={() => setConfirmar(false)} />)}
      {aberto && <DocAberto ctx={ctx} d={d} x={x} fechar={() => setAberto(false)} />}
    </li>
  );
}

/** Numa conta real, reenviar o acesso pede a permissão do portal (a mesma do «Acesso ao portal» do negócio). */
function ReenviarReal(props: { ctx: Ctx; d: Negocio; x: DocEnviado; fechar: () => void }) {
  const perm = usePodeAcessoPortal(props.d, true);
  return <Reenviar {...props} pode={perm.pode} porque={!perm.pode && !perm.aLer ? perm.motivo : undefined} />;
}
function Reenviar({ ctx, d, x, pode, porque, fechar }: { ctx: Ctx; d: Negocio; x: DocEnviado; pode: boolean; porque?: string; fechar: () => void }) {
  const email = emailDaFicha(d);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{pode ? <>Reenviar ao cliente o aviso com {x.titulo.toLowerCase()} {x.numero}{email ? <> para <b className="font-medium">{email}</b></> : ""}?</> : porque ?? "Sem permissão para reenviar."}</span>
      {pode && <Button type="button" size="sm" className="min-h-10 rounded-full" onClick={() => { ctx.run(() => ctx.A.reenviarDocumento(d.id, x.reenvio, `${x.titulo} ${x.numero}`)); fechar(); }}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Sim, reenviar</Button>}
      <Button type="button" size="sm" variant="ghost" className="min-h-10 rounded-full" onClick={fechar}>{pode ? "Não" : "Fechar"}</Button>
    </div>
  );
}

/** O documento por cima do Estúdio (no telemóvel, em ecrã inteiro). Esc fecha só o documento. */
function DocAberto({ ctx, d, x, fechar }: { ctx: Ctx; d: Negocio; x: DocEnviado; fechar: () => void }) {
  const S = ctx.S;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); fechar(); } };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [fechar]);
  const doc = x.k === "proposta" ? <PropostaDoc S={S} d={d} /> : x.k === "contrato" ? <ContratoDoc S={S} d={d} />
    : x.k === "fatura" ? <FaturaDoc S={S} d={d} /> : x.k === "faturaTranche" ? <FaturaDoc S={S} d={d} reg={x.reg} regParcela={x.reg?.tranche} />
    : x.k === "propostaAdenda" ? <PropostaDoc S={S} d={d} a={x.a} /> : x.k === "contratoAdenda" ? <ContratoDoc S={S} d={d} a={x.a} />
    : x.k === "faturaAdenda" ? <FaturaDoc S={S} d={d} a={x.a} ft={x.ft} /> : <AutoRececaoDoc d={d} />;
  const tipo = x.k === "proposta" ? "proposta" : x.k === "contrato" || x.k === "contratoAdenda" ? "contrato" : x.k === "propostaAdenda" ? "adenda" : x.k === "auto" ? null : "fatura";
  return (
    <NaFrente>
    <div className="fixed inset-0 z-[60] flex justify-center bg-black/40 sm:items-center sm:p-6" onClick={fechar}>
      <div role="dialog" aria-modal="true" aria-label={`${x.titulo} ${x.numero}`} onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-4xl flex-col bg-card shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{x.numero} · {x.estado}</p>
            <h2 className="text-lg font-semibold">{x.titulo}</h2>
          </div>
          <Button type="button" variant="ghost" className="min-h-10 shrink-0" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tipo ? <Partilhar ctx={ctx} d={d} tipo={tipo} estado={x.estado}>{doc}</Partilhar> : doc}
        </div>
        <div className="flex justify-end border-t border-border p-3">
          <Button type="button" variant="outline" size="lg" onClick={fechar}>Fechar</Button>
        </div>
      </div>
    </div>
    </NaFrente>
  );
}

/* ================================================================== o projeto em 3D e as plantas */
// 23/11 (Rúben: «o 3D ainda é genérico… quero o 3D real do projeto aprovado e a planta antes e depois»). O 3D com modelos do passo «3D»
// do Estúdio (os produtos do contrato, o revestimento e o pavimento como materiais), com o feito a cores e o que falta transparente; sem
// WebGL (ou se o 3D com modelos falhar), o 3D simples de antes. Por baixo, as duas plantas do Estúdio: como está e como vai ficar.
const Visualizador3D = lazy(() => import("@/emylia/planta3d/Visualizador3D"));

let webgl: boolean | null = null;
/** Se o browser desenha 3D (WebGL). Pergunta-se uma vez. */
function temWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { webgl = false; }
  return webgl;
}

/** Se o 3D com modelos falhar (um modelo que não abre), fica o 3D simples em vez de partir o ecrã. */
class Falha3D extends Component<{ alternativa: ReactNode; children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch(e: unknown) { console.warn("[obra] o 3D com modelos falhou; fica o simples:", e); }
  render() { return this.state.erro ? this.props.alternativa : this.props.children; }
}

/** O nome de um produto na planta: sem o tipo à frente («Base de Duche ZEUS 70x150» → «ZEUS 70x150»), até três palavras. */
export function nomeCurto(nome: string, tipo: string): string {
  const n = nome.trim();
  const sem = n.toLowerCase().startsWith(tipo.toLowerCase()) ? n.slice(tipo.length).trim() : n;
  return (sem || n).split(/\s+/).slice(0, 3).join(" ");
}

export function ProjetoEm3D({ d, dias = [], abrirTarefa }: { d: Negocio; dias?: Date[]; abrirTarefa?: (ti: number) => void }) {
  // os produtos do projeto e do contrato, lidos pelo id (o Estúdio da obra não carrega o catálogo); redesenha quando chegam
  // os do contrato entram logo pelo nome (os produtos das Necessidades); a linha do catálogo junta-se quando chega
  const pr = useMemo(() => projetoDoNegocio(d.f), [d.f.estudio]); // eslint-disable-line react-hooks/exhaustive-deps
  const pedidos = useMemo(() => (pr ? comNomesDoContrato(d, produtosPedidosDoProjeto(pr, pedidosDosExtras(extrasDoContrato(d)))) : []), [pr, d, d.visita.prod]); // eslint-disable-line react-hooks/exhaustive-deps
  useLerProdutos(pedidos);
  const versao = useSyncExternalStore(ouvirProdutosReais, versaoProdutosReais);
  const O = useMemo(() => obraEm3D(d), [d, d.f.estudio, d.obra.plano, versao]); // eslint-disable-line react-hooks/exhaustive-deps
  const M = useMemo(() => obraEm3DComModelos(d), [d, d.f.estudio, d.obra.plano, versao]); // eslint-disable-line react-hooks/exhaustive-deps
  const [qual, setQual] = useState<"obra" | "final" | "antes">("obra");
  const [vista, setVista] = useState<"3d" | "cima" | "pessoa">("3d");
  const [sel, setSel] = useState<string | null>(null);
  // 23/11 (Rúben: «mega next-level»): a régua do tempo. null = hoje (o que está mesmo feito); um número = esse dia, pelo plano
  const plano = d.obra.plano;
  const fimPlano = plano ? Math.max(1, ...plano.tasks.map((t) => t.dia + t.dur)) : 1;
  const hojeK = plano?.estado === "em curso" ? Math.min(plano.dia, fimPlano - 1) : plano?.estado === "concluída" ? fimPlano - 1 : 0;
  const [diaSel, setDiaSel] = useState<number | null>(null);
  const noDia = useMemo(() => (diaSel == null ? null : obraEm3DNoDia(d, diaSel)), [d, diaSel, versao]); // eslint-disable-line react-hooks/exhaustive-deps
  const inv = useInventario();
  if (!O || !M) {
    return <p className="rounded-xl bg-muted/50 px-4 py-3 text-[15px] text-muted-foreground">Este negócio não tem projeto do Estúdio do projeto: o 3D aparece quando a visita é feita no Estúdio.</p>;
  }
  const opcao = (on: boolean) => cn("min-h-11 rounded-full px-4 text-[15px] font-medium transition-colors", on ? "bg-background shadow-sm" : "text-muted-foreground");
  // 23/11 (revisão): antes do arranque, «A obra hoje» é a divisão como está (o antes), não o depois transparente
  const aindaNao = !!plano && antesDoArranque(plano) && diaSel == null;
  const titulo = qual === "obra" && aindaNao ? "A divisão como está, antes da obra" : qual === "obra" ? "A obra em 3D, com o que está feito" : qual === "final" ? "A obra acabada, como vai ficar" : "A divisão antes da obra";
  const simples = <Vista3D cena={qual === "obra" ? (aindaNao ? O.antes : O.cena) : qual === "final" ? cenaDe(M.projeto.depois, M.projeto, true) : O.antes} titulo={titulo} />;
  const res = qual === "obra" ? (noDia?.cena ?? (aindaNao ? M.antes : M.hoje)) : qual === "final" ? M.final : M.antes;
  const porFazer = qual === "obra" && !aindaNao ? (noDia ? noDia.porFazer : M.porFazer) : undefined;
  const comModelos = res.ok && temWebGL();
  const p = M.projeto;
  return (
    <div className="space-y-8">
      <section aria-label="O projeto em 3D" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Box className="h-4 w-4 text-primary" aria-hidden="true" />Como a obra vai ficar</h2>
            <p className="text-sm text-muted-foreground">
              {qual === "obra" && aindaNao ? <>A obra ainda não começou: <b className="font-medium text-foreground">a divisão como está hoje</b>. Use a régua para a ver a ser feita, dia a dia.</>
                : qual === "obra" ? <>{noDia ? "O plano neste dia." : "O projeto aprovado."} <b className="font-medium text-foreground">A cores, o que {noDia ? "o plano dá por feito" : "já está feito"}</b>; transparente, o que falta{(noDia ?? M).total ? ` (${(noDia ?? M).feitas} de ${(noDia ?? M).total} peças feitas)` : noDia && !noDia.demolida ? " (ainda antes da demolição)" : ""}. Só para ver.</>
                : qual === "final" ? "O projeto aprovado, com tudo feito: os produtos do contrato, o revestimento e o pavimento." : "A divisão como estava antes da obra."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div role="group" aria-label="O que ver" className="inline-flex rounded-full bg-muted p-1">
              <button type="button" aria-pressed={qual === "obra"} onClick={() => setQual("obra")} className={opcao(qual === "obra")}>A obra hoje</button>
              <button type="button" aria-pressed={qual === "final"} onClick={() => setQual("final")} className={opcao(qual === "final")}>Como vai ficar</button>
              <button type="button" aria-pressed={qual === "antes"} onClick={() => setQual("antes")} className={opcao(qual === "antes")}>Antes</button>
            </div>
            {comModelos && (
              <div role="group" aria-label="A vista" className="inline-flex rounded-full bg-muted p-1">
                {([["3d", "3D"], ["cima", "De cima"], ["pessoa", "Pessoa"]] as const).map(([v, n]) => (
                  <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)} className={opcao(vista === v)}>{n}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        {comModelos && res.ok ? (
          <div className={cn("overflow-hidden rounded-2xl border border-border", qual === "obra" && plano ? "h-[48vh] min-h-[320px]" : "h-[62vh] min-h-[420px]")}>
            <Falha3D alternativa={simples}>
              <Suspense fallback={<p className="grid h-full place-items-center text-[15px] text-muted-foreground">A abrir o 3D…</p>}>
                <Visualizador3D espaco={res.espaco} modelos={res.modelos} vista={vista} teto={false} etiquetas={false} descricao={titulo}
                  selecionada={sel} onSelecionar={setSel} porFazer={porFazer} />
              </Suspense>
            </Falha3D>
          </div>
        ) : simples}
        {comModelos && qual === "obra" && plano && (
          <ReguaDoTempo plano={plano} dias={dias} fim={fimPlano} hoje={hojeK} dia={diaSel} setDia={(k) => { setDiaSel(k === hojeK ? null : k); setSel(null); }} />
        )}
        {comModelos && sel && res.ok && <PecaTocada d={d} pecaId={sel} nome={res.modelos[res.espaco.pecas.find((x) => x.id === sel)?.produtoId ?? ""]?.nome} dias={dias} inv={inv} abrir={abrirTarefa} fechar={() => setSel(null)} />}
        {comModelos && !sel && <p className="text-sm text-muted-foreground">Arraste para rodar. Toque numa peça para ver quem a instala, quando e o estado do material.</p>}
      </section>

      <section aria-label="As plantas antes e depois" className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">As plantas</h2>
          <p className="text-sm text-muted-foreground">Como está e como vai ficar, com as medidas das paredes. A tracejado, o que sai.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlantaVista planta={p.antes} titulo="Antes: como está" />
          <PlantaVista planta={p.depois} titulo="Depois: como vai ficar" fantasmas={sairam(p)}
            cor={(pc) => produto(p.escolhas[pc.id])?.hex} rotulo={(pc) => { const x = produto(p.escolhas[pc.id]); return x ? `${PECAS[pc.tipo].n} · ${nomeCurto(x.colecao || x.n, PECAS[pc.tipo].n)}` : undefined; }} />
        </div>
      </section>
    </div>
  );
}

/** 23/11: a régua do tempo do 3D: um segmento por dia do plano, na cor da fase que nele decorre; «Hoje» volta ao que está mesmo feito. */
function ReguaDoTempo({ plano, dias, fim, hoje, dia, setDia }: { plano: Plano; dias: Date[]; fim: number; hoje: number; dia: number | null; setDia: (k: number) => void }) {
  const k = dia ?? hoje;
  const quando = (x: number) => (dias[x] ? dataCurta(dias[x]) : `dia ${x + 1}`);
  const ativas = (x: number) => plano.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.dia <= x && x < t.dia + t.dur);
  const faseDe = (x: number) => { const a = ativas(x); return a.length ? Math.max(...a.map(({ t }) => t.fase ?? 1)) : null; };
  const A = ativas(k), f = faseDe(k);
  return (
    <section aria-label="A obra dia a dia" className="space-y-2 rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <b className="font-semibold">{dia == null ? "Hoje" : `Dia ${k + 1} de ${fim}`}</b> · {quando(k)}
          {f && <span className="text-muted-foreground"> · Fase {f} · {FASES_OBRA[f - 1]?.curto}</span>}
        </p>
        {dia != null && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => setDia(hoje)}>Voltar a hoje</Button>}
      </div>
      <div className="flex gap-0.5" role="group" aria-label="Escolher o dia">
        {Array.from({ length: fim }, (_, x) => {
          const fx = faseDe(x);
          return (
            <button key={x} type="button" aria-label={`${quando(x)}${fx ? `, fase ${fx}` : ", sem trabalho"}`} aria-pressed={x === k} onClick={() => setDia(x)}
              className={cn("h-7 min-w-0 flex-1 rounded-sm transition-transform hover:scale-y-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", x === k && "ring-2 ring-foreground ring-offset-1 ring-offset-card")}
              style={{ background: fx ? COR_FASE[fx] : "hsl(var(--muted))", opacity: x <= k ? 1 : 0.35 }} />
          );
        })}
      </div>
      <input type="range" min={0} max={fim - 1} value={k} onChange={(e) => setDia(Number(e.target.value))} aria-label="O dia da obra" className="w-full accent-[hsl(var(--primary))]" />
      <p className="text-xs text-muted-foreground">
        {A.length ? <>Neste dia: {A.map(({ t }) => `${nomeCurtoTarefa(t.nome)} (${(nomeTec(t.tec) || "sem técnico").split(" ")[0]})`).join(", ")}.</> : "Neste dia não há trabalho marcado."}
        {dia != null && " As peças aparecem a cores quando o plano as dá por feitas."}
      </p>
    </section>
  );
}

/** 23/11: a peça tocada no 3D: a tarefa que a instala, quem, quando, o estado, e o material. */
function PecaTocada({ d, pecaId, nome, dias, inv, abrir, fechar }: { d: Negocio; pecaId: string; nome?: string; dias: Date[]; inv: Inventario; abrir?: (ti: number) => void; fechar: () => void }) {
  const p = d.obra.plano, ti = tarefaDaPeca(d, pecaId), t = ti != null && p ? p.tasks[ti] : null;
  const quando = (x: number) => (dias[x] ? dataCurta(dias[x]) : `dia ${x + 1}`);
  const resumo = d.obra.ec?.ref ? resumoEcNegocio(inv, d.obra.ec.ref) : null;
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const mat = nome ? materiaisPorFase(d, resumo).flatMap((g) => g.itens).find((m) => norm(m.n) === norm(nome)) : undefined;
  return (
    <section aria-label="A peça escolhida" className="flex flex-wrap items-start gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-3">
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <p className="font-semibold">{nome ?? "Peça"}</p>
        {t && p ? <p>Instala: <b className="font-medium">{nomeCurtoTarefa(t.nome)}</b> · {(nomeTec(t.tec) || "sem técnico").split(" ")[0]} · {t.dur > 1 ? `${quando(t.dia)} a ${quando(t.dia + t.dur - 1)}` : quando(t.dia)} · {ROTULO_VIVO[estadoVivo(t, p)].toLowerCase()}</p>
          : <p className="text-muted-foreground">Sem tarefa própria no plano.</p>}
        <p className="text-muted-foreground">Material: {mat ? (mat.quando ? `chega a ${mat.quando}` : mat.estado === "reservado" || mat.estado === "recebido" ? "no armazém" : mat.estado) : "não está na encomenda"}</p>
      </div>
      <div className="flex gap-2">
        {t && ti != null && abrir && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => abrir(ti)}>Abrir a tarefa</Button>}
        <Button type="button" size="sm" variant="ghost" className="min-h-9 rounded-full" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" /></Button>
      </div>
    </section>
  );
}
