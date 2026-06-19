import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Tag } from "lucide-react";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface ContactTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  organizationId: string;
  entityName?: string;
  onTagsChanged?: () => void;
}

const TAG_COLORS = [
  { value: "blue", label: "Azul", bg: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "green", label: "Verde", bg: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  { value: "red", label: "Vermelho", bg: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  { value: "yellow", label: "Amarelo", bg: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "purple", label: "Roxo", bg: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  { value: "orange", label: "Laranja", bg: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
];

export function getTagColorClass(color: string): string {
  const found = TAG_COLORS.find(c => c.value === color);
  return found?.bg || TAG_COLORS[0].bg;
}

interface TagRecord {
  id: string;
  tag: string;
  color: string;
}

export function ContactTagsDialog({ open, onOpenChange, entityId, organizationId, entityName, onTagsChanged }: ContactTagsDialogProps) {
  const { toast } = useToast();
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && entityId) loadTags();
  }, [open, entityId]);

  const loadTags = async () => {
    const { data } = await supabase
      .from("contact_tags")
      .select("id, tag, color")
      .eq("entity_id", entityId)
      .eq("organization_id", organizationId);
    setTags((data as TagRecord[]) || []);
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    setLoading(true);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const { error } = await supabase.from("contact_tags").insert({
        entity_id: entityId,
        organization_id: organizationId,
        tag: newTag.trim(),
        color: newColor,
        created_by: businessUserId,
      } as any);
      if (error) {
        if (error.code === "23505") {
          toast({ title: "Tag já existe", variant: "destructive" });
        } else throw error;
      } else {
        setNewTag("");
        loadTags();
        onTagsChanged?.();
      }
    } catch (err: any) {
      toast({ title: "Erro ao adicionar tag", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const removeTag = async (tagId: string) => {
    await supabase.from("contact_tags").delete().eq("id", tagId);
    loadTags();
    onTagsChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags {entityName ? `— ${entityName}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem tags atribuídas.</p>
            )}
            {tags.map(t => (
              <Badge key={t.id} className={`${getTagColorClass(t.color)} gap-1`}>
                {t.tag}
                <button onClick={() => removeTag(t.id)} className="ml-1 hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              placeholder="Nova tag..."
              className="flex-1"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            />
            <Select value={newColor} onValueChange={setNewColor}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAG_COLORS.map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${c.bg.split(" ")[0]}`} />
                      {c.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" onClick={addTag} disabled={loading || !newTag.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
