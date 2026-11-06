// 6/11: a Visita de uma casa de banho com o Estúdio, de ponta a ponta, no motor verdadeiro (seed, acoes e run): os passos, abrir o
// Estúdio, decidir as peças, «Voltar ao negócio», as medidas, as respostas, as necessidades no orçamento e o plano de obra guardado.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Negocio } from "./motor";
import { passosDaFase } from "./PaginaNegocio";
import { EstudioNaVisita, PlanoEstimado } from "./VisitaEstudio";
import type { Ctx } from "./pecas";
import { retangulo } from "./planta";
import { CHAVE_ESTUDIO, abrirEstudio, devolverAoNegocio } from "@/pages/prototipo-estudio/daVisita";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(cleanup);
beforeEach(() => localStorage.clear());

const montar = () => {
  const S = seed();
  const gravacoes = { n: 0 };
  const run = (fn: () => void) => { fn(); gravacoes.n++; };
  const ctx = { S, A: acoes(S, () => {}, run), run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio;
  return { S, ctx, d, gravacoes };
};

describe("a Visita de uma casa de banho segue o Estúdio (motor verdadeiro)", () => {
  it("os passos: visitas, exterior, interior, área, Estúdio e fechar a visita", () => {
    const { ctx, d } = montar();
    const ids = passosDaFase(ctx, d, true).map((p) => p.id);
    expect(ids.slice(-2)).toEqual(["estudio", "fecho"]);
    expect(ids).not.toContain("medidas");
    expect(ids).not.toContain("nec");
    expect(ids[0]).toBe("visitas");
    // a vista não simples fica como era
    expect(passosDaFase(ctx, d, false).map((p) => p.id)).toContain("medidas");
  });

  it("abrir, decidir no Estúdio, voltar: fica tudo no negócio e nas necessidades", () => {
    const { ctx, d, gravacoes } = montar();
    // 1. abrir o Estúdio a partir da Visita
    expect(abrirEstudio(d.nome, d.f, d.id, "/negocios")).toBe(true);
    const p0 = JSON.parse(localStorage.getItem(CHAVE_ESTUDIO)!) as Projeto;
    expect(p0.negocio).toBe(d.id);
    // 2. no Estúdio: a planta (2 × 2,5 m), uma base e uma sanita com produto, e a impermeabilização
    const planta = { o: { x: 50, y: 50 }, paredes: retangulo(200, 250), pecas: [] };
    const p: Projeto = {
      ...p0, antes: planta,
      depois: { ...planta, pecas: [{ id: "b", tipo: "base", x: 50, y: 50, w: 120, h: 70 }, { id: "s", tipo: "sanita", x: 200, y: 250, w: 36, h: 52 }] },
      escolhas: { b: "bas-ard-p", s: "san-nexo-s" }, revestimento: "rev-tela-c", servicos: [{ id: "sv-imperm", q: 4.6 }], gravadoEm: Date.now(),
    };
    localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(p));
    // 3. «Voltar ao negócio»
    expect(devolverAoNegocio(p)).toBe(true);
    const antes = gravacoes.n;
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    // o projeto, a planta, as medidas e as respostas gravaram-se (pelo run)
    expect(gravacoes.n).toBeGreaterThan(antes);
    expect(JSON.parse(d.f.estudio).escolhas).toEqual({ b: "bas-ard-p", s: "san-nexo-s" });
    expect(d.f.planta).toBeTruthy();
    expect(d.visita.med.pav).toBe(5);
    expect(d.visita.med.par).toBeGreaterThan(0);
    expect(d.f.pc_base_cor).toBe("Preto");
    expect(d.f.pc_sanita_tipo).toBe("Suspensa");
    // 4. as necessidades: revê-se e junta-se; os serviços ficam no negócio
    expect(screen.getByRole("heading", { name: "Do Estúdio para as necessidades" })).toBeInTheDocument();
    const botao = screen.getByRole("button", { name: /Juntar às necessidades \((\d+)\)/ });
    const n = Number(botao.textContent!.match(/\((\d+)\)/)![1]);
    expect(n).toBeGreaterThan(0);
    const extrasAntes = Object.keys(d.visita.extra).length;
    fireEvent.click(botao);
    expect(Object.keys(d.visita.extra).length + (d.visita.prod ?? []).length).toBeGreaterThan(extrasAntes);
    expect(screen.getByText(/Nas necessidades:/)).toBeInTheDocument();
  });

  it("o plano de obra estimado guarda-se no negócio com a duração", () => {
    const { ctx, d } = montar();
    const planta = { o: { x: 50, y: 50 }, paredes: retangulo(200, 250), pecas: [] };
    const p: Projeto = {
      negocio: d.id, antes: planta, depois: { ...planta, pecas: [{ id: "b", tipo: "base", x: 50, y: 50, w: 120, h: 70 }] }, escolhas: { b: "bas-ard-p" }, acompanha: {},
      revestimento: "rev-tela-c", pavimento: "pav-tela-a", alturas: { peDireito: 250, tetoFalso: null }, estilo: { cores: [], porCategoria: {} }, ajustes: {}, gravadoEm: 1,
    };
    d.f.estudio = JSON.stringify(p);
    d.f.plano_inicio = "2026-11-16";
    render(<PlanoEstimado ctx={ctx} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: /Guardar no negócio/ }));
    expect(d.f.duracao_obra).toMatch(/úte?is/);
    expect(JSON.parse(d.f.plano_estimado)[0]).toMatchObject({ inicio: "2026-11-16" });
  });
});
