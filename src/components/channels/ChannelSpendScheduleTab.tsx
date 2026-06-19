import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

interface Props {
  channelId: string;
  range?: { from: string; to: string };
  activeSpend?: number;
}

const EMPTY = {
  id: null as string | null,
  amount: "",
  currency: "EUR",
  entry_type: "one_time" as "one_time" | "recurring",
  interval_count: "",
  interval_unit: "month" as "day" | "week" | "month",
  starts_on: new Date().toISOString().slice(0, 10),
  ends_on: "",
  notes: "",
};

const fmtCur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(n));

export function ChannelSpendScheduleTab({ channelId, range, activeSpend }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("channels.create");
  const canEdit = hasPermission("channels.edit");
  const canDelete = hasPermission("channels.delete");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["channel-spend-entries", channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_spend_entries" as any)
        .select("*")
        .eq("channel_id", channelId)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const summary = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      openRecurring: list.filter((e: any) => e.entry_type === "recurring" && !e.ends_on).length,
    };
  }, [data]);

  const reset = () => setForm(EMPTY);
  const openCreate = () => { reset(); setOpen(true); };
  const openEdit = (e: any) => {
    setForm({
      id: e.id,
      amount: String(e.amount ?? ""),
      currency: e.currency ?? "EUR",
      entry_type: e.entry_type,
      interval_count: e.interval_count ? String(e.interval_count) : "",
      interval_unit: e.interval_unit ?? "month",
      starts_on: e.starts_on,
      ends_on: e.ends_on ?? "",
      notes: e.notes ?? "",
    });
    setOpen(true);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (form.entry_type === "recurring" && form.ends_on && form.ends_on < form.starts_on) {
      toast({ title: "Datas inválidas", description: "A data de fim tem de ser igual ou posterior ao início.", variant: "destructive" });
      return;
    }
    const payload: any = {
      channel_id: channelId,
      amount: parseFloat(form.amount) || 0,
      currency: form.currency,
      entry_type: form.entry_type,
      interval_count: form.entry_type === "recurring" ? parseInt(form.interval_count) || 1 : null,
      interval_unit: form.entry_type === "recurring" ? form.interval_unit : null,
      starts_on: form.starts_on,
      ends_on: form.entry_type === "recurring" && form.ends_on ? form.ends_on : null,
      notes: form.notes || null,
      source: "manual",
    };
    try {
      if (form.id) {
        const { error } = await supabase.from("channel_spend_entries" as any).update(payload).eq("id", form.id);
        if (error) throw error;
        toast({ title: "Entrada atualizada" });
      } else {
        const { error } = await supabase.from("channel_spend_entries" as any).insert(payload);
        if (error) throw error;
        toast({ title: "Entrada criada" });
      }
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["channel-spend-entries", channelId] });
      qc.invalidateQueries({ queryKey: ["channel-dashboard", channelId] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar esta entrada?")) return;
    const { error } = await supabase.from("channel_spend_entries" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Entrada eliminada" });
    qc.invalidateQueries({ queryKey: ["channel-spend-entries", channelId] });
    qc.invalidateQueries({ queryKey: ["channel-dashboard", channelId] });
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Summary */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">
              Spend ativo no intervalo
              {range && <span className="ml-1">({range.from} → {range.to})</span>}
            </div>
            <div className="text-lg font-semibold mt-1">{fmtCur(activeSpend)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Nº de entradas</div>
            <div className="text-lg font-semibold mt-1">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Recorrentes abertas</div>
            <div className="text-lg font-semibold mt-1">{summary.openRecurring}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Plano de investimento do canal. Suporta entradas pontuais e recorrentes (expandidas no servidor).
        </p>
        {canCreate && (
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Nova entrada</Button>
        )}
      </div>

      <Card>
        {isLoading ? (
          <CardContent className="py-12 text-center text-muted-foreground">A carregar…</CardContent>
        ) : !data || data.length === 0 ? (
          <CardContent className="py-12 text-center text-muted-foreground">
            Sem entradas de investimento definidas.
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Montante</TableHead>
                <TableHead>Cadência</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Badge variant="outline">{e.entry_type === "recurring" ? "Recorrente" : "Pontual"}</Badge>
                  </TableCell>
                  <TableCell>{fmtCur(e.amount)}</TableCell>
                  <TableCell>{e.entry_type === "recurring" ? `${e.interval_count} ${e.interval_unit}` : "—"}</TableCell>
                  <TableCell>{e.starts_on}</TableCell>
                  <TableCell>{e.ends_on ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground line-clamp-1 max-w-[260px]">{e.notes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="w-4 h-4" /></Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar entrada" : "Nova entrada"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.entry_type} onValueChange={(v: any) => setForm({ ...form, entry_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">Pontual</SelectItem>
                    <SelectItem value="recurring">Recorrente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Montante (€) *</Label>
                <Input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              {form.entry_type === "recurring" && (
                <>
                  <div className="space-y-2">
                    <Label>Intervalo *</Label>
                    <Input type="number" min="1" required value={form.interval_count} onChange={(e) => setForm({ ...form, interval_count: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade *</Label>
                    <Select value={form.interval_unit} onValueChange={(v: any) => setForm({ ...form, interval_unit: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Dia</SelectItem>
                        <SelectItem value="week">Semana</SelectItem>
                        <SelectItem value="month">Mês</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Início *</Label>
                <Input type="date" required value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
              </div>
              {form.entry_type === "recurring" && (
                <div className="space-y-2">
                  <Label>Fim (opcional)</Label>
                  <Input type="date" value={form.ends_on} min={form.starts_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">{form.id ? "Guardar" : "Criar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
