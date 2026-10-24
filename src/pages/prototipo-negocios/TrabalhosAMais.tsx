// Trabalhos a mais (14/10/2026): depois do contrato assinado, a mudança faz-se com uma adenda (adendas.ts).
// Um cartão discreto no negócio: as adendas feitas (estado, total, dias, os documentos) e "Nova adenda", que abre
// a escolha dos serviços com a quantidade, o motivo e as contas ao vivo (+ € e + dias).
// 21/10: o mesmo percurso do orçamento: verificar as margens (e a aprovação da Direção, quando é preciso) → enviar a proposta →
// o cliente aceita, pede alterações (a versão seguinte, com o mesmo número) ou recusa → o comercial gera o contrato da adenda → o
// cliente assina (Chave Móvel Digital ou SMS) → as faturas das parcelas. Os passos do cliente simulam-se aqui (como no orçamento).
// O IVA: 6% na mão de obra, 23% nos materiais (os das linhas livres).
import { useMemo, useState } from "react";
import { Check, Minus, Plus, Trash2, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO_TODO } from "./catalogo";
import { PAPEIS, eur, nfmt, r2, servicoDoCatalogo, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { SeletorPesquisa } from "./pecasFicha";
import { ContratoDoc, Partilhar, PropostaDoc } from "./DocsCliente";
import { ecDaAdenda, porEncomendarDe } from "./encomendasAjuste";
import {
  MOTIVOS_ADENDA, adendaBloqueada, alertasAdenda, diasAdenda, estadoAdenda, faturaAValidar, nomeParcela, parcelaFaturavel, parcelasAdenda, previsaoLinha, primeiraPaga, proximaParcela,
  totaisAdenda, totaisLinhas, valorContrato, versaoAdenda, type Adenda, type LinhaAdenda,
} from "./adendas";
import { lerVersao } from "./versaoPrototipo";

/** 21/10: o próximo passo de uma adenda (o comercial, a Direção, o Jurídico) e os do cliente, simulados no protótipo.
 *  Serve o cartão dos Trabalhos a mais e o do imprevisto (ImprevistosObra.tsx). */
export function AcoesAdenda({ ctx, d, a, editar }: { ctx: Ctx; d: Negocio; a: Adenda; editar?: (a: Adenda) => void }) {
  const { S, A, go } = ctx;
  const bloq = a.estado === "rascunho" && a.verif ? alertasAdenda(d, S, a).filter((x) => x.k === "x") : [];
  const bloqueada = a.estado === "rascunho" && a.verif && adendaBloqueada(d, S, a);
  const aprovavel = bloq.every((x) => x.aprov);
  const ligacao = "inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline";
  return (
    <div className="space-y-2">
      {a.estado === "rascunho" && a.verif && bloq.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-destructive/[0.06] px-3 py-2 text-[15px]" aria-label={`Bloqueios da adenda ${a.n}`}>
          {bloq.map((x) => <li key={x.t}><b className="font-medium">{x.t}.</b> <span className="text-muted-foreground">{x.d}</span></li>)}
          {a.aprov === "ok" && <li className="text-success">Exceção aprovada pela Direção.</li>}
        </ul>
      )}
      {a.estado === "enviada" && a.pedidoCliente && (
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-[15px]">O cliente pediu alterações ({a.pedidoCliente.q}): {[...a.pedidoCliente.motivos, a.pedidoCliente.nota ? `«${a.pedidoCliente.nota}»` : ""].filter(Boolean).join(", ") || "sem detalhe"}.</p>
      )}
      {a.estado === "aceite" && a.contratoPedido && (
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-[15px]">O cliente pediu alterações ao contrato da adenda: {a.contratoPedido.clausulas.map((x) => `${x.c} («${x.nota}»)`).join(", ")}. O Jurídico revê e valida.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {a.estado === "rascunho" && !a.verif && <Button size="sm" className="min-h-10" onClick={go(() => A.verificarEnviarAdenda(d.id, a.n))}>Verificar e enviar ao cliente</Button>}
        {a.estado === "rascunho" && a.verif && !bloqueada && <Button size="sm" className="min-h-10" onClick={go(() => A.enviarAdenda(d.id, a.n))}>Enviar ao cliente</Button>}
        {bloqueada && a.aprov === "pedida" && (S.role === "direcao"
          ? <><Button size="sm" className="min-h-10" onClick={go(() => A.aprovarAdenda(d.id, a.n))}>Aprovar a exceção</Button><Button size="sm" variant="outline" className="min-h-10" onClick={go(() => A.recusarAprovAdenda(d.id, a.n))}>Recusar a exceção</Button></>
          : <><span className="text-sm text-muted-foreground">À espera da aprovação da Direção.</span><button type="button" className={ligacao} onClick={go(() => A.role("direcao"))}>Mudar para {PAPEIS.direcao.n}</button></>)}
        {bloqueada && a.aprov !== "pedida" && aprovavel && <Button size="sm" variant="outline" className="min-h-10" onClick={go(() => A.pedirAprovAdenda(d.id, a.n))}>Pedir aprovação à Direção</Button>}
        {a.estado === "enviada" && !a.pedidoCliente && <>
          <Button size="sm" variant="outline" className="min-h-10" onClick={go(() => A.simularAceitarAdenda(d.id, a.n))}>Simular: o cliente aceita</Button>
          <Button size="sm" variant="outline" className="min-h-10" onClick={go(() => A.simularAlteracoesAdenda(d.id, a.n))}>Simular: o cliente pede alterações</Button>
        </>}
        {a.estado === "enviada" && a.pedidoCliente && editar && <Button size="sm" className="min-h-10" onClick={() => editar(a)}>Fazer a versão {versaoAdenda(a) + 1}</Button>}
        {a.estado === "aceite" && !a.contrato && !a.contratoPedido && <Button size="sm" className="min-h-10" onClick={go(() => A.enviarContratoAdenda(d.id, a.n))}>{a.contratoRevisto ? `Enviar o contrato da adenda (versão ${(a.contratoVersoes?.length ?? 0) + 1})` : "Gerar o contrato da adenda"}</Button>}
        {a.estado === "aceite" && a.contratoPedido && (S.role === "juridico"
          ? <Button size="sm" className="min-h-10" onClick={go(() => A.abrirRevisaoAdenda(d.id, a.n))}>Rever o contrato</Button>
          : <button type="button" className={ligacao} onClick={go(() => A.role("juridico"))}>Mudar para {PAPEIS.juridico.n}</button>)}
        {a.estado === "aceite" && a.contrato === "enviado" && <Button size="sm" variant="outline" className="min-h-10" onClick={go(() => A.simularAdenda(d.id, a.n))}>Simular: o cliente assina</Button>}
        {a.estado === "recusada" && !a.vista && !a.origem && <button type="button" className={ligacao} onClick={go(() => A.vistaRecusaAdenda(d.id, a.n))}>Marcar como visto</button>}
        {(a.estado === "rascunho" || a.estado === "enviada" || a.estado === "aceite") && (
          <button type="button" onClick={go(() => A.anularAdenda(d.id, a.n))} className="inline-flex min-h-10 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{a.enviada || a.versoes?.length ? "Retirar do portal" : "Apagar"}</button>
        )}
      </div>
    </div>
  );
}

/** As parcelas da adenda (as mesmas do contrato): a fatura e o pagamento de cada uma. */
function ParcelasAdenda({ ctx, d, a }: { ctx: Ctx; d: Negocio; a: Adenda }) {
  const { S, A, go } = ctx;
  const P = parcelasAdenda(d, a), prox = proximaParcela(d, a), fin = S.role === "financeiro", atual = lerVersao() === "atual";
  // 21/10: como no contrato: a seguinte só depois de paga a 1.ª (a do fim, com a obra concluída); valida-se pela ordem das parcelas
  const fat = parcelaFaturavel(d, a), aValidar = faturaAValidar(a);
  return (
    <div className="mt-2 space-y-1 text-[15px]">
      {P.map((x) => (
        <p key={x.i} className="text-muted-foreground">
          {nomeParcela(x.i)} ({x.l.toLowerCase()}, {Math.round(x.p * 100)}%) · {eur(x.v)} €: {x.ft ? (x.ft.recibo ? `${x.ft.n}, paga (${x.ft.recibo.n})` : `${x.ft.n}, ${x.ft.pag?.comprovativo ? `o cliente avisou: ${x.ft.pag.comprovativo}` : "por pagar no portal"}`) : "por faturar"}
        </p>
      ))}
      {fin && atual && prox && <Button size="sm" className="min-h-10" disabled={!!fat.motivo} onClick={go(() => (prox.i === 0 ? A.faturarAdendas(d.id) : A.faturarParcelaAdenda(d.id, a.n)))}>Emitir a fatura da {nomeParcela(prox.i)}</Button>}
      {fin && aValidar.f && <Button size="sm" className="ml-2 min-h-10" onClick={go(() => A.validarPagamentosAdenda(d.id, a.n))}>Validar o pagamento</Button>}
      {fin && prox && fat.motivo && <p className="text-sm text-muted-foreground">{nomeParcela(prox.i)}: {fat.motivo.replace(/^./, (c) => c.toLowerCase())}</p>}
    </div>
  );
}

export function TrabalhosAMais(ctx: Ctx & { d: Negocio }) {
  const { S, A, d, run } = ctx;
  const [novo, setNovo] = useState(false);
  // 21/10: a nova versão de uma adenda (o mesmo número) ou a mudança antes de a enviar
  const [editar, setEditar] = useState<string | null>(null);
  const [itens, setItens] = useState<{ sid: string; q: number }[]>([]);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_ADENDA[0]);
  const [desconto, setDesconto] = useState("");
  const [ver, setVer] = useState<string | null>(null);
  const L = d.adendas ?? [];
  const V = valorContrato(d, S);
  const assinado = d.orc?.contrato === "assinado" || (d.orc?.vendaDireta && !!d.orc.aceite);
  // os serviços: os em uso primeiro, depois o Catálogo inteiro
  const opcoes = useMemo(() => {
    const vistos = new Set<string>();
    const out: { v: string; t: string; sub: string; valor: string }[] = [];
    for (const [sid, s] of Object.entries(S.svc)) { if (sid.startsWith("livre-")) continue; vistos.add(sid); out.push({ v: sid, t: s.n, sub: s.perfil, valor: `${eur(s.preco)} €/${s.un}` }); }
    for (const c of CATALOGO_TODO) if (!vistos.has(c.id)) { const s = servicoDoCatalogo(c.id); out.push({ v: c.id, t: c.n, sub: c.cat, valor: s ? `${eur(s.preco)} €/${s.un}` : c.un }); }
    return out;
  }, [S.svc]);
  if (!assinado || d.obra.plano?.estado === "concluída") return null;
  const aEditar = editar ? L.find((a) => a.n === editar) : undefined;
  // a pré-visualização das contas, sem mexer no estado: o mesmo preço e as mesmas horas que a adenda leva ao cliente
  // (as linhas livres de uma versão anterior ficam como estavam, com os materiais)
  const linhas: LinhaAdenda[] = itens.flatMap((x) => { const lv = aEditar?.linhas.find((y) => y.livre && y.sid === x.sid); if (lv) return [lv]; const l = previsaoLinha(S, x.sid, x.q); return l ? [l] : []; });
  const dsc = Math.max(0, Math.min(100, Number(desconto.replace(",", ".")) || 0));
  const T = totaisLinhas(linhas, dsc);
  const fechar = () => { setNovo(false); setEditar(null); setItens([]); setMotivo(MOTIVOS_ADENDA[0]); setDesconto(""); };
  const mudarQ = (sid: string, q: number) => setItens((I) => I.map((y) => (y.sid === sid ? { ...y, q: Math.max(0, r2(q)) } : y)));
  const abrirCom = (a: Adenda, n: string | null) => { setItens(a.linhas.map((x) => ({ sid: x.sid, q: x.q }))); setMotivo(a.motivo); setDesconto(a.desconto ? String(a.desconto) : ""); setEditar(n); setNovo(true); setVer(null); };
  /** Refazer a que o cliente não aceitou: os mesmos trabalhos e o mesmo motivo, para mudar o que ele pediu (uma adenda nova). */
  const refazer = (a: Adenda) => { abrirCom(a, null); if (!a.vista) run(() => A.vistaRecusaAdenda(d.id, a.n)); };
  const valida = linhas.length > 0 && linhas.every((x) => x.q > 0);
  const enviar = () => {
    const n = editar;
    run(() => {
      if (n && aEditar?.estado === "rascunho") { if (A.mudarAdenda(d.id, n, itens, dsc)) A.verificarEnviarAdenda(d.id, n); }
      else if (n) { if (A.novaVersaoAdenda(d.id, n, itens, dsc)) A.verificarEnviarAdenda(d.id, n); }
      else { const k = A.criarAdenda(d.id, itens, motivo, { desconto: dsc }); if (k) A.verificarEnviarAdenda(d.id, k); }
    });
    fechar();
  };

  return (
    <section aria-labelledby={`tam-${d.id}`} className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={`tam-${d.id}`} className="text-lg font-semibold">Trabalhos a mais</h2>
          <p className="text-[15px] text-muted-foreground">Com o contrato assinado, o que muda vai numa adenda, com o mesmo percurso da proposta: verifica-se, o cliente aceita, assina o contrato da adenda e paga nas parcelas do contrato.</p>
          {V.adendas > 0 && <p className="mt-1 text-[15px] tabular-nums">Valor do contrato: <b className="font-semibold">{eur(V.total)} €</b> <span className="text-muted-foreground">com IVA ({eur(V.contrato)} € + {eur(V.adendas)} € em adendas)</span></p>}
        </div>
        {!novo && <Button variant="outline" className="min-h-11" onClick={() => setNovo(true)}><FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Nova adenda</Button>}
      </div>

      {L.length > 0 && (
        <ul className="mt-4 space-y-3">
          {L.map((a) => {
            const E = estadoAdenda(a), TA = totaisAdenda(a), dd = diasAdenda(a.linhas), v = versaoAdenda(a);
            const temContrato = a.estado === "assinada" || (a.estado === "aceite" && a.contrato === "enviado");
            return (
              <li key={a.n} className="rounded-xl border border-border p-4" aria-label={`Adenda ${a.n}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">{a.n}{v > 1 ? ` · v${v}` : ""} · {a.linhas.map((x) => x.n).join(", ")}</p>
                    <p className="text-sm tabular-nums text-muted-foreground">+{eur(TA.total)} € com IVA ({eur(TA.base)} € sem IVA{a.desconto ? `, desconto ${nfmt(a.desconto)}%` : ""}) · +{dd} {dd === 1 ? "dia" : "dias"} · {a.motivo.toLowerCase()}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium", E.cor)}>{E.t}</span>
                </div>
                {a.origem && <p className="mt-1 text-sm text-muted-foreground">Imprevisto na obra: {a.origem.texto}</p>}
                {/* 21/10 (decisão C): as faturas das parcelas (as do contrato), emitidas pelo Financeiro depois da assinatura, e o pagamento no portal */}
                {a.estado === "assinada" && <ParcelasAdenda ctx={ctx} d={d} a={a} />}
                {/* 21/10 (decisão B): os materiais da adenda só se encomendam com a 1.ª parcela dela paga */}
                {a.estado === "assinada" && (() => {
                  const ea = ecDaAdenda(d, a.n), pend = porEncomendarDe(d, a.n).length;
                  if (!ea && !pend) return null;
                  return <p className="mt-1 text-[15px] text-muted-foreground">Materiais: {ea ? `encomenda ${ea.n} no Inventário` : primeiraPaga(a) ? (d.obra.ec?.ref ? "a encomenda não chegou ao Inventário: emita-a no passo Materiais" : "a encomenda emite-se logo a seguir à inicial") : "encomendam-se quando a 1.ª parcela da adenda for paga"}</p>;
                })()}
                {a.estado === "recusada" && <p className="mt-2 text-[15px]">{a.recusa ? <>«{a.recusa}»</> : "Sem motivo."} <span className="text-sm text-muted-foreground">· {a.recusada}</span></p>}
                <div className="mt-3"><AcoesAdenda ctx={ctx} d={d} a={a} editar={(x) => abrirCom(x, x.n)} /></div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  {a.estado === "rascunho" && !a.versoes?.length && !novo && <button type="button" onClick={() => abrirCom(a, a.n)} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Mudar a adenda</button>}
                  {a.estado === "recusada" && !novo && <Button size="sm" variant="outline" className="min-h-10" onClick={() => refazer(a)}>Refazer a adenda</Button>}
                  <button type="button" onClick={() => setVer(ver === "p" + a.n ? null : "p" + a.n)} aria-expanded={ver === "p" + a.n} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">{ver === "p" + a.n ? "Fechar a proposta" : "Ver a proposta"}</button>
                  {temContrato && <button type="button" onClick={() => setVer(ver === "c" + a.n ? null : "c" + a.n)} aria-expanded={ver === "c" + a.n} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">{ver === "c" + a.n ? "Fechar o contrato da adenda" : "Ver o contrato da adenda"}</button>}
                </div>
                {ver === "p" + a.n && <div className="mt-3 animate-in fade-in-0 duration-200"><Partilhar ctx={ctx} d={d} tipo="adenda" estado={E.t}><PropostaDoc S={S} d={d} a={a} /></Partilhar></div>}
                {ver === "c" + a.n && <div className="mt-3 animate-in fade-in-0 duration-200"><Partilhar ctx={ctx} d={d} tipo="adenda" estado={E.t}><ContratoDoc S={S} d={d} a={a} /></Partilhar></div>}
              </li>
            );
          })}
        </ul>
      )}

      {novo && (
        <div className="mt-4 space-y-4 rounded-xl border border-border p-4 animate-in fade-in-0 slide-in-from-top-1 duration-200" aria-label={aEditar ? `Mudar a adenda ${aEditar.n}` : "Nova adenda"} role="group">
          {aEditar?.pedidoCliente && <p className="rounded-xl bg-warning/10 px-3 py-2 text-[15px]">A versão {versaoAdenda(aEditar) + 1} da adenda {aEditar.n}, com o que o cliente pediu: {[...aEditar.pedidoCliente.motivos, aEditar.pedidoCliente.nota ? `«${aEditar.pedidoCliente.nota}»` : ""].filter(Boolean).join(", ")}. A v{versaoAdenda(aEditar)} fica guardada.</p>}
          {!aEditar && (
            <fieldset>
              <legend className="text-[15px] font-medium">Porquê?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {MOTIVOS_ADENDA.map((m) => (
                  <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)}
                    className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors", motivo === m ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-foreground/40")}>
                    {motivo === m && <Check className="h-4 w-4" aria-hidden="true" />}{m}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <p className="text-[15px] font-medium">Que trabalhos?</p>
            {linhas.length > 0 && (
              <ul className="mt-2 divide-y divide-border">
                {linhas.map((x) => (
                  <li key={x.sid} className="flex flex-wrap items-center justify-between gap-3 py-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                    <span className="min-w-0 flex-1 text-[15px]">{x.n}<span className="block text-sm tabular-nums text-muted-foreground">{eur(x.pu)} €/{x.un} = {eur(x.q * x.pu)} €{x.livre && x.mats?.length ? ` · com materiais (IVA 23%)` : ""}</span></span>
                    {!x.livre && (
                      <span className="inline-flex items-center rounded-lg border border-input bg-card p-0.5" role="group" aria-label={`Quantidade de ${x.n}`}>
                        <button type="button" aria-label="Menos" disabled={x.q <= 1} onClick={() => mudarQ(x.sid, Math.max(1, x.q - 1))} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                        {/* 21/10: a quantidade também se escreve (20 m² não são 20 toques) */}
                        <label className="flex items-baseline gap-1 px-1"><span className="sr-only">Quantidade de {x.n} ({x.un})</span>
                          <input type="number" inputMode="decimal" min={0} step="any" value={x.q || ""} onChange={(e) => mudarQ(x.sid, Number(e.target.value.replace(",", ".")) || 0)}
                            className="w-14 bg-transparent text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                          <span className="text-sm text-muted-foreground">{x.un}</span></label>
                        <button type="button" aria-label="Mais" onClick={() => mudarQ(x.sid, x.q + 1)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted"><Plus className="h-4 w-4" /></button>
                      </span>
                    )}
                    <button type="button" aria-label={`Tirar ${x.n}`} onClick={() => setItens((I) => I.filter((y) => y.sid !== x.sid))} className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <SeletorPesquisa rotulo="Juntar um trabalho" placeholder="Serviço do Catálogo" max={12}
              opcoes={opcoes.filter((o) => !itens.some((x) => x.sid === o.v))}
              onEscolher={(v) => setItens((I) => [...I, { sid: v, q: 1 }])}
              className="mt-1" gatilho={<span className="inline-flex items-center gap-1.5 px-1 font-medium text-primary"><Plus className="h-4 w-4" aria-hidden="true" />Juntar um trabalho</span>} />
          </div>
          <label className="block max-w-[12rem]">
            <span className="text-[15px] font-medium">Desconto (%)</span>
            <input type="number" inputMode="decimal" min={0} max={100} step="any" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0"
              className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          {/* as contas ao vivo, com o IVA por taxa */}
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-sm">
            <div><p className="text-muted-foreground">Sem IVA</p><p className="text-[15px] font-semibold tabular-nums">+{eur(T.base)} €</p></div>
            <div><p className="text-muted-foreground">Com IVA {T.mat > 0 ? "(6% e 23%)" : "(6%)"}</p><p className="text-[15px] font-semibold tabular-nums">+{eur(T.total)} €</p></div>
            <div><p className="text-muted-foreground">Prazo</p><p className="text-[15px] font-semibold tabular-nums">+{diasAdenda(linhas)} {diasAdenda(linhas) === 1 ? "dia" : "dias"}</p></div>
          </div>
          <p className="text-sm text-muted-foreground">A Olyvia verifica as margens antes de enviar (as regras do orçamento): abaixo do mínimo, pede-se a aprovação da Direção.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="lg" onClick={fechar}>Cancelar</Button>
            <Button size="lg" disabled={!valida} onClick={enviar}>{aEditar && aEditar.estado !== "rascunho" ? `Verificar e enviar a versão ${versaoAdenda(aEditar) + 1}` : "Verificar e enviar ao cliente"}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
