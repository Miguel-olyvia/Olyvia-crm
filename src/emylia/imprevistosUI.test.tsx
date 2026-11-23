// 21/10: os imprevistos no ecrã: registar (técnico/gestor), a proposta do gestor, o portal (aprovar e pagar a fatura da adenda) e os ajustes juntos.
import { useReducer, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { ImprevistosNaObra, RegistarImprevisto } from "./ImprevistosObra";
import { PortalCliente } from "./PortalCliente";
import { juntarAjustes, type Alteracao } from "./trabalhoObra";
import { precoSugeridoLivre } from "./adendas";
import { adendaAssinada, registarFaturasAdenda } from "./testeAdenda";

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
    // 21/10: o preço sugerido da linha livre tem a margem alvo (a adenda verifica-se antes de ir ao cliente)
    expect(a.linhas[0]).toMatchObject({ livre: true, n: "Cano podre", h: 4, pu: precoSugeridoLivre(S, 4) });
    // 27/10: o estado diz-se na pastilha do cartão; a linha da adenda fica com o número, o valor e os dias
    expect(screen.getByText("à espera do cliente")).toBeTruthy();
    expect(screen.getByText(new RegExp(`^Adenda ${a.n.replace(/[/-]/g, "\\$&")} ·`))).toBeTruthy();
    r.unmount();
    // o cliente assina; o Financeiro fatura; no portal paga por MB Way (19/11: sem prestador de pagamentos, não há referência MB)
    adendaAssinada(A, d.id, a.n);
    A.role("financeiro"); registarFaturasAdenda(A, d);
    render(<Montar S={S} A={A}>{(c) => <PortalCliente ctx={c} d={d} fechar={() => {}} />}</Montar>);
    const pag = screen.getByText(`Pagar a fatura ${a.faturas![0].n}`).closest("section, li, div[class]")!;
    expect(pag).toBeTruthy();
    const grupo = screen.getAllByRole("radiogroup", { name: "Como quer pagar" }).at(-1)!;
    expect(within(grupo).queryByRole("radio", { name: "Referência MB" })).toBeNull();
    fireEvent.click(within(grupo).getByRole("radio", { name: "MB Way" }));
    expect(a.faturas![0].pag?.metodo).toBe("MB Way");
    expect(d.f.metodo).not.toBe("MB Way");
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

  // 23/11: o «Atrasa» do técnico é um pedido ao gestor da obra; a lista de tarefas do técnico só tem as dele
  const datas = (p: { tasks: { dia: number; dur: number }[] }) => JSON.stringify(p.tasks.map((t) => [t.dia, t.dur]));
  it("o técnico só vê as suas tarefas e «Atrasa» passa a «Pedir para atrasar»: o pedido vai ao gestor e o plano não muda", () => {
    const { S, A, d, p } = obra();
    A.role("tecnico");
    const af = (t: (typeof p.tasks)[number]) => t.exec?.estado !== "validada" && t.corrige == null;
    // uma tarefa dele com outra tarefa afetável de outro técnico (a que não pode aparecer)
    const ti = p.tasks.findIndex((t) => af(t) && !!t.tec && p.tasks.some((o) => af(o) && o.tec !== t.tec));
    expect(ti).toBeGreaterThanOrEqual(0);
    const antes = datas(p);
    render(<Montar S={S} A={A}>{(c) => <RegistarImprevisto ctx={c} d={d} ti={ti} fechar={() => {}} />}</Montar>);
    const tarefas = within(screen.getByRole("group", { name: "Registar imprevisto" })).getByText("Que tarefas afeta?").parentElement!;
    const nomes = within(tarefas).getAllByRole("button").map((b) => b.textContent);
    expect(nomes.length).toBeGreaterThan(0);
    for (const n of nomes) expect(p.tasks.find((t) => t.nome === n)?.tec).toBe(p.tasks[ti].tec);
    expect(screen.queryByText("Atrasa")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Pedir para atrasar/ }));
    expect(screen.getByText("O gestor da obra decide; o plano só muda se ele aceitar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mais um dia" }));
    fireEvent.change(screen.getByLabelText("O que encontrou?"), { target: { value: "Cano de esgoto podre" } });
    fireEvent.click(screen.getByRole("button", { name: "Pedir ao gestor da obra" }));
    expect(d.obra.imprevistos![0]).toMatchObject({ grav: "atrasa", atraso: 2, pedido: "pendente", estado: "aberto" });
    expect(datas(p)).toBe(antes);
  });
  it("quem planeia continua a ver «Atrasa» e todas as tarefas afetáveis", () => {
    const { S, A, d, p } = obra();
    A.role("operacoes");
    render(<Montar S={S} A={A}>{(c) => <RegistarImprevisto ctx={c} d={d} fechar={() => {}} />}</Montar>);
    expect(screen.getByText("O plano anda os dias que indicar; o cliente é avisado")).toBeTruthy();
    const tarefas = screen.getByText("Que tarefas afeta?").parentElement!;
    expect(within(tarefas).getAllByRole("button").length).toBe(p.tasks.filter((t) => t.exec?.estado !== "validada" && t.corrige == null).length);
  });
  it("o pedido no cartão do imprevisto: o técnico vê que o gestor decide; o gestor aceita e o plano anda", () => {
    const { S, A, d, p } = obra();
    const ti = p.tasks.findIndex((t) => t.dia > p.dia && t.corrige == null);
    A.role("tecnico");
    A.registarImprevisto(d.id, { texto: "Cano de esgoto podre", onde: "", grav: "atrasa", tarefas: [ti], dias: 2 });
    const um = render(<Montar S={S} A={A}>{(c) => <ImprevistosNaObra ctx={c} d={d} />}</Montar>);
    expect(screen.getByText("O gestor da obra decide se o plano anda.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceitar o atraso" })).toBeNull();
    um.unmount();
    A.role("operacoes");
    const antes = datas(p);
    render(<Montar S={S} A={A}>{(c) => <ImprevistosNaObra ctx={c} d={d} />}</Montar>);
    expect(screen.getByText("pedido de atraso")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fazer a proposta ao cliente" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar o atraso" }));
    expect(datas(p)).not.toBe(antes);
    expect(d.obra.imprevistos![0].pedido).toBe("aceite");
    expect(screen.getByRole("button", { name: "Fazer a proposta ao cliente" })).toBeTruthy();
  });
  it("o gestor recusa o pedido: o plano fica igual e o imprevisto fecha", () => {
    const { S, A, d, p } = obra();
    const ti = p.tasks.findIndex((t) => t.dia > p.dia && t.corrige == null);
    A.role("tecnico");
    A.registarImprevisto(d.id, { texto: "Cano de esgoto podre", onde: "", grav: "atrasa", tarefas: [ti], dias: 2 });
    A.role("operacoes");
    const antes = datas(p);
    render(<Montar S={S} A={A}>{(c) => <ImprevistosNaObra ctx={c} d={d} />}</Montar>);
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(datas(p)).toBe(antes);
    expect(d.obra.imprevistos![0]).toMatchObject({ pedido: "recusado", estado: "fechado" });
  });
});
