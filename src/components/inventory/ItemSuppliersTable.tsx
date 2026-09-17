import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Star, Pencil, Trash2, Plus, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Supplier {
  id: string;
  name: string;
}

interface ItemSupplierRow {
  id: string;
  supplier_id: string;
  supplier_sku: string | null;
  purchase_price: number | null;
  currency: string;
  lead_time_days: number | null;
  moq: number | null;
  is_preferred: boolean;
  is_active: boolean;
  suppliers?: { name: string } | null;
}

interface RowFormState {
  supplier_id: string;
  supplier_sku: string;
  purchase_price: string;
  currency: string;
  lead_time_days: string;
  moq: string;
  is_active: boolean;
}

const EMPTY_FORM: RowFormState = {
  supplier_id: "",
  supplier_sku: "",
  purchase_price: "",
  currency: "EUR",
  lead_time_days: "",
  moq: "",
  is_active: true,
};

interface ItemSuppliersTableProps {
  itemType: "product" | "service";
  itemId: string;
  organizationId: string;
  // O trigger fn_item_suppliers_sync_preferred mantém products.supplier_id/
  // services.supplier_id em sincronia com a linha preferencial — o pai (a
  // listagem) precisa de recarregar depois de qualquer alteração aqui para
  // não mostrar o supplier_id antigo em cache.
  onChanged?: () => void;
}

export default function ItemSuppliersTable({ itemType, itemId, organizationId, onChanged }: ItemSuppliersTableProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  // Custo de compra (purchase_price/currency) e código do fornecedor são
  // sensíveis por tipo de artigo — sem a permissão, lê-se de
  // item_suppliers_public (sem essas colunas) em vez de item_suppliers.
  // Isto é só UX de ocultação: a leitura direta de item_suppliers por quem
  // não tem a permissão continua dependente das políticas da BD.
  const costPermission = itemType === "product" ? "products.view_cost" : "services.view_cost";
  const canViewCost = hasPermission(costPermission);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ItemSupplierRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<RowFormState>(EMPTY_FORM);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RowFormState>(EMPTY_FORM);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [deletingRow, setDeletingRow] = useState<ItemSupplierRow | null>(null);

  const itemColumn = itemType === "product" ? "product_id" : "service_id";

  useEffect(() => {
    if (itemId && organizationId) {
      loadRows();
      loadSuppliers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, organizationId, canViewCost]);

  const loadRows = async () => {
    setLoading(true);
    // Sem products.view_cost/services.view_cost: lê-se item_suppliers_public
    // (sem purchase_price/currency/supplier_sku) em vez de item_suppliers.
    const { data, error } = canViewCost
      ? await (supabase as any)
          .from("item_suppliers")
          .select("id, supplier_id, supplier_sku, purchase_price, currency, lead_time_days, moq, is_preferred, is_active, suppliers(name)")
          .eq(itemColumn, itemId)
          .is("deleted_at", null)
          .order("is_preferred", { ascending: false })
      : await (supabase as any)
          .from("item_suppliers_public")
          .select("id, supplier_id, lead_time_days, moq, is_preferred, is_active, suppliers(name)")
          .eq(itemColumn, itemId)
          .order("is_preferred", { ascending: false });
    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    } else {
      const mapped = canViewCost
        ? ((data || []) as ItemSupplierRow[])
        : ((data || []) as any[]).map((row) => ({
            ...row,
            supplier_sku: null,
            purchase_price: null,
            currency: "",
          })) as ItemSupplierRow[];
      setRows(mapped);
    }
    setLoading(false);
  };

  const loadSuppliers = async () => {
    const { data } = await (supabase as any)
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("name");
    setSuppliers((data || []) as Supplier[]);
  };

  const availableSuppliers = suppliers.filter((s) => !rows.some((r) => r.supplier_id === s.id));

  const resolveActor = async (): Promise<string | null> => {
    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) {
      toast({ title: t('common.error'), description: "Perfil de utilizador não encontrado.", variant: "destructive" });
      return null;
    }
    return businessUserId;
  };

  const handleAdd = async () => {
    if (!addForm.supplier_id) {
      toast({ title: t('common.error'), description: "Selecione um fornecedor.", variant: "destructive" });
      return;
    }
    const businessUserId = await resolveActor();
    if (!businessUserId) return;

    const { error } = await (supabase as any).from("item_suppliers").insert({
      organization_id: organizationId,
      item_type: itemType,
      [itemColumn]: itemId,
      supplier_id: addForm.supplier_id,
      supplier_sku: addForm.supplier_sku || null,
      purchase_price: addForm.purchase_price ? Number(addForm.purchase_price) : null,
      currency: addForm.currency,
      lead_time_days: addForm.lead_time_days ? Number(addForm.lead_time_days) : null,
      moq: addForm.moq ? Number(addForm.moq) : null,
      is_preferred: rows.length === 0, // primeiro fornecedor do artigo é preferencial por omissão
      is_active: addForm.is_active,
      created_by: businessUserId,
    });

    if (error) {
      toast({ title: "Erro ao adicionar fornecedor", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fornecedor adicionado" });
    setIsAdding(false);
    setAddForm(EMPTY_FORM);
    await loadRows();
    onChanged?.();
  };

  const startEdit = (row: ItemSupplierRow) => {
    setEditingRowId(row.id);
    setEditForm({
      supplier_id: row.supplier_id,
      supplier_sku: row.supplier_sku || "",
      purchase_price: row.purchase_price != null ? String(row.purchase_price) : "",
      currency: row.currency || "EUR",
      lead_time_days: row.lead_time_days != null ? String(row.lead_time_days) : "",
      moq: row.moq != null ? String(row.moq) : "",
      is_active: row.is_active,
    });
  };

  const handleSaveEdit = async (rowId: string) => {
    setSavingRowId(rowId);
    // Sem canViewCost, o formulário nunca mostrou o valor real de
    // supplier_sku/purchase_price/currency (foram lidos como null/"" de
    // item_suppliers_public) — omitir estes campos do payload evita apagar
    // o valor real na BD com o estado em branco do formulário.
    const { error } = await (supabase as any)
      .from("item_suppliers")
      .update({
        ...(canViewCost
          ? {
              supplier_sku: editForm.supplier_sku || null,
              purchase_price: editForm.purchase_price ? Number(editForm.purchase_price) : null,
              currency: editForm.currency,
            }
          : {}),
        lead_time_days: editForm.lead_time_days ? Number(editForm.lead_time_days) : null,
        moq: editForm.moq ? Number(editForm.moq) : null,
        is_active: editForm.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId);
    setSavingRowId(null);

    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
      return;
    }
    setEditingRowId(null);
    await loadRows();
    onChanged?.();
  };

  // Marcar como preferencial exige 2 passos do lado do cliente: a trigger
  // trg_item_suppliers_preferred_guard rejeita is_preferred=true enquanto já
  // existir outra linha preferencial ativa para o mesmo artigo (por
  // desenho — não há RPC dedicado para isto, ver migration da Fase 1).
  const handleTogglePreferred = async (row: ItemSupplierRow) => {
    if (row.is_preferred) return; // já é a preferencial, nada a fazer
    setSavingRowId(row.id);
    try {
      const currentPreferred = rows.find((r) => r.is_preferred && r.id !== row.id);
      if (currentPreferred) {
        const { error: unsetError } = await (supabase as any)
          .from("item_suppliers")
          .update({ is_preferred: false })
          .eq("id", currentPreferred.id);
        if (unsetError) throw unsetError;
      }
      const { error: setError } = await (supabase as any)
        .from("item_suppliers")
        .update({ is_preferred: true })
        .eq("id", row.id);
      if (setError) throw setError;

      await loadRows();
      onChanged?.();
    } catch (error: any) {
      toast({ title: "Erro ao definir fornecedor preferencial", description: error.message, variant: "destructive" });
    } finally {
      setSavingRowId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingRow) return;
    const { error } = await supabase.rpc("rpc_delete_item_supplier", { p_id: deletingRow.id });
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fornecedor removido" });
    setDeletingRow(null);
    await loadRows();
    onChanged?.();
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Código de compra</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Prazo (dias)</TableHead>
              <TableHead>MOQ</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isAdding && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  Nenhum fornecedor associado a este artigo.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={savingRowId === row.id}
                    onClick={() => handleTogglePreferred(row)}
                    title={row.is_preferred ? "Fornecedor preferencial" : "Marcar como preferencial"}
                  >
                    <Star className={cn("w-4 h-4", row.is_preferred ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                  </Button>
                </TableCell>
                {editingRowId === row.id ? (
                  <>
                    <TableCell className="font-medium">{row.suppliers?.name || "-"}</TableCell>
                    <TableCell>
                      {canViewCost ? (
                        <Input value={editForm.supplier_sku} onChange={(e) => setEditForm({ ...editForm, supplier_sku: e.target.value })} className="h-8 w-32" />
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sem permissão</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canViewCost ? (
                        <Input type="number" step="0.01" value={editForm.purchase_price} onChange={(e) => setEditForm({ ...editForm, purchase_price: e.target.value })} className="h-8 w-24" />
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sem permissão</span>
                      )}
                    </TableCell>
                    <TableCell><Input type="number" value={editForm.lead_time_days} onChange={(e) => setEditForm({ ...editForm, lead_time_days: e.target.value })} className="h-8 w-20" /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={editForm.moq} onChange={(e) => setEditForm({ ...editForm, moq: e.target.value })} className="h-8 w-20" /></TableCell>
                    <TableCell>
                      <input type="checkbox" checked={editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={savingRowId === row.id} onClick={() => handleSaveEdit(row.id)}>
                          {savingRowId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-600" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRowId(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-medium">{row.suppliers?.name || "-"}</TableCell>
                    <TableCell>{canViewCost ? (row.supplier_sku || "-") : <span className="text-muted-foreground italic">Sem permissão</span>}</TableCell>
                    <TableCell>{canViewCost ? (row.purchase_price != null ? `${row.purchase_price} ${row.currency}` : "-") : <span className="text-muted-foreground italic">Sem permissão</span>}</TableCell>
                    <TableCell>{row.lead_time_days ?? "-"}</TableCell>
                    <TableCell>{row.moq ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Sim" : "Não"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(row)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingRow(row)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {isAdding && (
              <TableRow>
                <TableCell></TableCell>
                <TableCell>
                  <Select value={addForm.supplier_id} onValueChange={(v) => setAddForm({ ...addForm, supplier_id: v })}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Fornecedor..." /></SelectTrigger>
                    <SelectContent>
                      {availableSuppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {canViewCost ? (
                    <Input value={addForm.supplier_sku} onChange={(e) => setAddForm({ ...addForm, supplier_sku: e.target.value })} className="h-8 w-32" placeholder="Código" />
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sem permissão</span>
                  )}
                </TableCell>
                <TableCell>
                  {canViewCost ? (
                    <Input type="number" step="0.01" value={addForm.purchase_price} onChange={(e) => setAddForm({ ...addForm, purchase_price: e.target.value })} className="h-8 w-24" placeholder="0.00" />
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sem permissão</span>
                  )}
                </TableCell>
                <TableCell><Input type="number" value={addForm.lead_time_days} onChange={(e) => setAddForm({ ...addForm, lead_time_days: e.target.value })} className="h-8 w-20" /></TableCell>
                <TableCell><Input type="number" step="0.01" value={addForm.moq} onChange={(e) => setAddForm({ ...addForm, moq: e.target.value })} className="h-8 w-20" /></TableCell>
                <TableCell>
                  <input type="checkbox" checked={addForm.is_active} onChange={(e) => setAddForm({ ...addForm, is_active: e.target.checked })} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAdd}>
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setIsAdding(false); setAddForm(EMPTY_FORM); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {!isAdding && (
        <Button
          variant="outline" size="sm"
          onClick={() => setIsAdding(true)}
          disabled={availableSuppliers.length === 0}
        >
          <Plus className="w-4 h-4 mr-1" /> Adicionar fornecedor
        </Button>
      )}
      {!isAdding && availableSuppliers.length === 0 && suppliers.length > 0 && (
        <p className="text-xs text-muted-foreground">Todos os fornecedores da organização já estão associados a este artigo.</p>
      )}

      <AlertDialog open={!!deletingRow} onOpenChange={(v) => { if (!v) setDeletingRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fornecedor "{deletingRow?.suppliers?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A associação a este artigo é removida. O histórico de preços fica preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
