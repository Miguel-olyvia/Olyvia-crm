import { describe, expect, it } from "vitest";
import { CLAUSE_ORDINALS } from "@/utils/contractBaseTemplates";
import { injectSignatoryIntoSignatureBlock } from "@/components/contracts/contractDocument";
import { CLASSE_ASSINATURAS, CLASSE_ASSINATURA_CLIENTE, CLASSE_ASSINATURA_EMPRESA, temBlocoDeAssinatura } from "@/lib/idiomaDocumento";
import { ORDINAIS_EN, corpoTemLocalDeAssinatura, htmlBlocoAssinatura, htmlNovaClausula } from "../blocosDeInsercao";

/** O HTML que o botão «Espaço para assinatura» inseria ANTES desta mudança (EnhancedToolbarButtons.tsx). */
const ASSINATURA_PT_DE_SEMPRE = `<br/><div style="margin-top:40px;">
      <div style="display:flex;justify-content:space-between;gap:60px;">
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
          <p style="font-size:12px;"><strong>A PRIMEIRA CONTRATANTE</strong></p>
          <p style="font-size:11px;color:#666;">(Nome / Carimbo)</p>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
          <p style="font-size:12px;"><strong>O SEGUNDO CONTRATANTE</strong></p>
          <p style="font-size:11px;color:#666;">(Nome / Assinatura)</p>
        </div>
      </div>
    </div><br/>`;

const semClasses = (html: string) => html.replace(/ class="olv-[a-z-]+"/g, "");

describe("htmlBlocoAssinatura", () => {
  it("em português é o HTML de sempre (palavras, estilos e estrutura), só com as marcas de classe a mais", () => {
    expect(semClasses(htmlBlocoAssinatura("pt"))).toBe(ASSINATURA_PT_DE_SEMPRE);
  });

  it("sem idioma, ou com um idioma sem palavras próprias, usa o português", () => {
    expect(htmlBlocoAssinatura()).toBe(htmlBlocoAssinatura("pt"));
    expect(htmlBlocoAssinatura("xx")).toBe(htmlBlocoAssinatura("pt"));
  });

  it("emite as marcas: contentor, coluna da empresa e coluna do cliente", () => {
    for (const idioma of ["pt", "en"]) {
      const html = htmlBlocoAssinatura(idioma);
      expect(html).toContain(`class="${CLASSE_ASSINATURAS}"`);
      expect(html).toContain(`class="${CLASSE_ASSINATURA_EMPRESA}"`);
      expect(html).toContain(`class="${CLASSE_ASSINATURA_CLIENTE}"`);
    }
  });

  it("em inglês usa as palavras em inglês e nenhuma em português", () => {
    const html = htmlBlocoAssinatura("en");
    expect(html).toContain("<strong>THE FIRST PARTY</strong>");
    expect(html).toContain("<strong>THE SECOND PARTY</strong>");
    expect(html).toContain("(Name / Stamp)");
    expect(html).toContain("(Name / Signature)");
    expect(html).not.toMatch(/CONTRATANTE|Carimbo|Assinatura/);
  });

  it("o inglês tem a mesma estrutura e os mesmos estilos que o português", () => {
    const esqueleto = (h: string) => h.replace(/<strong>[^<]*<\/strong>/g, "<strong/>").replace(/>\([^<]*\)</g, ">()<");
    expect(esqueleto(htmlBlocoAssinatura("en"))).toBe(esqueleto(htmlBlocoAssinatura("pt")));
  });

  it("as marcas e as palavras são reconhecidas pelo detetor de assinaturas do núcleo, nos dois idiomas", () => {
    for (const idioma of ["pt", "en"]) {
      expect(temBlocoDeAssinatura(`<p>Texto</p>${htmlBlocoAssinatura(idioma)}`, idioma)).toBe(true);
    }
  });

  it("o bloco em português continua a receber o signatário como antes", () => {
    const html = injectSignatoryIntoSignatureBlock(`<p>x</p>${htmlBlocoAssinatura("pt")}`, "Ana Silva", "Gerente");
    expect(html).toContain("Ana Silva");
  });
});

describe("htmlNovaClausula", () => {
  it("em português é o HTML de sempre, com a próxima ordinal", () => {
    expect(htmlNovaClausula("pt", "<p>sem cláusulas</p>")).toBe(
      `<br/><p><strong>${CLAUSE_ORDINALS[0]} — Título da Cláusula</strong></p><p><em>(clique aqui para editar esta cláusula...)</em></p><br/>`,
    );
    const duas = "<p><strong>PRIMEIRA — Partes</strong></p><p><strong>SEGUNDA — Objeto</strong></p>";
    expect(htmlNovaClausula("pt", duas)).toContain(`<strong>${CLAUSE_ORDINALS[2]} — Título da Cláusula</strong>`);
  });

  it("português por omissão e para idiomas sem palavras próprias", () => {
    expect(htmlNovaClausula(undefined, "")).toBe(htmlNovaClausula("pt", ""));
    expect(htmlNovaClausula("xx", "")).toBe(htmlNovaClausula("pt", ""));
  });

  it("passada a lista de ordinais, usa «CLÁUSULA n» como sempre", () => {
    const muitas = Array.from({ length: CLAUSE_ORDINALS.length }, (_, i) => `<strong>${CLAUSE_ORDINALS[i]} — X</strong>`).join("");
    expect(htmlNovaClausula("pt", muitas)).toContain(`CLÁUSULA ${CLAUSE_ORDINALS.length + 1} — Título da Cláusula`);
  });

  it("em inglês usa ordinais, título e instrução em inglês e conta as cláusulas em inglês", () => {
    expect(htmlNovaClausula("en", "")).toBe(
      "<br/><p><strong>FIRST — Clause Title</strong></p><p><em>(click here to edit this clause...)</em></p><br/>",
    );
    const duas = "<p><strong>FIRST — Parties</strong></p><p><strong>SECOND — Subject matter</strong></p>";
    expect(htmlNovaClausula("en", duas)).toContain("<strong>THIRD — Clause Title</strong>");
  });

  it("em inglês, depois dos ordinais, usa «CLAUSE n»", () => {
    const muitas = ORDINAIS_EN.map((o) => `<strong>${o} — X</strong>`).join("");
    expect(htmlNovaClausula("en", muitas)).toContain(`CLAUSE ${ORDINAIS_EN.length + 1} — Clause Title`);
  });
});

describe("corpoTemLocalDeAssinatura", () => {
  it("reconhece o marcador, as marcas por classe e as frases dos idiomas registados", () => {
    expect(corpoTemLocalDeAssinatura('<div data-signatory-block="primary"></div>')).toBe(true);
    expect(corpoTemLocalDeAssinatura("<p>{{signatario_nome}}</p>")).toBe(true);
    expect(corpoTemLocalDeAssinatura('<div class="olv-assinaturas"></div>')).toBe(true);
    expect(corpoTemLocalDeAssinatura("<p>O SEGUNDO CONTRATANTE</p>")).toBe(true);
    expect(corpoTemLocalDeAssinatura("<p>THE SECOND PARTY</p>")).toBe(true);
    expect(corpoTemLocalDeAssinatura(htmlBlocoAssinatura("en"))).toBe(true);
  });

  it("falso para um corpo sem nada disso, vazio ou nulo", () => {
    expect(corpoTemLocalDeAssinatura("<p>Texto sem assinatura</p>")).toBe(false);
    expect(corpoTemLocalDeAssinatura("")).toBe(false);
    expect(corpoTemLocalDeAssinatura(null)).toBe(false);
    expect(corpoTemLocalDeAssinatura(undefined)).toBe(false);
  });
});
