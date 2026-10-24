// A lead a que a abordagem de uma pessoa se refere: a que tem o encerramento, senão a aberta mais recente. A lead que a ficha põe em `lead` é
// a mais recente viva em QUALQUER estado, por isso pode estar morta (convertida, perdida, rejeitada) e não é a certa para encerrar ou reativar.
import { describe, expect, it } from "vitest";
import { fichaDb } from "./fichaFabrica";
import { leadDaAbordagem } from "./leadDaAbordagem";

const lead = (id: string, fecho: string | null, criada: string | null) => ({ id, status: "new", created_at: criada, closure_result: fecho });
const encerramento = { resultado: "semInteresse", motivo: "preco", motivo_outro: null, em: "2026-10-01T10:00:00Z" };

describe("leadDaAbordagem", () => {
  it("a lead da ficha com encerramento é a encerrada", () => {
    const ficha = fichaDb({ lead: { id: "a", estado: "new", aberta: true, encerramento } });
    expect(leadDaAbordagem(ficha)).toEqual({ id: "a", encerrada: true });
  });

  it("a lead da ficha aberta e sem encerramento é a da abordagem, ainda que haja uma aberta mais antiga encerrada", () => {
    const ficha = fichaDb({ lead: { id: "a", estado: "new", aberta: true, encerramento: null }, leads_abertas: [lead("b", "semInteresse", "2026-01-01T00:00:00Z")] });
    expect(leadDaAbordagem(ficha)).toEqual({ id: "a", encerrada: false });
  });

  it("com a lead da ficha morta, vale a aberta mais recente (encerrada ou não)", () => {
    const morta = { id: "m", estado: "converted", aberta: false, encerramento: null };
    expect(leadDaAbordagem(fichaDb({ lead: morta, leads_abertas: [lead("b", "obraInviavel", "2026-01-01T00:00:00Z")] }))).toEqual({ id: "b", encerrada: true });
    expect(leadDaAbordagem(fichaDb({
      lead: morta, leads_abertas: [lead("velha", "semInteresse", "2026-01-01T00:00:00Z"), lead("nova", null, "2026-05-01T00:00:00Z")],
    }))).toEqual({ id: "nova", encerrada: false });
  });

  it("uma data em falta conta como a mais antiga", () => {
    const morta = { id: "m", estado: "converted", aberta: false, encerramento: null };
    expect(leadDaAbordagem(fichaDb({ lead: morta, leads_abertas: [lead("sem", null, null), lead("com", "semInteresse", "2026-05-01T00:00:00Z")] }))).toEqual({ id: "com", encerrada: true });
  });

  it("sem abertas, a lead morta da ficha continua a ser o que há (não encerrada); sem nenhuma, null", () => {
    const morta = { id: "m", estado: "converted", aberta: false, encerramento: null };
    expect(leadDaAbordagem(fichaDb({ lead: morta, leads_abertas: [] }))).toEqual({ id: "m", encerrada: false });
    expect(leadDaAbordagem(fichaDb({ lead: null, leads_abertas: [] }))).toBeNull();
  });

  it("um encerramento sem resultado conhecido não conta como encerramento", () => {
    const ficha = fichaDb({ lead: { id: "a", estado: "new", aberta: true, encerramento: { ...encerramento, resultado: "xpto" } } });
    expect(leadDaAbordagem(ficha)).toEqual({ id: "a", encerrada: false });
  });
});
