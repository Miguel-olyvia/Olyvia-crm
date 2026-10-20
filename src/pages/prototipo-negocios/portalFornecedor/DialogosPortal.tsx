// Os diálogos do Portal do Fornecedor simulado (20/10, demo): confirmar a encomenda (como SpConfirmOrderDialog do portal real, aqui com a data
// de entrega obrigatória, que é a regra do Inventário do protótipo) e, SÓ NO PROTÓTIPO, expedir com a guia de remessa e ver/imprimir a guia.
import { useState } from "react";
import { CheckCircle2, Printer, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agora, armazem, fmtD, nomeProd, poPorId } from "../inventario/base";
import { executar, useInventario } from "../inventario/loja";
import { porExpedir, portalConfirmar, portalExpedir, poUnits, proximaGuiaRemessa } from "../inventario/po";
import type { Expedicao, Fornecedor, Po } from "../inventario/tipos";

const refForn = (db: ReturnType<typeof useInventario>, itemId: string, sku: string): string => db.items.find((i) => i.id === itemId)?.ref || sku;

function Erro({ texto }: { texto: string }) {
  return texto ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[15px] text-destructive">{texto}</p> : null;
}

/** "Confirmar encomenda": a data de entrega prevista e um comentário; confirmar chama portalConfirmar (inventario/po.ts). */
export function ConfirmarDialogo({ p, aoFechar, aoFeito }: { p: Po; aoFechar: () => void; aoFeito: (t: string) => void }) {
  const [data, setData] = useState(p.portal.promised || p.due);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState("");
  const confirmar = (): void => {
    const r = executar((d) => portalConfirmar(d, poPorId(d, p.id) as Po, data, comentario.trim()));
    if (!r.ok) { setErro(r.erro); return; }
    aoFeito(`Encomenda ${p.id} confirmada · entrega prevista ${fmtD(data)}.`);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar encomenda {p.id}</DialogTitle>
          <DialogDescription className="text-[15px]">Ao confirmar, a empresa fica a saber que vai entregar esta encomenda na data indicada.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pf-data">Data de entrega prevista</Label>
            <Input id="pf-data" type="date" className="h-11 text-[15px]" value={data} min={p.date} onChange={(e) => { setErro(""); setData(e.target.value); }} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-comentario">Comentário (opcional)</Label>
            <Textarea id="pf-comentario" rows={3} maxLength={2000} className="text-[15px]" value={comentario} onChange={(e) => setComentario(e.target.value)}
              placeholder="Ex.: entrega em duas vezes, artigo X com prazo maior…" />
          </div>
          <Erro texto={erro} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={aoFechar}>Cancelar</Button>
          <Button className="h-11 gap-2" onClick={confirmar}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Confirmar encomenda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** SÓ PROTÓTIPO: "Expedir encomenda" com a guia de remessa (número obrigatório), a data, o transportador e as quantidades por linha
 *  (por omissão tudo o que falta expedir; menos = expedição parcial). Expedir chama portalExpedir (inventario/po.ts). */
export function ExpedirDialogo({ p, aoFechar, aoFeito }: { p: Po; aoFechar: () => void; aoFeito: (e: Expedicao) => void }) {
  const db = useInventario();
  const linhas = p.lines.filter((l) => porExpedir(p, l) > 0);
  const [guia, setGuia] = useState(() => proximaGuiaRemessa(db));
  const [data, setData] = useState(() => agora(db).slice(0, 10));
  const [transportador, setTransportador] = useState("");
  const [obs, setObs] = useState("");
  const [q, setQ] = useState<Record<string, string>>(() => Object.fromEntries(linhas.map((l) => [l.id, String(porExpedir(p, l))])));
  const [erro, setErro] = useState("");
  const total = linhas.reduce((a, l) => a + (Number(q[l.id]) || 0), 0);
  const expedir = (): void => {
    for (const l of linhas) {
      const n = Number(q[l.id] || 0);
      if (!Number.isInteger(n) || n < 0) { setErro(`Quantidades inteiras: ${nomeProd(db, l.sku)}.`); return; }
    }
    const r = executar((d) => portalExpedir(d, poPorId(d, p.id) as Po, { guia, data, transportador, obs, linhas: linhas.map((l) => ({ lineId: l.id, qty: Number(q[l.id] || 0) })) }));
    if (!r.ok) { setErro(r.erro); return; }
    aoFeito(r.valor);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Expedir encomenda {p.id}</DialogTitle>
          <DialogDescription className="text-[15px]">Indique a guia de remessa que segue com a mercadoria. O armazém da empresa dá entrada lendo este número.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-guia">Nº da guia de remessa</Label>
              <Input id="pf-guia" className="h-11 font-mono text-[15px]" value={guia} onChange={(e) => { setErro(""); setGuia(e.target.value); }} autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-dexp">Data de expedição</Label>
              <Input id="pf-dexp" type="date" className="h-11 text-[15px]" value={data} min={p.date} onChange={(e) => { setErro(""); setData(e.target.value); }} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pf-transp">Transportador (opcional)</Label>
              <Input id="pf-transp" className="h-11 text-[15px]" value={transportador} onChange={(e) => setTransportador(e.target.value)} placeholder="Ex.: transporte próprio, transportadora, matrícula…" />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-[15px]">
              <caption className="sr-only">Quantidades a expedir por linha (máximo = o que falta expedir)</caption>
              <thead className="bg-muted/50 text-left text-sm text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Artigo</th><th className="px-3 py-2 text-right font-medium">Falta expedir</th><th className="px-3 py-2 text-right font-medium">Expedir</th></tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2"><span className="block font-medium">{refForn(db, l.itemId, l.sku)}</span><span className="block text-sm text-muted-foreground">{nomeProd(db, l.sku)}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{porExpedir(p, l)} un</td>
                    <td className="px-3 py-2 text-right">
                      <Input type="number" inputMode="numeric" min={0} max={porExpedir(p, l)} step={1} aria-label={`Expedir: ${nomeProd(db, l.sku)}`}
                        className="ml-auto h-11 w-24 text-right text-[15px]" value={q[l.id] ?? ""} onChange={(e) => { setErro(""); setQ((x) => ({ ...x, [l.id]: e.target.value })); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-obs">Observações (opcional)</Label>
            <Textarea id="pf-obs" rows={2} className="text-[15px]" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: 2 paletes, descarga com empilhador" />
          </div>
          <Erro texto={erro} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={aoFechar}>Cancelar</Button>
          <Button className="h-11 gap-2" onClick={expedir}><Truck className="h-4 w-4" aria-hidden="true" />Expedir · {total} un</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** SÓ PROTÓTIPO: a guia de remessa para ver e imprimir (documento de demonstração, não é um documento de transporte comunicado à AT). */
export function GuiaRemessaDialogo({ p, e, s, empresa, aoFechar }: { p: Po; e: Expedicao; s: Fornecedor; empresa: string; aoFechar: () => void }) {
  const db = useInventario();
  const w = armazem(db, p.wh);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Guia de remessa {e.guia}</DialogTitle>
          <DialogDescription className="text-[15px]">Documento de demonstração do protótipo.</DialogDescription>
        </DialogHeader>
        <article aria-label={`Guia de remessa ${e.guia}`} className="grid gap-4 rounded-lg border bg-background p-4 text-[15px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{s.name}</p>
              <p className="text-sm text-muted-foreground">NIF {s.nif} · {s.addr}{s.city ? `, ${s.city}` : ""}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-semibold">{e.guia}</p>
              <p className="text-sm text-muted-foreground">Data: {fmtD(e.data)}</p>
            </div>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">Destinatário</dt><dd className="font-medium">{empresa}</dd></div>
            <div><dt className="text-sm text-muted-foreground">A vossa encomenda</dt><dd className="font-medium">{p.id}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Local de descarga</dt><dd>{w ? `${w.name} · ${w.addr}, ${w.cp} ${w.city}` : p.wh}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Transportador</dt><dd>{e.transportador || "—"}</dd></div>
          </dl>
          <table className="w-full">
            <thead className="border-b text-left text-sm text-muted-foreground"><tr><th className="py-1.5 font-medium">Referência</th><th className="py-1.5 font-medium">Descrição</th><th className="py-1.5 text-right font-medium">Qtd.</th></tr></thead>
            <tbody>
              {e.linhas.map((x) => {
                const l = p.lines.find((y) => y.id === x.lineId);
                return l ? <tr key={x.lineId} className="border-b last:border-0"><td className="py-1.5 font-mono">{refForn(db, l.itemId, l.sku)}</td><td className="py-1.5">{nomeProd(db, l.sku)}</td><td className="py-1.5 text-right tabular-nums">{x.qty} un</td></tr> : null;
              })}
            </tbody>
          </table>
          {e.obs && <p><span className="text-sm text-muted-foreground">Observações: </span>{e.obs}</p>}
          <p className="text-sm text-muted-foreground">Total de unidades: {e.linhas.reduce((a, x) => a + x.qty, 0)} de {p.lines.reduce((a, l) => a + poUnits(l) - l.cancelled, 0)} encomendadas.</p>
        </article>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" />Imprimir</Button>
          <Button className="h-11" onClick={aoFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
