// O fluxo das adendas de ponta a ponta (21/10/2026): o preço que o comercial vê é o que o cliente recebe; o cliente assina
// ou não aceita no portal; assinada, junta-se ao contrato (valor e documento) e entra no plano, sem cair em dias passados.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import { CATALOGO_TODO } from "./catalogo";
import type { Ctx } from "./pecas";
import { PortalCliente, passoPortal } from "./PortalCliente";
import { ContratoDoc, totais } from "./DocsCliente";
import { linhaAdenda, previsaoLinha, totalComIva, valorContrato } from "./adendas";

afterEach(cleanup);

// 1027 Tiago Almeida: contrato assinado, plano do orçamento por aprovar
const preparar = () => { const S = seed(); return { S, A: acoes(S, () => {}, (fn) => fn()), d: S.deals.find((x) => x.id === 1027)! }; };

function Portal({ S, d, A }: { S: Estado; d: Negocio; A: ReturnType<typeof acoes> }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return <PortalCliente ctx={ctx} d={d} fechar={() => {}} />;
}

describe("criar a adenda", () => {
  it("a pré-visualização tem o mesmo preço e as mesmas horas que a adenda enviada, mesmo num serviço do Catálogo ainda sem uso", () => {
    const { S } = preparar();
    const novos = CATALOGO_TODO.filter((c) => !S.svc[c.id]);
    const semReceita = novos.find((c) => !c.rs), comReceita = novos.find((c) => c.rs);
    for (const c of [semReceita, comReceita].filter(Boolean)) {
      const antes = previsaoLinha(S, c!.id, 3)!;
      expect(S.svc[c!.id]).toBeUndefined(); // a pré-visualização não mexe no estado
      expect(linhaAdenda(S, c!.id, 3)).toEqual(antes);
    }
  });
  it("quantidades a zero ou inválidas não entram; as decimais arredondam", () => {
    const { A, d } = preparar();
    A.criarAdenda(d.id, [{ sid: "pint", q: 0 }, { sid: "pint", q: Number.NaN }], "O cliente pediu");
    expect(d.adendas).toBeUndefined();
    A.criarAdenda(d.id, [{ sid: "pint", q: 12.345 }], "O cliente pediu");
    expect(d.adendas![0].linhas[0].q).toBe(12.35);
  });
});

describe("o cliente responde no portal", () => {
  it("não aceita (com o porquê): nada muda no contrato nem no plano; a seguinte tem o número seguinte", () => {
    const { S, A, d } = preparar();
    const n0 = d.obra.plano!.tasks.length, v0 = valorContrato(d, S);
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    A.recusarAdenda(d.id, "AD 2026/1027-1", "O preço");
    expect(d.adendas![0]).toMatchObject({ estado: "recusada", recusa: "O preço" });
    expect(passoPortal(d).estado).toBe("obra");
    expect(d.obra.plano!.tasks).toHaveLength(n0);
    expect(valorContrato(d, S)).toEqual(v0);
    A.assinarAdenda(d.id, "AD 2026/1027-1"); // já não se assina
    expect(d.adendas![0].estado).toBe("recusada");
    A.criarAdenda(d.id, [{ sid: "pint", q: 10 }], "O cliente pediu");
    expect(d.adendas![1].n).toBe("AD 2026/1027-2");
  });
  it("o comercial retira a enviada: sai do portal", () => {
    const { A, d } = preparar();
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "Erro de medição");
    A.anularAdenda(d.id, "AD 2026/1027-1");
    expect(d.adendas![0].estado).toBe("anulada");
    expect(passoPortal(d).estado).toBe("obra");
  });
  it("no portal: «Não aceito» pede o porquê e volta à obra, com o aviso", () => {
    const { S, A, d } = preparar();
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    render(<Portal S={S} d={d} A={A} />);
    expect(screen.getByText(/O contrato passa de .* € para .* €, com IVA/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: "Não aceito" }));
    const nao = screen.getByRole("button", { name: "Não aceitar a adenda" }) as HTMLButtonElement;
    expect(nao.disabled).toBe(true); // primeiro, o porquê
    fireEvent.click(screen.getByRole("button", { name: /O prazo/ }));
    fireEvent.click(nao);
    expect(d.adendas![0]).toMatchObject({ estado: "recusada", recusa: "O prazo" });
    expect(screen.getByText(/Não aceitou a adenda AD 2026\/1027-1/)).toBeTruthy();
  });
});

describe("assinada, junta-se ao contrato", () => {
  it("o valor do contrato soma só as assinadas; o contrato e os documentos do portal mostram-na", () => {
    const { S, A, d } = preparar();
    const c0 = totais(d, S).total;
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    A.criarAdenda(d.id, [{ sid: "pint", q: 5 }], "Surpresa em obra");
    A.simularAdenda(d.id, "AD 2026/1027-1");
    const [a1, a2] = d.adendas!;
    expect(a1).toMatchObject({ estado: "assinada", assinatura: { tipo: "digital" } });
    expect(a2.estado).toBe("enviada");
    const V = valorContrato(d, S);
    expect(V.contrato).toBeCloseTo(c0, 2);
    expect(V.adendas).toBeCloseTo(totalComIva(a1.linhas), 2);
    expect(V.total).toBeCloseTo(c0 + totalComIva(a1.linhas), 2);
    render(<ContratoDoc S={S} d={d} />);
    const sec = screen.getByRole("region", { name: "Adendas ao contrato" });
    expect(within(sec).getByText("Valor do contrato, com IVA")).toBeTruthy();
    expect(within(sec).queryByText(/AD 2026\/1027-2/)).toBeNull();
    cleanup();
    A.recusarAdenda(d.id, a2.n, "Quero falar primeiro");
    render(<Portal S={S} d={d} A={A} />);
    const docs = screen.getByRole("region", { name: "Documentos" });
    expect(within(docs).getByRole("button", { name: /Contrato CT 2026\/1027 \+ 1 adenda/ })).toBeTruthy();
    expect(within(docs).getByRole("button", { name: /Adenda AD 2026\/1027-1/ })).toBeTruthy();
    expect(within(docs).queryByRole("button", { name: /AD 2026\/1027-2/ })).toBeNull();
  });
  it("com a obra em curso, a tarefa da adenda não cai num dia que já passou", () => {
    const { A, d } = preparar();
    const p = d.obra.plano!;
    p.estado = "em curso"; p.dia = Math.max(...p.tasks.map((t) => t.dia + t.dur)) - 1; // quase no fim
    A.criarAdenda(d.id, [{ sid: "demol", q: 2 }], "Surpresa em obra");
    A.simularAdenda(d.id, d.adendas![0].n);
    const t = p.tasks.find((x) => /adenda/.test(x.nome))!;
    expect(t.dia).toBeGreaterThanOrEqual(p.dia);
    expect(p.estado).toBe("em curso");
  });
});
