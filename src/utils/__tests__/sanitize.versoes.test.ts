import DOMPurify from "dompurify";
import { describe, expect, it } from "vitest";
import { sanitizeRichHtml } from "../sanitize";

// As marcas das versões de idioma e das assinaturas têm de chegar inteiras ao documento: o editor guarda o corpo
// por sanitizeRichHtml, o portal e o resolver passam-no pelo DOMPurify por omissão. Só classes e style: data-* corta-se.

const MARCADO =
  `<div class="olv-versao olv-versao-pt"><p>um</p></div>` +
  `<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always"><p>two</p>` +
  `<div class="olv-assinaturas"><div class="olv-assinatura-empresa"><p>E</p></div><div class="olv-assinatura-cliente"><p>C</p></div></div></div>`;

const CLASSES = ["olv-versao", "olv-versao-pt", "olv-versao-en", "olv-assinaturas", "olv-assinatura-empresa", "olv-assinatura-cliente"];

function classesDe(html: string): string[] {
  const t = document.createElement("template");
  t.innerHTML = html;
  return Array.from(t.content.querySelectorAll("[class]")).flatMap((e) => Array.from(e.classList));
}

describe.each([
  ["sanitizeRichHtml (editor)", (html: string) => sanitizeRichHtml(html)],
  ["DOMPurify por omissão (portal e PDF)", (html: string) => DOMPurify.sanitize(html)],
])("%s", (_nome, sanitizar) => {
  it("as classes das versões e das assinaturas sobrevivem", () => {
    const saida = classesDe(sanitizar(MARCADO));
    for (const classe of CLASSES) expect(saida, classe).toContain(classe);
  });

  it("o style da quebra de página sobrevive", () => {
    const saida = sanitizar(MARCADO);
    expect(saida).toContain("break-before:page");
    expect(saida).toContain("page-break-before:always");
  });

  it("não deixa passar scripts nem handlers", () => {
    const saida = sanitizar(`<div class="olv-versao olv-versao-en" onclick="x()"><script>alert(1)</script><p>x</p></div>`);
    expect(saida).not.toContain("script");
    expect(saida).not.toContain("onclick");
  });
});

describe("sanitizeRichHtml corta os data-* (as marcas são só classes)", () => {
  it("data-versao e data-class não passam, a classe sim", () => {
    const saida = sanitizeRichHtml(`<div class="olv-versao olv-versao-en" data-versao="en" data-class="olv-versao"><p>x</p></div>`);
    expect(saida).not.toContain("data-versao");
    expect(saida).not.toContain("data-class");
    expect(saida).toContain("olv-versao-en");
  });
});
