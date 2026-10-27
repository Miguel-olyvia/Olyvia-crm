import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  spShipOrder,
  type SpOrderDetail,
  type SpOrderShipments,
} from "@/lib/supplierPortal/spRpc";
import { formatSpDate, formatSpQty } from "@/components/supplier-portal/spOrderFormat";
import {
  spLineRequiresIntegerQty,
  spLineUnitCode,
  spProductLines,
  spToShipByLine,
} from "@/components/supplier-portal/spShipping";

const NOTE_MAX = 60;
const CARRIER_MAX = 120;
const NOTES_MAX = 1000;

/** Hoje em Lisboa, "YYYY-MM-DD" (igual ao diálogo de confirmação). */
export function todayLisbon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Resposta de sp_ship_order. */
export type SpShipOrderResponse = Awaited<ReturnType<typeof spShipOrder>>;

/** "1,5" ou "1.5" → 1.5; vazio → 0; lixo → NaN. */
function parseQty(value: string): number {
  const v = value.trim().replace(",", ".");
  if (v === "") return 0;
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : Number.NaN;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: SpOrderDetail;
  shipments: SpOrderShipments;
  /** Revisão da publicação no ecrã quando o diálogo abriu. */
  revision: number;
  onShipped: (res: SpShipOrderResponse, file: File | null) => void;
  /** Erros da RPC (mensagens via spErrorMessage). O diálogo fica aberto: quem chama decide se fecha. */
  onError: (err: unknown) => void;
  /** Anexo da guia (PDF/foto): fica para outra fatia — só o campo, sem upload. */
  allowAttachment?: boolean;
}

/**
 * Expedir a encomenda com a guia de remessa (sp_ship_order). O requestId é
 * gerado uma vez ao abrir: repetir o envio (duplo clique, falha de rede) não
 * duplica a expedição.
 */
export function SpShipOrderDialog({
  open,
  onOpenChange,
  order,
  shipments,
  revision,
  onShipped,
  onError,
  allowAttachment = false,
}: Props) {
  const toShip = useMemo(() => spToShipByLine(shipments), [shipments]);
  const lines = useMemo(
    () => spProductLines(order.lines).filter((l) => (toShip.get(l.id) ?? 0) > 0),
    [order.lines, toShip],
  );

  const today = todayLisbon();
  const minDate = order.order_date ? order.order_date.slice(0, 10) : undefined;

  const [requestId, setRequestId] = useState("");
  const [noteNumber, setNoteNumber] = useState("");
  const [shipDate, setShipDate] = useState(today);
  const [carrier, setCarrier] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  // Ao abrir (transição fechado → aberto): novo requestId e valores por omissão.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setRequestId(crypto.randomUUID());
      setNoteNumber("");
      setShipDate(todayLisbon());
      setCarrier("");
      setNotes("");
      setFile(null);
      setQty(Object.fromEntries(lines.map((l) => [l.id, String(toShip.get(l.id) ?? 0)])));
      setNoteError(null);
      setDateError(null);
      setLinesError(null);
    }
    wasOpen.current = open;
  }, [open, lines, toShip]);

  const lineError = (lineId: string): string | null => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return null;
    const max = toShip.get(lineId) ?? 0;
    const n = parseQty(qty[lineId] ?? "");
    if (Number.isNaN(n) || n < 0) return "Quantidade inválida.";
    if (n > max) return `Máximo ${formatSpQty(max)}.`;
    if (spLineRequiresIntegerQty(line) && !Number.isInteger(n)) return "Só números inteiros.";
    return null;
  };

  const totalQty = lines.reduce((a, l) => {
    const n = parseQty(qty[l.id] ?? "");
    return a + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const validate = (): boolean => {
    const nErr = noteNumber.trim() ? null : "Indique o número da guia de remessa.";
    const dErr = !/^\d{4}-\d{2}-\d{2}$/.test(shipDate)
      ? "Indique a data de expedição."
      : minDate && shipDate < minDate
        ? `A data não pode ser anterior à encomenda (${formatSpDate(minDate)}).`
        : null;
    const anyLineError = lines.some((l) => lineError(l.id));
    const lErr = anyLineError
      ? "Corrija as quantidades assinaladas."
      : totalQty <= 0
        ? "Indique a quantidade a expedir em pelo menos uma linha."
        : null;
    setNoteError(nErr);
    setDateError(dErr);
    setLinesError(lErr);
    if (nErr) noteRef.current?.focus();
    return !nErr && !dErr && !lErr;
  };

  const submit = async () => {
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      const carrierTrim = carrier.trim();
      const notesTrim = notes.trim();
      const res = await spShipOrder({
        requestId,
        poId: order.purchase_order_id,
        revision,
        noteNumber: noteNumber.trim(),
        shipDate,
        lines: lines
          .map((l) => ({ purchase_order_item_id: l.id, quantity: parseQty(qty[l.id] ?? "") }))
          .filter((l) => l.quantity > 0),
        ...(carrierTrim ? { carrier: carrierTrim } : {}),
        ...(notesTrim ? { notes: notesTrim } : {}),
      });
      onOpenChange(false);
      onShipped(res, file);
    } catch (e) {
      onError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const setAll = (full: boolean) => {
    setLinesError(null);
    setQty(Object.fromEntries(lines.map((l) => [l.id, full ? String(toShip.get(l.id) ?? 0) : "0"])));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          noteRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Expedir encomenda {order.order_number}</DialogTitle>
          <DialogDescription>
            Indique a guia de remessa que segue com a mercadoria. O armazém da {order.company.name} dá entrada a partir
            deste número.
          </DialogDescription>
        </DialogHeader>

        <form
          id="sp-ship-order-form"
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-ship-note">Nº da guia de remessa</Label>
              <Input
                id="sp-ship-note"
                ref={noteRef}
                className="h-11 font-mono"
                value={noteNumber}
                maxLength={NOTE_MAX}
                autoComplete="off"
                required
                aria-required="true"
                aria-invalid={!!noteError}
                aria-describedby={noteError ? "sp-ship-note-error" : undefined}
                onChange={(e) => {
                  setNoteNumber(e.target.value);
                  if (noteError && e.target.value.trim()) setNoteError(null);
                }}
              />
              {noteError && (
                <p id="sp-ship-note-error" className="text-xs text-destructive" role="alert">
                  {noteError}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-ship-date">Data de expedição</Label>
              <Input
                id="sp-ship-date"
                type="date"
                className="h-11"
                value={shipDate}
                min={minDate}
                required
                aria-required="true"
                aria-invalid={!!dateError}
                aria-describedby={dateError ? "sp-ship-date-error" : undefined}
                onChange={(e) => {
                  setShipDate(e.target.value);
                  if (dateError) setDateError(null);
                }}
              />
              {dateError && (
                <p id="sp-ship-date-error" className="text-xs text-destructive" role="alert">
                  {dateError}
                </p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sp-ship-carrier">Transportador (opcional)</Label>
              <Input
                id="sp-ship-carrier"
                className="h-11"
                value={carrier}
                maxLength={CARRIER_MAX}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="Ex.: transporte próprio, transportadora, matrícula…"
              />
            </div>
          </div>

          {allowAttachment && (
            <div className="space-y-1.5">
              <Label htmlFor="sp-ship-file">Ficheiro da guia de remessa (opcional)</Label>
              <Input
                id="sp-ship-file"
                type="file"
                accept="application/pdf,image/*"
                className="h-11"
                aria-describedby="sp-ship-file-help"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p id="sp-ship-file-help" className="text-xs text-muted-foreground">
                PDF ou foto da guia.
              </p>
            </div>
          )}

          <div role="group" aria-labelledby="sp-ship-lines-title" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="sp-ship-lines-title" className="text-sm font-medium">Quantidades a expedir</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={() => setAll(true)}>
                  Expedir tudo
                </Button>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setAll(false)}>
                  Limpar
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <caption className="sr-only">Quantidade a expedir por linha (máximo = o que falta expedir)</caption>
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Artigo</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Por expedir</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Expedir</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const max = toShip.get(l.id) ?? 0;
                    const unit = spLineUnitCode(l);
                    const integer = spLineRequiresIntegerQty(l);
                    const err = lineError(l.id);
                    const name = l.description || l.supplier_sku || l.sku || "Artigo";
                    const errId = `sp-ship-qty-error-${l.id}`;
                    return (
                      <tr key={l.id} className="border-t align-top">
                        <td className="px-3 py-2">
                          <span className="block font-medium">{l.supplier_sku || l.sku || "—"}</span>
                          <span className="block text-xs text-muted-foreground">{l.description || "—"}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {formatSpQty(max)}
                          {unit ? ` ${unit}` : ""}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            inputMode={integer ? "numeric" : "decimal"}
                            min={0}
                            max={max}
                            step={integer ? 1 : "any"}
                            aria-label={`Quantidade a expedir: ${name}`}
                            aria-invalid={!!err}
                            aria-describedby={err ? errId : undefined}
                            className="ml-auto h-11 w-28 text-right"
                            value={qty[l.id] ?? ""}
                            onChange={(e) => {
                              setLinesError(null);
                              setQty((q) => ({ ...q, [l.id]: e.target.value }));
                            }}
                          />
                          {err && (
                            <p id={errId} className="mt-1 text-xs text-destructive">
                              {err}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {linesError && (
              <p className="text-xs text-destructive" role="alert">
                {linesError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-ship-notes">Observações (opcional)</Label>
            <Textarea
              id="sp-ship-notes"
              rows={2}
              maxLength={NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
              placeholder="Ex.: 2 paletes, descarga com empilhador"
            />
          </div>
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="sp-ship-order-form" className="h-11 gap-2" disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Truck className="h-4 w-4" aria-hidden="true" />
            )}
            Expedir · {formatSpQty(totalQty)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
