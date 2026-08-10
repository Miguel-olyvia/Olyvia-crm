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

// Real markup from the "Contrato de Empreita Obra Geral" minuta — the
// signature columns wrapper is a SIBLING of loose text ("Pontinha, {{data}}")
// inside the same outer container, which used to make the naive "first
// element whose combined text mentions O Cliente" heuristic grab that outer
// container (and inject the stamp into the "Pontinha," text) instead of the
// actual two-column block nested inside it.
const EMPREITA_BLOCK = `<div style="text-align: left;"><font>Pontinha,&nbsp;</font><span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">06/08/2026</span><font><br></font><div style="margin-top:40px;">
      <div style="display:flex;justify-content:space-between;gap:60px;">
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
          <p style=""><b><font>A M1D3L4R, REMODELAÇÕES UNIPESSOAL, LDA.</font></b></p>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
          <p style=""><strong><font><font>O CLIENTE</font><br></font></strong></p>
        </div>
      </div>
    </div><font><br></font></div>`;

describe("injectSignaturesIntoBlock — Empreita minuta (loose sibling text before the columns)", () => {
  it("does not inject into the 'Pontinha, {{data}}' text — lands in the real column instead", () => {
    const out = injectSignaturesIntoBlock(
      EMPREITA_BLOCK,
      { signed: true, name: "Ricardo Belchior", showOtpBadge: false },
      { signed: false, showOtpBadge: true },
    );
    expect(out).toContain("Ricardo Belchior");
    // Must NOT have landed inside the "Pontinha," text run.
    expect(out).not.toMatch(/Pontinha,[^<]*Ricardo Belchior/);
    // Must be immediately next to (right before) its own signature line, not
    // dangling near the date line far above it.
    const nameIdx = out.indexOf("Ricardo Belchior");
    const lineIdx = out.indexOf('border-bottom:1px solid #000');
    expect(nameIdx).toBeLessThan(lineIdx);
    expect(lineIdx - nameIdx).toBeLessThan(200); // close together, not across the whole block
  });
});

// Real markup from "Contrato de Prestação de Serviços" — uses a <table> with
// a decorative underscore line ("_______________") instead of a border-bottom
// div. hasLineMarker()/isLineElement() must recognize this style too.
const TABLE_UNDERSCORE_BLOCK = `<table style="width:100%;"><tr>
<td style="text-align:center;width:50%;border:none;"><p>_______________________________</p><p><strong>{{empresa_nome}}</strong></p><p>(O Prestador)</p></td>
<td style="text-align:center;width:50%;border:none;"><p>_______________________________</p><p><strong>{{cliente_nome}}</strong></p><p>(O Cliente)</p></td>
</tr></table>`;

describe("injectSignaturesIntoBlock — table + underscore-line minuta", () => {
  it("injects above the underscore line, keeps client blank until signed", () => {
    const out = injectSignaturesIntoBlock(
      TABLE_UNDERSCORE_BLOCK,
      { signed: true, name: "Ricardo Belchior", showOtpBadge: false },
      { signed: false, showOtpBadge: true },
    );
    expect(out).toContain("Ricardo Belchior");
    expect(out).not.toContain("Assinado via SMS OTP");
    const nameIdx = out.indexOf("Ricardo Belchior");
    const lineIdx = out.indexOf("_______________________________");
    expect(nameIdx).toBeLessThan(lineIdx);
  });

  it("injects the client's OTP badge above its own underscore line once signed", () => {
    const out = injectSignaturesIntoBlock(
      TABLE_UNDERSCORE_BLOCK,
      { signed: false },
      { signed: true, name: "Maria Fátima de Jesus Duarte", signedAt: "2026-08-06T17:46:00.000Z", ip: "78.137.210.201", showOtpBadge: true },
    );
    expect(out).toContain("Assinado via SMS OTP");
    expect(out).toContain("Maria Fátima de Jesus Duarte");
    expect(out).toContain("78.137.210.201");
    expect(out).toContain("(O Cliente)");
  });
});
