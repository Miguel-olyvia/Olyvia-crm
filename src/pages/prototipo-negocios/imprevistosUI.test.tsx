// 21/10: os imprevistos no ecrã: registar (técnico/gestor), a proposta do gestor, o portal (aprovar e pagar a fatura da adenda) e os ajustes juntos.
import { useReducer, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { ImprevistosNaObra, RegistarImprevisto } from "./ImprevistosObra";
import { PortalCliente } from "./PortalCliente";
import { juntarAjustes, type Alteracao } from "./trabalhoObra";

afterEach(cleanup);

function Montar({ S, A, children }: { S: Estado; A: ReturnType<typeof acoes>; children: (c: Ctx) => ReactNode }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return <>{children(ctx)}</>;
}
const obra = () => {
  const S = seed(), A = acoes(S, vi.fn(), (fn) => fn()), d = S.deals.find((x) => x.id === 1022) as Negocio;
  return { S, A, d, p: d.obra.plano! };
};

describe("imprevistos no ecrã", () => {
  it("o técnico regista: o que encontrou, a gravidade e a tarefa (já escolhida); falta o texto até o escrever", () => {
    const { S, A, d, p } = obra();
    A.role("tecnico");
    const ti = p.tasks.findIndex((t) => t.dia >= p.dia && t.corrige == null);
    render(<Montar S={S} A={A}>{(c) => <RegistarImprevisto ctx={c} d={d} ti={ti} fechar={() => {}} />}</Montar>);
    const enviar = screen.getByRole("button", { name: "Registar o imprevisto" }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    expect(screen.getByText("Falta o que encontrou.")).toBeTruthy();
    expect(screen.getByRole("button", { name: p.tasks[ti].nome }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("O que encontrou?"), { target: { value: "Cano podre" } });
    fireEvent.click(enviar);
    expect(d.obra.imprevistos![0]).toMatchObject({ texto: "Cano podre", grav: "impede", estado: "aberto" });
    expect(p.tasks[ti].bloqueio).toBe("IM-1022-1");
  });

  it("«Só avisar» fica no diário, sem imprevisto nem mexer no plano", () => {
    const { S, A, d } = obra();
    A.role("tecnico");
    render(<Montar S={S} A={A}>{(c) => <RegistarImprevisto ctx={c} d={d} fechar={() => {}} />}</Montar>);
    fireEvent.change(screen.getByLabelText("O que encontrou?"), { target: { value: "Falta silicone" } });
    fireEvent.click(screen.getByRole("button", { name: /^Só avisar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Avisar o responsável" }));
    expect(d.obra.imprevistos ?? []).toEqual([]);
    expect(d.obra.diario!.at(-1)).toMatchObject({ k: "ocorrencia", t: "Falta silicone" });
  });

  it("o gestor faz a proposta com a linha livre e o cliente aprova e paga a fatura da adenda no portal", () => {
    const { S, A, d, p } = obra();
    A.role("tecnico");
    const ti = p.tasks.findIndex((t) => t.dia >= p.dia && t.corrige == null);
    A.registarImprevisto(d.id, { texto: "Cano podre", onde: "", grav: "impede", tarefas: [ti] });
    A.role("operacoes");
    const r = render(<Montar S={S} A={A}>{(c) => <ImprevistosNaObra ctx={c} d={d} />}</Montar>);
    fireEvent.click(screen.getByRole("button", { name: "Fazer a proposta ao cliente" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar ao cliente para aprovar" }));
    const a = d.adendas!.at(-1)!;
    expect(a).toMatchObject({ motivo: "Imprevisto na obra", estado: "enviada", origem: { texto: "Cano podre" } });
    expect(a.linhas[0]).toMatchObject({ livre: true, n: "Cano podre", h: 4, pu: 120 });
    expect(screen.getByText(/no portal do cliente/)).toBeTruthy();
    r.unmount();
    // o cliente assina; o Financeiro fatura; no portal paga por referência MB
    A.simularAdenda(d.id, a.n);
    A.role("financeiro"); A.faturarAdendas(d.id);
    render(<Montar S={S} A={A}>{(c) => <PortalCliente ctx={c} d={d} fechar={() => {}} />}</Montar>);
    const pag = screen.getByText(`Pagar a fatura ${a.fatura!.n}`).closest("section, li, div[class]")!;
    expect(pag).toBeTruthy();
    const grupo = screen.getAllByRole("radiogroup", { name: "Como quer pagar" }).at(-1)!;
    fireEvent.click(within(grupo).getByRole("radio", { name: "Referência MB" }));
    expect(a.pag?.metodo).toBe("Referência MB");
    expect(d.f.metodo).not.toBe("Referência MB");
  });

  it("os ajustes seguidos à mesma tarefa juntam-se com o efeito líquido", () => {
    const base = { dia: 2, quem: "Filipe Rocha", cliente: false } as const;
    const L: Alteracao[] = [
      { ...base, q: "hoje 11:00", t: "Canalização: 3 → 2 dias", motivo: "Mais rápido do que previsto", fimAntes: "sex 24 out", fimDepois: "qui 23 out" },
      { ...base, q: "hoje 10:00", t: "Canalização: 1 → 3 dias", motivo: "Imprevisto na obra", fimAntes: "qua 22 out", fimDepois: "sex 24 out" },
    ];
    const J = juntarAjustes(L);
    expect(J).toHaveLength(1);
    expect(J[0]).toMatchObject({ t: "Canalização: 1 → 2 dias", fimAntes: "qua 22 out", fimDepois: "qui 23 out", n: 2, motivo: "Imprevisto na obra · Mais rápido do que previsto" });
  });
});
