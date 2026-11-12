// 12/11: «Marcar a visita» (Contacto) fica feito com uma visita ativa na agenda do CRM ligada ao negócio, mesmo sem a vaga do motor
import { describe, expect, it, vi } from "vitest";
import { seed, visitaPassadaPeloServidor } from "@/emylia/motor";
import type { Passo } from "@/emylia/CamposFase";
import type { Ctx } from "@/emylia/pecas";
import type { VisitaDoNegocio } from "@/hooks/pessoas/useVisitasDoNegocio";
import { comVisitasDoCrm, resumoDaVisitaCrm, visitaAtivaDoCrm } from "./visitasDosPassos";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const visita = (x: Partial<VisitaDoNegocio>): VisitaDoNegocio => ({
  id: "v1", boardId: null, inicio: "2026-11-20T10:00:00Z", fim: "2026-11-20T11:00:00Z", minutos: 60, estado: "marcada", tipo: null, numeroEmylia: null,
  titulo: "Visita", notas: null, local: null, recursos: [], dia: "2026-11-20", hora: "10:00", ...x,
});
const vaga: Passo = { id: "vaga", titulo: "Marcar a visita com o comercial", icone: (() => null) as unknown as Passo["icone"], feito: false, resumo: [], corpo: null };

describe("«Marcar a visita» com a agenda do CRM", () => {
  const preparar = (visitasCrm?: VisitaDoNegocio[]) => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 1)!;
    return comVisitasDoCrm([vaga], { negocioId: "n1", ctx: { S } as unknown as Ctx, d, podeEditar: true, visitasCrm })[0]!;
  };

  it("sem visitas do CRM (ou ainda por ler) fica por fazer, como antes", () => {
    expect(preparar().feito).toBe(false);
    expect(preparar([]).feito).toBe(false);
  });

  it("uma visita marcada no CRM: feito, e o resumo é o dia e a hora", () => {
    const p = preparar([visita({})]);
    expect(p.feito).toBe(true);
    expect(p.resumo).toEqual([resumoDaVisitaCrm({ dia: "2026-11-20", hora: "10:00" })]);
    expect(p.resumo[0]).toContain("20/11");
    expect(p.resumo[0]).toContain("10:00");
  });

  it("só visitas canceladas: por fazer", () => {
    expect(preparar([visita({ estado: "cancelada" })]).feito).toBe(false);
  });

  it("com a vaga do motor, o resumo fica o da vaga", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 1)!;
    const p = comVisitasDoCrm([{ ...vaga, feito: true, resumo: ["qui 19/11 · 09:00"] }], { negocioId: "n1", ctx: { S } as unknown as Ctx, d, podeEditar: true, visitasCrm: [visita({})] })[0]!;
    expect(p.resumo).toEqual(["qui 19/11 · 09:00"]);
  });

  it("a marcada passa à frente da feita; as sombras do espelho não contam", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 1)!;
    expect(visitaAtivaDoCrm([visita({ id: "a", estado: "feita" }), visita({ id: "b" })], d)?.id).toBe("b");
    // uma linha com número da Emylia que o espelho não aponta é sombra (ou antiga só da Emylia): fora
    expect(visitaAtivaDoCrm([visita({ id: "s", numeroEmylia: 7 })], d)).toBeNull();
  });
});

// 12/11: neg_guardar_visita passou o negócio a Visita (passou_a_visita): o ecrã acompanha, sem portão, e nunca baixa a fase
describe("visitaPassadaPeloServidor", () => {
  it("Contacto → Visita, com a vaga e a linha do histórico (uma só vez)", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 1)!;
    d.f.posse = ""; // o portão do Contacto falharia: aqui não conta
    visitaPassadaPeloServidor(d, "qui 12/11 · 08:00");
    expect(d.fase).toBe(2);
    expect(d.visita.slot).toBe("qui 12/11 · 08:00");
    expect(d.hist[0]!.t).toBe("Visita marcada para qui 12/11 · 08:00");
    const n = d.hist.length;
    visitaPassadaPeloServidor(d, "qui 12/11 · 08:00");
    expect(d.hist.length).toBe(n);
    expect(d.fase).toBe(2);
  });

  it("nunca baixa a fase de um negócio já mais à frente", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase >= 3)!;
    const antes = d.fase;
    visitaPassadaPeloServidor(d, "sex 13/11 · 09:00");
    expect(d.fase).toBe(antes);
  });
});
