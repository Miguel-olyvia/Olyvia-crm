// 9/11: o plano da obra na visita (o mesmo que a obra vai ter) e a ligação do Estúdio ao Catálogo verdadeiro.
import { describe, expect, it, vi } from "vitest";
import { TECS, seed, type Negocio } from "./motor";
import { planoDaVisita, planoDoEstudio } from "./planoDaVisita";
import { retangulo } from "./planta";
import { lerCatalogo } from "./v2/catalogoStore";
import { simularNoNegocio } from "./estudioNoNegocio";
import { juntarExtra, mudarExtra, projetoNoCatalogo, reporServico, trocarServico } from "@/pages/prototipo-estudio/servicosDoCatalogo";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const planta = { o: { x: 50, y: 50 }, paredes: retangulo(200, 250), pecas: [] };
const projeto = (extra: Partial<Projeto> = {}): Projeto => ({
  negocio: 1, antes: planta,
  depois: { ...planta, pecas: [{ id: "b", tipo: "base", x: 50, y: 50, w: 120, h: 70 }, { id: "s", tipo: "sanita", x: 200, y: 250, w: 36, h: 52 }] },
  escolhas: { b: "bas-ard-p", s: "san-nexo-s" }, acompanha: {}, revestimento: "rev-tela-c", alturas: { peDireito: 250, tetoFalso: null },
  estilo: { cores: [], porCategoria: {} }, ajustes: {}, ...extra,
});
const visita = () => { const S = seed(); return { S, d: S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio }; };

describe("o plano da obra na visita", () => {
  it("as tarefas têm o técnico do ofício e as datas em dias úteis, a partir do dia de início", () => {
    const { S, d } = visita();
    const { d: dc } = simularNoNegocio(d, projeto(), S, lerCatalogo().produtos ?? []);
    const P = planoDaVisita(dc, S, "2026-11-16");
    expect(P.tarefas.length).toBeGreaterThan(2);
    expect(P.inicio?.getDate()).toBe(16);
    for (const t of P.tarefas) {
      expect([0, 6]).not.toContain(t.inicio.getDay());
      expect(t.fim.getTime()).toBeGreaterThanOrEqual(t.inicio.getTime());
    }
    expect(P.equipa.length).toBeGreaterThan(0);
    expect(P.tarefas.find((t) => /Revestimento/.test(t.nome))?.tecNome).not.toBe("Por atribuir");
    // a cópia não mexe no negócio
    expect(d.f.estudio_levado).toBeUndefined();
  });

  it("um técnico com outra obra nesses dias dá o lugar a outro do mesmo ofício", () => {
    const { S, d } = visita();
    const { d: dc } = simularNoNegocio(d, projeto(), S, lerCatalogo().produtos ?? []);
    const P0 = planoDaVisita(dc, S, "2026-11-16");
    const t0 = P0.tarefas.find((t) => t.tec && TECS.filter((x) => x.sk === TECS.find((y) => y.id === t.tec)?.sk).length > 1);
    if (!t0) return; // o exemplo não tem dois técnicos do mesmo ofício
    // outra obra, com esse técnico ocupado na semana toda (12/11: a agenda conta em horas: 15 dias de 8 h)
    const outro = S.deals.find((x) => x.id !== d.id)!;
    outro.obra.plano = { tasks: [{ nome: "Outra obra", svcs: [], dia: 0, dur: 15, sk: "", h: 120, tec: t0.tec }], estado: "aprovado", dia: 0, origem: "orcamento", inicio: "2026-11-16" };
    const P1 = planoDaVisita(dc, S, "2026-11-16");
    const t1 = P1.tarefas.find((t) => t.nome === t0.nome)!;
    expect(t1.tec).not.toBe(t0.tec);
    expect(t1.ocupado).toBeUndefined();
  });

  it("sem negócio, o plano sai só dos serviços do Estúdio", () => {
    const { S } = visita();
    const P = planoDoEstudio([{ sid: "revest", q: 20 }], S, "2026-11-16");
    expect(P.tarefas).toHaveLength(1);
    expect(P.tarefas[0].materiais.length + P.tarefas[0].h).toBeGreaterThan(0);
  });
});

describe("o Estúdio ligado ao Catálogo", () => {
  it("os trabalhos têm o serviço do Catálogo; trocar, tirar, repor e juntar outro", () => {
    const { S } = visita();
    const K = lerCatalogo().produtos ?? [];
    let p = projeto();
    const L = projetoNoCatalogo(p, S, K);
    const rev = L.servicos.find((s) => s.sid === "revest")!;
    expect(rev.q).toBeGreaterThan(0);
    expect(L.produtos.length).toBeGreaterThan(0);
    // trocar o revestimento por outro serviço do Catálogo
    p = trocarServico(p, rev.chave, "pav");
    expect(projetoNoCatalogo(p, S, K).servicos.find((s) => s.chave === rev.chave)).toMatchObject({ sid: "pav", trocado: true });
    // tirar e repor
    p = trocarServico(p, rev.chave, null);
    expect(projetoNoCatalogo(p, S, K).tirados.map((x) => x.chave)).toContain(rev.chave);
    p = reporServico(p, rev.chave);
    expect(projetoNoCatalogo(p, S, K).servicos.find((s) => s.chave === rev.chave)?.sid).toBe("revest");
    // juntar um serviço à mão, mudar a quantidade e tirá-lo
    p = juntarExtra(p, "eletr", 2);
    expect(projetoNoCatalogo(p, S, K).servicos.find((s) => s.chave === "extra:eletr")).toMatchObject({ q: 2, origem: "extra" });
    p = mudarExtra(p, "eletr", 0);
    expect(projetoNoCatalogo(p, S, K).servicos.some((s) => s.sid === "eletr")).toBe(false);
  });

  it("o que se tirou no Estúdio sai do negócio na volta seguinte", () => {
    const { S, d } = visita();
    const K = lerCatalogo().produtos ?? [];
    const { d: d1 } = simularNoNegocio(d, projeto(), S, K);
    expect(d1.visita.extra.revest).toBeGreaterThan(0);
    const chave = projetoNoCatalogo(projeto(), S, K).servicos.find((s) => s.sid === "revest")!.chave;
    const { d: d2 } = simularNoNegocio(d1, trocarServico(projeto(), chave, null), S, K);
    expect(d2.visita.extra.revest).toBeUndefined();
  });
});
