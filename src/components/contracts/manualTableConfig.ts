/**
 * Utilities to list and restyle user-inserted manual tables inside a
 * contract template body_html. Each manual table is marked with
 * `data-contract-manual-table="true"` and carries a stable `data-manual-table-id`.
 *
 * The "Layout da Minuta" panel uses these to render a per-table
 * config block (name + colors) similar to "Lista de Artigos".
 */

export interface ManualTableInfo {
  id: string;
  name: string;
  headerBg: string;
  headerText: string;
  borderColor: string;
}

const DEFAULTS: Omit<ManualTableInfo, "id" | "name"> = {
  headerBg: "#f3f4f6",
  headerText: "#111827",
  borderColor: "#d1d5db",
};

function readAttr(html: string, attr: string): string | null {
  const m = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, "i").exec(html);
  return m ? m[1] : null;
}

function readCss(style: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(style);
  return m ? m[1].trim() : null;
}

function readBorderColor(style: string): string | null {
  const direct = readCss(style, "border-color");
  if (direct) return direct;
  const border = readCss(style, "border");
  if (border) {
    const parts = border.trim().split(/\s+/);
    if (parts.length >= 3) return parts.slice(2).join(" ");
  }
  return null;
}

export function parseManualTables(html: string): ManualTableInfo[] {
  if (!html) return [];
  const tableRe = /<table\b([^>]*)\bdata-contract-manual-table\s*=\s*"true"([^>]*)>([\s\S]*?)<\/table>/gi;
  const out: ManualTableInfo[] = [];
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(html)) !== null) {
    const allAttrs = `${m[1]} ${m[2]}`;
    const id = readAttr(allAttrs, "data-manual-table-id") || "";
    if (!id) continue;
    const name = (readAttr(allAttrs, "data-manual-table-name") || "Tabela")
      .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

    const inner = m[3];
    const firstTh = /<th\b[^>]*\bstyle\s*=\s*"([^"]*)"[^>]*>/i.exec(inner);
    const firstTd = /<td\b[^>]*\bstyle\s*=\s*"([^"]*)"[^>]*>/i.exec(inner);

    let headerBg = DEFAULTS.headerBg;
    let headerText = DEFAULTS.headerText;
    let borderColor = DEFAULTS.borderColor;

    if (firstTh) {
      const s = firstTh[1];
      headerBg = readCss(s, "background-color") || readCss(s, "background") || headerBg;
      headerText = readCss(s, "color") || headerText;
      borderColor = readBorderColor(s) || borderColor;
    }
    if (firstTd) {
      borderColor = readBorderColor(firstTd[1]) || borderColor;
    }

    out.push({ id, name, headerBg, headerText, borderColor });
  }
  return out;
}

function upsertCss(style: string, prop: string, value: string): string {
  const re = new RegExp(`(^|;)\\s*${prop}\\s*:\\s*[^;]*`, "i");
  if (re.test(style)) return style.replace(re, (_m, p1) => `${p1}${prop}:${value}`);
  return style ? `${style.replace(/;?\s*$/, "")};${prop}:${value}` : `${prop}:${value}`;
}

function rewriteBorderColor(style: string, color: string): string {
  let out = style.replace(/\bborder\s*:\s*([^;]+)/gi, (_m, val) => {
    const parts = String(val).trim().split(/\s+/);
    if (parts.length >= 3) {
      parts[2] = color;
      return `border:${parts.join(" ")}`;
    }
    return `border:${val}`;
  });
  out = out.replace(/\bborder-color\s*:\s*[^;]+/gi, `border-color:${color}`);
  return out;
}

export function updateManualTable(
  html: string,
  id: string,
  patch: Partial<Omit<ManualTableInfo, "id">>,
): string {
  if (!html || !id) return html;
  const tableRe = /<table\b[^>]*\bdata-contract-manual-table\s*=\s*"true"[^>]*>[\s\S]*?<\/table>/gi;

  return html.replace(tableRe, (tableHtml) => {
    const tableId = readAttr(tableHtml, "data-manual-table-id");
    if (tableId !== id) return tableHtml;

    let out = tableHtml;

    if (patch.name !== undefined) {
      const safe = patch.name.replace(/"/g, "&quot;");
      if (/\bdata-manual-table-name\s*=\s*"[^"]*"/i.test(out)) {
        out = out.replace(/\bdata-manual-table-name\s*=\s*"[^"]*"/i, `data-manual-table-name="${safe}"`);
      } else {
        out = out.replace(/<table\b/i, `<table data-manual-table-name="${safe}"`);
      }
    }

    const rewriteCell = (tag: "th" | "td") => {
      const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
      out = out.replace(re, (_m, attrs) => {
        let style = (attrs.match(/\bstyle\s*=\s*"([^"]*)"/i)?.[1] || "");
        if (tag === "th") {
          if (patch.headerBg !== undefined) style = upsertCss(style, "background-color", patch.headerBg);
          if (patch.headerText !== undefined) style = upsertCss(style, "color", patch.headerText);
        }
        if (patch.borderColor !== undefined) style = rewriteBorderColor(style, patch.borderColor);
        const cleaned = String(attrs).replace(/\sstyle\s*=\s*"[^"]*"/i, "");
        return `<${tag}${cleaned} style="${style}">`;
      });
    };
    rewriteCell("th");
    rewriteCell("td");

    return out;
  });
}
