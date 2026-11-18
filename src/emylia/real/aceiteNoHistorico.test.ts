// 17/11 (A-Z na Mudelar): a aceitação no portal (gravada pelo servidor) não aparecia em «Últimos acontecimentos».
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { seed } from "../motor";
import { paraLinhas } from "./negocioReal";
import { negocioDoLido, type NegocioLido } from "./negocioBase";

describe("a aceitação da proposta no histórico", () => {
  it("lida da base com a proposta aceite e sem linha no histórico, junta-a a seguir ao envio; com ela, não repete", () => {
    const S = seed();
    const d = structuredClone(S.deals.find((x) => x.orc?.aceite)!);
    d.hist = [{ t: "Contrato enviado", q: "17/11 17:25", k: "a" }, { t: "Proposta enviada ao portal do cliente", q: "17/11 17:23", k: "a" }];
    const lido = { id: "x", entityId: "e", estadoCrm: "", fluxoEmylia: true, docsCrm: false, linhas: paraLinhas(d) } as NegocioLido;
    const r = negocioDoLido(lido);
    const i = r.hist.findIndex((h) => h.t === "O cliente aceitou a proposta no portal");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r.hist[i + 1].t).toMatch(/Proposta enviada/);
    const outra = negocioDoLido({ ...lido, linhas: paraLinhas(r) });
    expect(outra.hist.filter((h) => /aceitou a proposta/.test(h.t))).toHaveLength(1);
  });
});
