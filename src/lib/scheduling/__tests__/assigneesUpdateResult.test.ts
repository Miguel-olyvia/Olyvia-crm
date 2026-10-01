import { describe, expect, it } from "vitest";
import { parseAssigneesUpdateResult } from "../assigneesUpdateResult";

describe("parseAssigneesUpdateResult", () => {
  it("null (nada mudou / sem ficha ligada) nao muda o dono", () => {
    expect(parseAssigneesUpdateResult(null)).toEqual({ leadOwnerChanged: false, newOwnerId: null, otherVisitIds: [] });
  });

  it("lead com novo dono e outras visitas alinhadas", () => {
    const r = parseAssigneesUpdateResult({ lead_id: "l1", client_id: null, new_owner: "u2", other_visit_ids: ["v2", "v3"] });
    expect(r).toEqual({ leadOwnerChanged: true, newOwnerId: "u2", otherVisitIds: ["v2", "v3"] });
  });

  it("cliente tambem conta como ficha alinhada", () => {
    expect(parseAssigneesUpdateResult({ lead_id: null, client_id: "c1", new_owner: "u9", other_visit_ids: [] }).leadOwnerChanged).toBe(true);
  });

  it("ignora lixo nos ids", () => {
    expect(parseAssigneesUpdateResult({ lead_id: "l1", new_owner: "u2", other_visit_ids: ["v2", 5, null] }).otherVisitIds).toEqual(["v2"]);
  });
});
