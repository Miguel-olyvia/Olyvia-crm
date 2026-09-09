import { describe, it, expect } from "vitest";
import {
  getDirectOwnerId,
  getAssigneeOwnerIds,
  getAllOwnerIds,
  mergeById,
  selectItemsForOwners,
  resolveOwnerIdsForScope,
} from "@/lib/agenda/ownership";
import type { AgendaItemRow } from "@/lib/agenda/types";

const ANA = "11111111-1111-1111-1111-111111111111";
const BRUNO = "22222222-2222-2222-2222-222222222222";
const CARLA = "33333333-3333-3333-3333-333333333333";

function item(overrides: Partial<AgendaItemRow> & { id: string }): AgendaItemRow {
  return {
    title: "Item",
    status: "scheduled",
    start_datetime: "2026-09-01T09:00:00.000Z",
    end_datetime: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

const porUserId = item({ id: "a", user_id: ANA });
const porAssignee = item({ id: "b", assignees: [{ resource: { user_id: ANA } }] });
const pelosDois = item({ id: "c", user_id: ANA, assignees: [{ resource: { user_id: ANA } }] });
const deOutro = item({ id: "d", assignees: [{ resource: { user_id: BRUNO } }] });
const semDono = item({ id: "e", user_id: null, assignees: [] });

describe("caminhos de dono", () => {
  it("lê o dono directo e ignora valores vazios", () => {
    expect(getDirectOwnerId(porUserId)).toBe(ANA);
    expect(getDirectOwnerId(item({ id: "x", user_id: "" }))).toBeNull();
    expect(getDirectOwnerId(semDono)).toBeNull();
  });

  it("lê os donos via assignees -> recurso, sem repetições nem nulos", () => {
    const row = item({
      id: "y",
      assignees: [
        { resource: { user_id: ANA } },
        { resource: { user_id: ANA } },
        { resource: { user_id: null } },
        { resource: null },
      ],
    });
    expect(getAssigneeOwnerIds(row)).toEqual([ANA]);
  });

  it("junta os dois caminhos num único conjunto de donos", () => {
    expect(getAllOwnerIds(pelosDois)).toEqual([ANA]);
    expect(getAllOwnerIds(item({ id: "z", user_id: BRUNO, assignees: [{ resource: { user_id: ANA } }] })).sort())
      .toEqual([ANA, BRUNO].sort());
  });
});

describe("selectItemsForOwners", () => {
  const universo = [porUserId, porAssignee, pelosDois, deOutro, semDono];

  it("apanha os itens dos DOIS caminhos — ler só um deixaria a agenda quase vazia", () => {
    const ids = selectItemsForOwners(universo, [ANA]).map((r) => r.id);
    expect(ids).toContain("a"); // caminho user_id
    expect(ids).toContain("b"); // caminho assignees
    expect(ids).toContain("c");
  });

  it("deduplica o item que pertence pelos dois caminhos", () => {
    const ids = selectItemsForOwners(universo, [ANA]).map((r) => r.id);
    expect(ids.filter((id) => id === "c")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exclui itens de outra pessoa e itens sem dono", () => {
    const ids = selectItemsForOwners(universo, [ANA]).map((r) => r.id);
    expect(ids).not.toContain("d");
    expect(ids).not.toContain("e");
  });

  it("aceita vários donos (âmbito de equipa)", () => {
    const ids = selectItemsForOwners(universo, [ANA, BRUNO]).map((r) => r.id);
    expect(ids).toContain("d");
  });

  it("devolve vazio sem donos, em vez de devolver tudo", () => {
    expect(selectItemsForOwners(universo, [])).toEqual([]);
    expect(selectItemsForOwners(universo, ["", null as unknown as string])).toEqual([]);
  });
});

describe("mergeById", () => {
  it("preserva a ordem da primeira ocorrência", () => {
    const merged = mergeById([{ id: "1" }, { id: "2" }], [{ id: "2" }, { id: "3" }]);
    expect(merged.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("resolveOwnerIdsForScope", () => {
  it("OWNED devolve só o próprio", () => {
    expect(resolveOwnerIdsForScope("OWNED", ANA, [BRUNO])).toEqual([ANA]);
  });

  it("TEAM devolve o próprio mais a equipa, sem repetir", () => {
    expect(resolveOwnerIdsForScope("TEAM", ANA, [BRUNO, CARLA, ANA])?.sort()).toEqual([ANA, BRUNO, CARLA].sort());
  });

  it("ORG devolve null — nesse caso o filtro é a RLS, não o cliente", () => {
    expect(resolveOwnerIdsForScope("ORG", ANA, [BRUNO])).toBeNull();
  });

  it("NONE e utilizador por resolver fecham a porta", () => {
    expect(resolveOwnerIdsForScope("NONE", ANA, [])).toEqual([]);
    expect(resolveOwnerIdsForScope("OWNED", null, [])).toEqual([]);
  });
});
