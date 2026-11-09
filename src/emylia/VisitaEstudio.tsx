// 6/11 (Rúben: «refazermos no pipeline a fase da visita, porque o Estúdio já está a fazer praticamente tudo»). A Visita de uma casa de
// banho em seis momentos: a caminho (a morada para o Waze e o Google Maps), o exterior à chegada, a gravação da conversa (por cima dos
// passos), o interior e a área à mão, o Estúdio, e fechar a visita. As medidas, as necessidades e as peças da casa de banho saem do
// Estúdio e ficam num resumo dobrado no fecho, para conferir; o prazo e a decisão confirmam-se lá, com o plano de obra estimado.
//
// O projeto do Estúdio vive no negócio (f.estudio): o Estúdio abre noutro separador e grava neste browser; esta página ouve e guarda
// no negócio a versão mais recente. «Voltar ao negócio» (ou «Trazer do Estúdio») passa a planta, as medidas, as respostas das peças e
// as necessidades (estas com revisão, ligadas ao Catálogo verdadeiro).
import { irPara, urlDoNegocio } from "./urlNegocio";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarCheck, Check, ChevronDown, MapPin, Navigation, Phone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHAVE_ESTUDIO, CHAVE_VOLTA, abrirEstudio, lerVolta, projetoDoEstudioPara, projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import { produtosEscolhidos } from "@/pages/prototipo-estudio/sugestoesServicos";
import { PlantaVista } from "@/pages/prototipo-estudio/PlantaVista";
import { acertarPosicoes } from "@/pages/prototipo-estudio/posicoesDepois";
import { produto } from "@/pages/prototipo-estudio/catalogoFake";
import { duracaoEmPalavras } from "@/pages/prototipo-estudio/planoEstimado";
import { planoDaVisita, planoParaGuardar } from "./planoDaVisita";
import { levarEstudio } from "./estudioNoNegocio";
import { escolhasDoNegocio } from "./preparacaoObra";
import { MapaDatasObra, inicioPorOmissao } from "./MapaDatasObra";
import { lerCatalogo } from "./v2/catalogoStore";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";
import { useCatalogo } from "./v2/catalogoStore";
import { ligarAoCatalogo, type LinhaLevada } from "./ligarEstudio";
import { porMedida, type Negocio } from "./motor";
import { areaChaoM2, gravarPlanta } from "./planta";
import type { Ctx } from "./pecas";

const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const dataCurta = (d: Date) => d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "long" });

/** A visita que segue o Estúdio: a de uma casa de banho (o que o Estúdio sabe fazer hoje). */
export const visitaComEstudio = (d: Negocio, divisoes: string[]) => d.linha === "wc" || d.linha === "coz" || divisoes.includes("Casa de banho") || divisoes.includes("Cozinha");
/** 6/11: a divisão do Estúdio pelo negócio (a cozinha, quando é só cozinha). */
export const divisaoDoEstudio = (d: Negocio): "Casa de banho" | "Cozinha" =>
  d.linha === "coz" || (/cozinha/i.test(d.f.diag_tipo_area ?? "") && !/casa de banho/i.test(d.f.diag_tipo_area ?? "") && d.linha !== "wc") ? "Cozinha" : "Casa de banho";

/** A morada da obra numa linha (a do negócio, ou o local). */
export const moradaDe = (d: Negocio) => (d.f.morada ? [d.f.morada, d.f.cp, d.f.localidade].filter(Boolean).join(", ") : d.local) || "";

// ------------------------------------------------------------------------------------------------ a caminho

/** Ao abrir o negócio na Visita: para onde se vai, com o Waze e o Google Maps, e o telefone para avisar o cliente. */
export function ACaminho({ d }: { d: Negocio }) {
  const morada = moradaDe(d);
  const tel = d.tel.includes("@") ? "" : d.tel.replace(/[^\d+]/g, "");
  if (!morada && !tel) return null;
  const q = encodeURIComponent(morada);
  const BOTAO = "inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-[15px] font-medium hover:border-primary/50 hover:bg-primary/[0.04]";
  return (
    <section aria-label="A caminho da visita" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between">
      <p className="flex min-w-0 items-start gap-2 text-[15px]">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0"><b className="font-semibold">A caminho</b>
          <span className="block break-words text-muted-foreground">{morada || "Sem morada: confirme-a com o cliente."}</span>
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {morada && <a className={BOTAO} href={`https://waze.com/ul?q=${q}&navigate=yes`} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4 text-primary" aria-hidden="true" />Waze</a>}
        {morada && <a className={BOTAO} href={`https://www.google.com/maps/dir/?api=1&destination=${q}`} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" />Google Maps</a>}
        {tel && <a className={BOTAO} href={`tel:${tel}`}><Phone className="h-4 w-4 text-primary" aria-hidden="true" />Avisar o cliente</a>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ o Estúdio na Visita

/**
 * O que o Estúdio passa ao negócio: a planta, as medidas da área, as respostas das peças, os serviços e os produtos do Catálogo e o dia de
 * início (estudioNoNegocio.ts). 9/11: os serviços e os produtos entram logo nas necessidades (já foram vistos no Estúdio, ligados ao
 * Catálogo verdadeiro); antes ficavam numa lista para rever aqui. O plano da obra guarda-se com o técnico e as datas.
 */
export function aplicarDoEstudio(ctx: Ctx, d: Negocio, p: Projeto): { avisos: string[]; linhas: LinhaLevada[] } {
  const produtos = lerCatalogo().produtos ?? [];
  let r: ReturnType<typeof levarEstudio> | null = null;
  // tudo numa só gravação (o run grava no negócio e redesenha)
  ctx.run(() => {
    r = levarEstudio(d, p, ctx.S, produtos, {
      campo: (k, v) => ctx.A.campo(d.id, k, v),
      medida: (k, n) => porMedida(d.visita.med, k, n),
      extra: (sid, q) => ctx.A.extra(d.id, sid, q),
      produto: (pr, q) => ctx.A.produto(d.id, pr, q),
      produtoQtd: (pid, q) => ctx.A.produtoQtd(d.id, pid, q),
      tirarProduto: (pid) => ctx.A.tirarProduto(d.id, pid),
    });
    guardarPlano(ctx, d, d.f.plano_inicio || inicioPorOmissao());
  });
  const res = r as ReturnType<typeof levarEstudio> | null;
  const avisos = [...(res?.avisos ?? [])];
  if (res?.semPar.length) avisos.push(`Sem par no Catálogo (junte à mão nas Necessidades): ${res.semPar.join("; ")}.`);
  return { avisos, linhas: [] };
}

/** Guarda no negócio o plano da obra da visita (o dia de início, a duração, as tarefas com o técnico e as datas). Dentro de um ctx.run. */
function guardarPlano(ctx: Ctx, d: Negocio, inicio: string): ReturnType<typeof planoDaVisita> {
  const P = planoDaVisita(d, ctx.S, inicio);
  if (d.f.plano_inicio !== inicio) ctx.A.campo(d.id, "plano_inicio", inicio);
  if (P.tarefas.length) {
    const dur = duracaoEmPalavras(P.dias), json = planoParaGuardar(P);
    if (d.f.duracao_obra !== dur) ctx.A.campo(d.id, "duracao_obra", dur);
    if (d.f.plano_estimado !== json) ctx.A.campo(d.id, "plano_estimado", json);
  }
  return P;
}

/** O passo «Estúdio» da Visita: abrir, continuar, e o que voltou (as necessidades para rever). */
export function EstudioNaVisita({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const salvo = projetoDoNegocio(d.f);
  const [feito, setFeito] = useState("");
  const chavePendentes = `olyvia.estudio.pendentes.${d.id}`;
  const [pendentes, setPendentesEstado] = useState<LinhaLevada[]>(() => { try { return JSON.parse(localStorage.getItem(chavePendentes) ?? "[]"); } catch { return []; } });
  const setPendentes = (ls: LinhaLevada[]) => {
    setPendentesEstado(ls);
    try { if (ls.length) localStorage.setItem(chavePendentes, JSON.stringify(ls)); else localStorage.removeItem(chavePendentes); } catch { /* fica só no ecrã */ }
  };
  // a versão do Estúdio já guardada no negócio (para só gravar o que é mais recente)
  const ultimo = useRef(salvo?.gravadoEm ?? 0);
  const ref = useRef({ ctx, d });
  ref.current = { ctx, d };
  const trazer = (p: Projeto) => {
    const r = aplicarDoEstudio(ref.current.ctx, ref.current.d, p);
    if (r.linhas.length) setPendentes(r.linhas);
    setFeito(r.avisos.join(" ") || "Do Estúdio não veio nada de novo.");
  };

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const gravar = () => {
      const local = projetoDoEstudioPara(ref.current.d.id);
      // 9/11 (o «statement timeout»): só se grava no negócio quando o projeto mudou mesmo (a hora sozinha não conta)
      const noNegocio = projetoDoNegocio(ref.current.d.f);
      const igual = !!local && !!noNegocio && JSON.stringify({ ...local, gravadoEm: 0 }) === JSON.stringify({ ...noNegocio, gravadoEm: 0 });
      if (local && igual) { ultimo.current = Math.max(ultimo.current, local.gravadoEm ?? 0); return local; }
      if (local && (local.gravadoEm ?? 0) > ultimo.current) {
        ultimo.current = local.gravadoEm ?? Date.now();
        const { ctx: c, d: n } = ref.current;
        c.run(() => c.A.campo(n.id, "estudio", JSON.stringify(local)));
      }
      return local;
    };
    const aoVoltar = () => {
      const local = gravar();
      const v = lerVolta(ref.current.d.id);
      if (!v) return;
      const p = local ?? projetoDoNegocio(ref.current.d.f);
      if (!p) {
        if (v.antes.paredes.length) { const { ctx: c, d: n } = ref.current; c.run(() => c.A.campo(n.id, "planta", gravarPlanta(v.antes))); setFeito("A planta ficou no negócio."); }
        return;
      }
      trazer(p);
      // 9/11: «Fechar a visita» no Estúdio: com tudo levado, a visita fecha (o orçamento nasce com o plano e as datas). Se faltar alguma
      // resposta obrigatória, o motor diz qual e a visita fica aberta.
      if (v.fechar) { const { ctx: c, d: n } = ref.current; c.run(() => c.A.fecharVisita(n.id)); }
    };
    aoVoltar();
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE_VOLTA) aoVoltar();
      else if (e.key === CHAVE_ESTUDIO) { clearTimeout(t); t = setTimeout(gravar, 800); }
    };
    window.addEventListener("storage", aoMudar);
    window.addEventListener("focus", aoVoltar);
    return () => { clearTimeout(t); window.removeEventListener("storage", aoMudar); window.removeEventListener("focus", aoVoltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por negócio (o ctx e o negócio vão por ref)
  }, [d.id]);

  // 9/11 (Rúben: «a transcrição não corre enquanto estamos no Estúdio»): o Estúdio abre no mesmo separador, sem recarregar a app, e a
  // gravação da visita continua (num separador à parte o telemóvel suspendia-a); «Voltar ao negócio» volta a este negócio
  const abrir = () => {
    if (abrirEstudio(d.nome, d.f, d.id, urlDoNegocio(d.id), divisaoDoEstudio(d))) irPara("/prototipo/estudio");
    else setFeito("Não deu para abrir o Estúdio neste browser.");
  };
  const prods = salvo ? produtosEscolhidos(salvo) : [];
  const chao = salvo ? areaChaoM2(salvo.depois.paredes) : null;

  const nServ = (salvo?.servicos ?? []).length;
  const guardado = salvo?.gravadoEm ? new Date(salvo.gravadoEm) : null;

  return (
    <div className="space-y-4">
      {salvo ? (
        <section aria-labelledby={`estudio-${d.id}`} className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:grid-cols-[11rem_minmax(0,1fr)]">
          {/* a planta de como vai ficar, com as peças nas cores dos produtos */}
          {salvo.depois.paredes.length > 0 ? (
            <div className="mx-auto w-full max-w-[14rem] sm:max-w-none [&_figcaption]:sr-only">
              <PlantaVista planta={acertarPosicoes(salvo).depois} titulo="Como vai ficar" cor={(pc) => produto(salvo.escolhas[pc.id])?.hex} />
            </div>
          ) : (
            <div className="grid aspect-square place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">Ainda sem planta</div>
          )}
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <h3 id={`estudio-${d.id}`} className="text-[17px] font-semibold tracking-tight">O projeto do Estúdio</h3>
              {guardado && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                  Guardado no negócio a {guardado.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}, às {guardado.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-2">
              {[
                { n: String(prods.length), l: prods.length === 1 ? "produto" : "produtos" },
                { n: String(nServ), l: nServ === 1 ? "serviço" : "serviços" },
                { n: chao !== null ? nf(chao) : "—", l: "m² de chão" },
              ].map((x) => (
                <div key={x.l} className="rounded-xl bg-muted/60 px-3 py-2.5">
                  <dt className="sr-only">{x.l}</dt>
                  <dd className="text-xl font-semibold tabular-nums leading-tight">{x.n}</dd>
                  <dd aria-hidden="true" className="text-xs text-muted-foreground">{x.l}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button type="button" className="min-h-11 flex-1 sm:flex-none" onClick={abrir}><Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />Continuar no Estúdio</Button>
              <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => trazer(projetoDoEstudioPara(d.id) ?? salvo)}>Trazer do Estúdio</Button>
            </div>
          </div>
        </section>
      ) : (
        <section aria-labelledby={`estudio-${d.id}`} className="space-y-4 rounded-2xl border border-primary/30 bg-primary/[0.04] p-5">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 id={`estudio-${d.id}`} className="text-[17px] font-semibold tracking-tight">Desenhar com o cliente</h3>
              <p className="text-[15px] text-muted-foreground">A planta de como está e de como vai ficar, as peças do catálogo, os serviços e o 3D.</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Ao voltar, preenche sozinho as medidas e as necessidades{divisaoDoEstudio(d) === "Casa de banho" ? " e as peças da casa de banho" : ""}.</p>
          <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={abrir}><Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />Abrir o Estúdio</Button>
        </section>
      )}
      {pendentes.length > 0 && <DoEstudio ctx={ctx} d={d} linhas={pendentes} feito={(texto) => { setPendentes([]); setFeito(texto); }} />}
      <p role="status" className="min-h-5 text-sm text-success">{feito}</p>
    </div>
  );
}

/**
 * 5/11: o que veio do Estúdio, ligado ao Catálogo verdadeiro, para o comercial rever: cada linha com o par (o serviço ou o produto) e a
 * quantidade; as que não têm par, à parte; as instalações que o produto já traz, só a dizer. «Juntar às necessidades» põe-nas no negócio
 * (os serviços com a quantidade, como os juntados à mão; os produtos como na escolha da visita), e daí ao orçamento.
 */
export function DoEstudio({ ctx, d, linhas, feito }: { ctx: Ctx; d: Negocio; linhas: LinhaLevada[]; feito: (texto: string) => void }) {
  const K = useCatalogo();
  const ligacoes = useMemo(() => ligarAoCatalogo(linhas, ctx.S?.svc ?? {}, K.produtos ?? []), [linhas, ctx.S?.svc, K.produtos]);
  const juntaveis = ligacoes.filter((g) => g.alvo && !g.vemComProduto);
  const [fora, setFora] = useState<Set<number>>(new Set());
  const semPar = ligacoes.filter((g) => !g.alvo);
  const comProduto = ligacoes.filter((g) => g.vemComProduto);
  const entram = juntaveis.filter((g) => !fora.has(ligacoes.indexOf(g)));
  const juntar = () => {
    let s = 0, pr = 0;
    ctx.run(() => {
      for (const g of entram) {
        if (!g.alvo) continue;
        if (g.alvo.tipo === "servico") { ctx.A.extra(d.id, g.alvo.id, g.q); s++; }
        else { const prod = (K.produtos ?? []).find((x) => x.id === g.alvo!.id); if (prod) { ctx.A.produto(d.id, prod, g.q); pr++; } }
      }
    });
    feito(`Nas necessidades: ${s} ${s === 1 ? "serviço" : "serviços"} e ${pr} ${pr === 1 ? "produto" : "produtos"} do Estúdio. Confira-os mais abaixo, em «Necessidades do cliente».`);
  };
  return (
    <section data-do-estudio aria-labelledby={`do-estudio-${d.id}`} className="space-y-3 rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`do-estudio-${d.id}`} className="text-[17px] font-semibold tracking-tight">Do Estúdio para as necessidades</h3>
          <p className="text-sm text-muted-foreground">O que se decidiu no Estúdio, com o par no Catálogo. Tire o que não entra e junte.</p>
        </div>
        <Button type="button" variant="ghost" className="min-h-11" aria-label="Agora não" onClick={() => feito("")}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      <ul className="space-y-2">
        {juntaveis.map((g) => {
          const i = ligacoes.indexOf(g), dentro = !fora.has(i);
          return (
            <li key={i}>
              <button type="button" role="checkbox" aria-checked={dentro} onClick={() => setFora((x) => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors", dentro ? "border-primary/40 bg-primary/[0.04]" : "border-border opacity-70")}>
                <span aria-hidden="true" className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2", dentro ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {dentro && <Check className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 text-[15px]">
                  <b className="font-medium">{g.alvo!.n}</b> · {g.q.toLocaleString("pt-PT")} {g.linhas[0].un}
                  <span className="block text-xs text-muted-foreground">{g.alvo!.tipo === "produto" ? "Produto" : "Serviço"} do Catálogo, de: {g.linhas.map((l) => l.n).join("; ")}</span>
                  {g.incluidas?.length ? <span className="block text-xs text-muted-foreground">Inclui: {g.incluidas.map((l) => l.n).join("; ")}.</span> : null}
                  {g.unDiferente && <span className="block text-xs text-warning-foreground">No Catálogo é por {g.unDiferente}: confirme a quantidade nas Necessidades.</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {comProduto.length > 0 && <p className="text-sm text-muted-foreground">A instalação já vem com o produto: {comProduto.flatMap((g) => g.linhas.map((l) => l.n)).join("; ")}.</p>}
      {semPar.length > 0 && <p className="text-sm text-warning-foreground">Sem par no Catálogo (junte à mão nas Necessidades): {semPar.flatMap((g) => g.linhas.map((l) => l.n)).join("; ")}.</p>}
      <Button type="button" className="min-h-11" disabled={entram.length === 0} onClick={juntar}>
        <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Juntar às necessidades ({entram.length})
      </Button>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ fechar a visita

export interface BlocoDobrado { id: string; titulo: string; resumo: string; corpo: ReactNode; falta?: number }

/** O fecho: o que o Estúdio preencheu (dobrado, para conferir), o prazo e a decisão, e o plano de obra estimado. */
export function FecharVisita({ ctx, d, blocos, decisao }: { ctx: Ctx; d: Negocio; blocos: BlocoDobrado[]; decisao: ReactNode }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby={`conferir-${d.id}`} className="space-y-3">
        <h3 id={`conferir-${d.id}`} className="text-[17px] font-semibold tracking-tight">O que o Estúdio preencheu</h3>
        <p className="text-[15px] text-muted-foreground">Abra só o que quiser conferir ou corrigir.</p>
        {blocos.map((b) => (
          <details key={b.id} className="group rounded-2xl border border-border bg-card p-4" open={!!b.falta || undefined}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{b.titulo}{b.falta ? <span className="ml-2 rounded-full bg-destructive/10 px-2 text-xs font-medium text-destructive">falta {b.falta}</span> : null}</span>
                <span className="block truncate text-sm text-muted-foreground">{b.resumo}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="pt-4">{b.corpo}</div>
          </details>
        ))}
      </section>
      <section aria-labelledby={`decisao-${d.id}`} className="space-y-3">
        <h3 id={`decisao-${d.id}`} className="text-[17px] font-semibold tracking-tight">Prazo e decisão</h3>
        {decisao}
      </section>
      <PlanoEstimado ctx={ctx} d={d} />
    </div>
  );
}

/** 9/11: o plano da obra da visita (planoDaVisita.ts): o mesmo que o orçamento e a obra vão ter, com a equipa do RH e o mapa de datas. */
export function PlanoEstimado({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const [inicio, setInicio] = useState(() => inicioPorOmissao(d.f.plano_inicio));
  const [guardado, setGuardado] = useState("");
  const P = useMemo(() => planoDaVisita(d, ctx.S, inicio), [d, ctx.S, inicio, d.visita.extra, d.visita.prod, d.visita.med, d.f.plano_tecnicos, d.f.plano_equipa]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = () => {
    let x: ReturnType<typeof planoDaVisita> | null = null;
    ctx.run(() => { x = guardarPlano(ctx, d, inicio); });
    const y = x as ReturnType<typeof planoDaVisita> | null;
    if (y?.inicio && y.fim) setGuardado(`Guardado: ${duracaoEmPalavras(y.dias)}, de ${dataCurta(y.inicio)} a ${dataCurta(y.fim)}.`);
  };
  return (
    <section aria-labelledby={`plano-${d.id}`} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <div>
        <h3 id={`plano-${d.id}`} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><CalendarCheck className="h-5 w-5 text-primary" aria-hidden="true" />O plano da obra</h3>
        <p className="text-sm text-muted-foreground">Sai dos serviços das necessidades: as tarefas, o técnico livre de cada ofício e as datas. Ao fechar a visita, o orçamento e a obra seguem com ele.</p>
      </div>
      <MapaDatasObra P={P} inicio={inicio} mudarInicio={setInicio}
        equipa={{ S: ctx.S, negocio: d.id, escolhas: escolhasDoNegocio(d.f), calcular: (iso) => planoDaVisita(d, ctx.S, iso),
          mudar: (e) => ctx.run(() => {
            ctx.A.campo(d.id, "plano_tecnicos", e.tecnicos && Object.keys(e.tecnicos).length ? JSON.stringify(e.tecnicos) : "");
            ctx.A.campo(d.id, "plano_equipa", e.equipa?.length ? JSON.stringify(e.equipa) : "");
          }) }} />
      {P.tarefas.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[15px]">Duração: <b className="font-semibold">{duracaoEmPalavras(P.dias)}</b>{P.fim && <> · pronta a {dataCurta(P.fim)}</>}</p>
          <Button type="button" className="min-h-11" onClick={guardar}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Guardar no negócio</Button>
        </div>
      )}
      <p role="status" className="min-h-5 text-sm text-success">{guardado}</p>
    </section>
  );
}
