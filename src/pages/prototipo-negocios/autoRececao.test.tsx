// O fim da obra (15/10/2026): o auto de receção (gerado no fim, assinado pelo cliente no portal), o relatório da obra com o
// histórico, e a adenda assinada no portal (junta ao contrato).
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, proximo, seed, type Assinatura, type Estado, type Negocio } from "./motor";
import { OBRA, emFalta, type Grupo } from "./campos";
import type { Ctx } from "./pecas";
import { PortalCliente, passoPortal } from "./PortalCliente";
import { ContratoDoc } from "./DocsCliente";
import { completarParaEncerrar } from "./encerrarObra";
import { fotosPorFase, garantiaAte, historiaDaObra, resumoObra } from "./historiaObra";
import { adendaPorAssinar } from "./testeAdenda";

afterEach(cleanup);

function preencher(d: Negocio, gs: Grupo[]) {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
}
const ASS: Assinatura = { tipo: "digital", nome: "Tiago Almeida", q: "30/10/2026 18:05", id: "CMD-TESTE1" };
/** 1027 Tiago Almeida: contrato assinado; põe a obra em curso e regista o fim. */
function obraAcabada() {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  d.fase = 5; d.obra.plano!.estado = "em curso"; // como depois do recibo
  preencher(d, OBRA);
  completarParaEncerrar(d);
  A.fimObra(d.id);
  return { S, A, d };
}

describe("o auto de receção", () => {
  it("registar o fim da obra gera o auto, que vai ao portal; o negócio espera a assinatura antes de rever a margem", () => {
    const { S, A, d } = obraAcabada();
    expect(d.obra.plano!.estado).toBe("concluída");
    expect(d.obra.auto).toMatchObject({ n: "AR 2026/1027", estado: "por assinar" });
    expect(passoPortal(d)).toEqual({ i: 4, estado: "auto" });
    expect(proximo(d, S)).toMatchObject({ t: "À espera do auto de receção", who: "cliente", sim: "auto" });
    A.fimObra(d.id); // uma vez só
    expect(d.hist.filter((h) => /Auto de receção .* enviado/.test(h.t))).toHaveLength(1);
    A.simularAuto(d.id);
    expect(d.obra.auto!.estado).toBe("assinado");
    expect(proximo(d, S).t).toBe("Rever a margem real");
    expect(passoPortal(d)).toEqual({ i: 4, estado: "relatorio" });
  });

  it("assinado com uma observação: fica no auto e no histórico; a garantia conta a partir daí", () => {
    const { A, d } = obraAcabada();
    A.assinarAuto(d.id, ASS, "  Falta rejuntar um azulejo  ");
    expect(d.obra.auto).toMatchObject({ estado: "assinado", reservas: "Falta rejuntar um azulejo", assinado: "30/10/2026 18:05" });
    expect(d.hist[0]).toMatchObject({ k: "w" });
    expect(garantiaAte(d)).toBe("30/10/2028");
  });
});

describe("o relatório da obra", () => {
  it("a linha do tempo vai da proposta ao auto, sem custos internos nem margens", () => {
    const S = seed(), j = S.deals.find((x) => x.id === 1050)!; // Joana Ribeiro: obra concluída e auto assinado
    const H = historiaDaObra(j);
    const ts = H.map((x) => x.t);
    expect(ts[0]).toMatch(/Proposta/);
    expect(ts).toEqual(expect.arrayContaining([expect.stringMatching(/Contrato CT 2026\/1050 assinado/), expect.stringMatching(/recibo RC 2026\/270/), "Obra concluída", expect.stringMatching(/Auto de receção AR 2026\/1050 assinado/)]));
    expect(ts.at(-1)).toMatch(/Auto de receção/);
    expect(JSON.stringify(H)).not.toMatch(/margem|custo/i);
    expect(garantiaAte(j)).toBe("08/10/2028");
    expect(resumoObra(j)!.equipa.length).toBeGreaterThan(0);
  });

  it("as tarefas validadas entram com a fotografia e a nota, e nas fotografias por fase", () => {
    const { A, d } = obraAcabada();
    const t = d.obra.plano!.tasks[0];
    t.exec = { estado: "validada", horas: 6, fotos: ["data:image/png;base64,AAA", "data:image/png;base64,BBB"], nota: "Tudo limpo", validada: "27/10 17:00" };
    A.simularAuto(d.id);
    const m = historiaDaObra(d).find((x) => x.k === "tarefa")!;
    expect(m).toMatchObject({ t: t.nome, sub: "Tudo limpo", q: "27/10 17:00" });
    expect(m.fotos).toHaveLength(2);
    const F = fotosPorFase(d);
    expect(F[0].fotos.map((f) => f.t)).toEqual([`${t.nome} · antes`, `${t.nome} · depois`]);
  });
});

describe("a adenda assinada no portal", () => {
  it("guarda a assinatura, entra no plano e fica anexa ao contrato", () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    const a = d.adendas![0];
    adendaPorAssinar(A, d.id, a.n);
    expect(passoPortal(d)).toEqual({ i: 3, estado: "assinar", adenda: a.n });
    A.assinarAdendaCom(d.id, a.n, ASS);
    expect(a).toMatchObject({ estado: "assinada", assinatura: { id: "CMD-TESTE1" } });
    render(<ContratoDoc S={S} d={d} />);
    const sec = screen.getByRole("region", { name: "Adendas ao contrato" });
    expect(within(sec).getByText(/AD 2026\/1027-1/)).toBeTruthy();
  });
});

function Portal({ S, d, A }: { S: Estado; d: Negocio; A: ReturnType<typeof acoes> }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return <PortalCliente ctx={ctx} d={d} fechar={() => {}} />;
}

describe("no portal: receber a obra", () => {
  it("diz como encontrou a obra, assina o auto e recebe o relatório", () => {
    const { S, A, d } = obraAcabada();
    render(<Portal S={S} d={d} A={A} />);
    expect(screen.getByRole("heading", { name: "Receber a obra" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "O auto de receção" })).toBeTruthy();
    const assinar = () => within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: /Assinar o auto de receção/ }) as HTMLButtonElement;
    expect(assinar().disabled).toBe(true); // primeiro, como encontrou a obra
    fireEvent.click(screen.getByRole("button", { name: /Tenho uma observação/ }));
    expect(assinar().disabled).toBe(true); // a observação por escrever
    fireEvent.change(screen.getByRole("textbox", { name: /A sua observação/ }), { target: { value: "Falta um rodapé" } });
    fireEvent.click(assinar());
    fireEvent.click(screen.getByRole("button", { name: /Chave Móvel Digital/ }));
    fireEvent.change(screen.getByLabelText("Telemóvel"), { target: { value: "912 345 678" } });
    fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Pedir o código" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Recebi a obra e li o auto de receção AR 2026\/1027/ }));
    fireEvent.change(screen.getByLabelText(/[Cc]ódigo/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Assinar o auto/ }));
    expect(d.obra.auto).toMatchObject({ estado: "assinado", reservas: "Falta um rodapé" });
    expect(screen.getByRole("heading", { name: "O relatório da sua obra" })).toBeTruthy();
    const rel = screen.getByRole("region", { name: "Relatório da obra" });
    expect(within(rel).getByText(/Garantia até/)).toBeTruthy();
    expect(rel.textContent).not.toMatch(/margem|custo/i);
    expect(within(rel).getByRole("button", { name: /Auto de receção AR 2026\/1027/ })).toBeTruthy();
  });

  it("a adenda por assinar é o passo em destaque, com o documento à vista", () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    adendaPorAssinar(A, d.id, "AD 2026/1027-1");
    render(<Portal S={S} d={d} A={A} />);
    expect(screen.getByRole("heading", { name: /Assinar a adenda AD 2026\/1027-1/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "A adenda" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Próximo passo" })).getByRole("button", { name: /Assinar a adenda/ })).toBeTruthy();
    expect(screen.queryByText("Também precisa de si")).toBeNull();
  });
});
