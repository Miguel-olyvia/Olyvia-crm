import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, Plus, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Channel {
  id: string;
  name: string;
  type: string | null;
  is_active?: boolean;
}

interface Mapping {
  id: string;
  campaign_id: string;
  channel_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  match_priority: number | null;
  is_active: boolean;
}

interface Props {
  campaignId: string;
  channels: Channel[];
}

const ALIAS_MAP: Record<string, string[]> = {
  google: ["google_ads", "google", "googleads"],
  google_ads: ["google_ads", "google", "googleads"],
  facebook: ["meta", "facebook", "instagram", "fb", "ig"],
  meta: ["meta", "facebook", "instagram", "fb", "ig"],
  instagram: ["meta", "facebook", "instagram", "fb", "ig"],
  fb: ["meta", "facebook", "instagram", "fb", "ig"],
  ig: ["meta", "facebook", "instagram", "fb", "ig"],
  bing: ["bing", "microsoft_ads", "microsoft"],
  microsoft: ["bing", "microsoft_ads", "microsoft"],
  linkedin: ["linkedin"],
  tiktok: ["tiktok"],
  youtube: ["youtube"],
  email: ["email"],
  direct: ["direct"],
};

const norm = (v: string | null | undefined) =>
  (v ?? "").toString().trim().toLowerCase();

const findByTypes = (channels: Channel[], types: string[]): Channel | null => {
  const wanted = new Set(types.map((t) => t.toLowerCase()));
  return channels.find((c) => wanted.has((c.type ?? "").toLowerCase())) ?? null;
};

interface PreviewInput {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  gclid: string;
  fbclid: string;
  msclkid: string;
}

interface PreviewResult {
  channel: Channel | null;
  step: string;
  ambiguous?: boolean;
}

function resolvePreview(
  input: PreviewInput,
  channels: Channel[],
  mappings: Mapping[],
): PreviewResult {
  // 1-3. Click ids têm prioridade absoluta sobre as regras UTM.
  if (input.gclid) {
    const c = findByTypes(channels, ["google_ads", "google", "googleads"]);
    if (c) return { channel: c, step: "Click id (gclid → Google)" };
  }
  if (input.fbclid) {
    const c = findByTypes(channels, [
      "meta",
      "facebook",
      "instagram",
      "fb",
      "ig",
    ]);
    if (c) return { channel: c, step: "Click id (fbclid → Meta)" };
  }
  if (input.msclkid) {
    const c = findByTypes(channels, ["bing", "microsoft_ads", "microsoft"]);
    if (c) return { channel: c, step: "Click id (msclkid → Microsoft/Bing)" };
  }

  const src = norm(input.utm_source);
  const med = norm(input.utm_medium);
  const cmp = norm(input.utm_campaign);
  const channelIds = new Set(channels.map((c) => c.id));

  // 4. channel_utm_mappings — só depois dos click ids.
  const scored = mappings
    .filter((m) => m.is_active && channelIds.has(m.channel_id))
    .filter((m) => {
      const s = norm(m.utm_source);
      const me = norm(m.utm_medium);
      const c = norm(m.utm_campaign);
      return (!s || s === src) && (!me || me === med) && (!c || c === cmp);
    })
    .map((m) => ({
      m,
      specificity:
        (m.utm_source ? 1 : 0) +
        (m.utm_medium ? 1 : 0) +
        (m.utm_campaign ? 1 : 0),
    }))
    .sort((a, b) => {
      if (b.specificity !== a.specificity)
        return b.specificity - a.specificity;
      return (a.m.match_priority ?? 100) - (b.m.match_priority ?? 100);
    });

  if (scored[0]) {
    const top = scored[0];
    const ambiguous =
      scored.length > 1 &&
      scored[1].specificity === top.specificity &&
      (scored[1].m.match_priority ?? 100) === (top.m.match_priority ?? 100);
    const ch = channels.find((c) => c.id === top.m.channel_id) ?? null;
    return { channel: ch, step: "Regra UTM (mappings)", ambiguous };
  }

  // 5. Aliases por utm_source.
  if (src && ALIAS_MAP[src]) {
    const c = findByTypes(channels, ALIAS_MAP[src]);
    if (c) return { channel: c, step: `Alias por utm_source (${src})` };
  }

  // 6. Fallback direct/default.
  const fb =
    channels.find(
      (c) =>
        (c.type ?? "").toLowerCase() === "direct" ||
        (c.name ?? "").toLowerCase().includes("default"),
    ) ?? null;
  if (fb) return { channel: fb, step: "Fallback direct/default" };

  return { channel: null, step: "Sem canal resolvido" };
}

const emptyForm = {
  channel_id: "",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  match_priority: 100,
  is_active: true,
};

export function ChannelUtmMappings({ campaignId, channels }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [preview, setPreview] = useState<PreviewInput>({
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    gclid: "",
    fbclid: "",
    msclkid: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("channel_utm_mappings")
      .select(
        "id, campaign_id, channel_id, utm_source, utm_medium, utm_campaign, match_priority, is_active",
      )
      .eq("campaign_id", campaignId)
      .order("match_priority", { ascending: true });
    if (error) {
      console.error(error);
      toast({
        title: "Erro a carregar mappings",
        description: error.message,
        variant: "destructive",
      });
    }
    setMappings((data as Mapping[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (campaignId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const startEdit = (m: Mapping) => {
    setEditingId(m.id);
    setForm({
      channel_id: m.channel_id,
      utm_source: m.utm_source ?? "",
      utm_medium: m.utm_medium ?? "",
      utm_campaign: m.utm_campaign ?? "",
      match_priority: m.match_priority ?? 100,
      is_active: m.is_active,
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.channel_id) {
      toast({ title: "Escolhe um canal", variant: "destructive" });
      return;
    }
    const payload = {
      campaign_id: campaignId,
      channel_id: form.channel_id,
      utm_source: form.utm_source.trim() || null,
      utm_medium: form.utm_medium.trim() || null,
      utm_campaign: form.utm_campaign.trim() || null,
      match_priority: Number.isFinite(form.match_priority)
        ? form.match_priority
        : 100,
      is_active: form.is_active,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase
        .from("channel_utm_mappings")
        .update(payload)
        .eq("id", editingId));
    } else {
      ({ error } = await supabase
        .from("channel_utm_mappings")
        .insert(payload));
    }
    if (error) {
      toast({
        title: "Erro a gravar",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: editingId ? "Regra atualizada" : "Regra criada" });
    cancelForm();
    load();
  };

  const toggleActive = async (m: Mapping) => {
    const { error } = await supabase
      .from("channel_utm_mappings")
      .update({ is_active: !m.is_active })
      .eq("id", m.id);
    if (error) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    load();
  };

  const remove = async (m: Mapping) => {
    if (!confirm("Apagar esta regra?")) return;
    const { error } = await supabase
      .from("channel_utm_mappings")
      .delete()
      .eq("id", m.id);
    if (error) {
      toast({
        title: "Erro a apagar",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    load();
  };

  // AUDIT 03 #4: preview/dropdown only consider active channels.
  // Existing rules pointing to inactive channels stay visible (with badge), excluded from preview, never auto-modified.
  const activeChannels = channels.filter((c) => c.is_active !== false);
  const previewResult = resolvePreview(preview, activeChannels, mappings);

  // Detectar ambiguidade global (mesma especificidade + prioridade entre regras activas).
  const ambiguousGroups = (() => {
    const groups: Record<string, Mapping[]> = {};
    mappings
      .filter((m) => m.is_active)
      .forEach((m) => {
        const spec =
          (m.utm_source ? 1 : 0) +
          (m.utm_medium ? 1 : 0) +
          (m.utm_campaign ? 1 : 0);
        const key = `${spec}|${m.match_priority ?? 100}|${norm(m.utm_source)}|${norm(m.utm_medium)}|${norm(m.utm_campaign)}`;
        groups[key] = groups[key] || [];
        groups[key].push(m);
      });
    return Object.values(groups).filter((g) => g.length > 1);
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras UTM → Canal</CardTitle>
        <CardDescription>
          Define como UTMs são traduzidos em canais. Click ids (gclid, fbclid,
          msclkid) têm sempre prioridade sobre estas regras.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ambiguousGroups.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>
              {ambiguousGroups.length} grupo(s) de regras com a mesma
              especificidade e prioridade — a resolução pode ser ambígua.
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {loading ? "A carregar…" : `${mappings.length} regra(s)`}
          </div>
          <Button size="sm" onClick={startCreate} disabled={channels.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Nova regra
          </Button>
        </div>

        {showForm && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Canal</Label>
                <Select
                  value={form.channel_id}
                  onValueChange={(v) => setForm({ ...form, channel_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher canal" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeChannels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.type ? `(${c.type})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade (asc; menor = mais prioritário)</Label>
                <Input
                  type="number"
                  value={form.match_priority}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      match_priority: parseInt(e.target.value || "100", 10),
                    })
                  }
                />
              </div>
              <div>
                <Label>utm_source (vazio = wildcard)</Label>
                <Input
                  value={form.utm_source}
                  onChange={(e) =>
                    setForm({ ...form, utm_source: e.target.value })
                  }
                  placeholder="google, facebook, newsletter…"
                />
              </div>
              <div>
                <Label>utm_medium (vazio = wildcard)</Label>
                <Input
                  value={form.utm_medium}
                  onChange={(e) =>
                    setForm({ ...form, utm_medium: e.target.value })
                  }
                  placeholder="cpc, paid_social, email…"
                />
              </div>
              <div className="md:col-span-2">
                <Label>utm_campaign (vazio = wildcard)</Label>
                <Input
                  value={form.utm_campaign}
                  onChange={(e) =>
                    setForm({ ...form, utm_campaign: e.target.value })
                  }
                  placeholder="maio_2026…"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) =>
                    setForm({ ...form, is_active: v })
                  }
                />
                <Label>Activa</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelForm}>
                Cancelar
              </Button>
              <Button size="sm" onClick={save}>
                {editingId ? "Atualizar" : "Criar"}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {mappings.map((m) => {
            const ch = channels.find((c) => c.id === m.channel_id);
            const channelInactive = !!ch && ch.is_active === false;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div className="space-y-1">
                  <div className="font-medium">
                    {ch?.name ?? "(canal removido)"}{" "}
                    {ch?.type ? (
                      <span className="text-muted-foreground">({ch.type})</span>
                    ) : null}
                    {channelInactive && (
                      <Badge variant="outline" className="ml-2 border-yellow-400 text-yellow-800">
                        Canal inativo
                      </Badge>
                    )}
                    {!m.is_active && (
                      <Badge variant="secondary" className="ml-2">
                        Inactiva
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    src=<b>{m.utm_source ?? "*"}</b> · med=
                    <b>{m.utm_medium ?? "*"}</b> · camp=
                    <b>{m.utm_campaign ?? "*"}</b> · prio={m.match_priority ?? 100}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={m.is_active}
                    onCheckedChange={() => toggleActive(m)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(m)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {!loading && mappings.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Sem regras. Os click ids continuam a resolver canais por tipo.
            </div>
          )}
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="text-sm font-medium">Testar resolução</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              placeholder="utm_source"
              value={preview.utm_source}
              onChange={(e) =>
                setPreview({ ...preview, utm_source: e.target.value })
              }
            />
            <Input
              placeholder="utm_medium"
              value={preview.utm_medium}
              onChange={(e) =>
                setPreview({ ...preview, utm_medium: e.target.value })
              }
            />
            <Input
              placeholder="utm_campaign"
              value={preview.utm_campaign}
              onChange={(e) =>
                setPreview({ ...preview, utm_campaign: e.target.value })
              }
            />
            <Input
              placeholder="gclid"
              value={preview.gclid}
              onChange={(e) =>
                setPreview({ ...preview, gclid: e.target.value })
              }
            />
            <Input
              placeholder="fbclid"
              value={preview.fbclid}
              onChange={(e) =>
                setPreview({ ...preview, fbclid: e.target.value })
              }
            />
            <Input
              placeholder="msclkid"
              value={preview.msclkid}
              onChange={(e) =>
                setPreview({ ...preview, msclkid: e.target.value })
              }
            />
          </div>
          <div className="text-sm">
            Canal resolvido:{" "}
            <span className="font-medium">
              {previewResult.channel?.name ?? "—"}
            </span>{" "}
            <span className="text-muted-foreground">
              · {previewResult.step}
            </span>
            {previewResult.ambiguous && (
              <Badge
                variant="secondary"
                className="ml-2 bg-yellow-100 text-yellow-900"
              >
                Ambígua
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
