// 4/11 (Rúben): a fase Lead com os campos da Olyvia original, em passos que fazem sentido
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
const LEAD_X = { entityId: "p1", primeiro: "Ana", apelido: "Lopes", empresa: "Lopes, Lda.", notas: "", fonteId: "s1", fonte: "Feira", campanha: "",
  comercialId: "u1", comercial: "Rui Costa", respostas: [], extra: {} };

describe("a fase Lead", () => {
  it("no protótipo: Quem é, Como falar com o cliente, Como chegou e O pedido, com as perguntas de sempre em cada um", () => {
    const S = seed();
    const d = S.deals.find((x) => x.fase === 0)!;
    const passos = passosDaFase(ctxDe(S), d, true, 0);
    expect(passos.map((p) => p.titulo)).toEqual(["Quem é", "Como falar com o cliente", "Como chegou", "O pedido"]);
    // o email, o tipo de cliente e o NIF contam em «Quem é»; o RGPD em «Como falar com o cliente»
    expect(passos[0].conta?.n).toBe(2); // email e tipo de cliente (o NIF é opcional)
  });

  it("na página real, com a lead: também «Quem acompanha» (o comercial) e o resumo com a empresa e a fonte", () => {
    desligar = definirGuardarDadosLead(async () => "Ana Lopes", { fontes: [{ id: "s1", name: "Feira" }], comerciais: [{ id: "u1", name: "Rui Costa" }] });
    const S = seed();
    const d = S.deals.find((x) => x.fase === 0)!;
    d.dadosLead = LEAD_X;
    const passos = passosDaFase(ctxDe(S), d, true, 0);
    expect(passos.map((p) => p.id)).toEqual(["quem", "falar", "origem", "pedido", "comercial"]);
    expect(passos[0].resumo).toContain("Lopes, Lda.");
    expect(passos[2].resumo).toContain("Feira");
    expect(passos[4]).toMatchObject({ titulo: "Quem acompanha", feito: true, resumo: ["Rui Costa"] });
  });
});
