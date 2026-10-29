// As visitas marcadas no CRM (29/10) na agenda da Emylia: a hora de Lisboa, quem vai (o recurso atribuído) e a leitura na base.
import { afterEach, describe, expect, it, vi } from "vitest";
import { seed } from "../motor";
import { definirVisitasCrm } from "../equipa/visitasCrm";
import { visitasDaAgenda } from "../equipa/regrasAgenda";
import { carregarVisitasCrm, diaEHoraDeLisboa, visitasCrmDe } from "./agendaReal";

afterEach(() => definirVisitasCrm(null));

describe("visitas do CRM", () => {
  it("o dia e a hora são os de Lisboa (inverno UTC+0, verão UTC+1)", () => {
    expect(diaEHoraDeLisboa("2026-11-07T15:00:00+00:00")).toEqual({ data: "2026-11-07", hora: "15:00" });
    expect(diaEHoraDeLisboa("2026-07-07T23:30:00Z")).toEqual({ data: "2026-07-08", hora: "00:30" });
  });

  it("quem vai é o recurso atribuído; sem ele, Por atribuir; a duração sai do fim", () => {
    const v = visitasCrmDe([
      { id: "1", title: "Levantamento · Sérgio Matos", start_datetime: "2026-11-07T15:00:00Z", end_datetime: "2026-11-07T16:30:00Z", status: "scheduled", visit_kind: "levantamento",
        negocios: { numero: 1003, titulo: "Sérgio Matos" }, schedule_item_assignees: [{ schedule_resources: { name: "Rafael Gromicho" } }] },
      { id: "2", title: "Visita", start_datetime: "2026-11-05T09:05:00Z", end_datetime: null, status: "completed", visit_kind: null, negocios: null, schedule_item_assignees: [] },
    ]);
    expect(v[0]).toEqual({ nome: "Rafael Gromicho", papel: "comercial", data: "2026-11-07", hora: "15:00", horas: 1.5, titulo: "Levantamento · Sérgio Matos", sub: "Levantamento · Sérgio Matos", negocio: 1003 });
    expect(v[1]).toMatchObject({ nome: "Por atribuir", titulo: "Visita · Visita", horas: 1.5, feito: true });
  });

  it("entram na agenda ao lado das visitas dos negócios da Emylia", () => {
    const S = seed();
    const antes = visitasDaAgenda(S.deals).length;
    definirVisitasCrm([{ nome: "Rafael Gromicho", papel: "comercial", data: "2026-11-07", hora: "15:00", horas: 1.5, titulo: "Levantamento · X", sub: "X", negocio: 1003 }]);
    const depois = visitasDaAgenda(S.deals);
    expect(depois).toHaveLength(antes + 1);
    expect(depois[depois.length - 1]).toMatchObject({ nome: "Rafael Gromicho", data: "2026-11-07", item: { tipo: "visita", hora: "15:00", negocio: 1003 } });
  });

  it("lê da base só as do CRM (com negócio, sem número de visita da Emylia, não canceladas) da organização", async () => {
    const chamadas: string[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "neq", "not", "is", "gte"]) q[m] = (...a: unknown[]) => { chamadas.push(`${m}:${a.map(String).join(",")}`); return q; };
    q.lte = async (...a: unknown[]) => { chamadas.push(`lte:${a.map(String).join(",")}`); return { data: [], error: null }; };
    const sb = { from: vi.fn(() => ({ select: () => q })) };
    expect(await carregarVisitasCrm(sb as never, "org-1", new Date(2026, 9, 29))).toEqual({ n: 0, erro: null });
    expect(chamadas.slice(0, 4)).toEqual(["eq:organization_id,org-1", "not:negocio_id,is,null", "is:visita_numero,null", "neq:status,cancelled"]);
  });
});
