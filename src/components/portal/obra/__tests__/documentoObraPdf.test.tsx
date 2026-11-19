// O conteúdo da obra nos PDFs (19/11/2026): o modelo traduzido que o PDF da proposta (react-pdf) e o PDF do contrato (HTML)
// desenham. Os mesmos blocos e as mesmas palavras do ecrã do portal; em inglês só mudam as palavras, o dinheiro é o mesmo.
import { describe, expect, it } from "vitest";
import { pdf } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { formatCurrency } from "@/lib/utils";
import { ObraPDFDocument } from "@/components/pdf/ObraPDFDocument";
import { contratoDaVista, propostaDaVista } from "../dadosObra";
import { contratoObraPdf, documentoObraHtml, propostaObraPdf, type DocumentoObraPdf, type PartePdf } from "../documentoObraPdf";
import { comAdenda, exemploObra } from "./obraFixture";

/** Todo o texto do modelo, numa só cadeia (para procurar palavras e valores). */
function textoDe(doc: DocumentoObraPdf): string {
  const parte = (p: PartePdf): string[] => {
    switch (p.tipo) {
      case "texto": return [p.texto];
      case "lista": return [p.titulo ?? "", ...p.itens.flatMap((x) => [x.texto, ...(x.notas ?? []), ...(x.valores ?? [])])];
      case "fase": return [p.titulo, ...p.grupos.flatMap((g) => parte({ tipo: "lista", titulo: g.titulo, itens: g.itens }))];
      case "assinaturas": return p.itens.flatMap((a) => [a.quem, a.nome]);
      case "secao": return [p.titulo, p.etiqueta ?? "", ...(Array.isArray(p.corpo) ? p.corpo : [p.corpo])];
      case "barra": return [];
    }
  };
  return [doc.titulo, ...doc.blocos.flatMap((b) => [b.titulo, ...b.partes.flatMap(parte)])].join("\n");
}

describe("proposta: o modelo do PDF da obra", () => {
  it("em português: os blocos pela ordem do ecrã, com as palavras da Emylia e o dinheiro do template", () => {
    const P = propostaDaVista(exemploObra().v)!;
    const doc = propostaObraPdf(P, "pt");
    expect(doc.idioma).toBe("pt");
    expect(doc.titulo).toBe("A obra");
    const numeros = doc.blocos.map((b) => b.n);
    expect(numeros).toEqual([...numeros].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(numeros).not.toContain(3);
    expect(numeros).toEqual(expect.arrayContaining([1, 5, 6, 7]));
    expect(doc.blocos.map((b) => b.titulo)).toEqual(expect.arrayContaining(["O que vamos fazer", "Pagamento", "Condições", "Aceitação"]));
    const texto = textoDe(doc);
    expect(texto).toContain("Na adjudicação");
    expect(texto).toMatch(/Garantia de 5 anos sobre a mão de obra/);
    for (const p of P.prestacoes) expect(texto).toContain(formatCurrency(p.v));
    expect(texto).toContain("50%");
  });

  it("em inglês: as palavras traduzidas e o dinheiro exactamente igual", () => {
    const P = propostaDaVista(exemploObra().v)!;
    const pt = propostaObraPdf(P, "pt"), en = propostaObraPdf(P, "en");
    expect(en.idioma).toBe("en");
    expect(en.blocos.map((b) => b.n)).toEqual(pt.blocos.map((b) => b.n));
    const texto = textoDe(en);
    expect(texto).toContain("What we will do");
    expect(texto).toContain("On award");
    expect(texto).not.toContain("Na adjudicação");
    expect(texto).toMatch(/5 years warranty on labour/);
    // o dinheiro (e as percentagens) não muda com o idioma
    const dinheiro = (d: DocumentoObraPdf) => textoDe(d).match(/€[\d.,]+|\d+(,\d+)?%/g);
    expect(dinheiro(en)).toEqual(dinheiro(pt));
  });

  it("sem planeamento nem materiais: esses blocos não aparecem", () => {
    const P = propostaDaVista(exemploObra().v)!;
    const semNada = { ...P, planeamento: null, materiais: { mats: [], escolhidos: [], fornecidos: [], escolhas: [], nec: [] } };
    const numeros = propostaObraPdf(semNada, "pt").blocos.map((b) => b.n);
    expect(numeros).not.toContain(2);
    expect(numeros).not.toContain(4);
  });

  it("um idioma desconhecido cai no português", () => {
    const P = propostaDaVista(exemploObra().v)!;
    expect(propostaObraPdf(P, "fr" as never).idioma).toBe("pt");
  });

  it("o react-pdf desenha-o (pt e en): um PDF válido com pelo menos uma página", async () => {
    const P = propostaDaVista(exemploObra().v)!;
    for (const idioma of ["pt", "en"] as const) {
      const blob = await pdf(<ObraPDFDocument documento={propostaObraPdf(P, idioma)} cor="#123456" />).toBlob();
      const doc = await PDFDocument.load(await blob.arrayBuffer());
      expect(doc.getPageCount()).toBeGreaterThan(0);
    }
  }, 30000);
});

describe("contrato: as cláusulas e as adendas no PDF", () => {
  it("em português: as seis cláusulas com o preço; sem adendas, sem o bloco", () => {
    const C = contratoDaVista(exemploObra().v, { proposta: "accepted", contrato: "pending_signature" })!;
    const doc = contratoObraPdf(C, "pt");
    expect(doc.blocos).toHaveLength(1);
    const texto = textoDe(doc);
    for (const [i, t] of ["Objeto", "Preço", "Pagamento", "Prazo", "Garantia", "Condições gerais"].entries()) expect(texto).toContain(`Cláusula ${i + 1}.ª · ${t}`);
    expect(texto).toContain(`Total com IVA: ${formatCurrency(C.clausulas.T.total)}`);
  });

  it("em inglês: os títulos traduzidos e o dinheiro igual", () => {
    const C = contratoDaVista(exemploObra().v)!;
    const texto = textoDe(contratoObraPdf(C, "en"));
    expect(texto).toContain("Clause 1 · Scope");
    expect(texto).toContain(`Total incl. VAT: ${formatCurrency(C.clausulas.T.total)}`);
  });

  it("uma cláusula revista pelo Jurídico leva o texto escrito e o selo", () => {
    const C = contratoDaVista(exemploObra((d) => { d.orc!.clausulas = { Garantia: "Três anos sobre tudo." }; }).v)!;
    const secao = contratoObraPdf(C, "en").blocos[0].partes.find((p) => p.tipo === "secao" && p.corpo === "Três anos sobre tudo.");
    expect(secao).toMatchObject({ etiqueta: "revised" });
  });

  it("as adendas assinadas: a lista e o valor do contrato com elas", () => {
    const C = contratoDaVista(exemploObra(comAdenda).v)!;
    const doc = contratoObraPdf(C, "pt");
    expect(doc.blocos.map((b) => b.titulo)).toEqual(["Cláusulas do negócio", "Adendas ao contrato"]);
    const texto = textoDe(doc);
    expect(texto).toContain("AD-1 · Tomada <extra>");
    expect(texto).toContain("Assinada · 05/11/2026");
    expect(texto).toContain(formatCurrency(C.adendas!.total));
  });

  it("em HTML: escapado, numa página nova, com as cláusulas e as adendas", () => {
    const C = contratoDaVista(exemploObra(comAdenda).v)!;
    const html = documentoObraHtml(contratoObraPdf(C, "en"));
    expect(html.startsWith('<section data-doc-obra="contrato" lang="en" style="page-break-before:always">')).toBe(true);
    expect(html).toContain("Clause 1 · Scope");
    expect(html).toContain("Tomada &lt;extra&gt;");
    expect(html).not.toContain("<extra>");
    expect(html).toContain(formatCurrency(C.adendas!.total));
    // o HTML é bem formado: o navegador lê-o com as mesmas secções
    const el = document.createElement("div");
    el.innerHTML = html;
    expect(el.querySelectorAll("h2")).toHaveLength(2);
    expect(el.querySelectorAll("h3")).toHaveLength(6);
  });
});
