// A fase da Emylia (Negócio, Financeiro, Obra) dentro da ficha do Pipeline, com o MESMO ecrã e a mesma lógica da ficha de /negocios (NegocioSimples → FaseSimples e
// Lateral): à esquerda a lista de passos (visto, cadeado, «falta N», «Fim»), no centro «Passo N de M», o título, o corpo do passo (os campos, as sugestões e as
// ações são da Emylia: passosDaFase) e «Anterior»/«Continuar»; no «Fim» e no «Enviar proposta» o botão do passo seguinte (BotaoFase, que corre o motor: os gates de cada
// fase são os dele). Portado do NegocioSimples sem o editar: a barra de fases, o cabeçalho e o menu «Mais» são os da ficha do Pipeline. Só se mexe aqui no que a página
// faz por URL (o passo aberto vai para o estado) e na leitura em voz alta. Só leitura = `fieldset disabled` nos controlos de escrita (o conteúdo continua lido).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";
import { PAPEIS, proximo, type Negocio } from "@/emylia/motor";
import type { Passo } from "@/emylia/CamposFase";
import { BotaoFase, passosDaFase, temBotaoFase } from "@/emylia/PaginaNegocio";
import { PedidoDoCliente } from "@/emylia/PedidoDoCliente";
import { FASE_COR, type Ctx } from "@/emylia/pecas";
import { GuiaPassoCtx } from "@/emylia/guiaPasso";
import { irParaCampoEmFalta } from "@/emylia/irParaCampoEmFalta";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { CENTRO_QUE_ROLA, LATERAL_FIXA } from "../layoutGuia";
import { FOCO } from "@/components/negocio-metas/estilos";
import { SoParaLer } from "./SoParaLer";

const N = "pessoasPagina.real.neg.";
const PAUSA_AO_COMPLETAR_MS = 600;

// nomes curtos para a lista dos passos (os da página de Negócios)
const CURTO: Record<string, string> = {
  "Local · exterior (edifício e acessos)": "Exterior do edifício", "Local · interior": "Interior do espaço",
  "nec": "Necessidades do cliente", "Escolhas do cliente": "Escolhas do cliente", "Plano, materiais e resultado": "Plano e materiais", "Plano da obra": "Plano da obra",
};
const curto = (p: Passo): string => (p.personalizado ? p.titulo : CURTO[p.id] || CURTO[p.titulo] || p.titulo);
const completo = (p: Passo): boolean => (p.conta ? p.conta.n > 0 && p.conta.f >= p.conta.n : !!p.feito);
// quem pediu menos movimento no sistema não vê a página a deslizar
const suave = (): ScrollBehavior => (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

interface FaseDaEmyliaProps {
  ctx: Ctx;
  d: Negocio;
  soLeitura: boolean;
  /** O que vem por cima dos passos no centro (título da fase, cabeçalho do negócio, estado da gravação, avisos). */
  topo: ReactNode;
  /** As «Fases feitas» da ficha, por baixo da lista de passos. */
  fasesFeitas: ReactNode;
  /** O que vem por baixo dos passos (caminho da obra, trabalhos a mais, anular, histórico). */
  depois?: ReactNode;
  extra?: ReactNode;
  /** Muda a lista de passos da Emylia antes de se desenhar (a visita acrescenta os passos do questionário configurável); sem isto, são os da Emylia. */
  ajustarPassos?: (passos: Passo[]) => Passo[];
}

export function FaseDaEmylia({ ctx, d, soLeitura, topo, fasesFeitas, depois, extra, ajustarPassos }: FaseDaEmyliaProps) {
  const { t } = useTranslation();
  const { S } = ctx;
  const p = proximo(d, S), meu = !!p.who && p.who === S.role;
  const passosDaEmylia = passosDaFase(ctx, d, true);
  const passos = ajustarPassos ? ajustarPassos(passosDaEmylia) : passosDaEmylia;
  const comFim = temBotaoFase(ctx, d);
  // abre no primeiro passo por fazer; se está tudo feito, abre logo no passo do negócio (o «Fim»)
  const idx = passos.findIndex((x) => !completo(x));
  const primeiro = idx === -1 ? passos.length : idx;
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const ativo = escolhido ?? primeiro;
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;
  const setAtivo = useCallback((n: number) => setEscolhido(Math.max(0, n)), []);
  const titulo = useRef<HTMLHeadingElement>(null);
  const montado = useRef(false);
  // um passo com sub-passos (a seleção guiada das Necessidades) tem o seu «Seguinte»: a fase esconde o «Continuar»
  const [guiado, setGuiado] = useState(false);
  const guia = useMemo(() => ({ avancar: () => setAtivo(ativoRef.current + 1), recuar: () => setAtivo(ativoRef.current - 1), setGuiado }), [setAtivo]);

  // tentou passar de fase com campos em falta: vai para o primeiro passo com falta e põe o cursor no campo
  useEffect(() => {
    if (S.pulse === "falta") {
      const i = passos.findIndex((x) => (x.falta || 0) > 0);
      if (i >= 0 && i !== ativo) setAtivo(i);
      irParaCampoEmFalta();
    } else if (S.pulse === "verif") {
      // «Verificar» e «Ver bloqueios»: abre o orçamento na parte «Antes de enviar»
      const i = passos.findIndex((x) => x.id === "orc");
      if (i >= 0 && i !== ativo) setAtivo(i);
      setTimeout(() => document.getElementById("verif")?.scrollIntoView({ behavior: suave(), block: "start" }), 350);
    } else if (S.pulse === "sec-5") {
      // «Ver resultado» (a obra acabou): abre o passo da obra e desce até ao previsto e real
      const i = passos.findIndex((x) => x.id === "obra");
      if (i >= 0 && i !== ativo) setAtivo(i);
      setTimeout(() => document.getElementById(`real-fases-${d.id}`)?.scrollIntoView({ behavior: suave(), block: "start" }), 800);
    }
  });
  // enviada a proposta, a página não fica no orçamento: vai para o fim, «à espera do cliente»
  const enviadaAntes = useRef(!!d.orc?.enviada);
  useEffect(() => {
    const agora = !!d.orc?.enviada;
    if (agora && !enviadaAntes.current) setAtivo(passos.length);
    enviadaAntes.current = agora;
  }, [d.orc?.enviada, passos.length, setAtivo]);

  // um passo completo passa sozinho ao seguinte (menos os que têm mais por baixo das respostas, como as fotografias)
  const atual = passos[ativo];
  const ok = atual ? completo(atual) : false;
  const semAvancar = !!atual?.semAvancar;
  const antes = useRef({ i: ativo, ok });
  useEffect(() => {
    const a = antes.current;
    antes.current = { i: ativo, ok };
    if (a.i === ativo && !a.ok && ok && ativo < passos.length && !guiado && !semAvancar) {
      const h = setTimeout(() => setAtivo(ativo + 1), PAUSA_AO_COMPLETAR_MS);
      return () => clearTimeout(h);
    }
  }, [ativo, ok, passos.length, guiado, semAvancar, setAtivo]);

  // ao mudar de passo, o título recebe o foco (leitores de ecrã) sem saltar a página
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    titulo.current?.focus({ preventScroll: true });
  }, [ativo]);

  const fim = ativo >= passos.length;
  const quem = p.who && p.who !== "cliente" && !meu ? PAPEIS[p.who].n : null;
  // com a proposta pronta a enviar, o botão é sempre «Enviar proposta»: em cima e em baixo de cada passo, sem «Continuar»
  const enviar = !fim && meu && p.act === "enviar" && comFim;
  const botaoNoPasso = !fim && atual?.id === "orc" && d.orc && !d.orc.enviada && !completo(atual);
  const classeItem = (i: number): string => cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors", FOCO,
    i === ativo ? "bg-muted font-semibold text-foreground" : "text-foreground/80 hover:bg-muted/60");

  return (
    <>
      <div className={cn("md:self-start", LATERAL_FIXA)}>
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <nav aria-label={t(`${N}passos`)}>
            <ul className="m-0 list-none space-y-0.5 p-0">
              {passos.map((x, i) => {
                const feito = completo(x);
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => setAtivo(i)} aria-current={i === ativo ? "step" : undefined} className={classeItem(i)}>
                      <span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]",
                        x.falta ? "border-destructive bg-destructive text-destructive-foreground" : feito ? "border-primary bg-primary text-primary-foreground" : i === ativo ? "border-foreground" : "border-input")}>
                        {x.falta ? "!" : feito ? <Check className="h-3 w-3" /> : x.bloqueado && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </span>
                      <span className={cn("min-w-0 flex-1", x.bloqueado && "text-muted-foreground")}>{curto(x)}{x.bloqueado && <span className="sr-only"> ({t(`${N}bloqueado`)})</span>}</span>
                      {!!x.falta && <span className="text-sm font-medium text-destructive">{t(x.falta > 1 ? `${N}faltam` : `${N}falta`, { n: x.falta })}</span>}
                      {feito && <span className="sr-only">({t(`${N}feito`)})</span>}
                    </button>
                  </li>
                );
              })}
              {comFim && (
                <li>
                  <button type="button" onClick={() => setAtivo(passos.length)} aria-current={fim ? "step" : undefined} className={classeItem(passos.length)}>
                    <span aria-hidden="true" className={cn("h-5 w-5 shrink-0 rounded-full border", fim ? "border-foreground" : "border-input")} />
                    <span className="min-w-0 flex-1">{t(`${N}fim`)}</span>
                  </button>
                </li>
              )}
            </ul>
          </nav>
          {fasesFeitas}
        </div>
      </div>
      <div role="region" aria-label={t("pessoasPagina.guia.centro")} tabIndex={0} data-guia-centro="" className={cn(CENTRO_QUE_ROLA, FOCO)}>
        <div className="pn pg-root space-y-4 py-1 md:px-2">
          {topo}
          <SoParaLer ativo={soLeitura}>
            <section className="min-w-0 space-y-4" aria-labelledby="passo-titulo">
              <PedidoDoCliente ctx={ctx} d={d} />
              {!fim && atual ? (
                <>
                  {(!guiado || enviar) && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {!guiado && <p className="text-sm text-muted-foreground">{t(`${N}passoDe`, { n: ativo + 1, total: passos.length })}</p>}
                      <div className="ml-auto flex items-center gap-2">{enviar && <BotaoFase ctx={ctx} d={d} tamanho="default" />}</div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl [&_svg]:h-5 [&_svg]:w-5", FASE_COR[d.fase])} aria-hidden="true"><atual.icone /></span>
                    <h3 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">{curto(atual)}</h3>
                  </div>
                  <div id="passo-corpo" key={ativo}><GuiaPassoCtx.Provider value={guia}>{atual.corpo}</GuiaPassoCtx.Provider></div>
                </>
              ) : (
                <>
                  <h3 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
                    {p.done ? t(`${N}fechado`) : p.wait || !passos.every(completo) || /^(O cliente|À espera|O contrato)/.test(p.t) ? p.t : `${t(`${N}estaTudo`)} ${p.t}.`}
                  </h3>
                  {p.sub && <p className="text-base text-muted-foreground">{p.sub}</p>}
                  {quem && <p className="text-base text-muted-foreground">{t(`${N}passoDeQuem`, { quem })}</p>}
                </>
              )}
              {/* um só botão primário: «Continuar», ou o passo do negócio no fim (o passo guiado tem o seu) */}
              {!(guiado && !fim) && (
                <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>{ativo > 0 && <Button type="button" variant="ghost" size="lg" onClick={() => setAtivo(ativo - 1)}>{t(`${N}anterior`)}</Button>}</div>
                  {fim || enviar
                    ? (comFim ? <div className="[&_button]:w-full sm:[&_button]:w-auto"><BotaoFase ctx={ctx} d={d} /></div> : null)
                    : (botaoNoPasso && d.orc
                      ? <Button type="button" size="lg" className="w-full sm:w-auto" onClick={ctx.go(() => (d.orc!.verif ? ctx.A.irVerif() : ctx.A.verificar(d.id)))}>{d.orc.verif ? t(`${N}verErros`) : t(`${N}verificar`)}</Button>
                      : atual?.bloqueado ? null : <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setAtivo(ativo + 1)}>{t(`${N}continuar`)}</Button>)}
                </div>
              )}
            </section>
          </SoParaLer>
          {depois}
          {extra}
        </div>
      </div>
    </>
  );
}
