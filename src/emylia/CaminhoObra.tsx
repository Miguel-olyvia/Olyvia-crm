// "Do contrato à obra" (14/10/2026, refeito a 16/10): o circuito depois do contrato assinado, num só cartão.
// Em cima, o contrato; em baixo, o arranque da obra; no meio, o Pagamento (fatura → recibo) e, depois dele, a Encomenda (emitida sozinha
// no Inventário novo ao validar o pagamento; aqui só se lê o estado de lá) e o Plano da obra (gerado do orçamento → aprovado).
// Cada passo diz de quem é a vez; quem tem a vez vê o botão; os outros veem "Ver como …" (o protótipo muda de papel).
// Cada trilho abre o detalhe: as linhas da encomenda com o estado no Inventário (reservado, encomendado ao fornecedor, saiu), e o plano por fases.
// A lógica está em preparacaoObra.ts; aqui só se desenha.
import { useRef, useState } from "react";
import { ArrowRight, ChevronRight, CalendarRange, Check, ChevronDown, Euro, FileSignature, HardHat, Lock, Package, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, TECS, conflitos, eur, nfmt, pct, type Negocio, type Papel } from "./motor";
import { fazer, type Ctx } from "./pecas";
import { RegistarFaturaErp } from "./FaturaErp";
import { ContratoDoc, NotaEncomendaDoc, Partilhar } from "./DocsCliente";
import { SeloAssinatura } from "./AssinaturaContrato";
import { AutoNoNegocio } from "./AutoRececao";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { TRILHOS, faltaParaArrancar, passosPreparacao, type PassoPrep, type Trilho } from "./preparacaoObra";
import { useInventario } from "./inventario/loja";
import { prontaReal, prontidaoDe, usarProntidao } from "./inventario/prontidaoReal";
import { useFrota } from "./frota/loja";
import { ligacoesObra } from "./frota/transporteObra";
import { ProximoRececaoNegocio } from "./RececaoNegocio";
import { ecDaAdenda, linhasDaObra, porEncomendarDe } from "./encomendasAjuste";
import { nomeCurtoTarefa } from "./obraOps";
import { assinadas, primeiraPaga } from "./adendas";
import { estadoLinhaNegocio, linhaDoResumo, resumoEcNegocio, textoResumoEc, type ResumoEcNeg } from "./inventario/ponteNegocios";

const ICONE: Record<Trilho, typeof Package> = { ec: Package, plano: CalendarRange, pag: Euro, obra: HardHat };

function Bola({ estado }: { estado: PassoPrep["estado"] }) {
  return (
    <span className={cn("relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 bg-card transition-colors duration-500",
      estado === "feito" ? "border-primary bg-primary text-primary-foreground" : estado === "agora" ? "border-primary" : "border-input")} aria-hidden="true">
      {estado === "feito" && <Check className="h-3.5 w-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" />}
      {estado === "agora" && <><span className="absolute inset-0 rounded-full motion-safe:animate-ping border-2 border-primary/40 [animation-duration:2s]" /><span className="h-2.5 w-2.5 rounded-full bg-primary" /></>}
    </span>
  );
}

function Quem({ who }: { who: Papel | null }) {
  if (!who) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[10px] font-semibold text-foreground" aria-hidden="true">{PAPEIS[who].av}</span>
      {PAPEIS[who].n}
    </span>
  );
}

/** O contrato assinado (15/10): a assinatura do cliente (o desenho ou o selo digital), quem, quando e como, e o contrato à mão. */
export function ContratoAssinado({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const [ver, setVer] = useState(false);
  const o = d.orc;
  if (!o || o.vendaDireta || o.contrato !== "assinado") return null;
  const a = o.assinatura;
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4" data-testid="contrato-assinado">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true"><FileSignature className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px]"><b className="font-semibold">Contrato CT 2026/{d.id} assinado</b> </p>
          <p className="text-sm text-muted-foreground">
            {a ? <>{a.nome} · {a.tipo === "desenho" ? "desenhada no ecrã, no portal" : `${a.tipo === "sms" ? "Código por SMS" : "Chave Móvel Digital"}${a.telemovel ? ` (${a.telemovel})` : ""}`} · {a.q}</> : "No portal do cliente"}
          </p>
        </div>
        {a && <div className="w-full sm:w-auto sm:max-w-[14rem]"><SeloAssinatura a={a} compacto /></div>}
      </div>
      <button type="button" aria-expanded={ver} onClick={() => setVer(!ver)}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
        {ver ? "Fechar o contrato" : "Ver o contrato assinado"}<ChevronDown className={cn("h-4 w-4 transition-transform", ver && "rotate-180")} aria-hidden="true" />
      </button>
      {ver && (
        <div className="mt-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          <Partilhar ctx={ctx} d={d} tipo="contrato" estado={a ? `assinado a ${a.q}` : "assinado"}><ContratoDoc S={ctx.S} d={d} /></Partilhar>
        </div>
      )}
    </div>
  );
}

export function CaminhoObra(ctx: Ctx & { d: Negocio }) {
  const { S, A, d, run, go } = ctx;
  const [aberto, setAberto] = useState<Trilho | null>(null);
  const [verTudo, setVerTudo] = useState(false);
  // o que já estava feito ao abrir o negócio (só isso encolhe: o que se acaba de fazer fica à vista até se sair)
  const inicio = useRef<{ pag: boolean; arrancou: boolean } | null>(null);
  // o estado da encomenda vive no Inventário novo: o cartão redesenha quando lá muda alguma coisa
  const db = useInventario();
  const inv = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : undefined;
  const P = passosPreparacao(d, S, inv);
  // 16/10: a viatura ligada à obra na Frota (só informação: não bloqueia o arranque)
  const Fr = useFrota();
  const viaturas = ligacoesObra(Fr, d.id).map((x) => Fr.viaturas.find((v) => v.id === x.vid)?.mat).filter(Boolean);
  if (!P.length) return null;
  const feitos = P.filter((x) => x.estado === "feito").length;
  const falta = faltaParaArrancar(d, db);
  const go1 = P.find((x) => x.trilho === "obra")!;
  // um só botão primário: o primeiro passo que é do papel atual
  const meu = P.find((x) => x.estado === "agora" && x.who === S.role && x.act);
  const verComo = (who: Papel) => run(() => { S.role = who; });

  const passo = (x: PassoPrep, ultimo: boolean) => (
    <li key={x.id} className="relative flex gap-3 pb-5 last:pb-0">
      {!ultimo && <span className={cn("absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 transition-colors duration-500", x.estado === "feito" ? "bg-primary/60" : "bg-border")} aria-hidden="true" />}
      <Bola estado={x.estado} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn("text-[15px] font-medium leading-snug", x.estado === "espera" && "text-muted-foreground")}>{x.t}<span className="sr-only"> ({x.estado === "feito" ? "feito" : x.estado === "agora" ? "à espera de " + (x.who ? PAPEIS[x.who].n : "") : "ainda não"})</span></p>
        {x.sub && <p className="text-sm text-muted-foreground">{x.sub.split(" · atenção: ")[0]}{x.sub.includes(" · atenção: ") && <span className="mt-0.5 flex items-start gap-1.5 text-foreground"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />{x.sub.split(" · atenção: ")[1].replace(/^./, (c) => c.toUpperCase())}.</span>}</p>}
        {x.estado !== "feito" && <div className="mt-1"><Quem who={x.who} /></div>}
        {x.estado === "agora" && x.act && x.who && (
          // 22/10: a fatura do Eticadata: o número escreve-se aqui mesmo (FaturaErp.tsx)
          x.who === S.role && x.act === "registarFaturaErp"
            ? <div className="mt-2"><RegistarFaturaErp ctx={ctx} d={d} tamanho="default" aEsquerda /></div>
            : x.who === S.role
            ? <Button size="sm" variant={meu?.id === x.id ? "default" : "outline"} className="mt-2 min-h-10" onClick={go(() => fazer(A, x.act!, d.id, x.arg))}>{x.btn}</Button>
            : <button type="button" onClick={() => verComo(x.who!)} className="mt-1 inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Ver como {PAPEIS[x.who].nome}</button>
        )}
      </div>
    </li>
  );

  // 23/10: o que já está feito encolhe (contrato e pagamento numa linha; depois do arranque, tudo) e o próximo passo sobe
  // só encolhe o que está todo feito: com uma adenda assinada, a 1.ª parcela dela ainda é trabalho do bloco Pagamento
  const feitoTrilho = (k: Trilho) => P.filter((x) => x.trilho === k).every((x) => x.estado === "feito");
  const pagFeito = d.orc?.contrato === "assinado" && d.fin.pago && feitoTrilho("pag");
  const tudoArrancou = go1.estado === "feito" && feitoTrilho("ec") && feitoTrilho("plano");
  inicio.current ??= { pag: pagFeito, arrancou: tudoArrancou };
  const contratoEPago = pagFeito && inicio.current.pag;
  const arrancou = tudoArrancou && inicio.current.arrancou;
  const mostrarFeitos = !contratoEPago || verTudo;
  const mostrarRamos = !arrancou || verTudo;
  const resumoFeitos = [
    d.orc?.contrato === "assinado" && `Contrato CT 2026/${d.id} assinado`,
    d.fin.pago && `pagamento validado${d.fin.recibo ? ` (${d.fin.recibo.n})` : ""}`,
    arrancou && "encomenda e plano prontos",
  ].filter(Boolean).join(" · ");

  // 27/10: o arranque (as condições à vista): antes de arrancar, em cima; depois, no fim do percurso aberto
  const blocoArranque = (
        <div className={cn("flex flex-col gap-3 rounded-xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between transition-colors duration-500",
          go1.estado === "agora" ? "border-primary bg-primary/[0.04]" : go1.estado === "feito" ? "border-primary/40" : "border-dashed border-input")}>
          <div className="flex items-start gap-3">
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", go1.estado === "espera" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")} aria-hidden="true">
              {go1.estado === "espera" ? <Lock className="h-4 w-4" /> : <HardHat className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-[15px] font-semibold">{go1.t}</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Condições para arrancar">
                {[["Sinal pago", d.fin.pago], ["Encomenda emitida", !!d.obra.ec], ["Materiais no armazém", usarProntidao(d.obra.ec) ? prontaReal(prontidaoDe(d.obra.ec.contrato)) : !!inv?.pronta || (!!d.obra.ec && !d.obra.ec.ref)],
                  // 21/10 (decisão B): antes do arranque, cada adenda assinada: a 1.ª parcela paga e, com materiais, a encomenda dela (emitida com esse pagamento)
                  ...(go1.estado === "feito" ? [] : assinadas(d).flatMap((a) => [[`1.ª parcela da adenda ${a.n} paga`, primeiraPaga(a)],
                    ...(ecDaAdenda(d, a.n) || porEncomendarDe(d, a.n).length ? [[`Encomenda da adenda ${a.n}`, !!ecDaAdenda(d, a.n)]] : [])])),
                  ["Plano aprovado", d.obra.plano?.estado !== "por aprovar"]].map(([t, ok]) => (
                  <li key={t as string} className={cn("inline-flex items-center gap-1.5", ok ? "text-foreground" : "text-muted-foreground")}>
                    {ok ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <span className="h-3.5 w-3.5 rounded-full border-2 border-input" aria-hidden="true" />}{t as string}
                    <span className="sr-only">{ok ? " (feito)" : " (por fazer)"}</span>
                  </li>
                ))}
              </ul>
              {viaturas.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Viatura ligada: {viaturas.join(", ")} (Frota).</p>}
            </div>
          </div>
          {go1.estado === "agora" && (go1.who === S.role
            ? <Button className="min-h-11" variant={meu?.id === go1.id ? "default" : "outline"} onClick={go(() => fazer(A, "arrancar", d.id))}>Arrancar a obra</Button>
            : <button type="button" onClick={() => verComo("operacoes")} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Ver como {PAPEIS.operacoes.nome}</button>)}
        </div>
  );

  return (
    <section aria-labelledby={`caminho-${d.id}`} className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`caminho-${d.id}`} className="text-xl font-semibold tracking-tight">Do contrato à obra</h2>
          {/* 27/10: antes de arrancar, as condições estão logo abaixo: a frase só repetia */}
          {arrancou && <p className="text-[15px] text-muted-foreground">{/* 30/10 (visto no browser): com a obra já a andar, uma encomenda de ajuste por aprovar dizia "Para arrancar, falta…" */}{go1.estado === "feito" ? go1.t + "." : falta.length ? `Para arrancar, falta ${falta.join(", ")}.` : "Está tudo pronto para arrancar."}</p>}
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">{feitos} de {P.length} passos</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary motion-safe:transition-[width] duration-500 ease-out" style={{ width: `${(feitos / P.length) * 100}%` }} />
      </div>

      {/* primeiro, o que falta: o arranque (as condições à vista) e o próximo passo da Receção */}
      {!arrancou && <div className="mt-4">{blocoArranque}</div>}
      {!arrancou && (d.obra.ec?.ref || d.obra.ec?.contrato) && <ProximoRececaoNegocio d={d} A={A} go={go} />}

      {/* o que já está feito, numa linha; abre-se para ver o percurso todo */}
      {contratoEPago && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-4 py-2.5">
          <p className="flex min-w-0 items-center gap-2 text-[15px]"><Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /><span className="min-w-0">{resumoFeitos}</span></p>
          <button type="button" onClick={() => setVerTudo(!verTudo)} aria-expanded={verTudo}
            className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
            {verTudo ? "Esconder o percurso" : "Ver o percurso"}<ChevronDown className={cn("h-4 w-4 transition-transform", verTudo && "rotate-180")} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* o contrato, de onde tudo parte: com a assinatura do cliente (15/10), quem, quando e como, e o contrato à mão */}
      {mostrarFeitos && <ContratoAssinado ctx={ctx} d={d} />}
      {/* 15/10: o pagamento primeiro, a toda a largura; depois a ramificação para a encomenda e o plano, lado a lado,
          bloqueados (com o cadeado) até o pagamento estar confirmado */}
      {(() => {
        const trilho = (k: Trilho, t: string) => {
          const L = P.filter((x) => x.trilho === k), Ico = ICONE[k], feito = L.every((x) => x.estado === "feito");
          const preso = k !== "pag" && !d.fin.pago && !feito;
          return (
            <div key={k} className={cn("rounded-xl border p-4 transition-colors duration-500", feito ? "border-primary/30 bg-primary/[0.03]" : L.some((x) => x.estado === "agora") ? "border-border bg-card" : "border-border bg-muted/30")}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><Ico className="h-4 w-4 text-primary" aria-hidden="true" />{t}</h3>
                {feito && <span className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Check className="h-4 w-4" aria-hidden="true" />pronto</span>}
                {preso && <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" aria-hidden="true" />depois do pagamento</span>}
              </div>
              <ol className={cn(preso && "opacity-70")}>{L.map((x, i) => passo(x, i === L.length - 1))}</ol>
              {(k === "plano" || (k === "ec" && d.obra.ec)) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4">
                  <button type="button" onClick={() => setAberto(aberto === k ? null : k)} aria-expanded={aberto === k}
                    className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
                    {k === "ec" ? "Ver a encomenda" : "Ver o plano"}<ChevronDown className={cn("h-4 w-4 transition-transform", aberto === k && "rotate-180")} aria-hidden="true" />
                  </button>
                  {k === "ec" && (d.obra.ec?.ref || d.obra.ec?.contrato) && (
                    <button type="button" onClick={go(() => A.abrirInv(d.id))} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                      Abrir no Inventário<ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        };
        const [pag, ...resto] = TRILHOS;
        if (!mostrarRamos && !mostrarFeitos) return null;
        return (
          <>
            {mostrarFeitos && <div className="mt-4">{trilho(pag.k, pag.t)}</div>}
            {/* a ramificação: um traço que se abre para os dois trilhos (só no computador) */}
            {mostrarFeitos && mostrarRamos && <div className="relative hidden h-6 lg:block" aria-hidden="true">
              <span className={cn("absolute left-1/2 top-0 h-3 w-0.5 transition-colors duration-500", d.fin.pago ? "bg-primary/60" : "bg-border")} />
              <span className={cn("absolute left-1/4 right-1/4 top-3 h-0.5 transition-colors duration-500", d.fin.pago ? "bg-primary/60" : "bg-border")} />
              {[25, 75].map((x) => <span key={x} className={cn("absolute top-3 h-3 w-0.5 transition-colors duration-500", d.fin.pago ? "bg-primary/60" : "bg-border")} style={{ left: `${x}%` }} />)}
            </div>}
            {mostrarRamos && <div className={cn("mt-4 grid gap-4 lg:grid-cols-2", mostrarFeitos && "lg:mt-0")}>{resto.map(({ k, t }) => trilho(k, t))}</div>}
          </>
        );
      })()}

      {aberto === "ec" && d.obra.ec && <DetalheEncomenda ctx={ctx} inv={inv} />}
      {aberto === "plano" && <DetalhePlano d={d} ajustar={ctx.go(() => ctx.A.abrirPlano(d.id))} />}
      {arrancou && verTudo && <div className="mt-5">{blocoArranque}</div>}

      {/* a obra concluída: o auto de receção (por assinar ou assinado, com a assinatura) e o relatório da obra */}
      {d.obra.auto && <div className="mt-5"><AutoNoNegocio S={S} d={d} /></div>}
    </section>
  );
}

/** As linhas da encomenda de cliente, com o estado de cada uma lido do Inventário (reservado, encomendado ao fornecedor, saiu), e as encomendas a fornecedor de lá. */
function DetalheEncomenda({ ctx, inv }: { ctx: Ctx & { d: Negocio }; inv: ResumoEcNeg | null | undefined }) {
  const { A, d, go } = ctx;
  const ec = d.obra.ec!;
  const [nota, setNota] = useState(false);
  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-border p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 lg:grid-cols-2">
      <div>
        <h4 className="text-[15px] font-semibold">Encomenda de cliente {ec.n} <span className="font-normal text-muted-foreground">· {inv ? inv.rotulo.toLowerCase() : ec.ref ? "emitida" : "servida"}</span></h4>
        <ul className="mt-2 divide-y divide-border">
          {linhasDaObra(d).map(({ x, ec: n }) => {
            const l = linhaDoResumo(inv, x.n, n), st = l ? estadoLinhaNegocio(l) : ec.ref ? null : { t: "na obra", ok: true };
            return (
              <li key={n + x.n} className="py-2 text-[15px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 flex-1">{x.n} <span className="text-sm text-muted-foreground">· {x.de === "produto" ? "produto da visita" : "material"}{n !== ec.n ? ` · ${n}` : ""}</span></span>
                  <span className="font-medium tabular-nums">{eur((x.custo ?? 0) * x.q)} €</span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm tabular-nums">
                  <span className="text-muted-foreground">{nfmt(x.q)} {x.un} × {eur(x.custo ?? 0)} €</span>
                  {st && <span className={st.ok ? "text-success" : "text-warning"}>{st.t}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        {/* o custo contra o que o cliente paga por estes materiais */}
        <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-3 text-sm">
          <div><dt className="text-muted-foreground">Custo</dt><dd className="text-[15px] font-semibold tabular-nums">{eur(ec.custo ?? 0)} €</dd></div>
          <div><dt className="text-muted-foreground">Na proposta</dt><dd className="text-[15px] font-semibold tabular-nums">{eur(ec.valor)} €</dd></div>
          <div><dt className="text-muted-foreground">Margem</dt><dd className="text-[15px] font-semibold tabular-nums">{ec.valor > 0 ? pct((ec.valor - (ec.custo ?? 0)) / ec.valor) : "—"}</dd></div>
        </dl>
      </div>
      <div>
        <h4 className="text-[15px] font-semibold">No Inventário</h4>
        {!ec.ref ? (
          <p className="mt-2 text-[15px] text-muted-foreground">Obra do exemplo, paga antes do Inventário novo: os materiais já estão na obra.</p>
        ) : !inv ? (
          <p className="mt-2 text-[15px] text-muted-foreground">A encomenda ainda não está no Inventário (os dados de exemplo foram repostos). Volta a ser emitida sozinha.</p>
        ) : (
          <>
            <p className="mt-2 text-[15px]">{inv.id} · {inv.rotulo}. <span className="text-muted-foreground">{textoResumoEc(inv)}.</span></p>
            <p className="mt-2 text-sm text-muted-foreground">Encomendas a fornecedor</p>
            {inv.pos.length ? (
              <ul className="mt-1 divide-y divide-border">
                {inv.pos.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-x-3 py-2 text-[15px]">
                    <span>{p.id} · {p.forn.replace(" (exemplo)", "")}</span>
                    <span className="text-sm text-muted-foreground">{p.estado.toLowerCase()}{p.prometida ? ` · entrega ${p.prometida.slice(8, 10)}/${p.prometida.slice(5, 7)}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-[15px] text-muted-foreground">Nenhuma: havia tudo em stock.</p>}
            <button type="button" onClick={go(() => A.abrirInv(d.id))} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
              Abrir {inv.id} no Inventário<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {/* o documento do cliente: os preços (nunca os custos) e o estado de cada linha */}
      <div className="lg:col-span-2">
        <button type="button" onClick={() => setNota(!nota)} aria-expanded={nota} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
          {nota ? "Fechar a nota de encomenda" : "Nota de encomenda no portal do cliente"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", nota && "rotate-180")} aria-hidden="true" />
        </button>
        {nota && (
          <div className="mt-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            <Partilhar ctx={ctx} d={d} tipo="encomenda" estado="no portal do cliente"><NotaEncomendaDoc d={d} /></Partilhar>
          </div>
        )}
      </div>
    </div>
  );
}

/** O plano por fases: uma barra por tarefa na régua dos dias úteis, com o técnico; as férias em conflito a laranja. */
function DetalhePlano({ d, ajustar }: { d: Negocio; ajustar?: () => void }) {
  const p = d.obra.plano!, dias = Math.max(1, ...p.tasks.map((t) => t.dia + t.dur));
  const C = new Set(conflitos(p).map((c) => c.t));
  const fases = [...new Set(p.tasks.map((t) => t.fase ?? 0))].sort();
  return (
    <div className="mt-4 rounded-xl border border-border p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-[15px] font-semibold">Plano da obra <span className="font-normal text-muted-foreground">· {p.estado} · {nfmt(dias)} dias úteis{p.inicio ? ` desde ${p.inicio.split("-").reverse().join("/")}` : ""}</span></h4>
        {/* 15/10: quem gere as Operações ajusta o plano (dias, início, técnico, nota) na página da obra */}
        {ajustar && (p.estado === "por aprovar" || p.estado === "aprovado") && (
          <button type="button" onClick={ajustar} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">Ajustar nas Operações<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        )}
      </div>
      <div className="mt-3 space-y-4">
        {fases.map((f) => (
          <div key={f}>
            {f > 0 && <p className="mb-1 inline-flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_FASE[f] }} aria-hidden="true" />Fase {f} · {FASES_OBRA[f - 1].curto}</p>}
            <ul className="space-y-1.5">
              {p.tasks.filter((t) => (t.fase ?? 0) === f).map((t, i) => {
                const tec = TECS.find((x) => x.id === t.tec), mau = C.has(t);
                return (
                  <li key={i} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_9rem]">
                    <span className="truncate" title={t.nome}>{nomeCurtoTarefa(t.nome)}</span>
                    <span className="relative h-5 rounded bg-muted/60">
                      <span className={cn("absolute inset-y-0 rounded", mau && "ring-2 ring-warning")} style={{ left: `${(t.dia / dias) * 100}%`, width: `${(t.dur / dias) * 100}%`, background: COR_FASE[f] ?? "hsl(var(--primary))" }} />
                    </span>
                    <span className={cn("col-span-2 truncate text-muted-foreground sm:col-span-1", mau && "text-warning")}>{tec ? tec.n : "sem técnico"}{mau ? " · de férias" : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
