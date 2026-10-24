import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { captureMock, criarCliente, fonteReal, montarHook } from "./fichaTestUtil";
import type { FontePessoas } from "./useFontePessoas";

type Resposta = { data: unknown; error: unknown };
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => fromMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

import { agendaVisitaQueryKey, escolhaPorOmissao, quadroElegivel, useAgendaVisita, type QuadroVisita, type RecursoVisita } from "./useAgendaVisita";

const quadro = (sobre: Partial<QuadroVisita> = {}): QuadroVisita => ({ id: "q1", name: "Geral", board_type: null, settings: null, ...sobre });
const recurso = (sobre: Partial<RecursoVisita> = {}): RecursoVisita => ({ id: "r1", name: "Rita", resource_type: "user", user_id: "u1", ...sobre });

describe("quadroElegivel", () => {
  it("fora o quadro de ausências, o da frota e os que não deixam escolher recursos", () => {
    expect(quadroElegivel(quadro())).toBe(true);
    expect(quadroElegivel(quadro({ board_type: "visits" }))).toBe(true);
    expect(quadroElegivel(quadro({ board_type: "time_off" }))).toBe(false);
    expect(quadroElegivel(quadro({ board_type: "fleet" }))).toBe(false);
    expect(quadroElegivel(quadro({ settings: { allowed_modules: ["client", "location"] } }))).toBe(false);
    expect(quadroElegivel(quadro({ settings: { allowed_modules: ["resources", "client"] } }))).toBe(true);
    // Sem lista de módulos, todos os campos valem (como no calendário).
    expect(quadroElegivel(quadro({ settings: {} }))).toBe(true);
  });
});

describe("escolhaPorOmissao", () => {
  const base = { responsavelUserId: null, utilizadorId: null };

  it("quadro: o de visitas; senão o chamado «Visitas»; senão o único elegível; senão nenhum", () => {
    const geral = quadro({ id: "g", name: "Geral" });
    const nomeado = quadro({ id: "n", name: " visitas " });
    const tipado = quadro({ id: "t", name: "Outro", board_type: "visits" });
    expect(escolhaPorOmissao({ ...base, quadros: [geral, nomeado, tipado], recursos: [] }).boardId).toBe("t");
    expect(escolhaPorOmissao({ ...base, quadros: [geral, nomeado], recursos: [] }).boardId).toBe("n");
    expect(escolhaPorOmissao({ ...base, quadros: [geral], recursos: [] }).boardId).toBe("g");
    expect(escolhaPorOmissao({ ...base, quadros: [geral, quadro({ id: "h", name: "Obras" })], recursos: [] }).boardId).toBeNull();
    expect(escolhaPorOmissao({ ...base, quadros: [], recursos: [] }).boardId).toBeNull();
  });

  it("recurso: o do tipo utilizador do responsável da pessoa; senão o de quem está na sessão; senão nenhum", () => {
    const rita = recurso({ id: "rita", user_id: "u-resp" });
    const eu = recurso({ id: "eu", user_id: "u-me" });
    const sala = recurso({ id: "sala", resource_type: "room", user_id: "u-resp" });
    const todos = [sala, eu, rita];
    expect(escolhaPorOmissao({ quadros: [], recursos: todos, responsavelUserId: "u-resp", utilizadorId: "u-me" }).recursoId).toBe("rita");
    expect(escolhaPorOmissao({ quadros: [], recursos: todos, responsavelUserId: "ninguem", utilizadorId: "u-me" }).recursoId).toBe("eu");
    expect(escolhaPorOmissao({ quadros: [], recursos: todos, responsavelUserId: null, utilizadorId: "u-me" }).recursoId).toBe("eu");
    expect(escolhaPorOmissao({ quadros: [], recursos: todos, responsavelUserId: null, utilizadorId: null }).recursoId).toBeNull();
    // Só o tipo utilizador conta, mesmo que uma sala tenha o mesmo user_id.
    expect(escolhaPorOmissao({ quadros: [], recursos: [sala], responsavelUserId: "u-resp", utilizadorId: null }).recursoId).toBeNull();
  });
});

const comUtilizador: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null, utilizadorId: "u-me" };
let eqs: unknown[][] = [];

function responder(porTabela: Record<string, Resposta>): void {
  fromMock.mockImplementation((tabela: string) => {
    const cadeia: Record<string, unknown> = {};
    cadeia.select = vi.fn(() => cadeia);
    cadeia.order = vi.fn(() => cadeia);
    cadeia.eq = vi.fn((...a: unknown[]) => { eqs.push([tabela, ...a]); return cadeia; });
    cadeia.then = (ok: (r: Resposta) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(porTabela[tabela]).then(ok, ko);
    return cadeia;
  });
}

const BOARDS: Resposta = { data: [
  { id: "q-visitas", name: "Visitas", board_type: "visits", settings: {} },
  { id: "q-ausencias", name: "Férias", board_type: "time_off", settings: {} },
  { id: "q-frota", name: "Frota", board_type: "fleet", settings: {} },
  { id: "q-sem", name: "Sem recursos", board_type: null, settings: { allowed_modules: ["client"] } },
], error: null };
const RECURSOS: Resposta = { data: [{ id: "r-me", name: "Eu", resource_type: "user", user_id: "u-me" }, { id: "r-resp", name: "Rita", resource_type: "user", user_id: "u-resp" }], error: null };

beforeEach(() => {
  fromMock.mockReset();
  captureMock.mockReset();
  eqs = [];
});

describe("useAgendaVisita", () => {
  it("lê os quadros e os recursos ativos da organização, sem ausências nem frota, e escolhe por omissão", async () => {
    responder({ schedule_boards: BOARDS, schedule_resources: RECURSOS });
    const { result } = montarHook((p: { resp: string | null }) => useAgendaVisita(p.resp), { resp: "u-resp" }, { fonte: comUtilizador });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.quadros.map((q) => q.id)).toEqual(["q-visitas"]);
    expect(result.current.recursos.map((r) => r.id)).toEqual(["r-me", "r-resp"]);
    expect(result.current.omissao).toEqual({ boardId: "q-visitas", recursoId: "r-resp" });
    expect(result.current.isError).toBe(false);
    // Só select, e sempre com a organização e só os ativos.
    expect(eqs).toEqual(expect.arrayContaining([
      ["schedule_boards", "organization_id", "org-1"], ["schedule_boards", "is_active", true],
      ["schedule_resources", "organization_id", "org-1"], ["schedule_resources", "is_active", true],
    ]));
  });

  it("sem responsável conhecido, o recurso por omissão é o de quem está na sessão", async () => {
    responder({ schedule_boards: BOARDS, schedule_resources: RECURSOS });
    const { result } = montarHook((p: { resp: string | null }) => useAgendaVisita(p.resp), { resp: null }, { fonte: comUtilizador });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.omissao.recursoId).toBe("r-me");
  });

  it("a chave leva a organização", async () => {
    expect(agendaVisitaQueryKey("org-1")).toEqual(["neg-agenda-visita", "org-1"]);
    expect(agendaVisitaQueryKey(null)).toEqual(["neg-agenda-visita", null]);
    responder({ schedule_boards: BOARDS, schedule_resources: RECURSOS });
    const client = criarCliente();
    const { result } = montarHook(() => useAgendaVisita(null), undefined, { fonte: comUtilizador, client });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(client.getQueryState(["neg-agenda-visita", "org-1"])?.status).toBe("success");
  });

  it("uma leitura que falha dá isError, sem quadros nem recursos inventados", async () => {
    responder({ schedule_boards: { data: null, error: { message: "x" } }, schedule_resources: RECURSOS });
    const { result } = montarHook(() => useAgendaVisita(null), undefined, { fonte: comUtilizador });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.quadros).toEqual([]);
    expect(result.current.recursos).toEqual([]);
    expect(result.current.omissao).toEqual({ boardId: null, recursoId: null });
  });

  it("na fonte de exemplo não lê nada da base", async () => {
    const { result } = montarHook(() => useAgendaVisita(null), undefined, { fonte: { modo: "exemplo" } });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.quadros).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("numa fonte real sem utilizador conhecido, a omissão segue só o responsável da pessoa", async () => {
    responder({ schedule_boards: BOARDS, schedule_resources: RECURSOS });
    const { result } = montarHook(() => useAgendaVisita("u-resp"), undefined, { fonte: fonteReal() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.omissao.recursoId).toBe("r-resp");
  });
});
