// Marketing channel resolver. Fail-soft: never throws, returns null on any error.
// Filters channels strictly by campaign_id and is_active=true.

type Tracking = Record<string, any> | null | undefined;

interface ChannelRow {
  id: string;
  type: string | null;
  name: string | null;
}

interface MappingRow {
  id: string;
  created_at: string | null;
  channel_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  match_priority: number | null;
}

const norm = (v: unknown): string =>
  v == null ? "" : String(v).trim().toLowerCase();

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

const findByTypes = (channels: ChannelRow[], types: string[]): string | null => {
  const wanted = new Set(types.map((t) => t.toLowerCase()));
  const hit = channels.find((c) => wanted.has((c.type ?? "").toLowerCase()));
  return hit?.id ?? null;
};

export async function resolveChannel(args: {
  supabase: any;
  campaignId: string;
  tracking: Tracking;
}): Promise<string | null> {
  const { supabase, campaignId, tracking } = args;
  try {
    if (!campaignId) return null;

    // Load active channels for this campaign once and reuse.
    const { data: chData } = await supabase
      .from("channels")
      .select("id, type, name")
      .eq("campaign_id", campaignId)
      .eq("is_active", true);
    const channels: ChannelRow[] = chData ?? [];
    if (channels.length === 0) return null;

    const src = norm(tracking?.utm_source);
    const med = norm(tracking?.utm_medium);
    const cmp = norm(tracking?.utm_campaign);
    const gclid = tracking?.gclid;
    const fbclid = tracking?.fbclid;
    const msclkid = tracking?.msclkid;

    // 1-3. Click ids
    if (gclid) {
      const id = findByTypes(channels, ["google_ads", "google", "googleads"]);
      if (id) return id;
    }
    if (fbclid) {
      const id = findByTypes(channels, ["meta", "facebook", "instagram", "fb", "ig"]);
      if (id) return id;
    }
    if (msclkid) {
      const id = findByTypes(channels, ["bing", "microsoft_ads", "microsoft"]);
      if (id) return id;
    }

    // 4. channel_utm_mappings (NULL = wildcard, scoring in TS)
    const channelIds = new Set(channels.map((c) => c.id));
    const { data: mapData } = await supabase
      .from("channel_utm_mappings")
      .select("id, created_at, channel_id, utm_source, utm_medium, utm_campaign, match_priority")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("match_priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const mappings: MappingRow[] = mapData ?? [];

    const scored = mappings
      .filter((m) => channelIds.has(m.channel_id))
      .filter((m) => {
        const s = norm(m.utm_source);
        const me = norm(m.utm_medium);
        const c = norm(m.utm_campaign);
        return (
          (!s || s === src) &&
          (!me || me === med) &&
          (!c || c === cmp)
        );
      })
      .map((m) => ({
        m,
        specificity:
          (m.utm_source ? 1 : 0) +
          (m.utm_medium ? 1 : 0) +
          (m.utm_campaign ? 1 : 0),
      }))
      .sort((a, b) => {
        // AUDIT 03 #5: deterministic order
        // specificity DESC → match_priority ASC → created_at ASC → id ASC
        if (b.specificity !== a.specificity) return b.specificity - a.specificity;
        const pa = a.m.match_priority ?? 100;
        const pb = b.m.match_priority ?? 100;
        if (pa !== pb) return pa - pb;
        const ca = a.m.created_at ?? "";
        const cb = b.m.created_at ?? "";
        if (ca !== cb) return ca < cb ? -1 : 1;
        return a.m.id < b.m.id ? -1 : 1;
      });
    if (scored[0]) return scored[0].m.channel_id;

    // 5. Aliases por utm_source
    if (src && ALIAS_MAP[src]) {
      const id = findByTypes(channels, ALIAS_MAP[src]);
      if (id) return id;
    }

    // 6. Fallback: type='direct' OR name ILIKE '%default%'
    const fb = channels.find(
      (c) =>
        (c.type ?? "").toLowerCase() === "direct" ||
        (c.name ?? "").toLowerCase().includes("default"),
    );
    return fb?.id ?? null;
  } catch (e) {
    console.error("[resolveChannel] non-fatal", e);
    return null;
  }
}
