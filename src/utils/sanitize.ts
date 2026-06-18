import DOMPurify from "dompurify";

/**
 * Sanitizes a field value by stripping HTML tags.
 * Defense-in-depth against XSS in user-submitted form data.
 */
export function sanitizeFieldValue(value: unknown): string {
  if (value == null || value === '') return '';
  return String(value).replace(/<[^>]*>/g, '');
}

const RICH_TEXT_ALLOWED_TAGS = [
  "a", "b", "br", "div", "em", "font", "i", "li", "ol", "p", "span", "strong", "sub", "sup", "u", "ul",
  // Tables (used by contract editor — manual tables and data-bound chips)
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col", "caption",
  "h1", "h2", "h3", "h4", "h5", "h6",
];

const RICH_TEXT_ALLOWED_ATTR = [
  "class", "style", "href", "target", "rel", "title", "contenteditable",
  // <font> attrs produced by document.execCommand("fontName"/"fontSize"/"foreColor")
  "face", "size", "color",
  // Table attrs
  "colspan", "rowspan", "align", "valign", "width", "height", "border", "cellpadding", "cellspacing", "scope",
  // Data attrs used by contract data-table chips and manual-table marker
  "data-contract-table", "data-config", "data-contract-manual-table", "data-manual-table-id", "data-manual-table-name",
  // Data attrs used by contract formula chips (Corte 2C)
  "data-contract-formula", "data-op", "data-value", "data-format", "data-label", "data-contract-formula-label",
];

export function sanitizeRichHtml(html: unknown): string {
  if (html == null) return "";
  return DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
    ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select"],
    ALLOW_DATA_ATTR: false,
  });
}

export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeExternalUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, window.location.origin);
    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}
