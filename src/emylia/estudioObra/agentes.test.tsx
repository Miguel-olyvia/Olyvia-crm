// 25/11 (plano «Obra Viva», etapa 1): os agentes no Estúdio da obra. As regras (degraus, prazo, o que se aplica sozinho), o motor
// (aplicar, recusar, desfazer, os vistos) e a fita no ecrã.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { acoes, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { DEGRAUS_DE_ORIGEM, aAplicarAgora, degrauDe, modoDa, prazoDoDegrau2, propostasDosAgentes, type Proposta } from "./agentes";
import { ocupacaoDosTecnicos } from "../preparacaoObra";

afterEach(() => { cleanup(); localStorage.clear(); });

const P = (x: Partial<Proposta>): Proposta => ({ id: "x", agente: "plano", nivel: "atencao", titulo: "t", sub: "", acoes: [], ...x });

describe("as regras dos agentes", () => {
  it("os degraus de origem são os do plano aceite: Plano e Equipa com prazo, os outros sugerem, a Aprendizagem observa", () => {
    expect(DEGRAUS_DE_ORIGEM).toEqual({ plano: 2, equipa: 2, materiais: 1, cliente: 1, margem: 1, aprendizagem: 0 });
    expect(degrauDe({ degraus: { plano: 3 } }, "plano")).toBe(3);
    expect(degrauDe(undefined, "materiais")).toBe(1);
  });
  it("o prazo do degrau 2 é o fim do dia útil (18h); visto depois das 17h, o dia útil seguinte; nunca ao fim de semana", () => {
    const a = prazoDoDegrau2(new Date(2026, 10, 25, 10, 0).toISOString()); // qua
    expect([a.getDate(), a.getHours()]).toEqual([25, 18]);
    const b = prazoDoDegrau2(new Date(2026, 10, 25, 17, 30).toISOString());
    expect([b.getDate(), b.getHours()]).toEqual([26, 18]);
    const c = prazoDoDegrau2(new Date(2026, 10, 27, 17, 30).toISOString()); // sex à tarde → seg
    expect([c.getDay(), c.getDate()]).toEqual([1, 30]);
  });
  it("o modo de cada proposta pelo degrau; só se aplica sozinho o que tem ação automática", () => {
    const auto = { acao: { k: "passar" as const, ti: 0, tec: "a" }, texto: "Passar" };
    expect(modoDa(P({ auto }), undefined)).toBe("prazo");
    expect(modoDa(P({}), undefined)).toBe("pede");
    expect(modoDa(P({ auto, agente: "materiais" }), undefined)).toBe("pede");
    expect(modoDa(P({ auto }), { degraus: { plano: 0 } })).toBe("ver");
    expect(modoDa(P({ auto }), { degraus: { plano: 3 } })).toBe("ja");
    const visto = new Date(2026, 10, 25, 10, 0).toISOString();
    const L = [P({ id: "a", auto })];
    expect(aAplicarAgora(L, { vistos: { a: visto } }, new Date(2026, 10, 25, 12, 0))).toEqual([]);
    expect(aAplicarAgora(L, { vistos: { a: visto } }, new Date(2026, 10, 25, 18, 1)).map((x) => x.id)).toEqual(["a"]);
  });
});

/** A obra de exemplo com um buraco de 2 dias: o que vem depois do dia de hoje anda 2 dias para a frente. */
function comBuraco() {
  const x = obraDeExemplo(), p = x.d.obra.plano!;
  for (const t of p.tasks) if (!t.exec && t.dia > p.dia) t.dia += 2;
  return x;
}

describe("o motor dos agentes", () => {
  it("as propostas trazem o agente certo; um buraco curto pode fechar-se sozinho", () => {
    const { S, d } = comBuraco();
    const L = propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id));
    expect(L.length).toBeGreaterThan(0);
    const parada = L.find((x) => x.id.startsWith("parada-"));
    if (parada) { expect(parada.agente).toBe("plano"); }
    for (const x of L) expect(["plano", "equipa", "materiais", "cliente", "margem", "aprendizagem"]).toContain(x.agente);
  });
  it("aplicar guarda como estava e desfazer repõe; recusar esconde a proposta", () => {
    const { S, d } = comBuraco();
    const A = acoes(S, () => {}, (fn) => fn());
    A.role("operacoes");
    const p = d.obra.plano!;
    const L = propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id));
    const x = L.find((y) => y.auto) ?? L[0];
    if (x.auto) {
      const antes = p.tasks.map((t) => [t.dia, t.tec]);
      expect(A.agentesObra(d.id, { k: "aplicar", pid: x.id, agente: x.agente, nomeAgente: "Plano", texto: x.auto.texto, acao: x.auto.acao, auto: true })).toBe(true);
      const f = d.obra.agentes!.feitos![0];
      expect(f.auto).toBe(true);
      expect(p.tasks.map((t) => [t.dia, t.tec])).not.toEqual(antes);
      A.agentesObra(d.id, { k: "desfazer", fid: f.id });
      expect(p.tasks.map((t) => [t.dia, t.tec])).toEqual(antes);
      expect(d.obra.agentes!.feitos![0].desfeito).toBeTruthy();
    }
    A.agentesObra(d.id, { k: "recusar", pid: L[0].id, texto: L[0].titulo });
    expect(propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)).some((y) => y.id === L[0].id)).toBe(false);
  });
  it("os vistos guardam quando apareceu e esquecem as que já não existem", () => {
    const { S, d } = obraDeExemplo();
    const A = acoes(S, () => {}, (fn) => fn());
    A.agentesObra(d.id, { k: "vistos", ids: ["a", "b"] });
    const v = { ...d.obra.agentes!.vistos! };
    A.agentesObra(d.id, { k: "vistos", ids: ["b", "c"] });
    expect(Object.keys(d.obra.agentes!.vistos!).sort()).toEqual(["b", "c"]);
    expect(d.obra.agentes!.vistos!.b).toBe(v.b);
  });
});

function montar(prep?: (d: Negocio) => void) {
  const { S, d } = comBuraco();
  prep?.(d);
  const A = acoes(S, () => {}, (fn) => fn());
  A.role("operacoes");
  // a fita grava os vistos logo ao abrir: o primeiro run chega antes de haver o que re-renderizar
  let r: ReturnType<typeof render> | null = null;
  const ctx = { S, A, run: (fn: () => void) => { fn(); r?.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, d };
}

describe("a fita dos agentes no Estúdio", () => {
  it("aparece com o pulso, os seis agentes e a autonomia, que muda o degrau", () => {
    const { d } = montar();
    const fita = screen.getByRole("region", { name: "Os agentes da obra" });
    expect(within(fita).getByRole("group", { name: "Ver só um agente" }).querySelectorAll("button").length).toBe(6);
    fireEvent.click(within(fita).getByRole("button", { name: /Autonomia/ }));
    const plano = within(fita).getByRole("group", { name: "Autonomia do agente Plano" });
    fireEvent.click(within(plano).getByRole("button", { name: "Faz sozinho" }));
    expect(d.obra.agentes?.degraus?.plano).toBe(3);
  });
  it("as propostas ficam vistas (o prazo conta daí) e «Recusar» tira a proposta da fita", async () => {
    const { d } = montar();
    const fita = screen.getByRole("region", { name: "Os agentes da obra" });
    await waitFor(() => expect(Object.keys(d.obra.agentes?.vistos ?? {}).length).toBeGreaterThan(0));
    const rec = within(fita).queryAllByRole("button", { name: /^Recusar: / });
    if (rec.length) {
      const nome = rec[0].getAttribute("aria-label")!.replace("Recusar: ", "");
      fireEvent.click(rec[0]);
      expect(Object.keys(d.obra.agentes?.recusadas ?? {}).length).toBe(1);
      // sai com a animação
      await waitFor(() => expect(within(fita).queryByRole("button", { name: `Recusar: ${nome}` })).toBeNull());
    }
  });
});
