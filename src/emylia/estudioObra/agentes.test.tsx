// 25/11 (plano «Obra Viva», etapa 1): os agentes no Estúdio da obra. As regras (degraus, prazo, o que se aplica sozinho), o motor
// (aplicar, recusar, desfazer, os vistos) e a fita no ecrã.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { acoes, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { DEGRAUS_DE_ORIGEM, aAplicarAgora, ajusteSozinho, degrauDe, modoDa, prazoDoDegrau2, propostasDosAgentes, type Proposta } from "./agentes";
import { replanear, type Replano } from "./planoVivo";
import { ocupacaoDosTecnicos } from "../preparacaoObra";
import { estadoVivo as estadoVivoDe } from "./planoVivo";

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

// 26/11 (etapa 4, ajuste contínuo): atrasos pequenos absorvidos sem pedir, folgas aproveitadas sozinhas, o fim protegido
describe("o ajuste contínuo (etapa 4)", () => {
  const R = (mud: [number, number, number, number][], fimAntes: number, fimDepois: number) => ({ plano: {} as never, fimAntes, fimDepois,
    mudancas: mud.map(([d0, u0, d1, u1], ti) => ({ ti, nome: "t", de: { dia: d0, dur: u0 }, para: { dia: d1, dur: u1 }, tipo: "adiada" as const })) }) as Replano;
  it("sozinho só o que não empurra o fim e não anda mais de 2 dias úteis", () => {
    expect(ajusteSozinho(R([[5, 2, 6, 2]], 10, 10))).toBe(true);
    expect(ajusteSozinho(R([[5, 2, 3, 2]], 10, 8))).toBe(true);
    expect(ajusteSozinho(R([[5, 2, 6, 2]], 10, 11))).toBe(false); // empurra o fim
    expect(ajusteSozinho(R([[5, 2, 8, 2]], 10, 10))).toBe(false); // 3 dias
    expect(ajusteSozinho(R([[5, 2, 5, 5]], 10, 10))).toBe(false); // cresce 3 dias
    expect(ajusteSozinho(R([], 10, 10))).toBe(false); // nada a fazer
  });

  it("cada atraso traz o ajuste sozinho só quando pôr em dia não mexe no fim", () => {
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!, oc = ocupacaoDosTecnicos(S, d.id);
    const at = propostasDosAgentes(d, S, oc).filter((x) => x.id.startsWith("atraso-"));
    expect(at.length).toBeGreaterThan(0);
    const sozinho = ajusteSozinho(replanear(p, oc, { adiantar: false }));
    for (const x of at) expect(x.auto?.acao.k === "replanear").toBe(sozinho);
  });

  it("aplicar o ajuste (a folga) vai pelo replaneamento do gestor; desfazer repõe dias e durações", () => {
    const { S, d } = obraDeExemplo();
    const A = acoes(S, () => {}, (fn) => fn());
    A.role("operacoes");
    const p = d.obra.plano!;
    const x = propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)).find((y) => y.id === "folga")!;
    expect(x.auto?.acao).toEqual({ k: "replanear", adiantar: true });
    const antes = p.tasks.map((t) => [t.dia, t.dur]);
    expect(A.agentesObra(d.id, { k: "aplicar", pid: x.id, agente: "plano", nomeAgente: "Plano", texto: x.auto!.texto, acao: x.auto!.acao, auto: true })).toBe(true);
    expect(p.tasks.map((t) => [t.dia, t.dur])).not.toEqual(antes);
    const alt = d.obra.alteracoes![0];
    expect(alt.motivo).toMatch(/^Agente Plano \(sozinho\): Adiantar/);
    expect(alt.cliente).toBe(false);
    const f = d.obra.agentes!.feitos![0];
    expect(f.antes.some((a) => a.dur != null)).toBe(true); // o revestimento atrasado cresceu um dia
    A.agentesObra(d.id, { k: "desfazer", fid: f.id });
    expect(p.tasks.map((t) => [t.dia, t.dur])).toEqual(antes);
    // desfeito é recusado: nem no degrau 3 o agente o volta a fazer
    expect(propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)).some((y) => y.id === "folga")).toBe(false);
    expect(aAplicarAgora(propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)), { ...d.obra.agentes, degraus: { plano: 3 } }).some((y) => y.id === "folga")).toBe(false);
  });

  it("o fim protegido: o atraso que empurra o fim nunca se aplica sozinho e diz porquê", () => {
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!;
    // sem folga nenhuma: tudo o que ainda não começou fica colado ao revestimento atrasado
    const rev = p.tasks.findIndex((t) => estadoVivoDe(t, p) === "atrasada");
    expect(rev).toBeGreaterThanOrEqual(0);
    let dia = p.tasks[rev].dia + p.tasks[rev].dur;
    for (const t of p.tasks) if (!t.exec && t.dia > p.tasks[rev].dia) { t.dia = dia; dia += t.dur; }
    const oc = ocupacaoDosTecnicos(S, d.id);
    const r = replanear(p, oc, { adiantar: false });
    expect(r.fimDepois).toBeGreaterThan(r.fimAntes);
    const x = propostasDosAgentes(d, S, oc).find((y) => y.id === `atraso-${rev}`)!;
    expect(x.auto).toBeUndefined();
    expect(x.sub).toMatch(/O fim da obra anda .*pede sempre a tua decisão/);
    expect(modoDa(x, { degraus: { plano: 3 } })).toBe("pede");
  });

  it("a folga aproveita-se sozinha quando cada tarefa anda até 2 dias; mais do que isso, pede", () => {
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!, oc = ocupacaoDosTecnicos(S, d.id);
    const f0 = propostasDosAgentes(d, S, oc).find((y) => y.id === "folga")!;
    expect(f0.auto?.texto).toBe("Adiantar 1 tarefa com a folga: a obra acaba 2 dias úteis mais cedo");
    expect(f0.titulo).toBe("Há folga: a obra pode acabar 2 dias úteis mais cedo"); // o mesmo número no título e na proposta
    // a montagem com mais folga ainda: anda mais de 2 dias, já não vai sozinha
    const mont = p.tasks.findIndex((t) => /Montagem/.test(t.nome));
    p.tasks[mont].dia += 3;
    const f = propostasDosAgentes(d, S, oc).find((y) => y.id === "folga");
    expect(f).toBeTruthy();
    expect(f!.auto).toBeUndefined();
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

describe("etapa 2: os avisos automáticos", () => {
  it("o Cliente propõe o rascunho quando o fim do plano mudou e o cliente ainda conta com o antigo; depois de enviar, sai", () => {
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!;
    const A = acoes(S, () => {}, (fn) => fn());
    A.role("operacoes");
    // o plano aprovado (a base) acabava antes: a última tarefa passa 3 dias para a frente
    p.base = p.tasks.map((t) => ({ dia: t.dia, dur: t.dur, h: t.h, tec: t.tec }));
    const ult = p.tasks.reduce((a, t, i) => (t.dia + t.dur > p.tasks[a].dia + p.tasks[a].dur ? i : a), 0);
    p.tasks[ult].dia += 3;
    d.obra.alteracoes = (d.obra.alteracoes ?? []).filter((a) => !a.cliente);
    const x = propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)).find((y) => y.id.startsWith("cliente-fim-"))!;
    expect(x.agente).toBe("cliente");
    const enviar = x.acoes[0].a;
    expect(enviar.k).toBe("avisarCliente");
    if (enviar.k === "avisarCliente") A.avisarClienteObra(d.id, enviar.texto);
    expect(propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)).some((y) => y.id.startsWith("cliente-fim-"))).toBe(false);
  });
  it("o registo de um aviso fica em «Desde a última visita», sem desfazer", () => {
    const { S, d } = obraDeExemplo();
    const A = acoes(S, () => {}, (fn) => fn());
    A.role("operacoes");
    A.agentesObra(d.id, { k: "registo", agente: "equipa", auto: true, texto: "Avisou o Luís das mudanças no plano" });
    const f = d.obra.agentes!.feitos![0];
    expect(f).toMatchObject({ agente: "equipa", auto: true, quem: "Olyvia", antes: [] });
  });
});

describe("etapa 3a: os agentes vigiam todas as obras", () => {
  it("uma volta marca as propostas novas como vistas e aplica a que já passou do prazo", async () => {
    const { voltaDosAgentes } = await import("./VigiaAgentes");
    const { S, d } = comBuraco();
    const A = acoes(S, () => {}, (fn) => fn());
    A.role("operacoes");
    const ctx = { S, A, run: (fn: () => void) => fn() };
    expect(voltaDosAgentes(ctx)).toBe(0); // vê pela primeira vez: o prazo começa agora
    expect(Object.keys(d.obra.agentes?.vistos ?? {}).length).toBeGreaterThan(0);
    const auto = propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)).filter((x) => x.auto);
    if (auto.length) {
      // passado o prazo (vista ontem), aplica-se sozinha
      const ontem = new Date(Date.now() - 2 * 86400000).toISOString();
      for (const x of auto) d.obra.agentes!.vistos![x.id] = ontem;
      expect(voltaDosAgentes(ctx)).toBeGreaterThan(0);
      expect(d.obra.agentes!.feitos![0].auto).toBe(true);
    }
  });
  it("sem a permissão de planear a obra, não corre", async () => {
    const { voltaDosAgentes } = await import("./VigiaAgentes");
    const { S, d } = comBuraco();
    const A = acoes(S, () => {}, (fn) => fn());
    A.role("tecnico");
    expect(voltaDosAgentes({ S, A, run: (fn: () => void) => fn() })).toBe(0);
    expect(d.obra.agentes?.vistos).toBeUndefined();
  });
});
