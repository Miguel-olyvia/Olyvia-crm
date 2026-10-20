// O detalhe de uma encomenda no Portal do Fornecedor simulado (20/10, demo), com o aspeto de SupplierPortalOrderDetail.tsx: logótipo, "Encomenda Nº",
// selos, o cartão Encomenda e o cartão Empresa, as notas e a tabela das linhas com totais. Abrir uma encomenda por ver marca-a como vista
// (portalVista). A ação principal depende do estado: "Confirmar encomenda" e, depois de confirmada, "Expedir encomenda" (SÓ PROTÓTIPO).
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Building2, CheckCircle2, FileText, Info, Truck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { armazem, fmtD, fmtDT, nomeProd, poPorId } from "../inventario/base";
import { executar, useInventario } from "../inventario/loja";
import { expedidoLinha, podeExpedir, poStatus, poTotals, portalVista } from "../inventario/po";
import type { Expedicao, Fornecedor, Po } from "../inventario/tipos";
import { dinheiro, porConfirmar, qtd } from "./dadosPortal";
import { ConfirmarDialogo, ExpedirDialogo, GuiaRemessaDialogo } from "./DialogosPortal";
import { SelosPortal } from "./SelosPortal";

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-sm text-muted-foreground">{rotulo}</dt><dd className="text-[15px] font-medium text-foreground break-words">{children}</dd></div>;
}

type Dlg = { t: "confirmar" } | { t: "expedir" } | { t: "guia"; e: Expedicao } | null;

export function EncomendaPortal({ id, s, empresa, voltar, avisar }: { id: string; s: Fornecedor; empresa: string; voltar: () => void; avisar: (t: string) => void }) {
  const db = useInventario();
  const p = poPorId(db, id);
  const [dlg, setDlg] = useState<Dlg>(null);
  // abrir uma encomenda nova (por ver) marca-a como vista, como no portal real
  useEffect(() => { executar((d) => { const x = poPorId(d, id); if (x && x.portal.state === "sent") portalVista(d, x); }); }, [id]);
  if (!p || p.sup !== s.id) {
    return (
      <div className="space-y-3">
        <p className="text-[15px]">Esta encomenda já não está disponível no portal.</p>
        <Button variant="outline" className="h-11 gap-2" onClick={voltar}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar às encomendas</Button>
      </div>
    );
  }
  const pub = p.portal, st = poStatus(p);
  const confirmada = pub.state === "confirmed";
  const recebeu = p.lines.some((l) => l.recv > 0);
  const expedicoes = pub.expedicoes ?? [];
  const totais = poTotals(p);
  const w = armazem(db, p.wh);
  const podeConfirmar = porConfirmar(p), expedir = podeExpedir(p);
  return (
    <div className="space-y-4">
      <Button variant="ghost" className="-ml-2 h-11 gap-2 text-muted-foreground" onClick={voltar}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Encomendas</Button>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Building2 className="h-6 w-6" aria-hidden="true" /></div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Encomenda {p.id}</h1>
            <p className="truncate text-[15px] text-muted-foreground">{empresa}</p>
            <SelosPortal p={p} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {expedicoes.map((e) => (
            <Button key={e.guia} variant="outline" className="h-11 gap-2" onClick={() => setDlg({ t: "guia", e })}><FileText className="h-4 w-4" aria-hidden="true" />Guia {e.guia}</Button>
          ))}
          {podeConfirmar && <Button className="h-11 gap-2" onClick={() => setDlg({ t: "confirmar" })}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Confirmar encomenda</Button>}
          {!podeConfirmar && expedir && <Button className="h-11 gap-2" onClick={() => setDlg({ t: "expedir" })}><Truck className="h-4 w-4" aria-hidden="true" />{expedicoes.length ? "Expedir o resto" : "Expedir encomenda"}</Button>}
        </div>
      </div>

      {confirmada && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          <CheckCircle2 className="h-4 w-4 !text-emerald-700 dark:!text-emerald-300" />
          <AlertTitle>Confirmada em {fmtDT(pub.confirmed)}{pub.promised ? ` · entrega prevista ${fmtD(pub.promised)}` : ""}</AlertTitle>
          <AlertDescription className="space-y-1">
            {pub.comment && <p className="whitespace-pre-wrap">Comentário: {pub.comment}</p>}
            {pub.promised && p.promiseAccepted && <p>A empresa aceitou a data de entrega prevista.</p>}
          </AlertDescription>
        </Alert>
      )}

      {expedicoes.length > 0 && (
        <Alert className="border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100">
          <Truck className="h-4 w-4 !text-violet-700 dark:!text-violet-300" />
          <AlertTitle>{expedicoes.length === 1 ? "Expedida" : `${expedicoes.length} expedições`}</AlertTitle>
          <AlertDescription>
            <ul className="space-y-0.5">
              {expedicoes.map((e) => <li key={e.guia}>Guia de remessa <b className="font-mono">{e.guia}</b> · {fmtD(e.data)} · {e.linhas.reduce((a, x) => a + x.qty, 0)} un{e.transportador ? ` · ${e.transportador}` : ""}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {!podeConfirmar && !confirmada && (st === "received" || st === "cancelled") && (
        <Alert><Info className="h-4 w-4" /><AlertDescription>{st === "received" ? "Esta encomenda já foi recebida pela empresa." : "Esta encomenda foi cancelada pela empresa."}</AlertDescription></Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">Encomenda</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Campo rotulo="Número">{p.id}</Campo>
              <Campo rotulo="Data da encomenda">{fmtD(p.date)}</Campo>
              <Campo rotulo="Entrega pedida">{fmtD(p.due)}</Campo>
              <Campo rotulo="Enviada em">{fmtDT(pub.sent || p.sentAt)}</Campo>
              <Campo rotulo="Vista em">{fmtDT(pub.seen)}</Campo>
              <Campo rotulo="Entregar em">{w ? `${w.name} · ${w.addr}, ${w.cp} ${w.city}` : p.wh}</Campo>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Empresa</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Campo rotulo="Nome">{empresa}</Campo>
              {w?.phone ? <Campo rotulo="Telefone (armazém)">{w.phone}</Campo> : null}
              {w?.email ? <Campo rotulo="Email (armazém)">{w.email}</Campo> : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      {p.notesSup && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Notas da empresa</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-[15px] text-foreground">{p.notesSup}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Linhas ({p.lines.length})</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço unit.</TableHead><TableHead className="text-right">IVA</TableHead><TableHead className="text-right">Total</TableHead>
                  {expedicoes.length > 0 && <TableHead className="text-right">Expedido</TableHead>}
                  {recebeu && <TableHead className="text-right">Recebido</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.lines.map((l) => {
                  const ref = db.items.find((i) => i.id === l.itemId)?.ref;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="align-top">
                        {ref ? <><span className="block font-semibold text-foreground">{ref}</span><span className="block text-xs text-muted-foreground">Nossa ref.: {l.sku}</span></> : <span className="text-muted-foreground">{l.sku}</span>}
                      </TableCell>
                      <TableCell className="min-w-[16ch] align-top">{nomeProd(db, l.sku)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right align-top tabular-nums">
                        <span className="block">{qtd(l.packs)} {l.unitLabel}</span>
                        {l.packN > 1 && <span className="block text-xs text-muted-foreground">= {qtd(l.packs * l.packN)} un</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right align-top tabular-nums">{dinheiro(l.price)}</TableCell>
                      <TableCell className="text-right align-top tabular-nums">{qtd(l.iva)}%</TableCell>
                      <TableCell className="whitespace-nowrap text-right align-top font-medium tabular-nums">{dinheiro(l.packs * l.price)}</TableCell>
                      {expedicoes.length > 0 && <TableCell className="whitespace-nowrap text-right align-top tabular-nums">{qtd(expedidoLinha(p, l.id))} un</TableCell>}
                      {recebeu && <TableCell className="whitespace-nowrap text-right align-top tabular-nums">{qtd(l.recv)} un</TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <dl className="ml-auto mt-4 w-full space-y-1 px-4 pb-4 text-[15px] sm:w-72 sm:px-0 sm:pb-0">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal (sem IVA)</dt><dd className="tabular-nums">{dinheiro(totais.sub)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">IVA</dt><dd className="tabular-nums">{dinheiro(totais.iva)}</dd></div>
            <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{dinheiro(totais.total)}</dd></div>
          </dl>
        </CardContent>
      </Card>

      {dlg?.t === "confirmar" && <ConfirmarDialogo p={p} aoFechar={() => setDlg(null)} aoFeito={(t) => { setDlg(null); avisar(t); }} />}
      {dlg?.t === "expedir" && <ExpedirDialogo p={p} aoFechar={() => setDlg(null)} aoFeito={(e) => { setDlg({ t: "guia", e }); avisar(`Encomenda ${p.id} expedida com a guia de remessa ${e.guia}.`); }} />}
      {dlg?.t === "guia" && <GuiaRemessaDialogo p={p} e={dlg.e} s={s} empresa={empresa} aoFechar={() => setDlg(null)} />}
    </div>
  );
}
