import { describe, expect, it, vi } from "vitest";
import { fetchEntityCompanyName } from "@/lib/clients/fetchEntityCompanyName";
import { resolveClientNameForSave } from "@/lib/nameOnSave";

function mockClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, eq, maybeSingle };
}

describe("fetchEntityCompanyName (leitura propria, tolerante a coluna por aplicar)", () => {
  it("coluna existe com empresa: devolve a empresa e le so company_name dessa ficha", async () => {
    const m = mockClient({ data: { company_name: "EVOLAR LDA" }, error: null });
    const r = await fetchEntityCompanyName(m.client, "ent-1");
    expect(r).toEqual({ status: "ok", company: "EVOLAR LDA" });
    expect(m.from).toHaveBeenCalledWith("anew_entities");
    expect(m.select).toHaveBeenCalledWith("company_name");
    expect(m.eq).toHaveBeenCalledWith("id", "ent-1");
  });

  it("coluna existe sem empresa (null ou espacos): ok com empresa null", async () => {
    expect(await fetchEntityCompanyName(mockClient({ data: { company_name: null }, error: null }).client, "e"))
      .toEqual({ status: "ok", company: null });
    expect(await fetchEntityCompanyName(mockClient({ data: { company_name: "  " }, error: null }).client, "e"))
      .toEqual({ status: "ok", company: null });
    expect(await fetchEntityCompanyName(mockClient({ data: null, error: null }).client, "e"))
      .toEqual({ status: "ok", company: null });
  });

  it.each([
    [{ code: "42703", message: 'column anew_entities.company_name does not exist' }],
    [{ code: "PGRST204", message: "Could not find the 'company_name' column" }],
    [{ code: "PGRST200", message: "column company_name does not exist in the schema cache" }],
  ])("coluna ainda nao existe (%j): tolerado, sem empresa e sem erro", async (error) => {
    const r = await fetchEntityCompanyName(mockClient({ data: null, error }).client, "e");
    expect(r).toEqual({ status: "no-column", company: null });
  });

  it("outro erro (rede, permissao): devolve erro, para nao gravar como se nao houvesse empresa", async () => {
    const r = await fetchEntityCompanyName(mockClient({ data: null, error: { code: "42501", message: "permission denied" } }).client, "e");
    expect(r.status).toBe("error");
  });

  it("sem ficha: nem pergunta", async () => {
    const m = mockClient({ data: null, error: null });
    expect(await fetchEntityCompanyName(m.client, null)).toEqual({ status: "no-column", company: null });
    expect(m.from).not.toHaveBeenCalled();
  });

  it("o caso do dono: ficha EVOLAR LDA de Rui Silva, apelido muda para Costa, o nome fica a empresa lida", async () => {
    const lida = await fetchEntityCompanyName(
      mockClient({ data: { company_name: "EVOLAR LDA" }, error: null }).client, "ent-1",
    );
    const out = resolveClientNameForSave(
      { display_name: "EVOLAR LDA", first_name: "Rui", last_name: "Silva", company_name: lida.company },
      { first_name: "Rui", last_name: "Costa" },
    );
    expect(out.displayName).toBe("EVOLAR LDA");
    expect(out.last).toBe("Costa");
  });

  it("coluna por aplicar: comportamento anterior (nome + apelido), sem rebentar", async () => {
    const lida = await fetchEntityCompanyName(
      mockClient({ data: null, error: { code: "42703", message: "column does not exist" } }).client, "ent-1",
    );
    const out = resolveClientNameForSave(
      { display_name: "Rui Silva", first_name: "Rui", last_name: "Silva", company_name: lida.company },
      { first_name: "Rui", last_name: "Costa" },
    );
    expect(out.displayName).toBe("Rui Costa");
  });
});
