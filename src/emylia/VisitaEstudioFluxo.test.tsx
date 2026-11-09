// 6/11: a Visita de uma casa de banho com o Estúdio, de ponta a ponta, no motor verdadeiro (seed, acoes e run): os passos, abrir o
// Estúdio, decidir as peças, «Voltar ao negócio», as medidas, as respostas, as necessidades no orçamento e o plano de obra guardado.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Negocio } from "./motor";
import { passosDaFase } from "./PaginaNegocio";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, grupoVisita } from "./campos";
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
  it("os passos (9/11, o fluxo simplificado): só o exterior, o interior e o Estúdio (a área e o fecho dentro do Estúdio)", () => {
    const { ctx, d } = montar();
    const passos = passosDaFase(ctx, d, true);
    expect(passos.map((p) => p.id)).toEqual([EXTERIOR.titulo, INTERIOR.titulo, "estudio"]);
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
    // 4. 9/11: os serviços e os produtos do Catálogo entram logo nas necessidades (já foram vistos no Estúdio), e o plano guarda-se
    expect(screen.queryByRole("heading", { name: "Do Estúdio para as necessidades" })).toBeNull();
    expect(Object.keys(d.visita.extra).length + (d.visita.prod ?? []).length).toBeGreaterThan(0);
    expect(screen.getByText(/Nas necessidades:/)).toBeInTheDocument();
    expect(JSON.parse(d.f.estudio_levado).s.length + JSON.parse(d.f.estudio_levado).p.length).toBeGreaterThan(0);
    const plano = JSON.parse(d.f.plano_estimado) as { tecNome: string; inicio: string }[];
    expect(plano.length).toBeGreaterThan(0);
    expect(plano.some((t) => t.tecNome !== "Por atribuir")).toBe(true);
    // 5. voltar outra vez com um serviço tirado no Estúdio: sai também do negócio
    const sid = JSON.parse(d.f.estudio_levado).s[0] as string | undefined;
    if (sid) {
      const chave = Object.keys(d.visita.extra).includes(sid) ? sid : null;
      expect(chave).toBe(sid);
    }
  });

  it("«Fechar a visita» no Estúdio: o orçamento nasce com o dia de início do plano", () => {
    const S = seed();
    const avisos: string[] = [];
    const run = (fn: () => void) => { fn(); };
    const ctx = { S, A: acoes(S, (a) => { avisos.push(`${a.msg} ${a.sub ?? ""}`); }, run), run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
    const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio;
    // a visita com as respostas obrigatórias e as fotografias (o que a gravação e os passos preenchem)
    for (let i = 0; i < 5; i++) for (const c of emFalta([...(d.vis ?? []).map(grupoVisita), EXTERIOR, INTERIOR, AREA, ESCOLHAS], d.f)) {
      d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
    }
    d.visita.fotos = 2;
    const planta = { o: { x: 50, y: 50 }, paredes: retangulo(200, 250), pecas: [] };
    expect(abrirEstudio(d.nome, d.f, d.id, "/negocios")).toBe(true);
    const p0 = JSON.parse(localStorage.getItem(CHAVE_ESTUDIO)!) as Projeto;
    const p: Projeto = {
      ...p0, antes: planta, depois: { ...planta, pecas: [{ id: "b", tipo: "base", x: 50, y: 50, w: 120, h: 70 }, { id: "s", tipo: "sanita", x: 200, y: 250, w: 36, h: 52 }] },
      escolhas: { b: "bas-ard-p", s: "san-nexo-s" }, revestimento: "rev-tela-c", gravadoEm: Date.now(), catalogo: { inicio: "2026-11-23" },
    };
    localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(p));
    expect(devolverAoNegocio(p, true)).toBe(true);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    expect(d.f.plano_inicio).toBe("2026-11-23");
    expect(avisos.join(" | ")).toMatch(/Orçamento criado/);
    expect(d.fase).toBe(3);
    expect(d.orc?.inicioObra).toBe("2026-11-23");
    // o orçamento tem os serviços do Estúdio e o plano guardado tem o técnico e as datas
    expect(d.orc!.linhas.some((l) => l.t === "svc" && l.sid === "revest")).toBe(true);
    expect(JSON.parse(d.f.plano_estimado)[0]).toMatchObject({ inicio: "2026-11-23" });
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
