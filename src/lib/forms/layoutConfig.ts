/**
 * Layout configuration helpers for the public form (`PublicLeadForm`).
 *
 * Goal: allow per-form overrides for paddings/gaps and an iframe "flush"
 * mode without ever changing the visual baseline of forms that don't use
 * the new `layout_config` JSON column on `form_branding`.
 *
 * Resolution priority (per value):
 *   1. `layout_config.<group>.<field>` (manual override, only when truthy/non-empty)
 *   2. density preset (`compact` / `spacious`); `comfortable` returns no overrides
 *   3. legacy granular column on `branding` (`step_padding`, `input_padding`, ...)
 *   4. hardcoded default that matches today's visual
 *
 * If `layout_config` is missing/`{}`/partial, the resolved object equals the
 * current behaviour exactly.
 */

export type LayoutDensity = "compact" | "comfortable" | "spacious" | "custom";

export interface LayoutConfig {
  density: LayoutDensity;
  iframe: { flush?: boolean; outerPadding?: string };
  container: { outerPadding?: string };
  step: { padding?: string };
  fields: { groupGap?: string; itemGap?: string };
  inputs: { padding?: string };
  options: {
    groupGap?: string;
    cardPadding?: string;
    radioPadding?: string;
    checkboxPadding?: string;
    buttonPadding?: string;
  };
  buttons: { navPadding?: string };
}

export interface ResolvedLayout {
  useFlushEmbed: boolean;
  iframe: { outerPadding: string };
  container: { outerPadding: string };
  step: { padding: string };
  fields: { groupGap: string; itemGap: string };
  inputs: { padding: string };
  options: {
    groupGap: string;
    cardPadding: string;
    radioPadding: string;
    checkboxPadding: string;
    buttonPadding: string;
  };
  buttons: { navPadding: string };
}

/** Hardcoded defaults — must match today's visual exactly. */
const DEFAULTS = {
  step: { padding: "32px" },
  fields: { groupGap: "24px", itemGap: "16px" },
  inputs: { padding: "12px 14px" },
  options: {
    groupGap: "12px",
    cardPadding: "24px 16px",
    radioPadding: "14px 16px",
    checkboxPadding: "14px 16px",
    buttonPadding: "14px",
  },
  buttons: { navPadding: "14px 24px" },
} as const;

type PresetMap = Partial<{
  step: Partial<{ padding: string }>;
  fields: Partial<{ groupGap: string; itemGap: string }>;
  inputs: Partial<{ padding: string }>;
  options: Partial<{
    groupGap: string;
    cardPadding: string;
    radioPadding: string;
    checkboxPadding: string;
    buttonPadding: string;
  }>;
  buttons: Partial<{ navPadding: string }>;
}>;

const COMPACT_PRESET: PresetMap = {
  step: { padding: "20px" },
  fields: { groupGap: "16px", itemGap: "12px" },
  inputs: { padding: "10px 12px" },
  options: {
    groupGap: "8px",
    cardPadding: "16px 12px",
    radioPadding: "10px 12px",
    checkboxPadding: "10px 12px",
    buttonPadding: "10px 12px",
  },
  buttons: { navPadding: "10px 18px" },
};

const SPACIOUS_PRESET: PresetMap = {
  step: { padding: "48px" },
  fields: { groupGap: "32px", itemGap: "20px" },
  inputs: { padding: "16px 18px" },
  options: {
    groupGap: "16px",
    cardPadding: "32px 24px",
    radioPadding: "18px 20px",
    checkboxPadding: "18px 20px",
    buttonPadding: "18px 22px",
  },
  buttons: { navPadding: "18px 32px" },
};

export function getDensityPreset(density: LayoutDensity): PresetMap {
  if (density === "compact") return COMPACT_PRESET;
  if (density === "spacious") return SPACIOUS_PRESET;
  return {}; // comfortable & custom → no preset overrides
}

const DENSITIES: ReadonlyArray<LayoutDensity> = [
  "compact",
  "comfortable",
  "spacious",
  "custom",
];

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export function normalizeLayoutConfig(raw: unknown): LayoutConfig {
  const o = asObject(raw);
  const densityRaw = o.density;
  const density: LayoutDensity =
    typeof densityRaw === "string" && (DENSITIES as readonly string[]).includes(densityRaw)
      ? (densityRaw as LayoutDensity)
      : "comfortable";

  const iframe = asObject(o.iframe);
  const container = asObject(o.container);
  const step = asObject(o.step);
  const fields = asObject(o.fields);
  const inputs = asObject(o.inputs);
  const options = asObject(o.options);
  const buttons = asObject(o.buttons);

  return {
    density,
    iframe: {
      flush: iframe.flush === true,
      outerPadding: asStr(iframe.outerPadding),
    },
    container: { outerPadding: asStr(container.outerPadding) },
    step: { padding: asStr(step.padding) },
    fields: {
      groupGap: asStr(fields.groupGap),
      itemGap: asStr(fields.itemGap),
    },
    inputs: { padding: asStr(inputs.padding) },
    options: {
      groupGap: asStr(options.groupGap),
      cardPadding: asStr(options.cardPadding),
      radioPadding: asStr(options.radioPadding),
      checkboxPadding: asStr(options.checkboxPadding),
      buttonPadding: asStr(options.buttonPadding),
    },
    buttons: { navPadding: asStr(buttons.navPadding) },
  };
}

/**
 * Pick the first non-empty string, walking the priority chain.
 * Empty strings / null / undefined are treated as "no value".
 */
function pick(...candidates: Array<string | undefined | null>): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c;
  }
  return "";
}

interface ResolveOpts {
  isInIframe: boolean;
}

/**
 * Resolve the final layout values for `PublicLeadForm`.
 * `branding` is the raw branding row (may include legacy granular columns).
 */
export function resolveLayout(
  branding: any,
  { isInIframe }: ResolveOpts
): ResolvedLayout {
  const cfg = normalizeLayoutConfig(branding?.layout_config);
  const preset = getDensityPreset(cfg.density);

  const useFlushEmbed =
    isInIframe === true &&
    (cfg.iframe.flush === true || branding?.iframe_flush_embed === true);

  const step = {
    padding: pick(
      cfg.step.padding,
      preset.step?.padding,
      branding?.step_padding,
      DEFAULTS.step.padding
    ),
  };

  const fields = {
    groupGap: pick(
      cfg.fields.groupGap,
      preset.fields?.groupGap,
      DEFAULTS.fields.groupGap
    ),
    itemGap: pick(
      cfg.fields.itemGap,
      preset.fields?.itemGap,
      DEFAULTS.fields.itemGap
    ),
  };

  const inputs = {
    padding: pick(
      cfg.inputs.padding,
      preset.inputs?.padding,
      branding?.input_padding,
      DEFAULTS.inputs.padding
    ),
  };

  const options = {
    groupGap: pick(
      cfg.options.groupGap,
      preset.options?.groupGap,
      DEFAULTS.options.groupGap
    ),
    cardPadding: pick(
      cfg.options.cardPadding,
      preset.options?.cardPadding,
      branding?.card_padding,
      DEFAULTS.options.cardPadding
    ),
    radioPadding: pick(
      cfg.options.radioPadding,
      preset.options?.radioPadding,
      branding?.radio_padding,
      DEFAULTS.options.radioPadding
    ),
    checkboxPadding: pick(
      cfg.options.checkboxPadding,
      preset.options?.checkboxPadding,
      branding?.checkbox_padding,
      DEFAULTS.options.checkboxPadding
    ),
    buttonPadding: pick(
      cfg.options.buttonPadding,
      preset.options?.buttonPadding,
      branding?.button_option_padding,
      DEFAULTS.options.buttonPadding
    ),
  };

  const buttons = {
    navPadding: pick(
      cfg.buttons.navPadding,
      preset.buttons?.navPadding,
      branding?.nav_button_padding,
      DEFAULTS.buttons.navPadding
    ),
  };

  return {
    useFlushEmbed,
    iframe: { outerPadding: cfg.iframe.outerPadding ?? "" },
    container: { outerPadding: cfg.container.outerPadding ?? "" },
    step,
    fields,
    inputs,
    options,
    buttons,
  };
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  density: "comfortable",
  iframe: {},
  container: {},
  step: {},
  fields: {},
  inputs: {},
  options: {},
  buttons: {},
};
