import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Plus, Trash2, GripVertical, Package, Save, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface ManualItem { id?: string; proposal_id: string; description: string; quantity: number; unit_price: number; sort_order: number; notes: string | null; _isNew?: boolean; _isDirty?: boolean; }

interface ProposalManualItemsEditorProps { proposalId: string; readOnly?: boolean; onTotalChange?: (total: number) => void; }

export function ProposalManualItemsEditor({ proposalId, readOnly = false, onTotalChange }: ProposalManualItemsEditorProps) {
  const [items, setItems] = useState<ManualItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("proposal_manual_items").select("*").eq("proposal_id", proposalId).order("sort_order");
    if (!error && data) setItems(data.map((d: any) => ({ ...d, _isNew: false, _isDirty: false })));
    setLoading(false);
  }, [proposalId]);

  useEffect(() => { if (proposalId) fetchItems(); }, [proposalId, fetchItems]);
  useEffect(() => { onTotalChange?.(items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)); }, [items, onTotalChange]);

  const addItem = () => setItems(prev => [...prev, { proposal_id: proposalId, description: "", quantity: 1, unit_price: 0, sort_order: prev.length, notes: null, _isNew: true, _isDirty: true }]);
  const updateItem = (index: number, field: keyof ManualItem, value: any) => setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value, _isDirty: true } : item));
  const removeItem = async (index: number) => { const item = items[index]; if (item.id && !item._isNew) await (supabase as any).from("proposal_manual_items").delete().eq("id", item.id); setItems(prev => prev.filter((_, i) => i !== index)); };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const item of items.filter(i => i._isDirty)) {
        const payload = { proposal_id: item.proposal_id, description: item.description, quantity: item.quantity, unit_price: item.unit_price, sort_order: item.sort_order, notes: item.notes };
        if (item._isNew) { await (supabase as any).from("proposal_manual_items").insert(payload).select().single(); }
        else if (item.id) { await (supabase as any).from("proposal_manual_items").update(payload).eq("id", item.id); }
      }
      toast({ title: "Itens guardados com sucesso" });
      await fetchItems();
    } catch (err: any) { toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" }); } finally { setSaving(false); }
  };

  const grandTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const hasDirty = items.some(i => i._isDirty);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Itens Manuais</h4>
        <div className="flex items-center gap-2">
          <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" disabled className="opacity-50"><Package className="h-4 w-4 mr-1" />Adicionar do Catálogo</Button></TooltipTrigger><TooltipContent>Em breve</TooltipContent></Tooltip>
          {!readOnly && (
            <>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" /> Adicionar Linha</Button>
              {hasDirty && <Button size="sm" onClick={saveAll} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Guardar</Button>}
            </>
          )}
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead className="min-w-[250px]">Descrição</TableHead><TableHead className="w-[100px]">Qtd.</TableHead><TableHead className="w-[120px]">Preço Unit. (€)</TableHead><TableHead className="w-[120px] text-right">Total (€)</TableHead>{!readOnly && <TableHead className="w-[50px]"></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {items.length === 0 && !loading && <TableRow><TableCell colSpan={readOnly ? 5 : 6} className="text-center text-muted-foreground py-8">Sem itens.</TableCell></TableRow>}
            {items.map((item, index) => (
              <TableRow key={item.id || `new-${index}`}>
                <TableCell className="text-muted-foreground"><GripVertical className="h-4 w-4" /></TableCell>
                <TableCell>{readOnly ? <span>{item.description}</span> : <Textarea value={item.description} onChange={e => updateItem(index, "description", e.target.value)} placeholder="Descrição..." className="min-h-[36px] resize-none" rows={1} />}</TableCell>
                <TableCell>{readOnly ? <span>{item.quantity}</span> : <Input type="number" min="0" step="0.01" value={item.quantity} onChange={e => updateItem(index, "quantity", Number(e.target.value))} />}</TableCell>
                <TableCell>{readOnly ? <span>€{item.unit_price.toFixed(2)}</span> : <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(index, "unit_price", Number(e.target.value))} />}</TableCell>
                <TableCell className="text-right font-medium">€{(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                {!readOnly && <TableCell><Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
          {items.length > 0 && <TableFooter><TableRow><TableCell colSpan={4} className="text-right font-semibold">Total</TableCell><TableCell className="text-right font-bold text-lg">€{grandTotal.toFixed(2)}</TableCell>{!readOnly && <TableCell />}</TableRow></TableFooter>}
        </Table>
      </div>
    </div>
  );
}
