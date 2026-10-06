// Escolha da guia do fornecedor no ecrã de receção (Fase 2 — fatia 2).
// Lista as guias ABERTAS da empresa (SELECT direto; RLS: org visível e
// purchase_orders.view ou .receive), com pesquisa por nº ou fornecedor.
// "Nova guia" só para quem pode receber; "Sem guia" = receção da fatia 1.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FileText, Plus, RefreshCw, Search, X } from "lucide-react";
import { FULLSCREEN_DIALOG_CLASS, fmtDay } from "./deliveryNotes";

export interface PickerNote {
  id: string;
  note_number: string;
  supplier_id: string;
  supplier_name: string | null;
  document_date: string | null;
  orders: number;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  /** Guia escolhida agora ("" = sem guia). */
  currentId: string;
  canCreate: boolean;
  onSelect: (note: PickerNote | null) => void;
  onCreate: () => void;
}

export function DeliveryNotePicker({ open, onOpenChange, orgId, currentId, canCreate, onSelect, onCreate }: Props) {
  const [notes, setNotes] = useState<PickerNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("supplier_delivery_notes")
          .select("id, note_number, supplier_id, document_date, created_at, suppliers(name), supplier_delivery_note_orders(count)")
          .eq("organization_id", orgId)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(300);
        if (cancelled) return;
        if (err) {
          setError(err.message || "Não foi possível carregar as guias.");
          return;
        }
        setNotes(
          (data ?? []).map((r) => {
            const sup = r.suppliers as unknown as { name: string | null } | null;
            const cnt = r.supplier_delivery_note_orders as unknown as { count: number }[] | null;
            return {
              id: r.id,
              note_number: r.note_number,
              supplier_id: r.supplier_id,
              supplier_name: sup?.name ?? null,
              document_date: r.document_date,
              created_at: r.created_at,
              orders: Number(cnt?.[0]?.count ?? 0),
            };
          }),
        );
      } catch {
        if (!cancelled) setError("Sem ligação ao servidor — não foi possível carregar as guias.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, reloadKey]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-PT");
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.note_number.toLocaleLowerCase("pt-PT").includes(q) ||
        (n.supplier_name ?? "").toLocaleLowerCase("pt-PT").includes(q),
    );
  }, [notes, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FULLSCREEN_DIALOG_CLASS}>
        <DialogHeader className="border-b p-4 pr-12 text-left">
          <DialogTitle>Guia do fornecedor</DialogTitle>
          <DialogDescription>
            Escolhe a guia que veio com a mercadoria. As leituras só recebem nas encomendas dessa guia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b p-4">
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <Button type="button" className="h-11" onClick={onCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Nova guia
              </Button>
            )}
            <Button
              type="button"
              variant={currentId ? "outline" : "secondary"}
              className="h-11"
              onClick={() => onSelect(null)}
            >
              <X className="mr-2 h-4 w-4" />
              Sem guia
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Procurar por nº da guia ou fornecedor"
              aria-label="Procurar guia"
              className="h-11 pl-9 text-base"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar guias…</p>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" className="h-11" onClick={() => setReloadKey((k) => k + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar de novo
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {notes.length === 0 ? "Não há guias abertas." : "Nenhuma guia aberta corresponde à pesquisa."}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(n)}
                    aria-current={n.id === currentId ? "true" : undefined}
                    className={cn(
                      "flex min-h-[3.5rem] w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      n.id === currentId && "border-primary bg-primary/5",
                    )}
                  >
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">GR {n.note_number}</span>
                      <span className="block break-words text-sm text-muted-foreground">
                        {[
                          n.supplier_name ?? "Fornecedor",
                          n.document_date ? fmtDay(n.document_date) : null,
                          n.orders > 0 ? `${n.orders} ${n.orders === 1 ? "encomenda" : "encomendas"}` : "todas as encomendas do fornecedor",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
