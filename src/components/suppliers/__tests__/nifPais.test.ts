import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn() }));
vi.mock("@/utils/auditContext", () => ({}));
import { nifComPais, paisDoNif, supplierNifKey } from "../newSupplier";

describe("NIF com o país", () => {
  it("sem prefixo é Portugal; com prefixo é o país", () => {
    expect(paisDoNif("509999990")).toBe("PT");
    expect(paisDoNif("ESB12345678")).toBe("ES");
    expect(paisDoNif("gr123456789")).toBe("EL");
  });

  it("escolher o país troca o prefixo; Portugal fica sem prefixo", () => {
    expect(nifComPais("B12345678", "ES")).toBe("ESB12345678");
    expect(nifComPais("ESB12345678", "FR")).toBe("FRB12345678");
    expect(nifComPais("PT509999990", "PT")).toBe("509999990");
    expect(supplierNifKey(nifComPais("PT123456789", "PT"))).toBe("PT123456789");
  });
});
