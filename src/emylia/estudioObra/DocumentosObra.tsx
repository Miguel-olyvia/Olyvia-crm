// 12/11 (Rúben: «falta no estúdio da gestão da obra também os documentos enviados ao cliente, ter também a parte do 3D para ver»).
// Dois separadores do Estúdio da obra:
//  · Documentos: o que foi para o portal do cliente (documentosObra.ts), quando e em que estado; abrir cada um por cima (o «voltar» fecha,
//    ?doc=) e reenviar o acesso ao cliente com esse documento (pede confirmação; numa conta real, a permissão do portal);
//  · 3D: o projeto do Estúdio do projeto em volume (obra3d.ts), só para ver: o que está feito a cores, o que falta transparente.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Visualizador3DSeguro } from "@/emylia/planta3d/Visualizador3DSeguro";
import { temWebGL } from "@/emylia/planta3d/carregarVisualizador3D";
import { Box, Check, FileText, Pause, Play, Send, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio, Plano } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { podeNeg } from "../permissoes";
import { modoReal, emailDaFicha } from "../acessosPortal";
import { usePodeAcessoPortal } from "../AcessoPortalNegocio";
import { ContratoDoc, FaturaDoc, Partilhar, PropostaDoc, imprimir } from "../DocsCliente";
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
import { AvatarTec, nomeTec } from "../AcompanhamentoObra";
import { ICONE_DA_FASE, iconeDaTarefa } from "./CaminhoCritico";
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
export function DocAberto({ ctx, d, x, fechar, imprimirLogo = false }: { ctx: Ctx; d: Negocio; x: DocEnviado; fechar: () => void;
  /** 25/11 (Tudo do negócio, «PDF»): pede logo a impressão da folha (no diálogo, «Guardar como PDF») */ imprimirLogo?: boolean }) {
  const S = ctx.S;
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!imprimirLogo) return;
    const id = window.setTimeout(() => imprimir(caixa.current?.querySelector(".folha") as HTMLElement | null, `${x.titulo} ${x.numero}`), 350);
    return () => window.clearTimeout(id);
  }, [imprimirLogo]); // eslint-disable-line react-hooks/exhaustive-deps
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
      <div ref={caixa} role="dialog" aria-modal="true" aria-label={`${x.titulo} ${x.numero}`} onClick={(e) => e.stopPropagation()}
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
  // as peças da planta com trabalho no dia escolhido na régua (a tarefa do ofício de cada uma)
  const doDia = useMemo(() => {
    const out = new Set<string>();
    if (diaSel == null || !plano || !pr) return out;
    for (const pc of pr.depois.pecas) { const ti = tarefaDaPeca(d, pc.id), t = ti != null ? plano.tasks[ti] : null; if (t && t.dia <= diaSel && diaSel < t.dia + t.dur) out.add(pc.id); }
    return out;
  }, [d, diaSel, plano, pr]);
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
            {/* 25/11: o visualizador com o 3D simples de reserva, que diz porquê e volta a tentar (Visualizador3DSeguro) */}
            <Visualizador3DSeguro alternativa={simples} refazer={`${qual}|${vista}|${diaSel ?? ""}`} espaco={res.espaco} modelos={res.modelos} vista={vista}
              teto={false} etiquetas={false} descricao={titulo} selecionada={sel} onSelecionar={setSel} porFazer={porFazer} />
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
          <PlantaVista planta={p.depois} titulo={diaSel != null ? `Depois: a cores forte, o trabalho de ${dias[diaSel] ? dataCurta(dias[diaSel]) : `dia ${diaSel + 1}`}` : "Depois: como vai ficar"} fantasmas={sairam(p)}
            cor={(pc) => (doDia.has(pc.id) ? "#7c5ce0" : produto(p.escolhas[pc.id])?.hex)} rotulo={(pc) => { const x = produto(p.escolhas[pc.id]); return x ? `${PECAS[pc.tipo].n} · ${nomeCurto(x.colecao || x.n, PECAS[pc.tipo].n)}` : undefined; }} />
        </div>
      </section>
    </div>
  );
}

// 23/11 (Rúben: «não gosto desta barra de progresso»): uma só linha do tempo. As fases da obra como segmentos (o nome, o ícone e a cor
// delas, as mesmas do Plano e do caminho crítico); até ao dia escolhido, preenchidas; depois, só em contorno. Um só cursor grande (arrasta-se,
// e as setas do teclado andam um dia), com o dia escrito por cima; a marca de «Hoje»; as segundas-feiras como marcos de data por baixo. As
// tarefas do dia em cartões, com o técnico e o ícone do trabalho.
export function ReguaDoTempo({ plano, dias, fim, hoje, dia, setDia }: { plano: Plano; dias: Date[]; fim: number; hoje: number; dia: number | null; setDia: (k: number) => void }) {
  const k = dia ?? hoje;
  const [aTocar, setATocar] = useState(false);
  useEffect(() => {
    if (!aTocar) return;
    const id = window.setTimeout(() => { if (k >= fim - 1) setATocar(false); else setDia(k + 1); }, 800);
    return () => window.clearTimeout(id);
  }, [aTocar, k, fim]); // eslint-disable-line react-hooks/exhaustive-deps
  const tocar = () => { if (aTocar) { setATocar(false); return; } if (k >= fim - 1) setDia(0); setATocar(true); };
  const quando = (x: number) => (dias[x] ? dataCurta(dias[x]) : `dia ${x + 1}`);
  const curta = (x: number) => quando(x).replace(/^[^,]+, /, "");
  const pos = (x: number) => `${((x + 0.5) / fim) * 100}%`;
  // as fases: cada uma do primeiro dia dela até ao início da seguinte (ou ao fim dela, a última)
  const fases = FASES_OBRA.map((f) => {
    const ts = plano.tasks.filter((t) => (t.fase ?? 1) === f.n);
    return ts.length ? { n: f.n, nome: f.curto, ini: Math.min(...ts.map((t) => t.dia)), fimF: Math.max(...ts.map((t) => t.dia + t.dur)) } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.ini - b.ini);
  const segs = fases.map((f, i) => ({ ...f, ate: i + 1 < fases.length ? Math.max(f.ini + 1, fases[i + 1].ini) : Math.max(f.fimF, f.ini + 1) }));
  const faseDe = (x: number) => segs.find((s) => x >= s.ini && x < s.ate) ?? null;
  // as datas por baixo: as segundas, o primeiro e o último dia; duas muito juntas («28 dez», «29 dez») ficam numa só (a última ganha)
  const perto = Math.max(2, Math.round(fim * 0.09));
  const marcos = Array.from({ length: fim }, (_, x) => x).filter((x) => x === 0 || x === fim - 1 || dias[x]?.getDay() === 1)
    .reduce<number[]>((acc, x) => { if (acc.length && x - acc[acc.length - 1] < perto) { if (x === fim - 1 && acc.length > 1) acc[acc.length - 1] = x; return acc; } acc.push(x); return acc; }, []);
  const ativas = plano.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.dia <= k && k < t.dia + t.dur);
  const fk = faseDe(k), primeiroDia = segs[0]?.ini ?? 0;
  return (
    <section aria-label="A obra dia a dia" className="space-y-4 rounded-2xl border border-border bg-card p-4">
      {/* o dia escolhido, o reproduzir e voltar a hoje */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label={aTocar ? "Parar" : "Ver a obra a andar, dia a dia"} onClick={tocar}>
          {aTocar ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight">{quando(k)}</p>
          <p className="text-sm text-muted-foreground">
            {k < primeiroDia ? "Antes do arranque" : `Dia ${k - primeiroDia + 1} de ${fim - primeiroDia}`}{fk ? <> · <span style={{ color: COR_FASE[fk.n] }} className="font-medium">{fk.nome}</span></> : ""}{dia == null ? " · hoje" : ""}
          </p>
        </div>
        {dia != null && <button type="button" onClick={() => { setATocar(false); setDia(hoje); }} className="min-h-10 shrink-0 rounded-full px-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Voltar a hoje</button>}
      </div>

      {/* 23/11 (revisão: «segmentos só em contorno e sem nome»): a linha do tempo é feita das fases, cada uma com a cor, o ícone e o nome
          dentro (o nome some quando não cabe; fica o ícone e a dica). Até ao dia escolhido, a cor cheia; depois, a cor clara. */}
      <div className="relative pt-7">
        {/* o dia escolhido, por cima do cursor */}
        <span aria-hidden="true" className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background transition-[left] duration-200" style={{ left: pos(k) }}>{curta(k)}</span>
        <div className="relative h-9">
          {segs.map((s) => {
            const a = (s.ini / fim) * 100, w = ((s.ate - s.ini) / fim) * 100, cor = COR_FASE[s.n], Ic = ICONE_DA_FASE[s.n] ?? Wrench;
            const cheio = Math.max(0, Math.min(1, (k + 1 - s.ini) / (s.ate - s.ini)));
            const rotulo = (claro: boolean) => (
              <span className="flex h-full items-center gap-1.5 overflow-hidden px-2 text-xs font-semibold" style={{ color: claro ? "#fff" : cor }}>
                <Ic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{s.nome}</span>
              </span>
            );
            return (
              <span key={s.n} title={`${s.nome}: ${quando(s.ini)} a ${quando(s.ate - 1)}`} className={cn("absolute inset-y-0 overflow-hidden rounded-lg ring-inset", fk?.n === s.n && "ring-2")}
                style={{ left: `calc(${a}% + 1px)`, width: `calc(${w}% - 2px)`, background: `color-mix(in srgb, ${cor} 16%, hsl(var(--card)))`, ["--tw-ring-color" as string]: cor }}>
                {rotulo(false)}
                {cheio > 0 && (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-200" style={{ width: `${cheio * 100}%`, background: cor }}>
                    <span className="absolute inset-y-0 left-0" style={{ width: `${100 / cheio}%` }}>{rotulo(true)}</span>
                  </span>
                )}
              </span>
            );
          })}
          {/* hoje */}
          {hoje >= 0 && <span aria-hidden="true" className="absolute -inset-y-1.5 z-[1] w-0.5 -translate-x-1/2 rounded-full bg-foreground/80" style={{ left: pos(hoje) }} />}
          {/* o cursor (visual): um pegador alto que não tapa o nome da fase; o controlo é o deslizador transparente por cima */}
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 z-[2] h-12 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-background shadow-md transition-[left] duration-200" style={{ left: pos(k), background: fk ? COR_FASE[fk.n] : "hsl(var(--foreground))" }} />
          <input type="range" min={0} max={fim - 1} step={1} value={k} onChange={(e) => { setATocar(false); setDia(Number(e.target.value)); }}
            aria-label="O dia da obra" aria-valuetext={`${quando(k)}${fk ? `, ${fk.nome}` : ""}`}
            className="absolute -inset-y-3 left-0 z-[3] w-full cursor-grab opacity-0 active:cursor-grabbing" />
        </div>
        {/* os marcos: as segundas-feiras, o primeiro e o último dia (dois muito juntos ficam num só: o fim ganha) */}
        <div className="relative mt-2 h-5 text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
          {marcos.map((x) => <span key={x} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(x) }}>{curta(x)}</span>)}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-foreground/70" />Hoje, {curta(hoje)}</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-5 rounded bg-primary" />Feito até ao dia escolhido</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-5 rounded bg-primary/20" />Por fazer</span>
      </p>

      {/* as tarefas do dia */}
      <div>
        <p className="mb-2 text-sm font-semibold">Neste dia</p>
        {ativas.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ativas.map(({ t, ti }) => {
              const T = iconeDaTarefa(t.nome), cor = COR_FASE[t.fase ?? 1];
              return (
                <li key={ti} className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-2.5" style={{ borderLeft: `4px solid ${cor}` }} title={t.nome}>
                  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}><T className="h-[18px] w-[18px]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{nomeCurtoTarefa(t.nome)}</span>
                    <span className="block text-xs text-muted-foreground">{t.dur > 1 ? `dia ${k - t.dia + 1} de ${t.dur}` : "um dia"}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs"><AvatarTec id={t.tec} tam="h-7 w-7" /><span className="hidden sm:inline">{(nomeTec(t.tec) || "Sem técnico").split(" ")[0]}</span></span>
                </li>
              );
            })}
          </ul>
        ) : <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{k < primeiroDia ? "Ainda antes do arranque: a divisão como está." : "Sem trabalho marcado neste dia."}</p>}
        {dia != null && <p className="mt-2 text-xs text-muted-foreground">No 3D, a cores o que o plano dá por feito ao fim deste dia.</p>}
      </div>
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
