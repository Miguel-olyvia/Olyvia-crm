// Proposta de 09/10/2026: a página do negócio com menos ruído.
// Uma coisa de cada vez: o passo atual ocupa o ecrã, os outros ficam numa
// lista à esquerda. Um só botão primário. Texto a 15–16 px, contraste AA.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pessoaDeOrigem } from "./PessoasV1";
import { clienteDeOrigem } from "./ClientesV1";
import { ArrowLeft, Check, Euro, Lock, Mail, MapPin, MessageCircle, MoreHorizontal, Phone, RotateCcw, Smartphone, Square, TrendingUp, Volume2 } from "lucide-react";
import { BotaoAcessoPortal, EstadoAcessoPortal, temPortal } from "./AcessoPortalNegocio";
import { modoReal } from "./acessosPortal";
import { PortalCliente } from "./PortalCliente";
import { NovaVersao, VoltarVisita } from "./VoltarAtras";
import { CaminhoObra } from "./CaminhoObra";
import { PedidoDoCliente } from "./PedidoDoCliente";
import { TrabalhosAMais } from "./TrabalhosAMais";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FASES, LINHAS, PAPEIS, eur0, pct, proximo, tot, versaoAtual, type Negocio } from "./motor";
import { CONTACTO, FINANCEIRO, LEAD, OBRA, PROPOSTA, EXTERIOR, INTERIOR, AREA, ESCOLHAS, efetivo, gruposArea, nomeGrupo, type Grupo } from "./campos";
import { Campos, type Passo } from "./CamposFase";
import { BotaoFase, passosDaFase, temBotaoFase } from "./PaginaNegocio";
import { OrcamentoSimples } from "./OrcamentoSimples";
import { DocumentosSimples } from "./FasesSimples";
import { ContratoDoc, Partilhar, PropostaDoc } from "./DocsCliente";
import { NecessidadesCliente } from "./NecessidadesVisita";
import { VisitasLista } from "./Visitas";
import { camposMedida, medida, nfmt, nomeLinha } from "./motor";
import { FASE_COR, IconeFase, type Ctx } from "./pecas";
import { GuiaPassoCtx } from "./guiaPasso";
import { ConfirmarAnulacao, oQueAnular, podeAnular } from "./AnularContrato";
import { useParamUrl } from "./usarParamUrl";
import { irParaCampoEmFalta } from "./irParaCampoEmFalta";

const GRUPOS_FASE: Grupo[][] = [LEAD, CONTACTO, [EXTERIOR, INTERIOR, AREA, ESCOLHAS], PROPOSTA, FINANCEIRO, OBRA];
// nomes curtos para a lista dos passos
const CURTO: Record<string, string> = {
  "Local · exterior (edifício e acessos)": "Exterior do edifício", "Local · interior": "Interior do espaço",
  "nec": "Necessidades do cliente", "Escolhas do cliente": "Escolhas do cliente", "Plano, materiais e resultado": "Plano e materiais", "Plano da obra": "Plano da obra",
};
const curto = (p: Passo) => (p.personalizado ? p.titulo : CURTO[p.id] || CURTO[p.titulo] || p.titulo);
const completo = (p: Passo) => (p.conta ? p.conta.n > 0 && p.conta.f >= p.conta.n : !!p.feito);

/** 27/10 (Rúben): por baixo do nome, os contactos que se tocam: o telefone liga, o WhatsApp abre a conversa, o email abre
 *  o programa de email e a morada abre o mapa. O "Telefone ou email" da lead pode ser um email: conta como o email. */
const LINK_CONTACTO = "inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[15px] text-primary underline-offset-4 hover:underline";
function ContactosCliente({ d }: { d: Negocio }) {
  const telEmail = d.tel.includes("@");
  const tel = telEmail ? "" : d.tel.trim(), email = (d.f.email || (telEmail ? d.tel : "")).trim();
  const digitos = tel.replace(/[^\d+]/g, "");
  // o WhatsApp quer o número com o indicativo e sem "+": um número português de 9 algarismos leva o 351
  const wa = digitos.replace(/^\+/, "").replace(/^00/, "").replace(/^(9\d{8}|2\d{8})$/, "351$1");
  const morada = d.f.morada ? [d.f.morada, d.f.cp, d.f.localidade].filter(Boolean).join(", ") : d.local;
  if (!tel && !email && !morada) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4">
      {tel && <a href={`tel:${digitos}`} className={LINK_CONTACTO}><Phone className="h-4 w-4" aria-hidden="true" />{tel}</a>}
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={LINK_CONTACTO}><MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp</a>}
      {email && <a href={`mailto:${email}`} className={cn(LINK_CONTACTO, "break-all")}><Mail className="h-4 w-4" aria-hidden="true" />{email}</a>}
      {morada && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada)}`} target="_blank" rel="noreferrer" className={LINK_CONTACTO}><MapPin className="h-4 w-4" aria-hidden="true" />{morada}</a>}
    </p>
  );
}

export function NegocioSimples(ctx: Ctx) {
  const { S, A, go } = ctx;
  const d = S.deals.find((x) => x.id === S.deal)!;
  const T = d.orc ? tot(d, S) : null;
  const [ver, setVer] = useState<number | null>(null); // uma fase já feita, só para ler
  const [portal, setPortal] = useState(false);
  const [anular, setAnular] = useState(false);
  // ao passar de fase: uma frase curta a dizer o que acabou e o que vem, que desaparece sozinha
  const faseAntes = useRef(d.fase);
  const [acabou, setAcabou] = useState<number | null>(null);
  useEffect(() => {
    if (d.fase > faseAntes.current) {
      setAcabou(faseAntes.current); setVer(null);
      const t = setTimeout(() => setAcabou(null), 5000);
      faseAntes.current = d.fase;
      return () => clearTimeout(t);
    }
    if (d.fase < faseAntes.current) setVer(null); // voltou atrás (à visita): mostra logo a fase aberta
    faseAntes.current = d.fase;
  }, [d.fase]);
  // o menu "Mais" do cabeçalho: fecha ao clicar fora
  const [mais, setMais] = useState(false);
  const maisRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mais) return;
    const fora = (e: MouseEvent) => { if (!maisRef.current?.contains(e.target as Node)) setMais(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [mais]);
  const verCliente = !!(d.orc?.enviada || d.orc?.versoes?.length);
  const portalReal = modoReal() && temPortal(d);
  const perder = d.fase < 4 && !d.perdido;
  const origem = pessoaDeOrigem(S.deal);
  const cliente = origem ? null : clienteDeOrigem(S.deal); // 21/10: aberto da página de um cliente: volta a ela

  const caminhoEAdendas = !d.perdido && d.fase >= 4 ? <>
    {d.obra.plano && <CaminhoObra {...ctx} d={d} />}
    {/* trabalhos a mais depois do contrato (adendas); 23/10: a seguir ao caminho da obra (o próximo passo primeiro) */}
    <TrabalhosAMais {...ctx} d={d} />
  </> : null;
  // 27/10: no orçamento, a página usa a largura do ecrã (as linhas e o plano precisam dela); o cartão do cliente sai da direita
  const largo = ver === null && d.fase === 3 && !!d.orc;
  return (
    <div className={cn("mx-auto w-full px-4 pb-24 pt-6 sm:px-8 sm:pt-10", largo ? "max-w-[1760px]" : "max-w-6xl")}>
      {/* aberto a partir da ficha de uma pessoa (proposta do V1, 16/10): o voltar leva de volta a ela */}
      <button type="button" onClick={go(() => A.nav(origem ? "pessoas" : cliente ? "clientes" : "negocios"))}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {origem ?? cliente ?? "Negócios"}
      </button>

      <header className="mt-2 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <IconeFase fase={d.fase} tam="lg" />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{d.nome}</h1>
              <p className="text-base text-muted-foreground">{d.servico}{!d.linhaPorDefinir && d.servico !== nomeLinha(d) ? " · " + nomeLinha(d) : ""}</p>
              <ContactosCliente d={d} />
            </div>
          </div>
          {/* 27/10: as ações de vez em quando ficam no "Mais"; o cabeçalho fica com o cliente e o progresso */}
          {(verCliente || portalReal || perder || podeAnular(d)) && (
            <div ref={maisRef} className="relative self-start" onKeyDown={(e) => { if (e.key === "Escape" && mais) { setMais(false); maisRef.current?.querySelector("button")?.focus(); } }}>
              <button type="button" onClick={() => setMais(!mais)} aria-label="Mais ações" aria-expanded={mais} aria-controls="mais-acoes"
                className="grid h-11 w-11 place-items-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </button>
              {mais && (
                <div id="mais-acoes" className="absolute right-0 z-20 mt-1 flex min-w-56 flex-col rounded-xl border border-border bg-card p-1.5 shadow-[var(--shadow-md)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 [&>button]:justify-start [&>button]:rounded-lg [&>button]:px-3 [&>button]:text-left [&>button:hover]:bg-muted">
                  {/* o que o cliente vê: 23/10, só para ver (antes a equipa aceitava e assinava por ele, sem rasto de quem foi) */}
                  {verCliente && (
                    <button type="button" onClick={() => { setMais(false); setPortal(true); }} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-foreground">
                      <Smartphone className="h-4 w-4" aria-hidden="true" />Ver como o cliente
                    </button>
                  )}
                  {/* 23/10 (2.0): reenviar o acesso ao portal (ou gerar uma password nova) sem mandar um documento novo */}
                  <BotaoAcessoPortal ctx={ctx} d={d} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-foreground" />
                  {perder && (
                    <button type="button" onClick={() => { setMais(false); go(() => A.perder(d.id))(); }} className="min-h-11 text-[15px] text-foreground">
                      Marcar como perdido
                    </button>
                  )}
                  {/* 19/10: com contrato, já não se "perde": a Direção anula o contrato (a encomenda no Inventário vai com ele) */}
                  {podeAnular(d) && (
                    <button type="button" onClick={() => { setMais(false); setAnular(!anular); }} aria-expanded={anular} className="min-h-11 text-[15px] text-destructive">
                      Anular {oQueAnular(d)}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {T && (
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            <div className="inline-flex items-center gap-2"><dt><Euro className="h-4 w-4 text-muted-foreground" aria-label="Total sem IVA" /></dt><dd className="font-semibold tabular-nums">{eur0(T.pf)} € s/ IVA</dd></div>
            <div className="inline-flex items-center gap-2"><dt><TrendingUp className="h-4 w-4 text-muted-foreground" aria-label="Margem" /></dt><dd className={cn("tabular-nums", T.m < S.cfg.min / 100 ? "text-destructive" : T.m < S.cfg.alvo / 100 - 0.005 ? "text-warning" : "text-success")}>margem {pct(T.m)}</dd></div>
          </dl>
        )}
        <div className="mt-6">
          {/* 27/10: as fases já feitas abrem-se na própria barra (só leitura) */}
          <ol className="grid grid-cols-6 gap-1.5" aria-label="Fases do negócio">
            {FASES.map((f, i) => {
              const barra = <span className={cn("block h-2 rounded-full transition-colors duration-500", i < d.fase ? "bg-primary" : i === d.fase ? "bg-primary/50" : "bg-muted")} />;
              const nome = <span className={cn("mt-1.5 hidden truncate text-xs sm:block", i === ver || i === d.fase ? "font-semibold text-foreground" : i < d.fase ? "text-foreground/70" : "text-muted-foreground")}>{f}</span>;
              return (
                <li key={f} aria-current={i === d.fase ? "step" : undefined}>
                  {i < d.fase
                    ? <button type="button" onClick={() => setVer(ver === i ? null : i)} aria-pressed={ver === i} aria-label={`Ver a fase ${f} (feita)`}
                        className={cn("block w-full rounded-md py-2 text-left -my-2", ver === i && "[&>span:first-child]:ring-2 [&>span:first-child]:ring-foreground/40")}>
                        {barra}{nome}
                      </button>
                    : <>{barra}{nome}</>}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[15px] text-muted-foreground sm:hidden" aria-live="polite">
            Fase {d.fase + 1} de 6: <span className="font-semibold text-foreground">{FASES[d.fase]}</span>
          </p>
        </div>
      </header>
      {/* 23/10 (2.0): o email que falta para enviar ao portal e o estado da conta do cliente */}
      <div className="mt-4 empty:hidden"><EstadoAcessoPortal ctx={ctx} d={d} /></div>
      {S.confirmPerda === d.id && (
        <div role="alertdialog" aria-label="Confirmar" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 animate-in fade-in-0">
          <p className="flex-1 text-[15px]">Marcar como perdido? Sai do quadro, mas fica no histórico.</p>
          <Button variant="outline" onClick={go(() => A.perderNao())}>Cancelar</Button>
          <Button variant="destructive" onClick={go(() => A.perderSim(d.id))}>Marcar como perdido</Button>
        </div>
      )}
      {anular && podeAnular(d) && <ConfirmarAnulacao ctx={ctx} d={d} fechar={() => setAnular(false)} />}
      {d.anulado && (
        <div role="status" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/[0.04] p-4 text-[15px]">
          <b className="font-semibold">{d.orc?.vendaDireta ? "Venda anulada" : "Contrato anulado"}</b>
          <span className="text-muted-foreground"> · {d.anulado.origem === "inventario" ? "a encomenda de cliente foi eliminada no Inventário" : d.anulado.por} · {d.anulado.q}</span>
          <span className="block">{d.anulado.motivo}</span>
        </div>
      )}

      {/* 27/10: um toast por cima da página: o aviso já não empurra o passo para baixo */}
      {acabou !== null && (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-success/30 bg-card px-4 py-3 text-[15px] shadow-[var(--shadow-lg)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success text-white"><Check className="h-4 w-4" aria-hidden="true" /></span>
          <span><b className="font-semibold">{FASES[acabou]} concluída.</b> Agora: {FASES[d.fase]}.</span>
        </div>
      )}

      {portal && <PortalCliente ctx={ctx} d={d} fechar={() => setPortal(false)} previa />}
      {/* 21/10: o cliente pediu alterações no portal: a proposta volta atrás, à vista, e guia-se a versão nova */}
      {(d.fase === 3 || d.fase === 2) && <PedidoDoCliente ctx={ctx} d={d} />}
      {/* do contrato à obra (16/10): o pagamento primeiro; com ele, a encomenda no Inventário; depois o plano e o arranque.
          23/10: no Financeiro, o passo de agora (fatura, pagamento) vem primeiro e isto fica a seguir; na Obra fica em cima */}
      {d.fase >= 5 && caminhoEAdendas}

      {/* De volta à visita com um orçamento já feito: diz o que fazer e como sair */}
      {d.fase === 2 && d.orc && !d.perdido && (
        <div role="status" className="mt-6 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
          <span className="flex items-start gap-3 text-[15px]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true"><RotateCcw className="h-4 w-4" /></span>
            <b className="self-center font-semibold">De volta à visita{d.orc.versoes?.length ? ` (versão ${versaoAtual(d.orc)})` : ""}.</b>
          </span>
          <button type="button" onClick={go(() => A.desistirVisita(d.id))}
            className="min-h-11 shrink-0 self-start px-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline sm:self-center">
            Voltar ao orçamento
          </button>
        </div>
      )}


      <div className={cn("mt-8 grid items-start gap-10 lg:grid-cols-[260px_minmax(0,1fr)]", !largo && "2xl:grid-cols-[260px_minmax(0,1fr)_240px]")}>
        {ver === null
          ? <FaseSimples key={d.id + ":" + d.fase + ":v" + (d.orc ? versaoAtual(d.orc) : 0)} ctx={ctx} d={d} lateral={(passos, ativo, setAtivo, comFim) => (
            <Lateral d={d} passos={passos} ativo={ativo} setAtivo={setAtivo} comFim={comFim} />
          )} />
          : <>
            <div className="hidden lg:block" aria-hidden="true" />
            <section className="min-w-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 motion-safe:duration-200" aria-labelledby="fase-lida">
              <p className="text-sm text-muted-foreground">Fase feita · só leitura</p>
              <h2 id="fase-lida" className="mt-1 text-2xl font-semibold">{FASES[ver]}</h2>
              <div className="mt-6 space-y-8">
                {/* Na Visita já feita, a pergunta natural: "e se quiser mudar isto?" */}
                {ver === 2 && d.fase === 3 && d.orc && !d.orc.aceite && (
                  <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="text-[15px]">{d.orc.enviada
                      ? "Precisa de mudar a visita? A proposta já está com o cliente: faz-se uma nova versão."
                      : "Precisa de mudar alguma coisa? Volte à visita: o orçamento refaz-se quando a fechar."}</p>
                    {d.orc.enviada ? <NovaVersao ctx={ctx} d={d} inicio="visita" /> : <VoltarVisita ctx={ctx} d={d} />}
                  </div>
                )}
                {ver === 2 && <div><h3 className="mb-3 text-[17px] font-semibold tracking-tight">Visitas</h3><VisitasLista ctx={ctx} d={d} simples /></div>}
                {ver === 2 && (
                  <div>
                    <h3 className="mb-3 text-[17px] font-semibold tracking-tight">Medidas e fotografias</h3>
                    <dl className="space-y-1 text-[15px]">
                      {camposMedida(LINHAS[d.linha]).map(([k, l]) => (
                        <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{l}</dt><dd className="tabular-nums">{nfmt(medida(d.visita.med, k))}</dd></div>
                      ))}
                      <div className="flex gap-2"><dt className="text-muted-foreground">Fotografias:</dt><dd className="tabular-nums">{d.visita.fotos}</dd></div>
                    </dl>
                    {d.f.obs_medidas && <p className="mt-1 text-[15px] text-muted-foreground">Observações: {d.f.obs_medidas}</p>}
                  </div>
                )}
                {ver === 2 && <div><h3 className="mb-3 text-[17px] font-semibold tracking-tight">Necessidades do cliente</h3><NecessidadesCliente {...ctx} d={d} simples /></div>}
                {ver === 3 && d.orc && <div><h3 className="mb-3 text-[17px] font-semibold tracking-tight">Orçamento</h3><OrcamentoSimples {...ctx} d={d} /></div>}
                {ver === 3 && d.orc && <div><h3 className="mb-3 text-[17px] font-semibold tracking-tight">Proposta</h3><Partilhar ctx={ctx} d={d} tipo="proposta" estado={d.orc.aceite ? `aceite ${d.orc.aceite}` : "enviada"}><PropostaDoc S={S} d={d} /></Partilhar></div>}
                {ver === 3 && d.orc && !d.orc.vendaDireta && <div><h3 className="mb-3 text-[17px] font-semibold tracking-tight">Contrato</h3><Partilhar ctx={ctx} d={d} tipo="contrato" estado={d.orc.contrato === "assinado" ? "assinado" : "enviado"}><ContratoDoc S={S} d={d} /></Partilhar></div>}
                {ver === 4 && <div><h3 className="mb-3 text-[17px] font-semibold tracking-tight">Fatura e recibo</h3><DocumentosSimples {...ctx} d={d} /></div>}
                {(ver === 3 && d.orc?.vendaDireta ? PROPOSTA.slice(0, 1) : GRUPOS_FASE[ver]).flatMap((g) => (g === AREA ? gruposArea(S.campos, d.f) : [g])).map((g0) => efetivo(S.campos, g0)).filter((g) => !g.oculto).map((g) => (
                  <div key={g.titulo}>
                    <h3 className="mb-3 text-[17px] font-semibold tracking-tight">{nomeGrupo(g)}</h3>
                    <Campos grupo={g} d={d} A={A} run={ctx.run} ro simples />
                  </div>
                ))}
              </div>
              <div className="mt-10 border-t border-border pt-6">
                <Button onClick={() => setVer(null)}>Voltar à fase {FASES[d.fase]}</Button>
              </div>
            </section>
          </>}

        {/* 27/10: os dados do cliente já estão no cabeçalho; aqui só o que aconteceu */}
        <aside className={cn("hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]", !largo && "2xl:block")} aria-labelledby="ultimos">
          <h2 id="ultimos" className="text-lg font-semibold tracking-tight">Últimos acontecimentos</h2>
          <ol className="mt-3 space-y-3">
            {d.hist.slice(0, 5).map((h, i) => (
              <li key={d.hist.length - i} className="text-[15px] leading-snug">
                {h.t}<span className="block text-sm text-muted-foreground">{h.q}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {d.fase === 4 && caminhoEAdendas}
    </div>
  );
}

// 27/10: quem pediu menos movimento no sistema não vê a página a deslizar
const suave = (): ScrollBehavior => (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

// Ler o passo em voz alta (ajuda quem tem dislexia): o título e as perguntas, com o que já está respondido.
function Ouvir() {
  const [a, setA] = useState(false);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const falar = () => {
    const sy = window.speechSynthesis;
    if (a) { sy.cancel(); setA(false); return; }
    const titulo = document.getElementById("passo-titulo")?.textContent || "";
    const linhas = [...document.querySelectorAll<HTMLElement>('#passo-corpo [id$="-rot"]')].map((el) => {
      const linha = el.closest(".grid");
      const escolhido = linha?.querySelector('[aria-pressed="true"]')?.textContent || (linha?.querySelector("input,textarea") as HTMLInputElement | null)?.value || linha?.querySelector("output")?.textContent || "";
      return el.textContent + (escolhido && escolhido !== "—" ? ": " + escolhido : ": por responder");
    });
    const u = new SpeechSynthesisUtterance([titulo, ...linhas].join(". "));
    u.lang = "pt-PT"; u.rate = 0.95;
    u.onend = () => setA(false);
    sy.cancel(); sy.speak(u); setA(true);
  };
  return (
    <button type="button" onClick={falar} aria-pressed={a} aria-label="Ouvir" title={a ? "Parar" : "Ouvir"}
      className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      {a ? <Square className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

type Lat = (passos: Passo[], ativo: number, setAtivo: (i: number) => void, comFim: boolean) => React.ReactNode;

function Lateral({ d, passos, ativo, setAtivo, comFim }: { d: Negocio; passos: Passo[]; ativo: number; setAtivo: (i: number) => void; comFim: boolean }) {
  return (
    <nav aria-label="Passos desta fase" className="hidden rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-sm)] lg:sticky lg:top-6 lg:block">
      {passos.length > 0 && (
        <>
          <h2 className="px-3 text-sm font-medium text-muted-foreground">{FASES[d.fase]}</h2>
          <ol className="mt-2 space-y-0.5">
            {passos.map((p, i) => {
              const ok = completo(p);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setAtivo(i)} aria-current={i === ativo ? "step" : undefined}
                    className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors",
                      i === ativo ? "bg-muted font-semibold text-foreground" : "text-foreground/80 hover:bg-muted/60")}>
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]",
                      p.falta ? "border-destructive bg-destructive text-destructive-foreground" : ok ? "border-primary bg-primary text-primary-foreground" : i === ativo ? "border-foreground" : "border-input")}>
                      {p.falta ? "!" : ok ? <Check className="h-3 w-3" aria-hidden="true" /> : p.bloqueado && <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
                    </span>
                    <span className={cn("min-w-0 flex-1", p.bloqueado && "text-muted-foreground")}>{curto(p)}{p.bloqueado && <span className="sr-only"> (fechado até o cliente aceitar)</span>}</span>
                    {!!p.falta && <span className="text-sm font-medium text-destructive">falta{p.falta > 1 ? "m" : ""} {p.falta}</span>}
                    {ok && <span className="sr-only">(feito)</span>}
                  </button>
                </li>
              );
            })}
            {/* 27/10: o passo do negócio também na lista (antes, um "Ir para…" por baixo de cada passo) */}
            {comFim && (
              <li>
                <button type="button" onClick={() => setAtivo(passos.length)} aria-current={ativo >= passos.length ? "step" : undefined}
                  className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors",
                    ativo >= passos.length ? "bg-muted font-semibold text-foreground" : "text-foreground/80 hover:bg-muted/60")}>
                  <span className={cn("h-5 w-5 shrink-0 rounded-full border", ativo >= passos.length ? "border-foreground" : "border-input")} aria-hidden="true" />
                  <span className="min-w-0 flex-1">Fim</span>
                </button>
              </li>
            )}
          </ol>
        </>
      )}
    </nav>
  );
}

function FaseSimples({ ctx, d, lateral }: { ctx: Ctx; d: Negocio; lateral: Lat }) {
  const { S } = ctx;
  const p = proximo(d, S), meu = !!p.who && p.who === S.role;
  const passos = passosDaFase(ctx, d, true);
  // abre no primeiro passo por fazer; se está tudo feito, abre logo no passo do negócio
  const idx = passos.findIndex((x) => !completo(x));
  const primeiro = idx === -1 ? passos.length : idx;
  // 26/10: o passo aberto vai para o endereço (?passo=orc; "fim" é o passo do negócio): o "voltar" do browser volta ao passo anterior
  const [passoUrl, setPassoUrl] = useParamUrl<string>("passo", "");
  const ids = passos.map((x) => x.id);
  const iUrl = passoUrl === "fim" ? passos.length : ids.indexOf(passoUrl);
  const ativo = iUrl >= 0 ? iUrl : primeiro;
  const ativoRef = useRef(ativo), idsRef = useRef(ids);
  ativoRef.current = ativo; idsRef.current = ids;
  const setAtivo = useCallback((x: number | ((a: number) => number)) => {
    const n = typeof x === "function" ? x(ativoRef.current) : x;
    setPassoUrl(n >= idsRef.current.length ? "fim" : idsRef.current[Math.max(0, n)] ?? "");
  }, [setPassoUrl]);
  // 27/10 (Rúben): enviada a proposta, a página não fica no orçamento (nem em nenhum passo de antes): vai para o fim, "à espera do cliente"
  const enviadaAntes = useRef(!!d.orc?.enviada);
  useEffect(() => {
    const agora = !!d.orc?.enviada;
    if (agora && !enviadaAntes.current) setPassoUrl("fim");
    enviadaAntes.current = agora;
  }, [d.orc?.enviada, setPassoUrl]);
  const titulo = useRef<HTMLHeadingElement>(null);
  const montado = useRef(false);
  // um passo com sub-passos (a seleção guiada das Necessidades) tem o seu "Seguinte": a fase esconde o "Continuar"
  const [guiado, setGuiado] = useState(false);
  const guia = useMemo(() => ({ avancar: () => setAtivo((a) => a + 1), recuar: () => setAtivo((a) => Math.max(0, a - 1)), setGuiado }), [setAtivo]);

  // tentou passar de fase com campos em falta: vai para o primeiro passo com falta e põe o cursor no campo
  // "Verificar" e "Ver bloqueios": abre o orçamento na parte "Antes de enviar"
  useEffect(() => {
    if (S.pulse !== "verif") return;
    const i = passos.findIndex((x) => x.id === "orc");
    if (i >= 0 && i !== ativo) setAtivo(i);
    setTimeout(() => document.getElementById("verif")?.scrollIntoView({ behavior: suave(), block: "start" }), 350);
  });
  // "Ver resultado" (a obra acabou): abre o passo da obra e desce até ao previsto e real
  useEffect(() => {
    if (S.pulse !== "sec-5") return;
    const i = passos.findIndex((x) => x.id === "obra");
    if (i >= 0 && i !== ativo) setAtivo(i);
    setTimeout(() => document.getElementById(`real-fases-${d.id}`)?.scrollIntoView({ behavior: suave(), block: "start" }), 800); // depois do foco no título do passo
  });
  useEffect(() => {
    if (S.pulse !== "falta") return;
    const i = passos.findIndex((x) => (x.falta || 0) > 0);
    if (i >= 0 && i !== ativo) setAtivo(i);
    irParaCampoEmFalta();
  });

  // um passo completo passa sozinho ao seguinte (27/10: menos os que têm mais por baixo das respostas, como as fotografias)
  const atual = passos[ativo];
  const ok = atual ? completo(atual) : false;
  const semAvancar = !!atual?.semAvancar;
  const antes = useRef({ i: ativo, ok });
  useEffect(() => {
    const a = antes.current;
    antes.current = { i: ativo, ok };
    if (a.i === ativo && !a.ok && ok && ativo < passos.length && !guiado && !semAvancar) {
      const t = setTimeout(() => setAtivo(ativo + 1), 600);
      return () => clearTimeout(t);
    }
  }, [ativo, ok, passos.length, guiado]);

  // 27/10: o passo novo entra do lado para onde se andou (para a frente, da direita; para trás, da esquerda)
  const ultimo = useRef(ativo);
  const recua = ativo < ultimo.current;
  useEffect(() => { ultimo.current = ativo; }, [ativo]);

  // ao mudar de passo, o título recebe o foco (leitores de ecrã) sem saltar a página
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    titulo.current?.focus({ preventScroll: true });
    titulo.current?.scrollIntoView({ behavior: suave(), block: "nearest" });
  }, [ativo]);

  const fim = ativo >= passos.length;
  const quem = p.who && p.who !== "cliente" && !meu ? PAPEIS[p.who].n : null;
  // 27/10 (Rúben): com a proposta pronta a enviar, o botão é sempre "Enviar proposta": em cima e em baixo de cada passo, sem "Continuar"
  const enviar = !fim && meu && p.act === "enviar" && temBotaoFase(ctx, d);

  return (
    <>
      {lateral(passos, ativo, setAtivo, temBotaoFase(ctx, d))}
      <section className="min-w-0" aria-labelledby="passo-titulo">
        {/* Telemóvel: os passos numa linha (a lista completa fica no computador) */}
        <ol className="mb-6 flex flex-wrap gap-1.5 lg:hidden" aria-label="Passos desta fase">
          {passos.map((x, i) => (
            <li key={x.id}>
              <button type="button" onClick={() => setAtivo(i)} aria-current={i === ativo ? "step" : undefined} aria-label={curto(x)}
                className={cn("flex h-9 min-w-9 items-center justify-center whitespace-nowrap rounded-full border px-3 text-sm transition-colors",
                  x.falta ? "border-destructive text-destructive" : i === ativo ? "border-foreground bg-foreground text-background" : completo(x) ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
                {i === ativo ? curto(x) : completo(x) && !x.falta ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </button>
            </li>
          ))}
          {temBotaoFase(ctx, d) && (
            <li><button type="button" onClick={() => setAtivo(passos.length)} aria-current={fim ? "step" : undefined}
              className={cn("flex h-9 items-center rounded-full border px-3 text-sm", fim ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground")}>Fim</button></li>
          )}
        </ol>
        <div key={ativo} className={cn("motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200", recua ? "motion-safe:slide-in-from-left-2" : "motion-safe:slide-in-from-right-2")}>
          {!fim && atual ? (
            <>
              {/* 27/10: o passo guiado tem a sua própria contagem (o "Enviar proposta" fica sempre) */}
              {(!guiado || enviar) && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {!guiado && <p className="text-sm text-muted-foreground">Passo {ativo + 1} de {passos.length}</p>}
                  <div className="ml-auto flex items-center gap-2">{!guiado && <Ouvir />}{enviar && <BotaoFase ctx={ctx} d={d} tamanho="default" />}</div>
                </div>
              )}
              <div className="mt-2 flex items-center gap-3">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl [&_svg]:h-5 [&_svg]:w-5", FASE_COR[d.fase])} aria-hidden="true"><atual.icone /></span>
                <h2 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">{curto(atual)}</h2>
              </div>
              <div id="passo-corpo" className="mt-6"><GuiaPassoCtx.Provider value={guia}>{atual.corpo}</GuiaPassoCtx.Provider></div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{FASES[d.fase]}</p>
              <h2 id="passo-titulo" ref={titulo} tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight outline-none">
                {p.done ? "Negócio fechado" : p.wait || !passos.every(completo) || /^(O cliente|À espera|O contrato)/.test(p.t) ? p.t : "Está tudo. " + p.t + "."}
              </h2>
              {p.sub && <p className="mt-2 text-base text-muted-foreground">{p.sub}</p>}
              {quem && <p className="mt-2 text-base text-muted-foreground">Este passo é de {quem}.</p>}
            </>
          )}
        </div>

        {/* Um só botão primário: Continuar, ou o passo do negócio no fim (o passo guiado tem o seu) */}
        {!(guiado && !fim) && (
        <div className="mt-10 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>{ativo > 0 && <Button variant="ghost" size="lg" onClick={() => setAtivo(ativo - 1)}>Anterior</Button>}</div>
          {fim || enviar
            ? (temBotaoFase(ctx, d) ? <div className="[&_button]:w-full sm:[&_button]:w-auto"><BotaoFase ctx={ctx} d={d} /></div> : null)
            : <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* no passo Orçamento por verificar, o botão é verificar: sem bloqueios o passo fica feito e avança sozinho;
                  com bloqueios, leva-os à vista (antes, o "Continuar" passava à Proposta com o orçamento por aprovar) */}
              {atual?.id === "orc" && d.orc && !d.orc.enviada && !completo(atual)
                ? <Button size="lg" className="w-full sm:w-auto" onClick={ctx.go(() => (d.orc!.verif ? ctx.A.irVerif() : ctx.A.verificar(d.id)))}>{d.orc.verif ? "Ver o que falta resolver" : "Verificar o orçamento"}</Button>
                : atual?.bloqueado ? null : <Button size="lg" className="w-full sm:w-auto" onClick={() => setAtivo(ativo + 1)}>Continuar</Button>}
            </div>}
        </div>
        )}
      </section>
    </>
  );
}
