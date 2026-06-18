import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface Props { channel: any }

export function ChannelSettingsTab({ channel }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(channel.name ?? "");
  const [description, setDescription] = useState(channel.description ?? "");
  const [isActive, setIsActive] = useState(!!channel.is_active);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("channels")
        .update({ name, description: description || null, is_active: isActive })
        .eq("id", channel.id);
      if (error) throw error;
      toast({ title: "Canal atualizado" });
      qc.invalidateQueries({ queryKey: ["channel-dashboard", channel.id] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Settings</CardTitle></CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>Ativo</Label>
        </div>
        <Button onClick={handleSave} disabled={saving}>{saving ? "A guardar…" : "Guardar"}</Button>
      </CardContent>
    </Card>
  );
}
