// As visitas da ficha real levam o que «Alterar visita» precisa de reenviar: quadro, recursos e duração.
import { describe, expect, it } from "vitest";
import { adaptarRegistos } from "./adaptarRegistos";
import { fichaDb, seccaoDb, visitaDb } from "./fichaFabrica";

const registos = (v: Parameters<typeof visitaDb>[0]) => adaptarRegistos(fichaDb({ visitas: seccaoDb([visitaDb(v)]) })).visitas[0];
const REC = (id: string, nome: string | null, ativo = true) => ({ id, nome, user_id: null, ativo });

describe("adaptarRegistos: a agenda de cada visita", () => {
  it("leva o quadro e os recursos (id e nome)", () => {
    const v = registos({ board_id: "q1", recursos: [REC("r1", "Rita Gomes"), REC("r2", "Rui Costa")] });
    expect(v.agenda).toEqual({ boardId: "q1", recursos: [{ id: "r1", nome: "Rita Gomes" }, { id: "r2", nome: "Rui Costa" }], duracaoMinutos: 60 });
  });

  it("a duração é o fim menos o início, e uma das quatro chaves quando coincide", () => {
    expect(registos({ inicio: "2026-10-20T09:00:00Z", fim: "2026-10-20T09:30:00Z" })).toMatchObject({ duracao: "m30", agenda: { duracaoMinutos: 30 } });
    expect(registos({ inicio: "2026-10-20T09:00:00Z", fim: "2026-10-20T10:00:00Z" })).toMatchObject({ duracao: "h1", agenda: { duracaoMinutos: 60 } });
    expect(registos({ inicio: "2026-10-20T09:00:00Z", fim: "2026-10-20T10:30:00Z" })).toMatchObject({ duracao: "h1m30", agenda: { duracaoMinutos: 90 } });
    expect(registos({ inicio: "2026-10-20T09:00:00Z", fim: "2026-10-20T11:00:00Z" })).toMatchObject({ duracao: "h2", agenda: { duracaoMinutos: 120 } });
  });

  it("uma duração fora das quatro fica sem chave e preserva os minutos", () => {
    expect(registos({ inicio: "2026-10-20T09:00:00Z", fim: "2026-10-20T09:45:00Z" })).toMatchObject({ duracao: "", agenda: { duracaoMinutos: 45 } });
  });

  it("sem fim, ou com um fim que não vem depois do início, não há duração", () => {
    expect(registos({ fim: null })).toMatchObject({ duracao: "", agenda: { duracaoMinutos: null } });
    expect(registos({ inicio: "2026-10-20T09:00:00Z", fim: "2026-10-20T09:00:00Z" })).toMatchObject({ duracao: "", agenda: { duracaoMinutos: null } });
    expect(registos({ inicio: "2026-10-20T09:00:00Z", fim: "lixo" })).toMatchObject({ agenda: { duracaoMinutos: null } });
  });

  it("sem quadro (null), sem recursos, ou com um nome em falta, fica vazio em vez de falhar", () => {
    expect(registos({ board_id: null, recursos: [] }).agenda).toMatchObject({ boardId: null, recursos: [] });
    expect(registos({ recursos: [REC("r1", null)] }).agenda?.recursos).toEqual([{ id: "r1", nome: "" }]);
  });

  it("os recursos inativos da visita também vão (reenvia-se a lista inteira)", () => {
    expect(registos({ recursos: [REC("r1", "A"), REC("r2", "B", false)] }).agenda?.recursos.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});
