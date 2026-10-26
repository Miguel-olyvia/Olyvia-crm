import { describe, expect, it } from "vitest";
import { parseReceivingParams, receivingLink } from "@/components/inventory/ui/inventoryLinks";

describe("receivingLink / parseReceivingParams (vista, separador e PO)", () => {
  it("valores por omissão não vão para o URL", () => {
    expect(receivingLink()).toBe("/receiving");
    expect(receivingLink({ vista: "lista", tab: "receber", notes: "all" })).toBe("/receiving");
    expect(receivingLink({ vista: "leitor" })).toBe("/receiving?vista=leitor");
    expect(receivingLink({ tab: "guias", notes: "open" })).toBe("/receiving?notes=open&tab=guias");
    expect(receivingLink({ po: "po-1" })).toBe("/receiving?po=po-1");
  });

  it("lê o URL e cai no valor por omissão com valores desconhecidos", () => {
    expect(parseReceivingParams("?vista=leitor&tab=recebidas&po=po-1&guia=g1")).toEqual({
      guia: "g1",
      notes: "all",
      tab: "recebidas",
      po: "po-1",
      vista: "leitor",
      vistaParam: "leitor",
    });
    expect(parseReceivingParams("?vista=xpto&tab=nada")).toMatchObject({ vista: "lista", vistaParam: null, tab: "receber", po: null });
  });

  it("?notes= sem ?tab= (links do Hoje do Inventário) abre o separador Guias", () => {
    expect(parseReceivingParams("?notes=open")).toMatchObject({ notes: "open", tab: "guias" });
    expect(parseReceivingParams(receivingLink({ notes: "divergent" }).split("?")[1])).toMatchObject({ notes: "divergent", tab: "guias" });
    // com ?tab= explícito, manda o tab
    expect(parseReceivingParams("?notes=open&tab=receber").tab).toBe("receber");
    expect(parseReceivingParams("").tab).toBe("receber");
  });
});
