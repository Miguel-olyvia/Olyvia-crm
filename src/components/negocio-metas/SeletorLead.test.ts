// A lead mais recente de uma pessoa (a que o negócio novo e o ganho trazem escolhida): compara o instante completo e, em empate, o id,
// para o resultado não depender da ordem em que as leads chegam.
import { describe, expect, it } from "vitest";
import type { LeadAbertaCostura } from "./costuraNegocio";
import { leadMaisRecente } from "./SeletorLead";

const lead = (id: string, criadaEm: string, instante?: string): LeadAbertaCostura => ({ id, criadaEm, encerrada: false, ...(instante ? { instante } : {}) });

describe("leadMaisRecente", () => {
  it("sem leads não há nenhuma", () => {
    expect(leadMaisRecente([])).toBeNull();
  });

  it("no mesmo dia ganha a criada mais tarde (instante completo), esteja onde estiver na lista", () => {
    const manha = lead("manha", "2026-10-01", "2026-10-01T08:00:00Z");
    const tarde = lead("tarde", "2026-10-01", "2026-10-01T17:30:00Z");
    expect(leadMaisRecente([tarde, manha])?.id).toBe("tarde");
    expect(leadMaisRecente([manha, tarde])?.id).toBe("tarde");
  });

  it("no mesmo instante desempata o id, também independente da ordem", () => {
    const a = lead("a-lead", "2026-10-01", "2026-10-01T08:00:00Z");
    const b = lead("b-lead", "2026-10-01", "2026-10-01T08:00:00Z");
    expect(leadMaisRecente([a, b])?.id).toBe("b-lead");
    expect(leadMaisRecente([b, a])?.id).toBe("b-lead");
  });

  it("um dia mais recente ganha a um instante mais cedo noutro dia", () => {
    expect(leadMaisRecente([lead("nova", "2026-10-02", "2026-10-02T00:10:00Z"), lead("velha", "2026-10-01", "2026-10-01T23:00:00Z")])?.id).toBe("nova");
  });

  it("sem instante (só o dia) compara o dia, e uma lead sem data nunca ganha a uma com data", () => {
    expect(leadMaisRecente([lead("velha", "2026-09-01"), lead("nova", "2026-10-01")])?.id).toBe("nova");
    expect(leadMaisRecente([lead("sem-data", ""), lead("com-data", "2026-09-01")])?.id).toBe("com-data");
    expect(leadMaisRecente([lead("com-data", "2026-09-01"), lead("sem-data", "")])?.id).toBe("com-data");
  });

  it("um instante que não é data cai para o dia, sem rebentar", () => {
    expect(leadMaisRecente([lead("a", "2026-09-01", "lixo"), lead("b", "2026-10-01", "lixo")])?.id).toBe("b");
  });
});
