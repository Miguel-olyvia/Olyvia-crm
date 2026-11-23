// 17/11 (A-Z na Mudelar): o contrato citava «P-2026-0032, válida 15 dias» e o cliente recebeu a «PR 2026/1005», 30 dias.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { seed, type Negocio } from "@/emylia/motor";
import { dadosDaMinuta } from "./templatesDosPassos";

describe("os dados da minuta do contrato", () => {
  it("o número é o da proposta que o cliente recebeu; a data vem da base; a validade da proposta enviada", () => {
    const S = seed();
    const d = structuredClone(S.deals.find((x) => x.orc)!) as Negocio;
    d.f = { ...d.f, validade: "30 dias" };
    const v = dadosDaMinuta(d, { ctx: { S } } as never, "Mudelar", {}, { numero: "P-2026-0032", data: "17/11/2026" });
    expect(v.proposta_numero).toBe(`PR 2026/${d.id}${d.orc?.versoes?.length ? ` · v${d.orc.versoes.length + 1}` : ""}`);
    expect(v.proposta_data).toBe("2026-11-17");
    expect(v.proposta_validade).toBe("30 dias");
  });

  it("23/11: o ano é o da proposta real e o número do contrato é o do negócio (CT <ano>/<n.º>)", () => {
    const S = seed();
    const d = structuredClone(S.deals.find((x) => x.orc)!) as Negocio;
    const v = dadosDaMinuta(d, { ctx: { S } } as never, "Mudelar", {}, { numero: "P-2027-0001", data: "02/01/2027", criadaEm: "2027-01-02T10:00:00Z" });
    expect(v.proposta_numero?.startsWith(`PR 2027/${d.id}`)).toBe(true);
    expect(v.contrato_numero).toBe(`CT ${new Date().getFullYear()}/${d.id}`);
  });
});
