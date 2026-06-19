import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";

interface UOM {
  id: string;
  code: string;
  description: string | null;
  is_active: boolean;
  base_uom_id: string | null;
  conversion_factor: number | null;
}

interface UnitsOfMeasureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UnitsOfMeasureDialog({
  open,
  onOpenChange,
}: UnitsOfMeasureDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [units, setUnits] = useState<UOM[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ code: "", description: "", is_active: true });
  const [newUnit, setNewUnit] = useState({ code: "", description: "" });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (open) {
      loadUnits();
    }
  }, [open]);

  const loadUnits = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("uom")
      .select("*")
      .order("code");

    if (error) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      setUnits(data || []);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newUnit.code.trim()) {
      toast({
        title: t("common.error"),
        description: t("uom.codeRequired"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("uom").insert({
      code: newUnit.code.toUpperCase().trim(),
      description: newUnit.description.trim() || null,
      is_active: true,
    });

    if (error) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t("common.success"),
        description: t("uom.addedSuccess"),
      });
      setNewUnit({ code: "", description: "" });
      setShowAddForm(false);
      loadUnits();
    }
    setLoading(false);
  };

  const handleEdit = (unit: UOM) => {
    setEditingId(unit.id);
    setEditForm({
      code: unit.code,
      description: unit.description || "",
      is_active: unit.is_active,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.code.trim()) return;

    setLoading(true);
    const { error } = await supabase
      .from("uom")
      .update({
        code: editForm.code.toUpperCase().trim(),
        description: editForm.description.trim() || null,
        is_active: editForm.is_active,
      })
      .eq("id", editingId);

    if (error) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t("common.success"),
        description: t("uom.updatedSuccess"),
      });
      setEditingId(null);
      loadUnits();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("uom.confirmDelete"))) return;

    setLoading(true);
    const { error } = await supabase.from("uom").delete().eq("id", id);

    if (error) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t("common.success"),
        description: t("uom.deletedSuccess"),
      });
      loadUnits();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("uom.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add new unit form */}
          {showAddForm ? (
            <div className="flex gap-2 items-end p-3 border rounded-md bg-muted/50">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t("uom.code")}</Label>
                <Input
                  value={newUnit.code}
                  onChange={(e) => setNewUnit({ ...newUnit, code: e.target.value })}
                  placeholder="M2"
                  className="h-8"
                />
              </div>
              <div className="flex-[2] space-y-1">
                <Label className="text-xs">{t("uom.description")}</Label>
                <Input
                  value={newUnit.description}
                  onChange={(e) => setNewUnit({ ...newUnit, description: e.target.value })}
                  placeholder={t("uom.descriptionPlaceholder")}
                  className="h-8"
                />
              </div>
              <Button size="sm" onClick={handleAdd} disabled={loading}>
                <Save className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddForm(false);
                  setNewUnit({ code: "", description: "" });
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("uom.addNew")}
            </Button>
          )}

          {/* Units table */}
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">{t("uom.code")}</TableHead>
                  <TableHead>{t("uom.description")}</TableHead>
                  <TableHead className="w-[80px]">{t("common.status")}</TableHead>
                  <TableHead className="w-[80px]">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => (
                  <TableRow key={unit.id}>
                    {editingId === unit.id ? (
                      <>
                        <TableCell>
                          <Input
                            value={editForm.code}
                            onChange={(e) =>
                              setEditForm({ ...editForm, code: e.target.value })
                            }
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm({ ...editForm, description: e.target.value })
                            }
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={editForm.is_active}
                            onCheckedChange={(checked) =>
                              setEditForm({ ...editForm, is_active: checked })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={handleSaveEdit}
                              disabled={loading}
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-mono font-medium">
                          {unit.code}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {unit.description || "-"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              unit.is_active
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                            }`}
                          >
                            {unit.is_active ? t("common.active") : t("common.inactive")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleEdit(unit)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(unit.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                {units.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {t("uom.noUnits")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
