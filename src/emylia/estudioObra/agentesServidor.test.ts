// 25/11 (Obra Viva, etapa 3b): a volta dos agentes no servidor. As leituras da base são simuladas: o que importa aqui é que só se grava a
// obra que um agente mudou, e só se a base ainda tem o que se leu (senão fica para a volta seguinte).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Negocio } from "../motor";
import { obraDeExemplo } from "./exemploObra";

const estado = vi.hoisted(() => ({ deals: [] as unknown[], obrasNaBase: null as Map<string, unknown> | null, gravadas: [] as string[] }));

vi.mock("../real/carregarCatalogo", async (orig) => ({ ...(await orig<typeof import("../real/carregarCatalogo")>()), carregarCatalogo: vi.fn(async () => ({ erro: null, M: { ids: { servico: new Map() } }, produtos: [] })) }));
vi.mock("../real/camposConfig", async (orig) => ({ ...(await orig<typeof import("../real/camposConfig")>()), carregarCamposConfig: vi.fn(async () => undefined) }));
vi.mock("../real/agendaReal", async (orig) => ({ ...(await orig<typeof import("../real/agendaReal")>()), carregarAgendaReal: vi.fn(async () => ({ pessoas: [], erro: null })), carregarVisitasCrm: vi.fn(async () => ({ n: 0, erro: null })), aplicarCompromissos: vi.fn(() => 0) }));
vi.mock("../real/encomendaReal", async (orig) => ({ ...(await orig<typeof import("../real/encomendaReal")>()), lerEncomendasReais: vi.fn(async () => ({ mapa: new Map(), erros: [] })) }));
vi.mock("../equipa/equipasObra", async (orig) => ({ ...(await orig<typeof import("../equipa/equipasObra")>()), carregarEquipasObra: vi.fn(async () => undefined) }));
vi.mock("../real/negocioBase", async (orig) => ({
  ...(await orig<typeof import("../real/negocioBase")>()),
  lerNegocios: vi.fn(async () => (estado.deals as Negocio[]).map((d) => ({ id: `uuid-${d.id}`, entityId: "e", estadoCrm: "", fluxoEmylia: true, docsCrm: false, ec: null, linhas: { negocio: { numero: d.id } }, obra: d.obra }))),
  negocioParaOEcra: vi.fn((n: { linhas: { negocio: { numero: number } } }) => (estado.deals as Negocio[]).find((d) => d.id === n.linhas.negocio.numero)),
  lerObras: vi.fn(async () => estado.obrasNaBase),
  gravarObra: vi.fn(async (_sb: unknown, _org: string, id: string) => { estado.gravadas.push(id); return []; }),
}));

import { correrAgentesServidor } from "./agentesServidor";

/** A obra de exemplo com um buraco de 2 dias, com as propostas vistas há dois dias (o prazo do degrau 2 já passou). */
function preparar() {
  const { S, d } = obraDeExemplo();
  const p = d.obra.plano!;
  for (const t of p.tasks) if (!t.exec && t.dia > p.dia) t.dia += 2;
  estado.deals = S.deals;
  estado.gravadas = [];
  return { S, d };
}

beforeEach(() => { estado.obrasNaBase = null; });

describe("os agentes no servidor", () => {
  it("uma volta marca as propostas vistas e grava as obras que mudaram", async () => {
    const { d } = preparar();
    const r = await correrAgentesServidor({} as never, "org");
    expect(r.erros).toEqual([]);
    expect(r.obras).toBeGreaterThan(0);
    expect(Object.keys(d.obra.agentes?.vistos ?? {}).length).toBeGreaterThan(0);
    expect(estado.gravadas).toContain(`uuid-${d.id}`);
  });
  it("se a obra mudou na base entretanto (o técnico registou), não grava: fica para a volta seguinte", async () => {
    const { d } = preparar();
    estado.obrasNaBase = new Map([[`uuid-${d.id}`, { ...JSON.parse(JSON.stringify(d.obra)), chat: [{ de: "cliente", quem: "x", t: "nova", q: "agora" }] }]]);
    const r = await correrAgentesServidor({} as never, "org");
    expect(r.adiadas).toBeGreaterThan(0);
    expect(estado.gravadas).not.toContain(`uuid-${d.id}`);
  });
});
