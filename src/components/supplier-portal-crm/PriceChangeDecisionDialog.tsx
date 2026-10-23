import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { formatMoney } from "./types";
import { NOTE_MAX, unitChangeText, type PriceChangeItem } from "./priceChanges";

export interface PriceDecisionRequest {
  mode: "approve" | "reject";
  items: PriceChangeItem[];
}

interface PriceChangeDecisionDialogProps {
  /** null = fechado. */
  request: PriceDecisionRequest | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (opts: { note: string; acceptUnitChange: boolean }) => void;
}

const MAX_LISTED = 8;

// Confirmar aceitar/recusar um ou vários pedidos de alteração de preço.
// Recusar: nota opcional. Aceitar com mudança de unidade/embalagem: exige a
// confirmação explícita (p_accept_unit_change); sem ela esses pedidos ficam
// por decidir (a RPC devolve skipped/unit_changed).
export default function PriceChangeDecisionDialog({ request, busy, onClose, onConfirm }: PriceChangeDecisionDialogProps) {
  const [note, setNote] = useState("");
  const [acceptUnit, setAcceptUnit] = useState(false);

  // Cópia tirada ao abrir: ao fechar o pai passa null mas o Radix mantém o
  // conteúdo montado durante a animação de saída — nunca se lê do pedido vivo.
  const [shown, setShown] = useState<PriceDecisionRequest | null>(request);
  const [prev, setPrev] = useState<PriceDecisionRequest | null>(request);
  if (request !== prev) {
    setPrev(request);
    if (request) {
      setShown(request);
      setNote("");
      setAcceptUnit(false);
    }
  }
  const current = request ?? shown;
  const items = current?.items ?? [];
  const approve = current?.mode === "approve";
  const unitChanged = items.filter((i) => i.unit_changed);
  const costChanges = items.filter((i) => i.product_cost?.will_update).length;
  const onlyUnitChanged = approve && unitChanged.length === items.length && items.length > 0;
  const canConfirm = !busy && items.length > 0 && !(onlyUnitChanged && !acceptUnit) && note.length <= NOTE_MAX;

  return (
    <Dialog open={!!request} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {approve ? `Aceitar ${items.length} preço(s)?` : `Recusar ${items.length} preço(s)?`}
          </DialogTitle>
          <DialogDescription>
            {approve
              ? `O preço deste fornecedor passa a ser o novo${costChanges > 0 ? `; o custo do produto muda em ${costChanges}` : "; o custo do produto não muda em nenhum"}. As encomendas já feitas não mudam.`
              : "Os preços ficam como estão. O fornecedor continua com o preço novo no portal."}
          </DialogDescription>
        </DialogHeader>

        <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
          {items.slice(0, MAX_LISTED).map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span className="truncate">
                <span className="font-mono text-xs">{i.catalog_item.supplier_ref}</span>
                {i.product ? ` · ${i.product.name}` : ""}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">
                {formatMoney(i.current_price, i.current_currency)} → {formatMoney(i.new_price, i.currency)}
              </span>
            </li>
          ))}
          {items.length > MAX_LISTED && <li className="text-xs text-muted-foreground">+{items.length - MAX_LISTED} outro(s)</li>}
        </ul>

        {approve && unitChanged.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
            <p className="text-sm">
              O fornecedor mudou a unidade/embalagem de {unitChanged.length} artigo(s)
              {unitChanged.length === 1 ? ` (${unitChangeText(unitChanged[0])})` : ""}. O preço novo vale para a unidade nova:
              confirma que a ligação ao produto continua certa.
            </p>
            <div className="flex items-start gap-2">
              <Checkbox id="price-decision-accept-unit" checked={acceptUnit} onCheckedChange={(v) => setAcceptUnit(v === true)} />
              <Label htmlFor="price-decision-accept-unit" className="text-sm font-normal leading-snug cursor-pointer">
                Confirmo: aceitar também com a unidade/embalagem nova
                {!onlyUnitChanged && (
                  <span className="block text-xs text-muted-foreground">Sem confirmar, estes ficam por aprovar e os restantes são aceites.</span>
                )}
              </Label>
            </div>
          </div>
        )}

        {!approve && (
          <div className="space-y-1.5">
            <Label htmlFor="price-decision-note">Nota (opcional)</Label>
            <Textarea
              id="price-decision-note"
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: preço não acordado com o fornecedor"
            />
            <p className="text-xs text-muted-foreground text-right">{note.length}/{NOTE_MAX}</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={approve ? "default" : "destructive"}
            disabled={!canConfirm}
            onClick={() => onConfirm({ note, acceptUnitChange: approve && acceptUnit })}
          >
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {approve ? "Aceitar" : "Recusar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
