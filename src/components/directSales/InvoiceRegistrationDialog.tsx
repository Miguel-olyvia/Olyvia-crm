import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Venda Direta — Fase 6B: registo da fatura fiscal.
//
// A Olyvia NÃO emite faturas: em Portugal isso exige software certificado pela
// AT. Este diálogo regista os dados de uma fatura emitida à parte, para a venda
// direta deixar de estar pendente e o número ficar ligado ao negócio.
//
// A escrita passa por rpc_register_direct_sale_invoice (20261202020000), não por
// um UPDATE directo: é lá que vivem as regras — venda tem de estar aceite,
// âmbito organizacional, e não se sobrescreve um registo cuja origem seja o
// futuro módulo certificado (invoice_source = 'integracao').

interface InvoiceFields {
  invoice_number: string;
  invoice_series: string;
  invoice_issued_at: string;
  invoice_atcud: string;
  invoice_hash: string;
  external_invoice_id: string;
  invoice_pdf_url: string;
}

const EMPTY: InvoiceFields = {
  invoice_number: "",
  invoice_series: "",
  invoice_issued_at: "",
  invoice_atcud: "",
  invoice_hash: "",
  external_invoice_id: "",
  invoice_pdf_url: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directSaleId: string | null;
  saleNumber: string | null;
  /** Chamado depois de gravar, para a listagem recarregar o distintivo. */
  onSaved: () => void;
}

export function InvoiceRegistrationDialog({
  open, onOpenChange, directSaleId, saleNumber, onSaved,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<InvoiceFields>(EMPTY);
  // Registo vindo do módulo certificado: mostra-se, não se edita.
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!open || !directSaleId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("direct_sales")
          .select(
            "invoice_number, invoice_series, invoice_issued_at, invoice_atcud, invoice_hash, external_invoice_id, invoice_pdf_url, invoice_source",
          )
          .eq("id", directSaleId)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;

        setLocked(data?.invoice_source === "integracao");
        setFields({
          invoice_number: data?.invoice_number ?? "",
          invoice_series: data?.invoice_series ?? "",
          // <input type="date"> só aceita YYYY-MM-DD.
          invoice_issued_at: data?.invoice_issued_at
            ? String(data.invoice_issued_at).slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          invoice_atcud: data?.invoice_atcud ?? "",
          invoice_hash: data?.invoice_hash ?? "",
          external_invoice_id: data?.external_invoice_id ?? "",
          invoice_pdf_url: data?.invoice_pdf_url ?? "",
        });
      } catch (error: any) {
        if (!cancelled) {
          toast({
            title: "Não foi possível carregar os dados da fatura",
            description: error?.message,
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, directSaleId, toast]);

  const set = (key: keyof InvoiceFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (!directSaleId || saving) return;
    if (!fields.invoice_number.trim()) {
      toast({ title: "O número da fatura é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("rpc_register_direct_sale_invoice", {
        p_direct_sale_id: directSaleId,
        p_invoice: {
          ...fields,
          // A RPC aceita timestamptz; o input dá só a data.
          invoice_issued_at: fields.invoice_issued_at
            ? new Date(`${fields.invoice_issued_at}T00:00:00`).toISOString()
            : null,
        },
      });
      if (error) throw error;
      toast({ title: "Fatura registada" });
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Não foi possível registar a fatura",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Registar fatura{saleNumber ? ` — ${saleNumber}` : ""}
          </DialogTitle>
          <DialogDescription>
            A Olyvia não emite faturas. Registe aqui os dados da fatura emitida
            no seu software de faturação certificado.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <OlyviaLoader size={32} />
          </div>
        ) : (
          <div className="space-y-3">
            {locked && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
                Esta fatura foi emitida pelo módulo de faturação. Os dados são
                registo fiscal e não podem ser alterados aqui.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invoice_number" className="text-xs">N.º da fatura *</Label>
                <Input
                  id="invoice_number"
                  value={fields.invoice_number}
                  onChange={set("invoice_number")}
                  disabled={locked}
                  placeholder="FT 2026/123"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice_series" className="text-xs">Série</Label>
                <Input
                  id="invoice_series"
                  value={fields.invoice_series}
                  onChange={set("invoice_series")}
                  disabled={locked}
                  placeholder="2026"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice_issued_at" className="text-xs">Data de emissão</Label>
              <Input
                id="invoice_issued_at"
                type="date"
                value={fields.invoice_issued_at}
                onChange={set("invoice_issued_at")}
                disabled={locked}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invoice_atcud" className="text-xs">ATCUD</Label>
                <Input
                  id="invoice_atcud"
                  value={fields.invoice_atcud}
                  onChange={set("invoice_atcud")}
                  disabled={locked}
                  placeholder="ABCD1234-123"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="external_invoice_id" className="text-xs">ID no software</Label>
                <Input
                  id="external_invoice_id"
                  value={fields.external_invoice_id}
                  onChange={set("external_invoice_id")}
                  disabled={locked}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice_hash" className="text-xs">Hash</Label>
              <Input
                id="invoice_hash"
                value={fields.invoice_hash}
                onChange={set("invoice_hash")}
                disabled={locked}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice_pdf_url" className="text-xs">Ligação para o PDF</Label>
              <Input
                id="invoice_pdf_url"
                value={fields.invoice_pdf_url}
                onChange={set("invoice_pdf_url")}
                disabled={locked}
                placeholder="https://…"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {locked ? "Fechar" : "Cancelar"}
          </Button>
          {!locked && (
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "A gravar…" : "Registar fatura"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InvoiceRegistrationDialog;
