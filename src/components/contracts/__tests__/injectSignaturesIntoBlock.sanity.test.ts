import { describe, it, expect } from "vitest";
import { injectSignaturesIntoBlock } from "@/components/contracts/contractDocument";

// Real signature-block markup pulled from the "Contrato de Compra e Venda de
// Materiais" minuta (client_contract_templates.body_html) — reproduces the
// exact nested-wrapper structure that broke the first version of the
// column-detection heuristic.
const REAL_BLOCK = `<div style="margin-top:40px;">
  <div style="display:flex;justify-content:space-between;gap:60px;">
    <div style="flex:1;text-align:center;">
      <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
      <p style=""><b><font>A M1D3L4R, REMODELAÇÕES UNIPESSOAL, LDA.</font></b></p><p style=""><font>(A VENDEDORA)</font></p>
    </div>
    <div style="flex:1;text-align:center;">
      <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
      <p style=""><strong><font>O CLIENTE<br></font></strong></p><p style=""><font>(O COMPRADOR)</font></p>
    </div>
  </div>
</div>`;

describe("injectSignaturesIntoBlock — real minuta markup", () => {
  it("injects nothing when neither party has signed yet, keeps original labels intact", () => {
    const out = injectSignaturesIntoBlock(REAL_BLOCK, { signed: false }, { signed: false });
    expect(out).toContain("A M1D3L4R, REMODELAÇÕES UNIPESSOAL, LDA.");
    expect(out).toContain("O CLIENTE");
    expect(out).not.toContain("Brush Script");
    expect(out).not.toContain("Assinado via SMS OTP");
  });

  it("injects the company's cursive signature above its line, leaves client blank", () => {
    const out = injectSignaturesIntoBlock(
      REAL_BLOCK,
      { signed: true, name: "Ricardo Belchior", showOtpBadge: false },
      { signed: false, showOtpBadge: true },
    );
    expect(out).toContain("Ricardo Belchior");
    expect(out).toContain("Brush Script");
    expect(out).toContain("A M1D3L4R, REMODELAÇÕES UNIPESSOAL, LDA.");
    expect(out).not.toContain("Assinado via SMS OTP");
    // The stamp must land inside the LEFT column, before the client column's
    // "O CLIENTE" text — not duplicated/misplaced on the client side.
    expect(out.indexOf("Ricardo Belchior")).toBeLessThan(out.indexOf("O CLIENTE"));
  });

  it("injects the client's SMS OTP badge once signed, keeps company signature intact", () => {
    const out = injectSignaturesIntoBlock(
      REAL_BLOCK,
      { signed: true, name: "Ricardo Belchior", showOtpBadge: false },
      { signed: true, name: "Daniel Paixao", signedAt: "2026-08-06T20:15:00.000Z", ip: "185.128.9.205", showOtpBadge: true },
    );
    expect(out).toContain("Ricardo Belchior");
    expect(out).toContain("Assinado via SMS OTP");
    expect(out).toContain("Daniel Paixao");
    expect(out).toContain("185.128.9.205");
    expect(out).toContain("O CLIENTE");
  });
});
