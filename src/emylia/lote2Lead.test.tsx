// 19/11 (auditoria, lote 2): os negócios que ficavam presos nas primeiras fases. 1) o resultado da chamada decide o próximo passo; 2) «Tudo
// na chamada» passa a Lead a Contacto; 3) a visita cancelada resolve-se no passo Estúdio; 5) a vaga da visita guarda o ano.
// (O ponto 4, a data de início do plano gravada ao mudar, está em VisitaEstudioFluxo.test.tsx.)
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, proximo, proximoDiaUtil, seed, semVisitaPelaChamada, type Negocio } from "./motor";
import { BotaoFase, passosDaFase } from "./PaginaNegocio";
import { CONTACTO, ESCOLHAS, EXTERIOR, INTERIOR, LEAD, emFalta, grupoVisita, gruposArea, type Grupo } from "./campos";
import { RegistarChamada } from "./RegistarChamada";
import { lerVaga, rotuloVaga } from "./vagaData";
import { permEmFaltaDoPasso } from "./permissoes";
import type { Ctx } from "./pecas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => localStorage.clear());

type Aviso = { msg: string; sub?: string; kind?: string };
const montar = () => {
  const S = seed();
  const avisos: Aviso[] = [];
  const run = (fn: () => void) => fn();
  const A = acoes(S, (a: Aviso) => { avisos.push(a); }, run);
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return { S, A, ctx, avisos };
};
const preencher = (d: Negocio, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0]! : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-12-20" : "x";
};
const lead = (S: ReturnType<typeof seed>) => S.deals.find((x) => x.fase === 0 && !x.perdido && !x.anulado)!;

describe("1. o resultado da chamada decide o próximo passo", () => {
  it("«Registar chamada» sem resultado não regista: abre o negócio e diz que falta escolher (sem «Atendeu · interessado» por omissão)", () => {
    const { S, A, avisos } = montar();
    const d = lead(S);
    delete d.f.resultado;
    A.contactar(d.id);
    expect(d.fase).toBe(0);
    expect(d.f.resultado).toBeUndefined();
    expect(avisos.at(-1)).toMatchObject({ msg: "Escolha como correu a chamada" });
    // vindo de uma lista (o Hoje), abre o negócio, onde se escolhe o resultado
    expect(S).toMatchObject({ view: "negocio", deal: d.id });
  });

  it("«Não atendeu»: passa a Contacto, o próximo passo é «Voltar a ligar» com o dia (o religar da lista «Contactar hoje»)", () => {
    const { S, A } = montar();
    const d = lead(S);
    A.contactar(d.id, "Não atendeu", "2026-12-21");
    expect(d.fase).toBe(1);
    expect(d.f).toMatchObject({ resultado: "Não atendeu", religar: "2026-12-21", tentativas: "1" });
    const p = proximo(d, S);
    expect(p).toMatchObject({ t: "Voltar a ligar", act: "contactar", btn: "Registar chamada" });
    expect(p.sub).toContain("21/12/2026");
    expect(d.hist.some((h) => /Não atendeu · voltar a ligar a 21\/12\/2026/.test(h.t))).toBe(true);
  });

  it("«Ligar mais tarde» sem dia escolhido fica para o dia útil seguinte; a chamada seguinte conta mais uma tentativa e limpa o dia", () => {
    const { S, A } = montar();
    const d = lead(S);
    A.contactar(d.id, "Atendeu · ligar mais tarde");
    expect(d.f.religar).toBe(proximoDiaUtil());
    A.contactar(d.id, "Atendeu · interessado");
    expect(d.fase).toBe(1);
    expect(d.f).toMatchObject({ resultado: "Atendeu · interessado", religar: "", tentativas: "2" });
    expect(proximo(d, S)).toMatchObject({ t: "Marcar a visita", act: "marcarVisita" });
  });

  it.each(["Sem interesse", "Número errado"])("«%s»: o próximo passo propõe «Marcar como perdido»", (r) => {
    const { S, A } = montar();
    const d = lead(S);
    A.contactar(d.id, r);
    expect(d.fase).toBe(1);
    expect(proximo(d, S)).toMatchObject({ t: "Marcar como perdido", btn: "Marcar como perdido", act: "perder" });
    // o botão do passo abre a confirmação da perda; dar como perdido pede negocios.perder
    A.perder(d.id);
    expect(S.confirmPerda).toBe(d.id);
    expect(permEmFaltaDoPasso({ role: "comercial" }, "perder")).toBeNull();
  });

  it("sem «Atendeu · interessado», marcarVisita recusa e diz porquê; com ele, marca", () => {
    const { S, A, avisos } = montar();
    const d = lead(S);
    preencher(d, LEAD);
    A.contactar(d.id, "Não atendeu", "2026-12-21");
    preencher(d, CONTACTO);
    A.marcarVisita(d.id);
    expect(d.fase).toBe(1);
    expect(avisos.at(-1)).toMatchObject({ msg: "A visita ainda não se marca", kind: "bad" });
    expect(avisos.at(-1)!.sub).toContain("«Não atendeu»");
    expect(semVisitaPelaChamada(d)).toContain("Volte a ligar");
    A.contactar(d.id, "Atendeu · interessado");
    A.marcarVisita(d.id);
    expect(d.fase).toBe(2);
  });

  it("o passo «Marcar a visita com o comercial» diz porquê em vez de mostrar as vagas", () => {
    const { S, A, ctx } = montar();
    const d = lead(S);
    A.contactar(d.id, "Sem interesse");
    const vaga = passosDaFase(ctx, d, true, 1).find((p) => p.id === "vaga")!;
    render(<>{vaga.corpo}</>);
    expect(screen.getByRole("note")).toHaveTextContent("A chamada ficou como «Sem interesse»");
    expect(screen.queryByRole("button", { name: /Marcar visita/ })).toBeNull();
  });

  it("no ecrã: o resultado escolhe-se no próprio «Registar chamada»; o botão só liga depois, e «Não atendeu» pede o dia", () => {
    const { S, ctx } = montar();
    const d = lead(S);
    const espiao = vi.spyOn(ctx.A, "contactar");
    render(<RegistarChamada ctx={ctx} d={d} />);
    const botao = screen.getByRole("button", { name: /Registar chamada/ });
    expect(botao).toBeDisabled();
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.queryByLabelText("Voltar a ligar em")).toBeNull();
    fireEvent.click(screen.getByLabelText("Não atendeu"));
    const dia = screen.getByLabelText("Voltar a ligar em") as HTMLInputElement;
    fireEvent.change(dia, { target: { value: "2026-12-22" } });
    expect(botao).toBeEnabled();
    fireEvent.click(botao);
    expect(espiao).toHaveBeenCalledWith(d.id, "Não atendeu", "2026-12-22");
    expect(d.fase).toBe(1);
    expect(d.f.religar).toBe("2026-12-22");
  });

  it("o botão do passo (BotaoFase) da Lead é o «Registar chamada» com o resultado", () => {
    const { S, ctx } = montar();
    const d = lead(S);
    render(<BotaoFase ctx={ctx} d={d} />);
    expect(screen.getByRole("group", { name: "Como correu a chamada?" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Como correu a chamada?" })).getAllByRole("radio")).toHaveLength(5);
  });
});

describe("2. «Tudo na chamada» não deixa a Lead presa", () => {
  it("o resultado escrito na Lead (Tudo na chamada, ou a análise da chamada) regista a chamada: passa a Contacto", () => {
    const { S, A } = montar();
    const d = lead(S);
    A.campo(d.id, "resultado", "Atendeu · interessado");
    expect(d.fase).toBe(1);
    expect(d.f.tentativas).toBeTruthy();
    expect(d.hist.some((h) => h.t === "Chamada registada · Atendeu · interessado")).toBe(true);
  });

  it("a chamada analisada passa a Lead a Contacto (uma vez; no Contacto não mexe)", () => {
    const { S, A } = montar();
    const d = lead(S);
    A.chamadaFeita(d.id);
    expect(d.fase).toBe(1);
    const n = d.hist.length;
    A.chamadaFeita(d.id);
    expect(d.hist.length).toBe(n);
  });

  it("depois, com a visita marcada e o Contacto completo, segue para a Visita", () => {
    const { S, A } = montar();
    const d = lead(S);
    preencher(d, LEAD);
    A.campo(d.id, "resultado", "Atendeu · interessado");
    preencher(d, CONTACTO);
    A.marcarVisita(d.id, { data: "2026-12-21", hora: "10:00" });
    expect(d.fase).toBe(2);
  });
});

describe("3. a visita cancelada no fluxo do Estúdio", () => {
  const naVisita = () => {
    const m = montar();
    const d = m.S.deals.find((x) => x.linha === "wc" && x.fase === 2)!;
    for (const n of d.vis ?? []) m.A.cancelarVisita(d.id, n);
    return { ...m, d };
  };

  it("o aviso diz o que fazer: «Marque outra visita (a única foi cancelada)»", () => {
    const { A, S, d, avisos } = naVisita();
    expect(d.vis).toHaveLength(1);
    // as respostas da visita preenchidas: no aviso ficam à frente as coisas que não são campos (a visita primeiro)
    preencher(d, [...(d.vis ?? []).map(grupoVisita), EXTERIOR, INTERIOR, ...gruposArea(S.campos, d.f), ESCOLHAS]);
    A.fecharVisita(d.id);
    expect(d.fase).toBe(2);
    const aviso = avisos.find((a) => a.kind === "bad")!;
    expect(aviso.sub).toContain("Marque outra visita (a única foi cancelada)");
    expect(aviso.sub).not.toContain("por cancelar");
  });

  it("o passo Estúdio acende (falta 1) e tem as visitas no topo: marcar outra resolve", () => {
    const { ctx, d } = naVisita();
    const estudio = () => passosDaFase(ctx, d, true).find((p) => p.id === "estudio")!;
    expect(estudio().falta).toBeGreaterThanOrEqual(1);
    render(<>{estudio().corpo}</>);
    const bloco = document.querySelector('[data-bloco="visitas"]') as HTMLDetailsElement;
    expect(bloco.open).toBe(true);
    expect(within(bloco).getByText("a única visita foi cancelada")).toBeInTheDocument();
    fireEvent.click(within(bloco).getByRole("button", { name: /Marcar outra visita/ }));
    expect(d.vis).toHaveLength(2);
    // sem validação pendente, a única falta era a das visitas: com outra marcada, o passo deixa de acender
    expect(estudio().falta ?? 0).toBe(0);
  });
});

describe("5. a vaga da visita guarda o ano", () => {
  it("lerVaga: o texto antigo sem ano lê-se com o ano mais perto no futuro; a data ISO lê-se tal e qual", () => {
    const hoje = new Date(2026, 10, 19);
    expect(lerVaga("qui 15/10 · 10:00", hoje)).toEqual({ data: "2027-10-15", hora: "10:00" });
    expect(lerVaga("sex 20/11 · 9:30", hoje)).toEqual({ data: "2026-11-20", hora: "09:30" });
    expect(lerVaga("qui 19/11 · 10:00", hoje)).toEqual({ data: "2026-11-19", hora: "10:00" });
    expect(lerVaga("seg 04/01 · 10:00", hoje)).toEqual({ data: "2027-01-04", hora: "10:00" });
    expect(lerVaga("2028-02-29 · 08:00", hoje)).toEqual({ data: "2028-02-29", hora: "08:00" });
    expect(lerVaga("sem dia", hoje)).toBeNull();
    expect(rotuloVaga({ data: "2027-01-14", hora: "10:00" })).toBe("qui 14/01 · 10:00");
  });

  it("marcar com a vaga completa grava o dia com o ano (janeiro do ano seguinte)", () => {
    const { S, A } = montar();
    const d = S.deals.find((x) => x.fase === 1)!;
    preencher(d, CONTACTO);
    A.marcarVisita(d.id, { data: "2027-01-14", hora: "10:00" });
    expect(d.fase).toBe(2);
    const n = d.vis![0]!;
    expect(d.f[`v${n}_data`]).toBe("2027-01-14");
    expect(d.visita.slot).toBe("qui 14/01 · 10:00");
  });

  it("um texto antigo (sem ano) passado a marcarVisita fica no ano mais perto no futuro, não em 2026", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 11, 20, 12, 0));
    const { S, A } = montar();
    const d = S.deals.find((x) => x.fase === 1)!;
    preencher(d, CONTACTO);
    A.marcarVisita(d.id, "seg 04/01 · 10:00");
    expect(d.f[`v${d.vis![0]}_data`]).toBe("2027-01-04");
  });

  it("«Outro dia» no passo da vaga marca com a data escolhida, com o ano", () => {
    const { S, ctx } = montar();
    const d = S.deals.find((x) => x.fase === 1)!;
    preencher(d, CONTACTO);
    const vaga = passosDaFase(ctx, d, true, 1).find((p) => p.id === "vaga")!;
    const { container } = render(<>{vaga.corpo}</>);
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: "2027-02-03" } });
    fireEvent.click(screen.getByRole("button", { name: /Marcar visita/ }));
    expect(d.fase).toBe(2);
    expect(d.f[`v${d.vis![0]}_data`]).toBe("2027-02-03");
  });
});
