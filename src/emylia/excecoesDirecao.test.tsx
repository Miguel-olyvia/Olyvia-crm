// 25/11 (contratos reais da Mudelar: «Projeto 3D» a 0 € como oferta, instalações da tabela antiga abaixo do custo): a aprovação da
// Direção cobre também as linhas abaixo do custo e as ofertas a 0 €, com o motivo no cartão do Hoje; e uma edição do orçamento só anula
// a aprovação já dada se a margem ou os preços aprovados piorarem.
import { useReducer } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, alertas, aprovacaoPiorou, bloqueado, fotoAprov, minhas, motivosExcecao, seed, textoBloqueios, tot, type Estado, type Negocio } from "./motor";
import { OrcamentoSimples } from "./OrcamentoSimples";

afterEach(cleanup);

/** Um negócio com orçamento por enviar, com pelo menos 3 serviços, todos com custo e margem acima do mínimo (sem bloqueios). */
function preparar() {
  const S = seed();
  const A = acoes(S, vi.fn(), (fn) => fn());
  const d = S.deals.find((x) => x.orc && x.fase === 3 && x.orc.linhas.filter((l) => l.t === "svc" && l.cu > 0).length >= 3) as Negocio;
  const o = d.orc!;
  Object.assign(o, { enviada: null, aceite: null, aprov: null, verif: true, desconto: 0 });
  // tudo no alvo: o que bloquear é só o que o teste puser
  for (const l of o.linhas) if (l.t === "svc") l.pu = Math.ceil((l.cu / (1 - S.cfg.alvo / 100)) * 100) / 100;
  const svc = o.linhas.map((l, i) => ({ l, i })).filter((x) => x.l.t === "svc" && x.l.cu > 0);
  S.role = "comercial";
  return { S, A, d, o, svc };
}
const bloqueiosAprovaveis = (d: Negocio, S: Estado) => alertas(d, S).filter((a) => a.k === "x" && a.aprov);
const semOutrosBloqueios = (d: Negocio, S: Estado) => alertas(d, S).filter((a) => a.k === "x" && !a.aprov).length === 0;

describe("a aprovação da Direção cobre os preços abaixo do custo e as ofertas a 0 €", () => {
  it("uma linha a 0 € é uma «oferta a 0 €» que se pede e aprova; aprovada, o «Verificar» já não bloqueia", () => {
    const { S, A, d, svc } = preparar();
    const nome = S.svc[(svc[0].l as { sid: string }).sid].n;
    A.precoLinha(d.id, svc[0].i, 0);
    A.verificar(d.id);
    const B = bloqueiosAprovaveis(d, S);
    expect(B.map((a) => a.motivo)).toContain("oferta");
    expect(bloqueado(d, S)).toBe(true);
    expect(motivosExcecao(d, S)).toContain(`${nome}: oferta a 0 €`);
    expect(semOutrosBloqueios(d, S)).toBe(true);
    A.pedirAprov(d.id);
    const cartao = minhas(S, "direcao").find((x) => x.d === d && x.dir);
    expect(cartao?.p.sub).toContain(`${nome}: oferta a 0 €`);
    expect(cartao?.p.sub).toMatch(/de margem · mínimo \d+%/);
    S.role = "direcao";
    A.aprovar(d.id);
    expect(d.orc!.aprov).toBe("ok");
    expect(bloqueado(d, S)).toBe(false);
    expect(textoBloqueios(d, S)).toBe("");
  });

  it("um preço uns cêntimos abaixo do custo diz «abaixo do custo» no cartão e a Direção aprova-o", () => {
    const { S, A, d, svc } = preparar();
    const l = svc[1].l as { sid: string; cu: number };
    const nome = S.svc[l.sid].n;
    A.precoLinha(d.id, svc[1].i, Math.round((l.cu - 0.49) * 100) / 100);
    expect(bloqueiosAprovaveis(d, S).find((a) => a.i === svc[1].i)?.motivo).toBe("custo");
    A.pedirAprov(d.id);
    expect(minhas(S, "direcao").find((x) => x.d === d && x.dir)?.p.sub).toContain(`${nome}: abaixo do custo`);
    S.role = "direcao";
    A.aprovar(d.id);
    expect(bloqueado(d, S)).toBe(false);
  });

  it("só a margem baixa continua a dizer só a margem no cartão", () => {
    const { S, A, d } = preparar();
    A.descontoOrc(d.id, 10);
    A.pedirAprov(d.id);
    const sub = minhas(S, "direcao").find((x) => x.d === d && x.dir)?.p.sub ?? "";
    expect(sub).toMatch(/^-?\d+(,\d+)?% de margem · mínimo \d+%$/);
  });
});

describe("uma edição só anula a aprovação se a margem ou os preços aprovados piorarem", () => {
  /** A oferta a 0 € aprovada pela Direção na 1.ª linha de serviço. */
  function aprovado() {
    const P = preparar();
    P.A.precoLinha(P.d.id, P.svc[0].i, 0);
    P.A.pedirAprov(P.d.id);
    P.S.role = "direcao";
    P.A.aprovar(P.d.id);
    P.S.role = "comercial";
    expect(P.o.aprov).toBe("ok");
    return P;
  }

  it("mudar o IVA, as zonas ou subir o preço de outra linha mantém a aprovação", () => {
    const { S, A, d, o, svc } = aprovado();
    A.ivaLinha(d.id, svc[1].i, 23);
    expect(o.aprov).toBe("ok");
    A.zonasOrc(d.id, ["Casa de banho"]);
    expect(o.aprov).toBe("ok");
    A.precoLinha(d.id, svc[2].i, (o.linhas[svc[2].i] as { pu: number }).pu + 50);
    expect(o.aprov).toBe("ok");
    A.descontoOrc(d.id, 0); // já era 0: nada muda
    expect(o.aprov).toBe("ok");
    expect(bloqueado(d, S)).toBe(false);
  });

  it("baixar o preço de outra linha (a margem desce) anula a aprovação e fica no histórico", () => {
    const { A, d, o, svc } = aprovado();
    A.precoLinha(d.id, svc[2].i, (o.linhas[svc[2].i] as { pu: number }).pu - 1);
    expect(o.aprov).toBeNull();
    expect(d.hist[0].t).toMatch(/Aprovação da Direção anulada/);
  });

  it("subir o desconto anula; uma linha nova abaixo do custo (não aprovada) também", () => {
    const P = aprovado();
    P.A.descontoOrc(P.d.id, 5);
    expect(P.o.aprov).toBeNull();
    const Q = aprovado();
    // subir o preço da linha 2 para não baixar a margem total, e pôr a 3 abaixo do custo: é uma exceção nova
    const l1 = Q.o.linhas[Q.svc[1].i] as { pu: number; cu: number; q: number };
    const l2 = Q.o.linhas[Q.svc[2].i] as { pu: number; cu: number; q: number };
    const depois = { m: tot(Q.d, Q.S).m + 0.5, x: { ...fotoAprov(Q.d, Q.S).x, ["s:novo"]: 1 } };
    expect(aprovacaoPiorou(fotoAprov(Q.d, Q.S), depois)).toBe(true);
    Q.A.precoLinha(Q.d.id, Q.svc[1].i, l1.pu + 10000);
    expect(Q.o.aprov).toBe("ok");
    Q.A.precoLinha(Q.d.id, Q.svc[2].i, Math.round(l2.cu * 0.9 * 100) / 100);
    expect(Q.o.aprov).toBeNull();
  });

  it("a oferta aprovada volta a ter preço («Usar X €»): mantém-se aprovada (a margem sobe)", () => {
    const { A, d, o, svc } = aprovado();
    A.precoLinha(d.id, svc[0].i, 10);
    expect(o.aprov).toBe("ok");
  });

  it("baixar o preço da linha aprovada (abaixo do aprovado) anula", () => {
    const P = preparar();
    const l = P.o.linhas[P.svc[0].i] as { cu: number };
    P.A.precoLinha(P.d.id, P.svc[0].i, Math.round(l.cu * 0.9 * 100) / 100);
    P.A.pedirAprov(P.d.id);
    P.S.role = "direcao"; P.A.aprovar(P.d.id); P.S.role = "comercial";
    P.A.precoLinha(P.d.id, P.svc[0].i, Math.round(l.cu * 0.5 * 100) / 100);
    expect(P.o.aprov).toBeNull();
  });
});

describe("o ecrã do orçamento depois de aprovada a exceção", () => {
  function Pagina({ S, d }: { S: Estado; d: Negocio }) {
    const [, refazer] = useReducer((x: number) => x + 1, 0);
    const run = (fn: () => void) => { fn(); refazer(); };
    const ctx = { S, A: acoes(S, vi.fn(), run), run, go: (fn: () => void) => () => run(fn), q: "", setQ: vi.fn() };
    return <OrcamentoSimples {...ctx} d={d} />;
  }

  it("a linha aprovada sai do «A corrigir» e aparece no cartão verde com o motivo; sem botão de pedir outra vez", () => {
    const { S, A, d, svc } = preparar();
    const nome = S.svc[(svc[0].l as { sid: string }).sid].n;
    A.precoLinha(d.id, svc[0].i, 0);
    A.verificar(d.id);
    expect(semOutrosBloqueios(d, S)).toBe(true);
    A.pedirAprov(d.id);
    S.role = "direcao"; A.aprovar(d.id);
    render(<Pagina S={S} d={d} />);
    expect(screen.queryByText(/A corrigir/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pedir aprovação à Direção" })).not.toBeInTheDocument();
    expect(screen.getByText("Exceção aprovada pela Direção. Pode enviar.")).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Exceções aprovadas" });
    expect(within(lista).getByText(`${nome} · oferta a 0 €`)).toBeInTheDocument();
  });
});
