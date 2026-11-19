import { describe, expect, it, vi } from "vitest";
import { extrairBlocoDeAssinatura, removerBlocoDeAssinatura, temBlocoDeAssinatura } from "../assinaturas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const COLUNA = (rotulo: string) =>
  `<div style="flex:1;text-align:center;"><div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div><p><strong>${rotulo}</strong></p></div>`;
const BLOCO_EN = `<div style="margin-top:40px;"><div style="display:flex;gap:60px;">${COLUNA("MUDELAR, LDA.")}${COLUNA("THE CLIENT")}</div></div>`;
const MARCADO = `<div class="olv-assinaturas"><div class="olv-assinatura-empresa"><p>Pela empresa</p></div><div class="olv-assinatura-cliente"><p>Pelo cliente</p></div></div>`;

describe("extrairBlocoDeAssinatura (o bloco para o repetir noutra versão)", () => {
  it("devolve o bloco em duas colunas, com o embrulho, sem o texto que o antecede", () => {
    const html = `<h2>SERVICES AGREEMENT</h2><p>Clause 1.</p>${BLOCO_EN}`;
    const bloco = extrairBlocoDeAssinatura(html, "en");
    expect(bloco).toContain("THE CLIENT");
    expect(bloco).toContain("MUDELAR, LDA.");
    expect(bloco).not.toContain("Clause 1.");
    expect(bloco).not.toContain("SERVICES AGREEMENT");
  });

  it("leva também as linhas decorativas imediatamente antes, pela ordem original", () => {
    const html = `<p>Fim.</p><p>_______</p><p>________</p>${MARCADO}`;
    const bloco = extrairBlocoDeAssinatura(html)!;
    expect(bloco.indexOf("_______")).toBeGreaterThanOrEqual(0);
    expect(bloco.indexOf("_______")).toBeLessThan(bloco.indexOf("Pela empresa"));
    expect(bloco).not.toContain("Fim.");
  });

  it("é o mesmo que a remoção tira: o corpo sem o bloco mais o bloco dá os mesmos elementos", () => {
    const html = `<p>Fim do texto.</p>${MARCADO}`;
    const bloco = extrairBlocoDeAssinatura(html)!;
    const restante = removerBlocoDeAssinatura(html).html;
    expect(restante + bloco).toBe(html);
  });

  it("sem bloco devolve null; sem html também", () => {
    expect(extrairBlocoDeAssinatura("<p>Só texto sem assinaturas.</p>", "en")).toBeNull();
    expect(extrairBlocoDeAssinatura("")).toBeNull();
    expect(extrairBlocoDeAssinatura(null)).toBeNull();
  });

  it("o bloco já carimbado (nome, data e IP por cima da linha) continua a ser reconhecido", () => {
    // O textContent cola o fim do carimbo à etiqueta: «…1.2.3.4THE CLIENT».
    const carimbo = `<div><div>Signed via SMS OTP</div><div>Rui Costa</div><div>IP: 1.2.3.4</div></div>`;
    const carimbado = `<p>Clause.</p><div><div style="display:flex;">${COLUNA("MUDELAR, LDA.")}<div style="flex:1;">${carimbo}<div style="border-bottom:1px solid #000;height:40px;"></div><p>THE CLIENT</p></div></div></div>`;
    expect(temBlocoDeAssinatura(carimbado, "en")).toBe(true);
    const bloco = extrairBlocoDeAssinatura(carimbado, "en");
    expect(bloco).toContain("Rui Costa");
    expect(bloco).toContain("THE CLIENT");
    expect(bloco).not.toContain("Clause.");
  });

  it("não altera o html recebido (é uma leitura)", () => {
    const html = `<p>Fim.</p>${MARCADO}`;
    const copia = String(html);
    extrairBlocoDeAssinatura(html);
    expect(html).toBe(copia);
  });
});
