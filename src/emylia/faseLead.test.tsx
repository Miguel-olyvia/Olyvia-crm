// 4/11 (Rúben, a gravação «Entrevista Completa»): a Lead e o Contacto só com o que se pergunta numa chamada
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { passosDaFase } from "./PaginaNegocio";
import { definirGuardarDadosLead } from "./DadosDaLead";
import type { Ctx } from "./pecas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
let desligar: (() => void) | null = null;
afterEach(() => { desligar?.(); desligar = null; });

const ctxDe = (S: ReturnType<typeof seed>) => {
  const run = (fn: () => void) => fn();
  return { S, A: acoes(S, () => {}, run), run, go: (fn: () => void) => () => fn() } as unknown as Ctx;
};
const LEAD_X = { entityId: "p1", primeiro: "Inês", apelido: "Lopes", empresa: "", notas: "", fonteId: "", fonte: "", campanha: "",
  comercialId: "u1", comercial: "Catarina", cliente: false, respostas: [], extra: {} };

describe("a Lead e o Contacto, como na chamada", () => {
  it("Por contactar: um só passo, «Quem pede» (o nome, o telefone e o que pediu), sem perguntas obrigatórias", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 0)!;
    const passos = passosDaFase(ctxDe(S), d, true, 0);
    expect(passos.map((p) => p.titulo)).toEqual(["Quem pede"]);
    expect(passos[0].conta?.n).toBe(0);
  });

  it("Contacto: Chamada, O que o cliente quer, Morada da obra, Qualificação, Marcar a visita (sem «Preparar a visita»)", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 1)!;
    const titulos = passosDaFase(ctxDe(S), d, true, 1).map((p) => p.titulo);
    expect(titulos.slice(0, 5)).toEqual(["Chamada", "O que o cliente quer", "Morada da obra", "Qualificação", "Marcar a visita"]);
    expect(titulos).not.toContain("Preparar a visita");
  });

  it("na página real, a Lead continua com um só passo (o nome próprio e o apelido gravam-se na pessoa)", () => {
    desligar = definirGuardarDadosLead(async () => "Inês Lopes", { fontes: [], comerciais: [{ id: "u1", name: "Catarina" }] });
    const S = seed();
    const d = S.deals.find((x) => x.fase === 0)!;
    d.dadosLead = LEAD_X;
    expect(passosDaFase(ctxDe(S), d, true, 0).map((p) => p.id)).toEqual(["quem"]);
  });
});
