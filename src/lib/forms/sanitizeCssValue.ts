/**
 * Sanitizes user-configurable "branding" values before interpolating them
 * into a raw CSS string (e.g. a `<style dangerouslySetInnerHTML>` block).
 *
 * These values come from `form_branding` / campaign configuration and are
 * editable by anyone with campaign-admin access, then rendered on public,
 * unauthenticated pages (`PublicLeadForm`, `CampaignFormPreview`). Without
 * strict validation, a malicious or malformed value could break out of its
 * intended CSS declaration and inject arbitrary rules (CSS injection),
 * exfiltrate data via `url()`/attribute selectors, or corrupt the page layout.
 *
 * Each `type` uses a narrow whitelist. Any value that doesn't match falls
 * back to a safe default — this only blocks/normalizes malicious or
 * malformed input; valid values pass through unchanged.
 */

export type CSSValueType = 'color' | 'font' | 'size' | 'padding' | 'shadow' | 'generic';

const SAFE_COLOR_DEFAULT = '#85D3BE';
const SAFE_SIZE_DEFAULT = '0';
const SAFE_PADDING_DEFAULT = '0';
const SAFE_FONT_DEFAULT = 'inherit';
const SAFE_SHADOW_DEFAULT = 'none';
const SAFE_GENERIC_DEFAULT = '';

const CSS_BREAKOUT_CHARS = /[<>"';{}\\]/;
const SAFE_NAMED_COLORS = new Set(['transparent', 'white', 'black', 'inherit', 'currentColor']);
const SAFE_SIZE_UNIT = '(px|rem|em|%|vh|vw)';

function defaultFor(type: CSSValueType): string {
  switch (type) {
    case 'color':
      return SAFE_COLOR_DEFAULT;
    case 'size':
      return SAFE_SIZE_DEFAULT;
    case 'padding':
      return SAFE_PADDING_DEFAULT;
    case 'font':
      return SAFE_FONT_DEFAULT;
    case 'shadow':
      return SAFE_SHADOW_DEFAULT;
    default:
      return SAFE_GENERIC_DEFAULT;
  }
}

function sanitizeColor(trimmed: string): string {
  // Hex shorthand (#RGB) or full (#RRGGBB) — case-insensitive.
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed) || /^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed;
  }
  // rgb() — digits and commas only inside, no expressions.
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(trimmed)) {
    return trimmed;
  }
  // rgba() — digits, commas and a decimal opacity only.
  if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/.test(trimmed)) {
    return trimmed;
  }
  // Small set of safe CSS named colours.
  if (SAFE_NAMED_COLORS.has(trimmed.toLowerCase())) {
    return trimmed;
  }
  return SAFE_COLOR_DEFAULT;
}

function sanitizeFont(trimmed: string): string {
  // Block any character that could break out of a CSS string context.
  if (CSS_BREAKOUT_CHARS.test(trimmed)) {
    return SAFE_FONT_DEFAULT;
  }
  // Allow only word characters, whitespace, commas and hyphens (font stacks).
  if (/^[\w\s,-]+$/.test(trimmed) && trimmed.length <= 200) {
    return trimmed;
  }
  return SAFE_FONT_DEFAULT;
}

function sanitizeSize(trimmed: string): string {
  // A single number optionally followed by a safe CSS unit.
  if (new RegExp(`^\\d+(\\.\\d+)?${SAFE_SIZE_UNIT}?$`).test(trimmed)) {
    return trimmed;
  }
  return SAFE_SIZE_DEFAULT;
}

function sanitizePadding(trimmed: string): string {
  // CSS shorthand: 1 to 4 space-separated size tokens (e.g. "14px 16px").
  const tokenPattern = `\\d+(?:\\.\\d+)?${SAFE_SIZE_UNIT}?`;
  const shorthandPattern = new RegExp(`^${tokenPattern}(?:\\s+${tokenPattern}){0,3}$`);
  if (shorthandPattern.test(trimmed)) {
    return trimmed;
  }
  return SAFE_PADDING_DEFAULT;
}

function sanitizeShadow(trimmed: string): string {
  if (trimmed.toLowerCase() === 'none') {
    return 'none';
  }
  if (CSS_BREAKOUT_CHARS.test(trimmed)) {
    return SAFE_SHADOW_DEFAULT;
  }
  // box-shadow shorthand: numbers/units, optional "inset", rgb()/rgba()/hex
  // colors, commas (multiple shadows) and whitespace only.
  const safeShadowPattern = /^[\d.,%\s()a-zA-Z#/-]+$/;
  if (!safeShadowPattern.test(trimmed) || trimmed.length > 200) {
    return SAFE_SHADOW_DEFAULT;
  }
  const allowedWords = new Set(['inset', 'none', 'rgb', 'rgba', 'px', 'rem', 'em']);
  const words = trimmed.match(/[a-zA-Z]+/g) || [];
  const hasUnknownWord = words.some((word) => !allowedWords.has(word.toLowerCase()));
  if (hasUnknownWord) {
    return SAFE_SHADOW_DEFAULT;
  }
  return trimmed;
}

function sanitizeGeneric(trimmed: string): string {
  if (CSS_BREAKOUT_CHARS.test(trimmed)) {
    return SAFE_GENERIC_DEFAULT;
  }
  return trimmed;
}

/**
 * Sanitizes an admin-authored "custom CSS" blob (a full stylesheet, not a
 * single declaration value) before interpolation into a `<style>` block.
 *
 * Unlike `sanitizeCSSValue`, this is intentionally permissive about CSS
 * syntax (the whole point of this field is to let campaign owners write
 * arbitrary rules). It only strips the specific constructs that would let
 * the value escape the `<style>` element and execute as HTML/script, or
 * that are never legitimate inside plain CSS:
 *   - Any `</style` closing-tag sequence (breaks out of the style element).
 *   - `<script` tags.
 *   - `@import` (can be used to load and execute remote, attacker-controlled
 *     stylesheets/behaviors).
 *   - `javascript:`/`vbscript:` URLs.
 *   - HTML comment terminators that some browsers still parse in this
 *     context (`-->`).
 */
export function sanitizeCustomCss(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/<\/\s*style/gi, '')
    .replace(/<\s*script/gi, '')
    .replace(/@import/gi, '')
    .replace(/(javascript|vbscript):/gi, '')
    .replace(/-->/g, '');
}

/**
 * Sanitizes a CSS value before interpolation into a `<style>` block.
 * Uses strict whitelists to prevent CSS injection / XSS breakout.
 */
export function sanitizeCSSValue(value: unknown, type: CSSValueType): string {
  if (typeof value !== 'string') {
    return defaultFor(type);
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return defaultFor(type);
  }

  switch (type) {
    case 'color':
      return sanitizeColor(trimmed);
    case 'font':
      return sanitizeFont(trimmed);
    case 'size':
      return sanitizeSize(trimmed);
    case 'padding':
      return sanitizePadding(trimmed);
    case 'shadow':
      return sanitizeShadow(trimmed);
    default:
      return sanitizeGeneric(trimmed);
  }
}
