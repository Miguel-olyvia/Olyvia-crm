// 13/11/2026: numa organização real a encomenda de cliente (e a de cada adenda) é emitida pela base (fn_neg_emitir_ec_se_pronta): os botões
// «Emitir a encomenda de cliente» (A.emitirEc) e «Emitir a encomenda da adenda» (A.emitirEcsAdenda) aí não fazem nada, por isso não se
// mostram; fica o estado («Encomenda emitida» nas condições) e a frase de que é automática. O «próximo passo» não fica preso num passo
// escondido. No protótipo/exemplo (sem a ligação real) fica tudo como antes: o botão faz a emissão simulada.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useReducer, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, minhas, proximo, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { esquecerInventario } from "./inventario/loja";
import { CaminhoObra } from "./CaminhoObra";
import { MateriaisObra } from "./MateriaisObra";
import { passoDeTeste } from "./FerramentasTeste";
import { Montar } from "./v2/testeV2";
import { adendaAssinada } from "./testeAdenda";
import type { Ctx } from "./pecas";
import {
  EC_ADENDA_AUTOMATICA, EC_AUTOMATICA, EC_AUTOMATICA_PRONTA, FALTA_EC_AUTOMATICA, ecNoServidor, faltaParaArrancar, marcarEcNoServidor, passosAgora, passosPreparacao, semEncomendaCliente,
} from "./preparacaoObra";

afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => { esquecerInventario(); });

const encher = (d: Negocio, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
};

/** Como o Montar dos testes da V2, mas com a ligação real do Inventário (a de /negocios e da ficha do Pipeline). */
function MontarReal({ S, children }: { S: Estado; children: (ctx: Ctx) => React.ReactNode }) {
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const ref = useRef<Ctx | null>(null);
  if (!ref.current) {
    const run = (fn: () => void) => { fn(); redesenhar(); };
    ref.current = { S, A: acoes(S, vi.fn(), run, { abrir: vi.fn() }), run, go: (fn) => () => run(fn), q: "", setQ: vi.fn(), repor: vi.fn() };
  }
  return <>{children(ref.current)}</>;
}

/** 1027: fatura, pagamento validado, medidas aceites e plano aprovado (o contrato já está assinado). `real`: com a ligação real. */
function pagoEProntoParaEc(real: boolean) {
  const S = seed(), d = S.deals.find((x) => x.id === 1027)!;
  encher(d, FINANCEIRO); encher(d, [OBRA[0]]);
  const run = (fn: () => void) => fn();
  const A = real ? acoes(S, vi.fn(), run, { abrir: vi.fn() }) : acoes(S, vi.fn(), run);
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
  A.role("operacoes"); A.retificarMedidas(d.id); A.aprovarPlano(d.id);
  return { S, A, d };
}

const caminho = (S: Estado, d: Negocio, real: boolean) => {
  const r = real
    ? render(<MontarReal S={S}>{(ctx) => <CaminhoObra {...ctx} d={d} />}</MontarReal>)
    : render(<Montar S={S}>{(ctx) => <CaminhoObra {...ctx} d={d} />}</Montar>);
  const ver = screen.queryByRole("button", { name: "Ver o percurso" });
  if (ver) fireEvent.click(ver);
  return r;
};

describe("organização real: a encomenda de cliente é automática (sem o botão de emitir)", () => {
  it("o motor marca o Estado com a ligação real; sem ela (protótipo, exemplo) não", () => {
    const S1 = seed(); acoes(S1, vi.fn(), (fn) => fn());
    expect(ecNoServidor(S1)).toBe(false);
    const S2 = seed(); acoes(S2, vi.fn(), (fn) => fn(), { abrir: vi.fn() });
    expect(ecNoServidor(S2)).toBe(true);
    expect(ecNoServidor(null)).toBe(false);
  });

  it("real: pagamento, plano e contrato prontos e a encomenda por chegar → passo em espera, sem ação; o próximo passo espera por ela", () => {
    const { S, d } = pagoEProntoParaEc(true);
    expect(d.obra.ec ?? null).toBeNull(); // é a base que a emite
    const ec = passosPreparacao(d, S).find((x) => x.id === "ec")!;
    expect(ec).toMatchObject({ estado: "espera", who: null, t: "Encomenda de cliente", sub: EC_AUTOMATICA_PRONTA });
    expect(ec.act).toBeUndefined();
    expect(passosAgora(d, S).some((x) => x.act === "emitirEc" || x.act === "emitirEcsAdenda")).toBe(false);
    // o que falta para arrancar não manda «emitir»
    expect(faltaParaArrancar(d, undefined, S)).toContain(FALTA_EC_AUTOMATICA);
    expect(faltaParaArrancar(d, undefined, S).join(" ")).not.toMatch(/^emitir|, emitir/);
    expect(semEncomendaCliente(d, S)).toBe(EC_AUTOMATICA_PRONTA);
    // o próximo passo não aponta para um passo escondido: espera pela encomenda (não aparece no Hoje de ninguém)
    const p = proximo(d, S);
    expect(p).toMatchObject({ t: "À espera da encomenda de cliente", wait: true });
    expect(p.act).toBeUndefined();
    for (const r of ["financeiro", "operacoes", "armazem", "comercial", "direcao"] as const)
      expect(minhas(S, r).some((x) => x.d === d && (x.p.act === "emitirEc" || x.p.act === "emitirEcsAdenda"))).toBe(false);
    // as ferramentas de teste («Avançar») também só esperam
    expect(passoDeTeste(d, S)).toMatchObject({ tipo: "espera", t: "À espera da encomenda de cliente" });
  });

  it("real: o percurso não tem «Emitir no Inventário»; mostra a frase automática e «Encomenda emitida» por fazer", () => {
    const { S, d } = pagoEProntoParaEc(true);
    S.role = "financeiro";
    caminho(S, d, true);
    expect(screen.queryByRole("button", { name: "Emitir no Inventário" })).toBeNull();
    expect(screen.queryByText("Emitir a encomenda de cliente")).toBeNull();
    expect(screen.getByText(EC_AUTOMATICA_PRONTA)).toBeTruthy();
    const cond = screen.getByRole("list", { name: "Condições para arrancar" });
    expect(within(cond).getByText("Encomenda emitida").closest("li")!.textContent).toMatch(/por fazer/);
  });

  it("real, antes do pagamento: a encomenda diz que é automática", () => {
    const S = seed(), d = S.deals.find((x) => x.id === 1027)!;
    acoes(S, vi.fn(), (fn) => fn(), { abrir: vi.fn() });
    expect(passosPreparacao(d, S).find((x) => x.id === "ec")).toMatchObject({ estado: "espera", sub: EC_AUTOMATICA });
    expect(semEncomendaCliente(d, S)).toBe(EC_AUTOMATICA);
  });

  it("exemplo: a encomenda que não chegou ao Inventário continua com o botão «Emitir no Inventário», que a emite", () => {
    const { S, d } = pagoEProntoParaEc(false);
    expect(d.obra.ec?.n).toBe("EC-1027"); // no exemplo emite-se sozinha
    d.obra.ec = null; // como se não tivesse chegado ao Inventário
    expect(passosPreparacao(d, S).find((x) => x.id === "ec")).toMatchObject({ estado: "agora", who: "financeiro", act: "emitirEc", btn: "Emitir no Inventário" });
    expect(faltaParaArrancar(d)).toContain("emitir a encomenda de cliente");
    expect(proximo(d, S)).toMatchObject({ act: "emitirEc" });
    expect(minhas(S, "financeiro").some((x) => x.d === d && x.p.act === "emitirEc")).toBe(true);
    S.role = "financeiro";
    caminho(S, d, false);
    fireEvent.click(screen.getByRole("button", { name: "Emitir no Inventário" }));
    expect(d.obra.ec?.n).toBe("EC-1027");
  });
});

describe("organização real: a encomenda da adenda é automática", () => {
  const N = "AD 2026/1027-1";
  /** 1027 pago (EC-1027) e plano aprovado; uma adenda de pintura assinada, com a 1.ª parcela paga e a encomenda dela por chegar. */
  function adendaPagaSemEc() {
    const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
    encher(d, FINANCEIRO); encher(d, [OBRA[0]]);
    const A = acoes(S, vi.fn(), (fn) => fn());
    A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
    A.role("operacoes"); A.retificarMedidas(d.id); A.aprovarPlano(d.id);
    A.role("comercial"); A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu"); adendaAssinada(A, d.id, N);
    const a = d.adendas!.find((x) => x.n === N)!;
    a.faturas = [{ n: "FT 2026/990", q: "13/11", i: 0, l: "1.ª", p: 0.5, v: 100, recibo: { n: "RC 2026/990", q: "13/11" } }];
    return { S, d };
  }

  it("exemplo: o passo e os Materiais têm «Emitir a encomenda da adenda»", () => {
    const { S, d } = adendaPagaSemEc();
    expect(passosPreparacao(d, S).find((x) => x.id === "ec-ad-" + N)).toMatchObject({ estado: "agora", act: "emitirEcsAdenda" });
    expect(faltaParaArrancar(d)).toContain(`emitir a encomenda da adenda ${N}`);
    render(<Montar S={S}>{(ctx) => <MateriaisObra {...ctx} d={d} />}</Montar>);
    expect(screen.getByRole("button", { name: "Emitir a encomenda da adenda" })).toBeTruthy();
  });

  it("real: sem o botão nem o passo a fazer; a frase automática; o próximo passo não aponta para emitirEcsAdenda", () => {
    const { S, d } = adendaPagaSemEc();
    marcarEcNoServidor(S);
    const passo = passosPreparacao(d, S).find((x) => x.id === "ec-ad-" + N)!;
    expect(passo).toMatchObject({ estado: "espera", who: null, sub: EC_ADENDA_AUTOMATICA });
    expect(passo.act).toBeUndefined();
    expect(faltaParaArrancar(d, undefined, S)).toContain(`a encomenda da adenda ${N} (emitida automaticamente)`);
    expect(proximo(d, S).act).not.toBe("emitirEcsAdenda");
    for (const r of ["financeiro", "operacoes", "armazem"] as const)
      expect(minhas(S, r).some((x) => x.d === d && x.p.act === "emitirEcsAdenda")).toBe(false);
    render(<Montar S={S}>{(ctx) => <MateriaisObra {...ctx} d={d} />}</Montar>);
    expect(screen.queryByRole("button", { name: "Emitir a encomenda da adenda" })).toBeNull();
    expect(screen.getByText(EC_ADENDA_AUTOMATICA)).toBeTruthy();
  });
});
