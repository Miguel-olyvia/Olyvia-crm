// Voltar atrás no negócio (14/10/2026), guiado e sem surpresas.
// - Antes de enviar: "Voltar à visita", no topo do orçamento e na Visita já feita. Antes de voltar, diz o que fica e o que se refaz.
// - Depois de enviar (e antes de o cliente aceitar): "O cliente pediu alterações" abre a versão seguinte em dois passos
//   (o que pediu; onde se mexe: só no orçamento ou também na visita). A versão enviada fica guardada como substituída.
// - As versões aparecem numa linha do tempo curta, com o total de cada uma e a diferença para a anterior.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Calculator, Check, ClipboardList, MessageSquareText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MOTIVOS_DA_VISITA, MOTIVOS_VERSAO, eur, tot, versaoAtual, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

type P = { ctx: Ctx; d: Negocio };
/** "12/10" → "a 12/10"; "hoje 16:09" → "hoje às 16:09"; "hoje" → "hoje". */
const quando = (q: string) => (q.startsWith("hoje") ? q.replace(/^hoje (\S+)/, "hoje às $1") : "a " + q);
/** Sem isto, o componente mostra o seu botão e abre-se sozinho; com isto, quem o usa decide quando está aberto. */
type Controlo = { aberto?: boolean; onFechar?: () => void };

/** Uma linha do que acontece: o que fica (visto), o que se refaz (seta circular). */
function Efeito({ fica, children }: { fica: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px]">
      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", fica ? "bg-success/15 text-success" : "bg-warning/15 text-warning")} aria-hidden="true">
        {fica ? <Check className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
      </span>
      <span><span className="sr-only">{fica ? "Fica: " : "Refaz-se: "}</span>{children}</span>
    </li>
  );
}

/** O que fica e o que se refaz quando a visita reabre (igual no "Voltar à visita" e na nova versão pela visita). */
function EfeitosVisita({ d }: { d: Negocio }) {
  const o = d.orc!;
  return (
    <ul className="space-y-2">
      <Efeito fica>Os preços que mudou{o.desconto ? ` e o desconto de ${o.desconto}%` : " e o desconto"} mantêm-se.</Efeito>
      <Efeito fica>As datas, a equipa e o pagamento do plano da obra mantêm-se.</Efeito>
      <Efeito fica={false}>As quantidades refazem-se com as medidas e as escolhas da visita.</Efeito>
      {(o.verif || o.aprov) && <Efeito fica={false}>A verificação{o.aprov ? " e a aprovação da Direção fazem-se" : " faz-se"} de novo.</Efeito>}
    </ul>
  );
}

/** "Voltar à visita": um botão discreto que abre a confirmação com o que acontece. Só antes de a proposta ser enviada. */
export function VoltarVisita({ ctx, d, texto = "Voltar à visita", ...c }: P & { texto?: string } & Controlo) {
  const [interno, setInterno] = useState(false);
  const aberto = c.aberto ?? interno, setAberto = (v: boolean) => (v || !c.onFechar ? setInterno(v) : c.onFechar());
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (aberto) painel.current?.focus(); }, [aberto]);
  if (d.fase !== 3 || !d.orc || d.orc.enviada) return null;
  return (
    <div>
      {!aberto && (
        <Button variant="outline" onClick={() => setAberto(true)} className="min-h-11 text-[15px]">
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />{texto}
        </Button>
      )}
      {aberto && (
        <div ref={painel} tabIndex={-1} role="alertdialog" aria-labelledby={`vv-${d.id}`}
          className="mt-1 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-md)] outline-none animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <div>
            <p id={`vv-${d.id}`} className="text-lg font-semibold">Voltar à visita?</p>
            <p className="mt-1 text-[15px] text-muted-foreground">Pode mudar as medidas, as necessidades e os produtos. Quando fechar o levantamento, o orçamento refaz-se sozinho.</p>
          </div>
          <EfeitosVisita d={d} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="lg" onClick={() => setAberto(false)}>Ficar no orçamento</Button>
            <Button size="lg" onClick={ctx.go(() => ctx.A.reabrirVisita(d.id))}><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />Voltar à visita</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "O cliente pediu alterações": dois passos curtos e a versão seguinte começa. Só com a proposta enviada e não aceite. */
export function NovaVersao({ ctx, d, inicio: inicio0 = "orcamento", texto = "O cliente pediu alterações", ...c }: P & { inicio?: "orcamento" | "visita"; texto?: string } & Controlo) {
  // 15/10: se o cliente pediu alterações no portal, a nova versão começa com o que ele disse (e onde mexer sugere-se por isso)
  const pc = d.orc?.pedidoCliente;
  const inicio: "orcamento" | "visita" = pc ? (pc.motivos.some((m) => MOTIVOS_DA_VISITA.includes(m)) ? "visita" : "orcamento") : inicio0;
  const [interno, setInterno] = useState<0 | 1 | 2>(c.aberto ? 1 : 0);
  const passo = c.aberto && interno === 0 ? 1 : interno;
  const setPasso = (p: 0 | 1 | 2) => (p === 0 && c.onFechar ? c.onFechar() : setInterno(p));
  const [motivos, setMotivos] = useState<string[]>(() => pc?.motivos.filter((m) => (MOTIVOS_VERSAO as readonly string[]).includes(m)) ?? []);
  const [nota, setNota] = useState(pc?.nota ?? "");
  const [onde, setOnde] = useState<"orcamento" | "visita">(inicio);
  const [escolheuOnde, setEscolheuOnde] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (passo) painel.current?.focus({ preventScroll: true }); }, [passo]);
  const o = d.orc;
  if (d.fase !== 3 || !o?.enviada || o.contrato === "assinado") return null;
  const n = versaoAtual(o), total = tot(d, ctx.S).pf;
  const alternar = (m: string) => setMotivos((antes) => {
    const novo = antes.includes(m) ? antes.filter((x) => x !== m) : [...antes, m];
    // sugere onde mexer pelo que o cliente pediu (materiais ou trabalhos mudam a visita), até a pessoa escolher
    if (!escolheuOnde) setOnde(novo.some((x) => MOTIVOS_DA_VISITA.includes(x)) ? "visita" : inicio0);
    return novo;
  });

  if (passo === 0) return (
    <Button variant="outline" onClick={() => setPasso(1)} className="min-h-11 text-[15px]">
      <MessageSquareText className="mr-1.5 h-4 w-4" aria-hidden="true" />{texto}
    </Button>
  );

  return (
    <div ref={painel} tabIndex={-1} role="dialog" aria-labelledby={`nv-${d.id}`}
      className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-md)] outline-none animate-in fade-in-0 slide-in-from-top-2 duration-200 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p id={`nv-${d.id}`} className="text-lg font-semibold">Nova versão da proposta</p>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label={`Passo ${passo} de 2`}>
          {[1, 2].map((i) => <span key={i} className={cn("h-1.5 w-6 rounded-full transition-colors duration-300", i <= passo ? "bg-primary" : "bg-muted")} />)}
        </span>
      </div>

      <div key={passo} className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
        {passo === 1 ? (
          <fieldset className="space-y-4">
            <legend className="text-[15px] font-medium">O que pediu o cliente?</legend>
            {pc && <p className="text-sm text-muted-foreground">Já vem do portal ({pc.q}). Pode juntar ou tirar.</p>}
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_VERSAO.map((m) => {
                const on = motivos.includes(m);
                return (
                  <button key={m} type="button" aria-pressed={on} onClick={() => alternar(m)}
                    className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors duration-150",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>
                    {on && <Check className="h-4 w-4" aria-hidden="true" />}{m}
                  </button>
                );
              })}
            </div>
            <label className="block">
              <span className="text-sm text-muted-foreground">Mais alguma coisa? (opcional)</span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: prefere azulejo mais claro"
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
          </fieldset>
        ) : (
          <fieldset className="space-y-3">
            <legend className="text-[15px] font-medium">Onde vai mexer?</legend>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
              {([
                ["orcamento", Calculator, "Só no orçamento", "Preços, desconto, datas e pagamento. Tudo fica como está, pronto a mudar."],
                ["visita", ClipboardList, "Na visita", "Medidas, necessidades e produtos. O orçamento refaz-se ao fechar o levantamento."],
              ] as const).map(([k, Icone, t, sub]) => (
                <button key={k} type="button" role="radio" aria-checked={onde === k} onClick={() => { setOnde(k); setEscolheuOnde(true); }}
                  className={cn("flex min-h-24 items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors duration-150",
                    onde === k ? "border-primary bg-primary/[0.05]" : "border-border hover:border-foreground/30")}>
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors", onde === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} aria-hidden="true"><Icone className="h-5 w-5" /></span>
                  <span><span className="block text-base font-semibold">{t}</span><span className="mt-0.5 block text-[15px] text-muted-foreground">{sub}</span></span>
                </button>
              ))}
            </div>
            {onde === "visita" && <div className="pt-1 animate-in fade-in-0"><EfeitosVisita d={d} /></div>}
            <p className="text-[15px] text-muted-foreground">
              A v{n} ({eur(total)} €, enviada {quando(o.enviada)}) fica guardada como substituída. O cliente só vê a v{n + 1} quando a enviar.
            </p>
          </fieldset>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        <Button variant="ghost" size="lg" onClick={() => setPasso(passo === 2 ? 1 : 0)}>{passo === 2 ? "Anterior" : "Cancelar"}</Button>
        {passo === 1
          ? <Button size="lg" disabled={!motivos.length && !nota.trim()} onClick={() => setPasso(2)}>Seguinte</Button>
          : <Button size="lg" onClick={ctx.go(() => ctx.A.novaVersao(d.id, motivos, nota, onde))}>Começar a versão {n + 1}</Button>}
      </div>
    </div>
  );
}

/** As versões da proposta: as substituídas e a atual, com o total e a diferença para a anterior. */
export function VersoesProposta({ ctx, d }: P) {
  const o = d.orc;
  if (!o?.versoes?.length) return null;
  const atual = { n: versaoAtual(o), total: tot(d, ctx.S).pf };
  const dif = (a: number, b: number) => {
    const x = a - b;
    return Math.abs(x) < 0.005 ? "mesmo valor" : `${x > 0 ? "+" : "−"}${eur(Math.abs(x))} €`;
  };
  return (
    <section aria-labelledby={`versoes-${d.id}`}>
      <h3 id={`versoes-${d.id}`} className="text-[17px] font-semibold tracking-tight">Versões da proposta</h3>
      <ol className="mt-3 space-y-0">
        {o.versoes.map((v, i) => (
          <li key={v.n} className="relative flex gap-3 pb-4">
            <span className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-border" aria-hidden="true" />
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-input bg-card text-xs font-semibold text-muted-foreground">v{v.n}</span>
            <span className="min-w-0 text-[15px]">
              <span className="block"><span className="tabular-nums text-muted-foreground line-through decoration-muted-foreground/50">{eur(v.total)} € s/ IVA</span>
                {i > 0 && <span className="text-muted-foreground"> · {dif(v.total, o.versoes![i - 1].total)}</span>}
                <span className="text-muted-foreground"> · enviada {quando(v.enviada)}{v.aceite ? `, aceite ${quando(v.aceite)}` : ""}, substituída {quando(v.substituida)}</span></span>
              {(v.motivos.length > 0 || v.nota) && <span className="block text-muted-foreground">O cliente pediu: {[...v.motivos, v.nota].filter(Boolean).join(", ").toLowerCase()}</span>}
            </span>
          </li>
        ))}
        <li className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">v{atual.n}</span>
          <span className="text-[15px]">
            <b className="font-semibold tabular-nums">{eur(atual.total)} € s/ IVA</b>
            <span className="text-muted-foreground"> · {dif(atual.total, o.versoes.at(-1)!.total)} · {o.enviada ? `enviada ${quando(o.enviada)}` : "em preparação"}</span>
          </span>
        </li>
      </ol>
    </section>
  );
}

/** O topo do orçamento: em que ponto está a proposta e como voltar atrás, cada coisa no seu momento. */
export function CaminhoOrcamento({ ctx, d }: P) {
  // o painel aberto é o do momento em que se abriu: ao começar a versão seguinte, não reabre o "Voltar à visita"
  const [abertoEm, setAberto] = useState<string | null>(null);
  const o = d.orc;
  if (d.fase !== 3 || !o || o.contrato === "assinado") return null;
  const n = versaoAtual(o), momento = `${n}:${o.enviada ? "enviada" : "rascunho"}`;
  const aberto = abertoEm === momento;
  if (aberto) return o.enviada
    ? <NovaVersao ctx={ctx} d={d} aberto onFechar={() => setAberto(null)} />
    : <VoltarVisita ctx={ctx} d={d} aberto onFechar={() => setAberto(null)} />;
  return (
    <section aria-label="Estado da proposta" className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px]">
        {o.enviada
          ? o.aceite
            ? <>Proposta{n > 1 ? ` v${n}` : ""} aceite pelo cliente {o.aceite.startsWith("hoje") ? "hoje" : `a ${o.aceite}`}. <span className="text-muted-foreground">O contrato ainda não está assinado: se o cliente mudar de ideias, faz-se uma nova versão{o.contrato === "enviado" ? " (o contrato enviado fica anulado)" : ""}.</span></>
            : <>Proposta{n > 1 ? ` v${n}` : ""} no portal do cliente {o.enviada.startsWith("hoje") ? "desde hoje" : `desde ${o.enviada}`}. <span className="text-muted-foreground">Se ele pedir mudanças, faz-se uma nova versão.</span></>
          : <>{n > 1 ? <b className="font-semibold">Versão {n}, em preparação. </b> : null}<span className="text-muted-foreground">Faltou alguma coisa na visita? Pode voltar e o orçamento refaz-se.</span></>}
      </p>
      <Button variant="outline" onClick={() => setAberto(momento)} className="min-h-11 shrink-0 text-[15px]">
        {o.enviada ? <><MessageSquareText className="mr-1.5 h-4 w-4" aria-hidden="true" />O cliente pediu alterações</> : <><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />Voltar à visita</>}
      </Button>
    </section>
  );
}
