// A etapa "Necessidades do cliente" guiada (14/10/2026, versão Atual), para o comercial de pé, com o telemóvel numa mão:
// um passo de cada vez, com uma barra de progresso compacta e o "Seguinte" fixo em baixo, ao alcance do polegar.
//   O que se faz → uma pergunta por troca ("Mantém / Troca" e logo os produtos dessa troca; escolhido o produto, avança-se
//   sozinho) → Mais produtos → Escolhas do cliente → O que o cliente fornece, por serviço (só com "Sim") → Resumo.
// Os cartões ligam e desligam ao toque (aria-pressed); a quantidade vem das medidas ou é 1, escrita no cartão
// ("12 m² · da visita"), com um "Mudar" discreto no cartão escolhido. A lógica está em selecao.ts e forneceCliente.ts.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useIsPresent } from "framer-motion";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { itemCatalogo } from "./catalogo";
import { Campos, aValidar } from "./CamposFase";
import { ESCOLHAS, efetivo, emFalta, visivel } from "./campos";
import { eur, nfmt, servicosVisita, type MedKey, type Negocio, type SvcId } from "./motor";
import { type Ctx } from "./pecas";
import { useCatalogo } from "./v2/catalogoStore";
import { useCustos } from "./v2/custosStore";
import { type Catalogo, type Produto } from "./v2/catalogoModelo";
import { CONSUMIVEIS } from "./equipamentosCliente";
import { orcLinhas } from "./ServicosCatalogo";
import { IconeServico, Ilustracao, ilustracaoDe, type IlustracaoKey } from "./ilustracoes";
import { nosAbaixo, obrigacoes, precoProduto, precoUnitario, produtosDoRamo, qtdSugerida, type Obrigacao } from "./produtosVisita";
import {
  filtrarProdutos, ilustracaoDoCatalogo, medidaDaSugestao, nomeCurto, objetoDaPergunta, obrigacoesAMostrar, ordenarParaObjeto, resumoNecessidades,
  servicoLeitura, tilesServicos, tocarProdutoGuiado, type TileServico,
} from "./necessidades";
import {
  CORES, blocosFornece, categoriaFiltro, categoriasDaLista, contavel, encurtar, escreverCores, fornecerTodos, lerCores, marcarFornece, poupanca, quantidadeDaRegra,
  notaNaLinha, oficiosPorUso, ordenarMobilidade, ordenarParaTroca, passosSelecao, qtdServicoAoEscolher, responderTroca, servicosFiltrados, textoQtd, tocarProduto,
  tocarServico, trocaResolvida, vizinho, type BlocoFornece, type ItemFornece, type PassoSel,
} from "./selecao";
import { CartaoProduto, CartaoResposta, CartaoServico, FiltrosFila, Pesquisa, QtdMudar } from "./CartoesSelecao";
import { useGuiaPasso } from "./guiaPasso";
import { ANIMAR_ATE, Brilho, CASCATA, Contagem, MOLA, MOLA_CARTAO, Progresso, SAIDA, VistoDesenho, cascata, deslize, useReduzir, useUmaVez, vibrar } from "./movimento";
import {
  FASES_OBRA, MODELOS_RAPIDOS, aplicarModelo, desfazerModelo, faseDoProduto, fasesDoServico, fasesDoTile, guardarPasso, lerPassoGuardado, modeloAtual, ordenarObrigacoesPorFase,
  porFase, sugestaoTroca, textoOutrasFases, type ComFases, type FaseObra, type ModeloRapido,
} from "./rapido";

type P = Ctx & { d: Negocio; simples?: boolean };
const PRIMEIROS_SVC = 6, PRIMEIROS_PROD = 6, PRIMEIROS_FORN = 6, MAIS = 12;
const GRELHA_SVC = "grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]";
const GRELHA_FORN = "grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))]";
const GRELHA_PROD = "grid items-start gap-2 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]";
const nomeSvc = (S: Ctx["S"], sid: SvcId) => S.svc[sid]?.n ?? itemCatalogo(sid)?.n ?? sid;
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/* ================================================================== o passo guiado */
export function SelecaoGuiada(ctx: P) {
  const { S, d } = ctx;
  const K = useCatalogo();
  const guia = useGuiaPasso();
  const v = d.visita;
  const clienteFornece = d.f.materiais_cliente === "Sim";
  const esc = efetivo(S.campos, ESCOLHAS);
  const comEscolhas = !esc.oculto;
  // os cartões dos serviços (uma vez por render) e a fase de cada serviço (fasesObra.ts: a da ficha, senão as regras)
  const tiles = tilesServicos(S, K, d);
  const faseSvc = (sid: SvcId) => {
    const t = tiles.find((x) => x.sid === sid);
    return fasesDoServico(K as ComFases, sid, t?.n ?? nomeSvc(S, sid), t?.oficio ?? "")[0];
  };
  // as trocas pela ordem das fases (primeiro as da fase mais cedo)
  const obr = ordenarObrigacoesPorFase(obrigacoesAMostrar(obrigacoes(K, servicosVisita(d), v, clienteFornece), d), faseSvc);
  const passos = passosSelecao(obr, clienteFornece, comEscolhas);
  const faltaEscolhas = comEscolhas && emFalta([esc], d.f).length > 0;

  // abre onde se ficou (o passo guardado a cada mudança); sem ele: nos serviços (nada mexido), na primeira troca por
  // resolver, nas Escolhas por responder, ou no resumo. A validar, abre sempre no resumo.
  const [k, setK] = useState(() => {
    if (aValidar(d, "nec") || aValidar(d, ESCOLHAS.titulo)) return "resumo";
    const guardado = lerPassoGuardado(d.id);
    if (guardado && passos.some((p) => p.k === guardado)) return guardado;
    const mexeu = Object.keys(v.manter ?? {}).length + (v.prod ?? []).length + Object.keys(v.extra).length;
    if (!mexeu) return "servicos";
    const q = obr.find((o) => !o.cumprida);
    return q ? "q:" + q.sid : faltaEscolhas ? "escolhas" : "resumo";
  });
  const iAntes = useRef(0);
  let i = passos.findIndex((p) => p.k === k);
  if (i < 0) i = Math.min(iAntes.current, passos.length - 1);
  iAntes.current = i;
  const atual = passos[i];
  useEffect(() => { guardarPasso(d.id, atual.k); }, [d.id, atual.k]);
  const passosRef = useRef(passos);
  passosRef.current = passos;
  // a direção da passagem: 1 avança (o passo novo entra da direita), -1 volta (entra da esquerda)
  const [dir, setDir] = useState(1);
  const reduzir = useReduzir();

  // enquanto está aberto, o "Seguinte" é deste passo (a fase esconde o "Continuar" e não salta sozinha)
  useEffect(() => { guia?.setGuiado(true); return () => guia?.setGuiado(false); }, [guia]);

  // avançar sozinho (depois de "Mantém" ou de escolher o produto da troca): primeiro o sinal de "feito" (o visto no
  // progresso, cerca de 0,6 s), depois o deslize. Qualquer outro toque cancela; o "Voltar" desfaz.
  const auto = useRef<number | undefined>();
  const [feito, setFeito] = useState<string | null>(null);
  const cancelar = () => { if (auto.current) { window.clearTimeout(auto.current); auto.current = undefined; setFeito(null); } };
  useEffect(() => () => { if (auto.current) window.clearTimeout(auto.current); }, []);
  const avancarSozinho = (de: string) => {
    cancelar();
    vibrar([10, 30, 10], reduzir);
    setFeito(de);
    auto.current = window.setTimeout(() => {
      auto.current = undefined;
      setFeito(null);
      setDir(1);
      setK((cur) => (cur === de ? vizinho(passosRef.current, de, 1) ?? cur : cur));
    }, 620);
  };
  const ir = (kk: string) => {
    cancelar();
    const j = passos.findIndex((p) => p.k === kk);
    setDir(j >= 0 && j < i ? -1 : 1);
    setK(kk);
  };
  const seguinte = () => { const n = vizinho(passos, atual.k, 1); if (n) ir(n); else guia?.avancar(); };
  const anterior = () => { const n = vizinho(passos, atual.k, -1); if (n) ir(n); else guia?.recuar(); };

  // o aviso com "Desfazer" (5 s), por cima da barra de baixo, ao alcance do polegar
  const [aviso, setAviso] = useState<{ id: number; texto: string; desfazer: () => void } | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso((a) => (a?.id === aviso.id ? null : a)), 5000);
    return () => window.clearTimeout(t);
  }, [aviso]);
  const avisar = (texto: string, desfazer: () => void) => setAviso({ id: Date.now(), texto, desfazer });

  // o gesto: deslizar o dedo para a esquerda avança, para a direita recua (só no toque; um gesto vertical é scroll;
  // a fila dos filtros e os campos não contam: data-sem-gesto)
  const gesto = useRef<{ x: number; y: number; t: number } | null>(null);
  const aoTocar = (e: React.TouchEvent) => {
    const alvo = e.target as HTMLElement;
    if (e.touches.length !== 1 || alvo.closest("[data-sem-gesto], input, textarea")) { gesto.current = null; return; }
    gesto.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const aoLargar = (e: React.TouchEvent) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g) return;
    const dx = e.changedTouches[0].clientX - g.x, dy = e.changedTouches[0].clientY - g.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - g.t > 700) return;
    if (dx < 0) seguinte(); else anterior();
  };

  // ao mudar de passo: o topo do passo à vista (só se ficou acima do ecrã) e o foco no título do passo novo
  const topo = useRef<HTMLDivElement>(null);
  const montado = useRef(false);
  const idTit = (kk: string) => `passo-${d.id}-${kk.replace(/[^a-z0-9-]/gi, "_")}`;
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    const caixa = topo.current?.getBoundingClientRect();
    if (caixa && caixa.top < 0) topo.current?.scrollIntoView?.({ block: "start", behavior: reduzir ? "auto" : "smooth" });
    document.getElementById(idTit(atual.k))?.focus({ preventScroll: true });
  }, [atual.k]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = resumoNecessidades(S, d, orcLinhas(d, S));
  const fim = atual.tipo === "resumo";
  const titulo = atual.tipo === "pergunta" && atual.o ? atual.o.pergunta ?? `Escolha ${atual.titulo.toLowerCase()}` : atual.titulo;
  const sub = atual.tipo === "pergunta" && atual.o ? `Para ${nomeCurto(nomeSvc(S, atual.o.sid)).toLowerCase()}`
    : atual.tipo === "servicos" ? "Toque para ligar ou desligar." : atual.tipo === "fornece" ? "Por serviço: toque no que o cliente traz. Sai do preço; a mão de obra e a instalação ficam." : null;
  const variantes = deslize(reduzir);

  return (
    <div ref={topo} className="scroll-mt-4" onPointerDownCapture={cancelar} onKeyDownCapture={cancelar}>
      <Progresso total={passos.length} atual={i} feito={feito === atual.k} rotulo="Passos das necessidades" />
      {/* o nome do passo para o leitor de ecrã (o foco vai para o título; isto confirma onde se está) */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{`Passo ${i + 1} de ${passos.length}: ${titulo}`}</p>

      {/* os passos deslizam: avançar para a esquerda, voltar para a direita (o que sai fica inerte e escondido do leitor) */}
      <div className="relative mt-5 [overflow-x:clip]" onTouchStart={aoTocar} onTouchEnd={aoLargar}>
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <motion.div key={atual.k} custom={dir} variants={variantes} initial="entra" animate="fica" exit="sai" className="w-full">
            <Saindo>
              <h3 id={idTit(atual.k)} tabIndex={-1}
                className="rounded-md text-[22px] font-semibold leading-tight tracking-[-0.01em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-4 focus-visible:ring-offset-background">
                {titulo}
              </h3>
              {sub && <p className="mt-1.5 text-[15px] leading-snug text-muted-foreground">{sub}</p>}
              <div className="mt-5">
                {atual.tipo === "escolhas" && <PassoEscolhas ctx={ctx} />}
                {atual.tipo === "servicos" && <PassoServicos ctx={ctx} K={K} tiles={tiles} avisar={avisar} />}
                {atual.tipo === "pergunta" && atual.o && <PassoPergunta key={atual.o.sid} ctx={ctx} K={K} o={atual.o} tiles={tiles} resolvido={() => avancarSozinho(atual.k)} />}
                {atual.tipo === "outros" && <PassoOutros ctx={ctx} K={K} obr={obr} />}
                {atual.tipo === "fornece" && <PassoFornece ctx={ctx} obr={obr} faseSvc={faseSvc} />}
                {atual.tipo === "resumo" && <PassoResumo ctx={ctx} K={K} passos={passos} obr={obr} ir={ir} tiles={tiles} faseSvc={faseSvc} />}
              </div>
            </Saindo>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* "Seguinte" fixo em baixo, ao alcance do polegar (no telemóvel, o padding do main já deixa o menu de fora;
          no tablet, a área segura do iPhone/iPad). O total conta até ao valor novo. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex items-center gap-3 border-t border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md backdrop-saturate-150 md:mx-0 md:px-0 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {aviso && (
            <motion.div key={aviso.id} role="status" initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduzir ? 0 : 8 }} transition={reduzir ? { duration: 0.1 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-3 bottom-full mb-3 flex min-h-12 items-center gap-3 rounded-xl bg-foreground py-1.5 pl-4 pr-1.5 text-[15px] text-background shadow-lg md:inset-x-0">
              <span className="min-w-0 flex-1 truncate">{aviso.texto}</span>
              <button type="button" onClick={() => { aviso.desfazer(); setAviso(null); }}
                className="min-h-11 shrink-0 rounded-lg px-4 font-semibold text-background underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-background">
                Desfazer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button type="button" onClick={anterior} aria-label="Voltar" whileTap={{ scale: 0.94 }} transition={MOLA_CARTAO}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-input bg-card text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </motion.button>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="sr-only" aria-live="polite">{`${eur(r.total)} € estimado, ${plural(r.servicos, "serviço", "serviços")}, ${plural(r.produtos, "produto", "produtos")}`}</p>
          <p aria-hidden="true" className="text-[17px] font-semibold text-foreground"><Contagem valor={r.total} fmt={(x) => `${eur(x)} €`} /></p>
          <p aria-hidden="true" className="truncate text-sm text-muted-foreground">{plural(r.servicos, "serviço", "serviços")} · {plural(r.produtos, "produto", "produtos")}</p>
        </div>
        {(!fim || guia) && (
          <Button size="lg" className="h-12 shrink-0 rounded-xl px-5 text-[15px] shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.6)]" onClick={seguinte}>
            {fim ? "Continuar" : "Seguinte"}<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** O passo que está a sair: inerte e escondido do leitor de ecrã (e dos testes), enquanto desliza para fora. */
function Saindo({ children }: { children: ReactNode }) {
  const presente = useIsPresent();
  // (React 18 não conhece o "inert": passa como atributo com o texto vazio)
  const inerte = presente ? {} : ({ inert: "" } as Record<string, string>);
  return <div aria-hidden={presente ? undefined : true} {...inerte} className={presente ? undefined : "pointer-events-none"}>{children}</div>;
}

/* ================================================================== Escolhas do cliente */
function PassoEscolhas({ ctx }: { ctx: P }) {
  const { S, A, run, d } = ctx;
  const esc = efetivo(S.campos, ESCOLHAS);
  const validar = aValidar(d, ESCOLHAS.titulo);
  const set = (k: string, x: string) => run(() => A.campo(d.id, k, x));
  const vis = esc.campos.filter((c) => visivel(c, d.f));
  const resto = vis.filter((c) => c.t !== "sim_nao" && c.k !== "cor_estilo");
  return (
    <div className="space-y-6">
      {vis.filter((c) => c.t === "sim_nao").map((c) => {
        const val = d.f[c.k], erro = validar && !val;
        return (
          <fieldset key={c.k}>
            <legend className={cn("text-[15px] font-medium", erro ? "text-destructive" : "text-foreground")}>{c.l}{erro && " · falta responder"}</legend>
            {c.ajuda && <p className="text-sm text-muted-foreground">{c.ajuda}</p>}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <CartaoResposta on={val === "Sim"} titulo="Sim" onTocar={() => set(c.k, val === "Sim" ? "" : "Sim")} />
              <CartaoResposta on={val === "Não"} titulo="Não" onTocar={() => set(c.k, val === "Não" ? "" : "Não")} />
            </div>
          </fieldset>
        );
      })}
      {vis.some((c) => c.k === "cor_estilo") && <Cores ctx={ctx} rotulo={vis.find((c) => c.k === "cor_estilo")!.l} />}
      {resto.length > 0 && <Campos grupo={{ ...esc, campos: resto }} d={d} A={A} run={run} simples />}
    </div>
  );
}

/** Cores e estilo: escolhas rápidas (várias), e texto livre só em "Outro". */
function Cores({ ctx, rotulo }: { ctx: P; rotulo: string }) {
  const { A, run, d } = ctx;
  const { escolhidas, outro } = lerCores(d.f.cor_estilo);
  const [comOutro, setComOutro] = useState(!!outro);
  const gravar = (e: string[], o: string) => run(() => A.campo(d.id, "cor_estilo", escreverCores(e, o)));
  const b = (on: boolean) => cn("min-h-11 rounded-xl border px-4 text-[15px] transition-colors duration-150",
    on ? "border-primary bg-primary/[0.06] font-medium text-foreground ring-1 ring-primary" : "border-input bg-card text-foreground hover:border-foreground/40");
  return (
    <fieldset>
      <legend className="text-[15px] font-medium text-foreground">{rotulo} <span className="font-normal text-muted-foreground">(opcional)</span></legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {CORES.map((c) => {
          const on = escolhidas.includes(c);
          return <button key={c} type="button" aria-pressed={on} className={b(on)} onClick={() => gravar(on ? escolhidas.filter((x) => x !== c) : [...escolhidas, c], outro)}>{c}</button>;
        })}
        <button type="button" aria-pressed={comOutro} className={b(comOutro)} onClick={() => { if (comOutro && outro) gravar(escolhidas, ""); setComOutro(!comOutro); }}>Outro</button>
      </div>
      {comOutro && (
        <label className="mt-2 block">
          <span className="sr-only">Outra cor ou estilo</span>
          <input key={outro} defaultValue={outro} autoFocus={!outro} placeholder="Ex.: verde-água, industrial"
            className="h-12 w-full max-w-md rounded-xl border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            onBlur={(e) => { if (e.target.value.trim() !== outro) gravar(escolhidas, e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </label>
      )}
    </fieldset>
  );
}

/* ================================================================== O que se faz */
/** Um título de fase pegajoso (fica no topo enquanto se faz scroll dentro da fase), com o que está escolhido nela. */
function TituloFase({ nome, escolhidos }: { nome: string; escolhidos?: number }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 flex min-h-10 items-baseline gap-3 bg-background/90 px-4 pb-2 pt-3 backdrop-blur-md md:mx-0 md:px-0">
      <h4 className="min-w-0 flex-1 text-[15px] font-semibold text-foreground">{nome}</h4>
      {!!escolhidos && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{plural(escolhidos, "escolhido", "escolhidos")}</span>}
    </div>
  );
}

/** O estado vazio: uma ilustração, uma frase útil e a saída (limpar a pesquisa e os filtros). */
function Vazio({ texto, acao, onAcao, img = "generico" }: { texto: string; acao?: string; onAcao?: () => void; img?: IlustracaoKey }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-8 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-muted/70"><Ilustracao k={img} className="h-12 w-12" /></span>
      <p className="max-w-xs text-[15px] text-muted-foreground">{texto}</p>
      {acao && onAcao && (
        <button type="button" onClick={onAcao}
          className="min-h-11 rounded-xl px-4 text-[15px] font-medium text-primary outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">{acao}</button>
      )}
    </div>
  );
}

/** O seletor rápido de fase ("Todas · 1 · 2 · 3 · 4"), o primeiro da fila de filtros; o ativo com o fundo a deslizar. */
function SeletorFase({ ativa, onMudar }: { ativa: FaseObra | null; onMudar: (f: FaseObra | null) => void }) {
  const reduzir = useReduzir();
  const ops: { f: FaseObra | null; t: string; l: string }[] = [
    { f: null, t: "Todas", l: "Todas as fases" },
    ...FASES_OBRA.map((x) => ({ f: x.n, t: String(x.n), l: `Fase ${x.n} · ${x.curto}` })),
  ];
  return (
    <span role="group" aria-label="Filtrar por fase" className="mr-1 inline-flex shrink-0 items-center rounded-full bg-foreground/[0.07] p-1">
      {ops.map((o) => {
        const on = ativa === o.f;
        return (
          <button key={o.t} type="button" aria-pressed={on} aria-label={o.l} title={o.l} onClick={() => onMudar(on && o.f != null ? null : o.f)}
            className={cn("relative inline-flex h-10 min-w-11 items-center justify-center rounded-full px-3 text-[15px] tabular-nums outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary",
              on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {on && <motion.span layoutId="fase-ativa" aria-hidden="true" className="absolute inset-0 rounded-full bg-card shadow-[0_1px_3px_hsl(var(--foreground)/0.18)]" transition={reduzir ? { duration: 0 } : MOLA} />}
            <span className="relative">{o.t}</span>
          </button>
        );
      })}
    </span>
  );
}

function PassoServicos({ ctx, K, tiles, avisar }: { ctx: P; K: Catalogo; tiles: TileServico[]; avisar: (t: string, desfazer: () => void) => void }) {
  const { S, A, run, d } = ctx;
  const C = useCustos();
  const v = d.visita;
  const reduzir = useReduzir();
  const [q, setQ] = useState("");
  const [of, setOf] = useState<string | null>(null);
  const [fase, setFase] = useState<FaseObra | null>(null);
  const [n, setN] = useState(PRIMEIROS_SVC);
  // os cartões que um modelo rápido acabou de mudar: mudam em cascata (o atraso de cada um)
  const [cascataDe, setCascataDe] = useState<Map<SvcId, number>>(new Map());
  const medidaDe = (sid: SvcId) => (C.receitas?.[sid] as { medida?: MedKey | null } | undefined)?.medida ?? null;
  const porSid = new Map(tiles.map((t) => [t.sid, t]));
  // a ordem e os filtros ficam parados enquanto se toca (os cartões não saltam debaixo do dedo)
  const ofs = useMemo(() => oficiosPorUso(tiles, d.linha), [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordem = useMemo(() => servicosFiltrados(tiles, { q, oficio: of, linha: d.linha }).map((t) => t.sid), [q, of, d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fasesDe = useMemo(() => new Map(tiles.map((t) => [t.sid, fasesDoTile(K as ComFases, t)])), [K, d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fasesDoSid = (sid: SvcId) => fasesDe.get(sid) ?? [4 as FaseObra];
  const lista = ordem.map((sid) => porSid.get(sid)).filter((t): t is TileServico => !!t).filter((t) => !fase || fasesDoSid(t.sid).includes(fase));
  // um serviço de várias fases aparece uma vez: na primeira (ou na do seletor), com "também na fase 3"
  const grupoDe = (t: TileServico): FaseObra => (fase && fasesDoSid(t.sid).includes(fase) ? fase : fasesDoSid(t.sid)[0]);
  const visiveis = lista.slice(0, n);
  const grupos = porFase(visiveis, grupoDe);
  const escolhidosNaFase = (f: FaseObra) => tiles.filter((t) => t.on && fasesDoSid(t.sid)[0] === f).length;
  const animar = visiveis.length <= ANIMAR_ATE;
  const atual = modeloAtual(tiles);

  const usarModelo = (m: ModeloRapido) => {
    let mudados: SvcId[] = [];
    run(() => { mudados = aplicarModelo(A, d, tiles, m); });
    if (!mudados.length) return;
    vibrar(10, reduzir);
    // a cascata pela ordem em que os cartões estão no ecrã
    const pos = new Map(visiveis.map((t, j) => [t.sid, j]));
    const ord = [...mudados].sort((a, b) => (pos.get(a) ?? 99) - (pos.get(b) ?? 99));
    setCascataDe(new Map(ord.map((sid, j) => [sid, j * 0.06])));
    avisar(plural(mudados.length, "serviço mudou", "serviços mudaram"), () => {
      run(() => desfazerModelo(A, d, mudados));
      setCascataDe(new Map(ord.map((sid, j) => [sid, j * 0.06])));
    });
  };

  // a quantidade em texto: "12 m² · da visita" (a da medida) ou "1 un"; mudada à mão, deixa de dizer "da visita"
  const linha2 = (t: TileServico, daMedida: MedKey | null, detalhe: string) => {
    const manual = (v.extra[t.sid] || 0) > 0;
    if (t.origem === "pacote") return t.semMedida ? "Falta a medida" : t.on ? textoQtd({ q: t.qt, un: t.un, daMedida: true }) : "Do pacote · não entra";
    if (t.de && !manual) return `Vem com ${t.de.join(", ")}`;
    if (t.on) return textoQtd({ q: t.qt, un: t.un, daMedida: !!daMedida && t.qt === qtdServicoAoEscolher({ id: t.sid, n: t.n, un: t.un, qm: 1 }, d, medidaDe(t.sid)) });
    return detalhe || `${eur(t.preco)} €/${t.un}`;
  };
  const limpar = () => { setQ(""); setOf(null); setFase(null); setN(PRIMEIROS_SVC); };
  let idx = 0;
  return (
    <div className="space-y-4">
      {/* modelos rápidos: um toque liga o conjunto (e o aviso em baixo deixa desfazer) */}
      <div role="group" aria-label="Modelos rápidos" className="flex flex-wrap items-center gap-2">
        <span className="w-full text-sm text-muted-foreground">Começar com um modelo</span>
        {MODELOS_RAPIDOS.map((m) => {
          const on = atual === m.id;
          return (
            <motion.button key={m.id} type="button" aria-pressed={on} onClick={() => usarModelo(m)} title={m.desc} whileTap={{ scale: 0.96 }} transition={MOLA_CARTAO}
              className={cn("relative inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                on ? "border-primary bg-primary/[0.08] text-foreground ring-1 ring-primary" : "border-input bg-card text-foreground hover:border-foreground/30")}>
              {on && <Check className="-ml-1 h-4 w-4 text-primary" strokeWidth={3} aria-hidden="true" />}
              {m.nome}
            </motion.button>
          );
        })}
      </div>
      <Pesquisa valor={q} onMudar={(x) => { setQ(x); setN(PRIMEIROS_SVC); }} rotulo="Procurar serviço" ph="Procurar: nicho, toalheiro, gás…" />
      <FiltrosFila opcoes={ofs} ativo={of} onMudar={(x) => { setOf(x); setN(PRIMEIROS_SVC); }} rotulo="Filtrar por área"
        prefixo={<SeletorFase ativa={fase} onMudar={(f) => { setFase(f); setN(PRIMEIROS_SVC); }} />} />
      {q.trim() && lista.length > 0 && <p className="text-sm text-muted-foreground" aria-live="polite">{plural(lista.length, "serviço", "serviços")}</p>}
      {!lista.length ? (
        <Vazio texto={q.trim() ? `Nenhum serviço com "${q.trim()}"${of || fase ? " nestes filtros" : ""}. Experimente outra palavra.` : "Nenhum serviço nesta área e nesta fase."}
          acao="Limpar a pesquisa e os filtros" onAcao={limpar} img="ferramenta" />
      ) : (
        <LayoutGroup>
          <ul className="space-y-1" aria-label="Serviços">
            {grupos.map((g) => (
              <li key={g.fase} role="presentation">
                <TituloFase nome={g.nome} escolhidos={escolhidosNaFase(g.fase)} />
                <ul className={GRELHA_SVC} role="list" aria-label={g.nome}>
                  {g.itens.map((t) => {
                    const manual = (v.extra[t.sid] || 0) > 0;
                    const daMedida = t.origem === "catalogo" ? medidaDaSugestao({ id: t.sid, n: t.n, un: t.un }, d, medidaDe(t.sid)) : t.medida;
                    const { nome, detalhe } = encurtar(t.n, { servico: true });
                    const outras = textoOutrasFases(fasesDoSid(t.sid).filter((f) => f !== g.fase).length ? [g.fase, ...fasesDoSid(t.sid).filter((f) => f !== g.fase)] : []);
                    const l2 = t.on && manual ? null : [linha2(t, daMedida, detalhe), outras].filter(Boolean).join(" · ");
                    const j = idx++;
                    return (
                      <CartaoServico key={t.sid} nome={nome} nomeCompleto={t.n} icone={t.icone} on={t.on} so={!!t.de && !manual} desativado={t.semMedida}
                        animar={animar} entrada={cascata(j, reduzir)} atraso={cascataDe.get(t.sid)}
                        linha2={l2} onTocar={() => { let r: string | null = null; run(() => { r = tocarServico(A, d, t, medidaDe(t.sid)); }); if (r === "ligou") vibrar(10, reduzir); }}>
                        {t.on && manual && (
                          <QtdMudar id={`sq-${t.sid}-${d.id}`} valor={t.qt} un={t.un} nome={nome} texto={[linha2(t, daMedida, detalhe), outras].filter(Boolean).join(" · ")} recuo onMudar={(x) => run(() => A.extra(d.id, t.sid, x))} />
                        )}
                      </CartaoServico>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </LayoutGroup>
      )}
      {lista.length > n && <VerMais n={Math.min(MAIS, lista.length - n)} onMais={() => setN((x) => x + MAIS)} />}
    </div>
  );
}

function VerMais({ n, onMais }: { n: number; onMais: () => void }) {
  return (
    <button type="button" onClick={onMais}
      className="min-h-12 w-full rounded-xl border border-input bg-card px-4 text-[15px] font-medium text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      Ver mais {n}
    </button>
  );
}

/* ================================================================== uma lista de produtos (pesquisa, filtros, os primeiros) */
function ListaProdutos({ ctx, K, produtos, onTocar, rotulo, faseDe }: {
  ctx: P; K: Catalogo; produtos: Produto[]; onTocar: (p: Produto) => "juntou" | "tirou" | void; rotulo: string;
  /** Agrupar pelas fases da obra (Mais produtos). */
  faseDe?: (p: Produto) => FaseObra;
}) {
  const { A, run, d } = ctx;
  const reduzir = useReduzir();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [n, setN] = useState(PRIMEIROS_PROD);
  const cats = useMemo(() => categoriasDaLista(produtos, K.arvore), [produtos, K.arvore]);
  const lista = useMemo(() => {
    const f = filtrarProdutos(produtos, K.arvore, { q });
    return cat ? f.filter((p) => categoriaFiltro(p, K.arvore) === cat) : f;
  }, [produtos, K.arvore, q, cat]);
  const escolhido = new Map((d.visita.prod ?? []).map((p) => [p.id, p]));
  const sids = servicosVisita(d);
  const visiveis = lista.slice(0, n);
  const animar = visiveis.length <= ANIMAR_ATE;
  const grupos = faseDe ? porFase(visiveis, faseDe) : [{ fase: 0, nome: "", itens: visiveis }];
  let idx = 0;
  const cartao = (p: Produto) => {
    const ja = escolhido.get(p.id);
    const { nome, detalhe } = encurtar(p.n, { categoria: categoriaFiltro(p, K.arvore) });
    const daMedida = !!ja && quantidadeDaRegra(K, p, sids) && !contavel(p.un) && ja.q === qtdSugerida(K, p, sids, d.visita.med);
    const j = idx++;
    return (
      <CartaoProduto key={p.id} nome={nome} nomeCompleto={p.n} detalhe={[detalhe, p.marca].filter(Boolean).join(" · ")} preco={precoUnitario(p)} un={p.un}
        img={ilustracaoDoCatalogo(K.arvore, p)} on={!!ja} trazInstalacao={!!p.servico} animar={animar} entrada={cascata(j, reduzir)}
        onTocar={() => { if (onTocar(p) === "juntou") vibrar(10, reduzir); }}>
        {ja && (
          <QtdMudar id={`pq-${p.id}-${d.id}`} valor={ja.q} un={p.un} nome={nome} texto={textoQtd({ q: ja.q, un: p.un, daMedida })}
            onMudar={(x) => run(() => A.produtoQtd(d.id, p.id, x))} />
        )}
      </CartaoProduto>
    );
  };
  return (
    <div className="space-y-3">
      {produtos.length > PRIMEIROS_PROD && <Pesquisa valor={q} onMudar={(x) => { setQ(x); setN(PRIMEIROS_PROD); }} rotulo={`Procurar em ${rotulo.toLowerCase()}`} ph="Procurar: nome, marca, referência…" />}
      <FiltrosFila opcoes={cats} ativo={cat} onMudar={(x) => { setCat(x); setN(PRIMEIROS_PROD); }} rotulo="Filtrar por tipo" />
      {q.trim() && lista.length > 0 && <p className="text-sm text-muted-foreground" aria-live="polite">{plural(lista.length, "produto", "produtos")}</p>}
      {!lista.length ? (
        <Vazio texto={q.trim() ? `Nada com "${q.trim()}". Procure pela marca ou pela referência, ou tire o filtro.` : "Não há produtos deste tipo."}
          acao={q.trim() || cat ? "Limpar a pesquisa e o filtro" : undefined} onAcao={() => { setQ(""); setCat(null); setN(PRIMEIROS_PROD); }} img="generico" />
      ) : faseDe ? (
        <LayoutGroup>
          <ul className="space-y-1" aria-label={rotulo}>
            {grupos.map((g) => (
              <li key={g.fase} role="presentation">
                <TituloFase nome={g.nome} />
                <ul className={GRELHA_PROD} role="list" aria-label={g.nome}>{g.itens.map(cartao)}</ul>
              </li>
            ))}
          </ul>
        </LayoutGroup>
      ) : (
        <LayoutGroup>
          <ul className={GRELHA_PROD} aria-label={rotulo}>{visiveis.map(cartao)}</ul>
        </LayoutGroup>
      )}
      {lista.length > n && <VerMais n={Math.min(MAIS, lista.length - n)} onMais={() => setN((x) => x + MAIS)} />}
    </div>
  );
}

/* ================================================================== uma troca: "Mantém / Troca" e os produtos */
function PassoPergunta({ ctx, K, o, tiles, resolvido }: { ctx: P; K: Catalogo; o: Obrigacao; tiles: TileServico[]; resolvido: () => void }) {
  const { A, run, d } = ctx;
  const v = d.visita, resp = v.manter?.[o.sid];
  const obj = objetoDaPergunta(o.pergunta);
  const mob = d.f.mobilidade_reduzida === "Sim";
  const produtos = useMemo(
    () => ordenarMobilidade(ordenarParaTroca(ordenarParaObjeto(produtosDoRamo(K, o.no, CONSUMIVEIS), obj?.comArtigo ?? null), obj?.comArtigo, K.arvore), mob),
    [K, o.no, obj?.comArtigo, mob],
  );
  const ramo = useMemo(() => nosAbaixo(K.arvore, o.no), [K.arvore, o.no]);
  const troca = !o.pergunta || resp === "nao" || (resp !== "sim" && (v.prod ?? []).some((p) => p.no && ramo.has(p.no)));
  const listaRef = useRef<HTMLDivElement>(null);
  // a resposta mais provável, destacada mas não escolhida (só enquanto não há resposta)
  const sug = !resp && !troca ? sugestaoTroca(tiles) : null;
  // a mobilidade reduzida (das Escolhas, que agora vêm no fim) pergunta-se aqui, num cartão rápido, enquanto não tem resposta:
  // muda a ordem dos produtos (bases de duche e barras à frente). Respondida, o cartão já não aparece nas trocas seguintes.
  const campoMob = efetivo(ctx.S.campos, ESCOLHAS).campos.find((c) => c.k === "mobilidade_reduzida" && visivel(c, d.f));
  const [pedeMob] = useState(() => !!campoMob && !d.f.mobilidade_reduzida);

  const responder = (r: "sim" | "nao") => {
    run(() => responderTroca(A, K, d, o, r));
    if (r === "sim") resolvido();
    else setTimeout(() => listaRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }), 120);
  };
  const tocar = (p: Produto) => {
    const res = { f: "tirou" as "juntou" | "tirou" };
    run(() => { res.f = tocarProdutoGuiado(A, K, d, o, p); });
    if (res.f !== "juntou") return res.f;
    const noRamo = (d.visita.prod ?? []).filter((x) => x.no && ramo.has(x.no)).map((x) => K.produtos.find((y) => y.id === x.id) ?? x);
    if (trocaResolvida(o, noRamo, produtos)) resolvido();
    return res.f;
  };
  const mantem = resp === "sim", trocaOn = troca && resp !== "sim";

  return (
    <div className="space-y-4">
      {pedeMob && campoMob && <MobilidadeRapida ctx={ctx} rotulo={campoMob.l} />}
      {o.pergunta && (
        <LayoutGroup>
          <div className="flex gap-2" role="group" aria-label={o.pergunta}>
            {/* o escolhido expande-se (layout); o outro encolhe, sem sair do sítio */}
            <motion.div layout transition={MOLA} className={cn("flex min-w-0", mantem ? "flex-[1.6]" : "flex-1")}>
              <CartaoResposta on={mantem} titulo="Mantém" sub="Sem produto" sugerido={sug?.r === "sim" ? sug.porque : undefined} onTocar={() => responder("sim")} />
            </motion.div>
            <motion.div layout transition={MOLA} className={cn("flex min-w-0", trocaOn ? "flex-[1.6]" : "flex-1")}>
              <CartaoResposta on={trocaOn} titulo="Troca" sub="Novo produto" sugerido={sug?.r === "nao" ? sug.porque : undefined} onTocar={() => responder("nao")} />
            </motion.div>
          </div>
        </LayoutGroup>
      )}
      {troca && (
        <div ref={listaRef} className="scroll-mt-24">
          <ListaProdutos ctx={ctx} K={K} produtos={produtos} onTocar={tocar} rotulo={obj ? `Produtos: ${obj.comArtigo}` : "Produtos"} />
        </div>
      )}
    </div>
  );
}

/** A pergunta da mobilidade reduzida num cartão rápido (Sim / Não), no início das trocas. */
function MobilidadeRapida({ ctx, rotulo }: { ctx: P; rotulo: string }) {
  const { A, run, d } = ctx;
  const val = d.f.mobilidade_reduzida;
  const b = (on: boolean) => cn("min-h-11 min-w-16 rounded-lg border px-4 text-[15px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    on ? "border-primary bg-primary font-medium text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40");
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
      <span className="text-[15px] text-foreground">{rotulo}<span className="block text-sm text-muted-foreground">Muda a ordem dos produtos</span></span>
      <span className="flex gap-2">
        {(["Sim", "Não"] as const).map((x) => (
          <button key={x} type="button" aria-pressed={val === x} className={b(val === x)} onClick={() => run(() => A.campo(d.id, "mobilidade_reduzida", val === x ? "" : x))}>{x}</button>
        ))}
      </span>
    </div>
  );
}

/* ================================================================== Mais produtos */
function PassoOutros({ ctx, K, obr }: { ctx: P; K: Catalogo; obr: Obrigacao[] }) {
  const { S, A, run, d } = ctx;
  const mob = d.f.mobilidade_reduzida === "Sim";
  const produtos = useMemo(() => {
    const ramos = obr.map((o) => nosAbaixo(K.arvore, o.no));
    const fora = K.produtos.filter((p) => !CONSUMIVEIS.has(p.n) && !ramos.some((r) => p.no && r.has(p.no)));
    // os do ofício dos serviços escolhidos primeiro (ordem estável)
    const ofDe = (no: string | null) => { let x = no ? K.arvore.find((y) => y.id === no) : undefined; while (x?.pai) x = K.arvore.find((y) => y.id === x!.pai); return x?.id; };
    const ofs = new Set(servicosVisita(d).map((sid) => ofDe(K.classe[sid] ?? null)).filter(Boolean));
    const ordenada = fora.map((p, i) => ({ p, i, s: notaNaLinha(ilustracaoDoCatalogo(K.arvore, p), d.linha) * 2 + (ofs.has(ofDe(p.no)) ? 1 : 0) }))
      .sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
    return ordenarMobilidade(ordenada, mob);
  }, [K, obr.map((o) => o.no).join(), mob, d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // a fase de um produto: a última do serviço que o instala; sem serviço, pelo tipo (fasesObra.ts)
  const cache = useMemo(() => new Map<string, FaseObra>(), [K]);
  const faseDe = (p: Produto): FaseObra => {
    let f = cache.get(p.id);
    if (f == null) {
      const s = p.servico ? { nome: nomeSvc(S, p.servico), oficio: "" } : undefined;
      f = faseDoProduto(K as ComFases, { servico: p.servico, img: ilustracaoDoCatalogo(K.arvore, p) }, s);
      cache.set(p.id, f);
    }
    return f;
  };
  return <ListaProdutos ctx={ctx} K={K} produtos={produtos} rotulo="Mais produtos" faseDe={faseDe} onTocar={(p) => { let r: "juntou" | "tirou" = "tirou"; run(() => { r = tocarProduto(A, K, d, p); }); return r; }} />;
}

/* ================================================================== O que o cliente fornece, por serviço */
/** Os blocos de "o que o cliente fornece" desta visita (selecao.ts: blocosFornece). */
function blocosDaVisita(ctx: P, K: Catalogo, obr: Obrigacao[]): BlocoFornece[] {
  const { S, d } = ctx;
  return blocosFornece(d, obr, orcLinhas(d, S), { arvore: K.arvore, exige: K.exigeProduto ?? {}, nomeSvc: (sid) => nomeSvc(S, sid), svc: (sid) => servicoLeitura(S, sid) });
}
const ATALHO = "min-h-11 rounded-xl border px-4 text-[15px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const atalho = (on: boolean) => cn(ATALHO, on ? "border-2 border-primary bg-primary/[0.06] text-foreground" : "border-input bg-card text-foreground hover:border-foreground/30");
/** "− 84,20 €", discreto (só quando baixa alguma coisa); conta até ao valor novo, como o total. */
const Menos = ({ v, className }: { v: number; className?: string }) =>
  v > 0 ? (
    <span className={cn("shrink-0 text-sm tabular-nums text-muted-foreground", className)} aria-label={`Baixa ${eur(v)} euros`}>
      <Contagem valor={v} de={0} fmt={(x) => `− ${eur(x)} €`} />
    </span>
  ) : null;

function PassoFornece({ ctx, obr, faseSvc }: { ctx: P; obr: Obrigacao[]; faseSvc: (sid: SvcId) => FaseObra }) {
  const { A, run, d } = ctx;
  const K = useCatalogo();
  // os blocos pela ordem das fases (os produtos sem serviço, "Outros produtos", no fim)
  const blocos = blocosDaVisita(ctx, K, obr).map((b, i) => ({ b, i, f: b.sid ? faseSvc(b.sid) : 9 })).sort((a, b) => a.f - b.f || a.i - b.i).map((x) => x.b);
  const todos = blocos.flatMap((b) => b.itens);
  if (!todos.length) return <Vazio texto="Ainda não há serviços nem produtos escolhidos. Volte a O que se faz e escolha o que entra na obra." img="material" />;
  const tudo = todos.every((x) => x.on), nada = todos.every((x) => !x.on);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Atalhos para tudo">
        <button type="button" aria-pressed={tudo} className={atalho(tudo)} onClick={() => run(() => fornecerTodos(A, d, todos, true))}>Fornece tudo</button>
        <button type="button" aria-pressed={nada} className={atalho(nada)} onClick={() => run(() => fornecerTodos(A, d, todos, false))}>Nenhum</button>
        <Menos v={poupanca(todos)} className="ml-auto text-[15px] font-medium text-foreground" />
      </div>
      {blocos.map((b) => <BlocoServico key={b.sid ?? "outros"} ctx={ctx} K={K} b={b} fase={b.sid ? faseSvc(b.sid) : null} />)}
    </div>
  );
}

const TIPO_TXT: Record<ItemFornece["tipo"], string> = { produto: "Produto", servico: "Material", cons: "Consumível", equip: "Equipamento" };
const FIG: Record<"cons" | "equip", IlustracaoKey> = { cons: "material", equip: "ferramenta" };

/** Um serviço: o nome, os atalhos dele, o que baixa, e os cartões (os 6 que mais pesam; o resto com "Ver mais"). */
function BlocoServico({ ctx, K, b, fase }: { ctx: P; K: Catalogo; b: BlocoFornece; fase: FaseObra | null }) {
  const { A, run, d } = ctx;
  const reduzir = useReduzir();
  const [n, setN] = useState(PRIMEIROS_FORN);
  const tudo = b.itens.every((x) => x.on), nada = b.itens.every((x) => !x.on);
  const titulo = b.sid ? nomeCurto(b.titulo) : b.titulo;
  const sec = (on: boolean) => cn("min-h-11 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary",
    on ? "bg-primary/10 text-foreground" : "text-primary hover:bg-muted");
  const linha2 = (it: ItemFornece) => {
    if (it.tipo === "servico") return it.on ? "O cliente compra" : "Material por escolher";
    const qtd = it.q != null && it.un ? `${nfmt(it.q)} ${it.un}` : "";
    if (it.on) return `Fornecido pelo cliente${it.valor ? ` · − ${eur(it.valor)} €` : ""}`;
    return [TIPO_TXT[it.tipo], qtd, it.valor ? `${eur(it.valor)} €` : ""].filter(Boolean).join(" · ");
  };
  const figura = (it: ItemFornece) => {
    if (it.tipo === "cons" || it.tipo === "equip") return FIG[it.tipo];
    const doCat = it.tipo === "produto" ? K.produtos.find((p) => p.id === it.id) : undefined;
    return doCat ? ilustracaoDoCatalogo(K.arvore, doCat) : ilustracaoDe(it.n);
  };
  const vis = b.itens.slice(0, n);
  return (
    <section aria-label={titulo} className="space-y-2">
      <div>
        {fase && <p className="text-sm text-muted-foreground">Fase {fase} · {FASES_OBRA[fase - 1].curto}</p>}
        <div className="flex items-baseline gap-3">
          <h4 className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground" title={b.titulo}>{titulo}</h4>
          <Menos v={poupanca(b.itens)} />
        </div>
        <span className="-ml-3 flex" role="group" aria-label={`Atalhos de ${titulo}`}>
          <button type="button" aria-pressed={tudo} className={sec(tudo)} onClick={() => run(() => fornecerTodos(A, d, b.itens, true))}>Fornece tudo</button>
          <button type="button" aria-pressed={nada} className={sec(nada)} onClick={() => run(() => fornecerTodos(A, d, b.itens, false))}>Nenhum</button>
        </span>
      </div>
      <ul className={GRELHA_FORN} aria-label={`O que o cliente fornece: ${titulo}`}>
        {vis.map((it, j) => {
          const { nome } = encurtar(it.n);
          return (
            <CartaoServico key={it.k} compacto nome={nome} nomeCompleto={it.n} icone="outro" figura={<Ilustracao k={figura(it)} className="h-7 w-7" />}
              on={it.on} linha2={linha2(it)} entrada={cascata(j, reduzir)} animar={vis.length <= ANIMAR_ATE}
              onTocar={() => { run(() => marcarFornece(A, d, it, !it.on)); if (!it.on) vibrar(10, reduzir); }} />
          );
        })}
      </ul>
      {b.itens.length > n && <VerMais n={Math.min(MAIS, b.itens.length - n)} onMais={() => setN((x) => x + MAIS)} />}
    </section>
  );
}

/* ================================================================== o Resumo */
interface LinhaCrono { k: string; nome: string; det: string; fig: ReactNode; passo: string }

function PassoResumo({ ctx, K, passos, obr, ir, tiles, faseSvc }: {
  ctx: P; K: Catalogo; passos: PassoSel[]; obr: Obrigacao[]; ir: (k: string) => void; tiles: TileServico[]; faseSvc: (sid: SvcId) => FaseObra;
}) {
  const { S, d } = ctx;
  const reduzir = useReduzir();
  const celebrar = useUmaVez();
  const v = d.visita, prod = v.prod ?? [];
  const r = resumoNecessidades(S, d, orcLinhas(d, S));
  const esc = efetivo(S.campos, ESCOLHAS);
  const nomeP = (id: string) => prod.find((p) => p.id === id);
  const txtProd = (ids: string[]) => ids.map((id) => { const p = nomeP(id)!; return `${encurtar(p.n).nome}${p.q !== 1 ? ` × ${nfmt(p.q)}` : ""}${p.cliente ? " (fornecido pelo cliente)" : ""}`; }).join(", ");
  const ramos = obr.map((o) => nosAbaixo(K.arvore, o.no));
  const linha = (p: PassoSel): { t: string; falta?: boolean } => {
    switch (p.tipo) {
      case "escolhas": {
        const f = emFalta([esc], d.f);
        const partes = esc.campos.filter((c) => d.f[c.k]).map((c) => (c.t === "sim_nao" ? `${c.l}: ${d.f[c.k]}` : d.f[c.k]));
        return f.length ? { t: `Falta: ${f.map((c) => c.l.toLowerCase()).join(", ")}`, falta: true } : { t: partes.join(" · ") || "Respondido" };
      }
      case "servicos": {
        const sids = orcLinhas(d, S);
        return sids.length ? { t: sids.map((s) => nomeCurto(nomeSvc(S, s))).join(", ") } : { t: "Falta escolher pelo menos um serviço", falta: true };
      }
      case "pergunta": {
        const o = p.o!;
        if (o.estado === "mantem") return { t: "Mantém" };
        if (o.estado === "cliente") return { t: "O cliente compra" };
        const ids = prod.filter((x) => x.no && nosAbaixo(K.arvore, o.no).has(x.no)).map((x) => x.id);
        if (ids.length) return { t: txtProd(ids) };
        return { t: o.estado === "pergunta" ? "Falta dizer se mantém ou troca" : "Falta escolher o produto", falta: true };
      }
      case "outros": {
        const ids = prod.filter((x) => !ramos.some((rr) => x.no && rr.has(x.no))).map((x) => x.id);
        return { t: ids.length ? txtProd(ids) : "Nenhum" };
      }
      case "fornece": {
        const on = blocosDaVisita(ctx, K, obr).flatMap((b) => b.itens).filter((x) => x.on);
        const menos = poupanca(on);
        return { t: on.length ? `${on.map((x) => encurtar(x.n).nome).join(", ")}${menos > 0 ? ` (− ${eur(menos)} €)` : ""}` : "Nada" };
      }
      default: return { t: "" };
    }
  };
  const revisao = passos.filter((p) => p.tipo !== "resumo").map((p) => ({ p, l: linha(p) }));
  const faltas = revisao.filter((x) => x.l.falta).length;
  const pronto = faltas === 0;

  // a cronologia por fase: os serviços (com o ícone) e os produtos (com a ilustração); cada linha volta ao seu passo
  const porSid = new Map(tiles.map((t) => [t.sid, t]));
  const passoDoProduto = (no: string | null) => {
    const j = no ? obr.findIndex((o, jj) => ramos[jj].has(no)) : -1;
    return j >= 0 ? "q:" + obr[j].sid : "outros";
  };
  const linhasCrono: (LinhaCrono & { f: FaseObra })[] = [
    ...orcLinhas(d, S).map((sid) => {
      const t = porSid.get(sid);
      const q = t?.qt ? `${nfmt(t.qt)} ${t.un}` : "";
      return { k: "s:" + sid, f: faseSvc(sid), nome: nomeCurto(nomeSvc(S, sid)), det: q, fig: <IconeServico k={t?.icone ?? "outro"} className="h-4 w-4" />, passo: "servicos" };
    }),
    ...prod.filter((p) => p.q > 0).map((p) => {
      const doCat = K.produtos.find((x) => x.id === p.id);
      const img = doCat ? ilustracaoDoCatalogo(K.arvore, doCat) : ilustracaoDe(p.n);
      const sNome = doCat?.servico ? nomeSvc(S, doCat.servico) : undefined;
      const f = faseDoProduto(K as ComFases, { servico: doCat?.servico, img }, sNome ? { nome: sNome } : undefined);
      return { k: "p:" + p.id, f, nome: encurtar(p.n).nome, det: [doCat?.marca, `${nfmt(p.q)} ${p.un}`, p.cliente ? "fornecido pelo cliente" : `${eur(precoProduto(p))} €`].filter(Boolean).join(" · "),
        fig: <Ilustracao k={img} className="h-6 w-6" />, passo: passoDoProduto(p.no ?? null) };
    }),
  ];
  const fases = porFase(linhasCrono, (x) => x.f);
  let idx = 0;
  const entrada = (atraso: number) => (reduzir ? { initial: false as const } : {
    initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: SAIDA, delay: atraso },
  });

  return (
    <div className="space-y-8">
      {/* o momento: o visto grande desenha-se com um brilho suave e o total conta (só com tudo respondido) */}
      <div className="flex items-center gap-4">
        <span className="relative grid h-16 w-16 shrink-0 place-items-center">
          <Brilho ativo={pronto && celebrar} />
          {pronto ? <VistoDesenho on={!celebrar || reduzir ? true : true} grande atraso={reduzir ? 0 : 0.15} />
            : <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-destructive/60 text-xl font-semibold tabular-nums text-destructive">{faltas}</span>}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-foreground">{pronto ? "Tudo respondido" : `Falta ${faltas === 1 ? "1 resposta" : `${faltas} respostas`}`}</p>
          <p className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-foreground" aria-label={`${eur(r.total)} € estimado`}>
            <Contagem valor={r.total} de={reduzir ? undefined : 0} realce={false} fmt={(x) => `${eur(x)} €`} />
          </p>
          <p className="text-sm text-muted-foreground">estimado · {plural(r.servicos, "serviço", "serviços")} · {plural(r.produtos, "produto", "produtos")}</p>
        </div>
      </div>

      {/* a cronologia por fase (1 → 4): a ligação entre as fases desenha-se em cascata */}
      {fases.length > 0 ? (
        <ol aria-label="Por fase da obra" className="relative">
          {fases.map((g, gi) => {
            const ultima = gi === fases.length - 1;
            return (
              <li key={g.fase} className="relative pb-6 pl-11 last:pb-0">
                {!ultima && (
                  <motion.span aria-hidden="true" className="absolute bottom-0 left-[15px] top-8 w-0.5 origin-top rounded-full bg-primary/30"
                    initial={reduzir ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.45, ease: SAIDA, delay: 0.25 + gi * 0.18 }} />
                )}
                <motion.span aria-hidden="true" className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-semibold tabular-nums text-primary-foreground ring-4 ring-background"
                  initial={reduzir ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...MOLA_CARTAO, delay: 0.15 + gi * 0.18 }}>
                  {g.fase}
                </motion.span>
                <h4 className="flex min-h-8 items-center text-[15px] font-semibold text-foreground">{g.nome}</h4>
                <ul className="mt-1">
                  {g.itens.map((x) => {
                    const j = idx++;
                    return (
                      <motion.li key={x.k} {...(j < ANIMAR_ATE ? entrada(0.2 + gi * 0.18 + j * CASCATA) : { initial: false as const })}>
                        <button type="button" onClick={() => ir(x.passo)}
                          className="group -mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/70 text-muted-foreground">{x.fig}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] text-foreground">{x.nome}</span>
                            {x.det && <span className="block truncate text-sm tabular-nums text-muted-foreground">{x.det}</span>}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      ) : (
        <Vazio texto="Ainda não há serviços nem produtos. Comece por O que se faz." acao="Ir a O que se faz" onAcao={() => ir("servicos")} img="ferramenta" />
      )}

      {/* rever um passo: o que falta a vermelho, e um toque volta ao passo (deslizando para trás) */}
      <section aria-label="Rever um passo">
        <h4 className="text-[15px] font-semibold text-foreground">Rever um passo</h4>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {revisao.map(({ p, l }, j) => (
            <motion.li key={p.k} {...(reduzir ? { initial: false as const } : entrada(0.35 + j * CASCATA))}>
              <button type="button" onClick={() => ir(p.k)} className="flex min-h-14 w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-foreground">{p.titulo}</span>
                  <span className={cn("line-clamp-2 text-sm", l.falta ? "font-medium text-destructive" : "text-muted-foreground")}>{l.t}</span>
                </span>
                <span className="shrink-0 text-sm font-medium text-primary">Mudar</span>
              </button>
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}
