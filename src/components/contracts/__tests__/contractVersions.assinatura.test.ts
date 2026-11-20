// O contrato com duas versões tem UMA assinatura, na última. Quando o cliente escolhe a versão que não a tem,
// anexa-se-lhe o bloco (com o carimbo) e a frase «esta assinatura vale para as duas versões»; o PDF leva só a versão
// escolhida, com o mesmo bloco. A assinatura em si (OTP) não se toca.
import { describe, expect, it, vi } from "vitest";
import { bodyDaVersaoComAssinatura, soAVersaoDoContrato } from "../contractVersions";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const COLUNA = (rotulo: string, carimbo = "") =>
  `<div style="flex:1;text-align:center;">${carimbo}<div style="border-bottom:1px solid #000;height:40px;"></div><p><strong>${rotulo}</strong></p></div>`;
const FRASE = `<p class="olv-assinatura-unica">Esta assinatura vale para as versões em português e em inglês. / This signature applies to both the Portuguese and English versions.</p>`;
const CARIMBO = `<div><span>Assinado via SMS OTP / Signed via SMS OTP</span><span>Rui Costa</span></div>`;
const BLOCO = `<div style="margin-top:40px;"><div style="display:flex;">${COLUNA("MUDELAR, LDA.")}${COLUNA("THE CLIENT", CARIMBO)}</div></div>`;

const PT = `<h2>CONTRATO</h2><p>Cláusula 1.</p>`;
const EN = `<h2>SERVICES AGREEMENT</h2><p>Clause 1.</p>${FRASE}${BLOCO}`;
const VERSOES = [
  { codigo: "pt", bodyHtml: PT },
  { codigo: "en", bodyHtml: EN },
];

describe("bodyDaVersaoComAssinatura", () => {
  it("a última versão (a que tem o bloco) sai tal e qual", () => {
    expect(bodyDaVersaoComAssinatura(VERSOES, "en")).toBe(EN);
  });

  it("a versão sem o bloco leva o bloco da última, com o carimbo nos dois idiomas e a frase", () => {
    const html = bodyDaVersaoComAssinatura(VERSOES, "pt");
    expect(html.startsWith(PT)).toBe(true);
    expect(html).toContain("Assinado via SMS OTP / Signed via SMS OTP");
    expect(html).toContain("Rui Costa");
    expect(html).toContain("THE CLIENT");
    expect(html).toContain("Esta assinatura vale para as versões em português e em inglês.");
    expect(html).toContain("This signature applies to both the Portuguese and English versions.");
    // a frase vem antes do bloco, e só uma vez
    expect(html.indexOf("Esta assinatura vale")).toBeLessThan(html.indexOf("THE CLIENT"));
    expect(html.match(/Esta assinatura vale/g)).toHaveLength(1);
    // o texto da outra versão não vem junto
    expect(html).not.toContain("SERVICES AGREEMENT");
  });

  it("uma versão que já tem o seu próprio bloco não leva outro", () => {
    const comBloco = `${PT}<div class="olv-assinaturas"><div class="olv-assinatura-empresa"><p>E</p></div><div class="olv-assinatura-cliente"><p>C</p></div></div>`;
    const versoes = [{ codigo: "pt", bodyHtml: comBloco }, { codigo: "en", bodyHtml: EN }];
    expect(bodyDaVersaoComAssinatura(versoes, "pt")).toBe(comBloco);
  });

  it("uma só versão, ou nenhuma assinatura em lado nenhum: o corpo como está", () => {
    expect(bodyDaVersaoComAssinatura([{ codigo: "pt", bodyHtml: PT }], "pt")).toBe(PT);
    const semBloco = [{ codigo: "pt", bodyHtml: PT }, { codigo: "en", bodyHtml: "<p>Clause 1.</p>" }];
    expect(bodyDaVersaoComAssinatura(semBloco, "pt")).toBe(PT);
  });

  it("um código que não existe: a primeira versão", () => {
    expect(bodyDaVersaoComAssinatura(VERSOES, "fr")).toBe(bodyDaVersaoComAssinatura(VERSOES, "pt"));
  });

  it("não altera as versões recebidas", () => {
    const copia = JSON.stringify(VERSOES);
    bodyDaVersaoComAssinatura(VERSOES, "pt");
    expect(JSON.stringify(VERSOES)).toBe(copia);
  });
});

describe("soAVersaoDoContrato (o documento resolvido, só com o idioma escolhido, para o PDF)", () => {
  const documento = {
    bodyHtml: "(junto)",
    pageWidth: "210mm",
    versoes: [
      { codigo: "pt", bodyHtml: PT, settings: { footer_text: "Rodapé pt" } },
      { codigo: "en", bodyHtml: EN, settings: { footer_text: "Footer en" } },
    ],
  };

  it("fica uma só versão, a escolhida, e as restantes propriedades mantêm-se", () => {
    const so = soAVersaoDoContrato(documento, "en");
    expect(so.versoes.map((v) => v.codigo)).toEqual(["en"]);
    expect(so.versoes[0].settings).toEqual({ footer_text: "Footer en" });
    expect(so.bodyHtml).toBe(EN);
    expect(so.pageWidth).toBe("210mm");
  });

  it("a versão sem o bloco sai com o bloco da última (como no ecrã)", () => {
    const so = soAVersaoDoContrato(documento, "pt");
    expect(so.versoes.map((v) => v.codigo)).toEqual(["pt"]);
    expect(so.versoes[0].bodyHtml).toBe(bodyDaVersaoComAssinatura(documento.versoes, "pt"));
    expect(so.versoes[0].bodyHtml).toContain("Assinado via SMS OTP / Signed via SMS OTP");
    expect(so.versoes[0].settings).toEqual({ footer_text: "Rodapé pt" });
    expect(so.bodyHtml).toBe(so.versoes[0].bodyHtml);
  });

  it("com uma só versão (ou um código desconhecido) devolve o documento como está", () => {
    const uma = { bodyHtml: PT, versoes: [{ codigo: "pt", bodyHtml: PT, settings: {} }] };
    expect(soAVersaoDoContrato(uma, "pt")).toBe(uma);
    expect(soAVersaoDoContrato(documento, "fr")).toBe(documento);
  });

  it("não altera o documento recebido", () => {
    const copia = JSON.stringify(documento);
    soAVersaoDoContrato(documento, "pt");
    expect(JSON.stringify(documento)).toBe(copia);
  });
});
