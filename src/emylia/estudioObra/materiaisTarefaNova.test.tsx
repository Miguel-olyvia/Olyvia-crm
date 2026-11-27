// 27/11/2026 (Rúben: «no plano, adicionar novas tarefas podem ter de gerar novas encomendas de fornecedor e atualizar a tab de materiais
// e equipamentos e ver em destaque o que falta, link para ver o detalhe etc»). Com a obra de exemplo (1027, em curso):
//  · sem a encomenda no Inventário: a tarefa nova fica com os materiais «por encomendar», em destaque no separador Materiais, e o aviso
//    diz o que falta e leva lá;
//  · com a encomenda no Inventário: juntar a tarefa emite a encomenda de ajuste (EC-1027-A1), as linhas dela entram nos Materiais, e o
//    que se pedir a mais encomenda-se do destaque, pelo mesmo caminho;
//  · a tarefa de uma adenda espera pelo pagamento dela; os equipamentos da obra veem-se no separador.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes, type Aviso, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { esquecerInventario, lerInventario } from "../inventario/loja";
import { materiaisPorFase } from "../obraOps";
import { porEncomendarDe } from "../encomendasAjuste";
import { resumoEcNegocio } from "../inventario/ponteNegocios";
import { EstudioObra } from "./EstudioObra";
import { encomendaDeExemploNoInventario, obraDeExemplo } from "./exemploObra";
import { emFalta, fraseDaTarefaNova, materiaisDasTarefasNovas, resumoFalta } from "./materiaisTarefasNovas";

afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => { esquecerInventario(); });

/** O serviço de pintura (tem consumíveis na receita) e a fase 4 (acabamentos). */
const PINT = { sid: "pint", q: 20, fase: 4 };

function montar(comInventario: boolean) {
  const { S, d } = obraDeExemplo();
  if (comInventario) expect(encomendaDeExemploNoInventario(d)).toBe(true);
  const avisos: Aviso[] = [];
  const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  const redesenhar = () => r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, A, d, avisos, ctx, redesenhar };
}
const inv = (d: Negocio) => (d.obra.ec?.ref ? resumoEcNegocio(lerInventario(), d.obra.ec.ref) : null);
const abrirMateriais = () => fireEvent.click(screen.getByRole("tab", { name: /Materiais/ }));

describe("a tarefa nova e os materiais que faltam", () => {
  it("sem a encomenda no Inventário: os materiais ficam por encomendar, em destaque nos Materiais; o aviso diz o que falta e leva lá", () => {
    const { S, A, d, avisos, redesenhar } = montar(false);
    const ti = A.novaTarefaPlano(d.id, PINT)!;
    const t = d.obra.plano!.tasks[ti];
    expect(t.nome).toBe(S.svc.pint.n);
    expect(t.mats!.length).toBeGreaterThan(0);
    // nada foi ao Inventário (a obra de exemplo não está lá)
    expect(d.obra.ecsAjuste ?? []).toEqual([]);
    const L = materiaisDasTarefasNovas(d).filter((x) => x.ti === ti);
    expect(L.length).toBe(t.mats!.length);
    expect(L.every((x) => x.estado === "por encomendar" && x.fase === 4 && x.dia === t.dia)).toBe(true);
    // não se pode encomendar daqui (a encomenda de cliente não está no Inventário): o destaque diz porquê
    const R = resumoFalta(d, L);
    expect(R.porEncomendar).toBe(L.length);
    expect(R.podeEncomendar).toBe(false);
    // o aviso diz o que falta e leva aos Materiais (o Estúdio está aberto)
    const av = avisos.at(-1)!;
    expect(av.msg).toBe("Tarefa juntada ao plano");
    expect(av.sub).toMatch(new RegExp(`Faltam ${new Set(L.map((x) => x.n)).size} de`));
    expect(av.sub).toMatch(/por encomendar/);
    expect(av.act?.label).toBe("Ver nos Materiais");
    act(() => av.act!.fn());
    redesenhar();
    const destaque = screen.getByRole("region", { name: "Falta para as tarefas novas" });
    const grupo = within(destaque).getByRole("group", { name: `Tarefa ${t.nome}` });
    // a tarefa acabada de juntar fica realçada; cada material com o estado; o nome leva ao painel da tarefa
    expect(grupo.className).toMatch(/ring-primary/);
    for (const m of t.mats!) expect(within(grupo).getByText(m.n)).toBeTruthy();
    expect(within(grupo).getAllByText("por encomendar").length).toBe(L.length);
    expect(within(destaque).getByText(/não está no Inventário/)).toBeTruthy();
    expect(within(destaque).queryByRole("button", { name: /^Encomendar/ })).toBeNull();
    fireEvent.click(within(grupo).getByRole("button", { name: /Pintura/i }));
    expect(screen.getByRole("complementary", { name: "A tarefa" })).toBeTruthy();
  });

  it("com a encomenda no Inventário: a tarefa nova vai à encomenda de ajuste, que entra nos Materiais; o que se pede a mais encomenda-se do destaque", () => {
    const { A, d, avisos, redesenhar } = montar(true);
    const n0 = lerInventario().ecs.length;
    const ti = A.novaTarefaPlano(d.id, PINT)!;
    const t = d.obra.plano!.tasks[ti];
    // o caminho de sempre: a encomenda de ajuste EC-1027-A1, com os materiais da tarefa
    expect(d.obra.ecsAjuste!.map((a) => a.n)).toEqual(["EC-1027-A1"]);
    expect(lerInventario().ecs.length).toBe(n0 + 1);
    expect(t.ecs).toEqual(["EC-1027-A1"]);
    expect(porEncomendarDe(d)).toEqual([]);
    // as linhas da encomenda de ajuste entram nos materiais da obra (antes só os da inicial), ligadas à encomenda
    const todos = materiaisPorFase(d, inv(d)).flatMap((g) => g.itens);
    for (const m of t.mats!) expect(todos.some((x) => x.n === m.n && x.ec === "EC-1027-A1")).toBe(true);
    // cada material da tarefa tem o estado do Inventário (reservado do stock, ou pedido ao fornecedor por aprovar)
    const L = materiaisDasTarefasNovas(d, inv(d)).filter((x) => x.ti === ti);
    expect(L.length).toBeGreaterThan(0);
    expect(L.every((x) => x.ec === "EC-1027-A1" && ["garantido", "por aprovar", "sem fornecedor"].includes(x.estado))).toBe(true);
    expect(avisos.at(-1)!.sub).toBe(`${t.nome} · ${avisos.at(-1)!.sub!.split(" · ")[1]} · ${fraseDaTarefaNova(d, t, inv(d))}`);
    // o gestor pede mais do primeiro material: fica por encomendar, em destaque, com o botão
    const m0 = t.mats![0];
    A.matsTarefa(d.id, ti, t.mats!.map((m, k) => (k ? m : { ...m, q: m.q + 10 })));
    redesenhar();
    abrirMateriais();
    const destaque = screen.getByRole("region", { name: "Falta para as tarefas novas" });
    const grupo = within(destaque).getByRole("group", { name: `Tarefa ${t.nome}` });
    expect(within(grupo).getAllByText(m0.n).length).toBeGreaterThan(0);
    expect(within(grupo).getByText("por encomendar")).toBeTruthy();
    expect(emFalta(materiaisDasTarefasNovas(d, inv(d))).some((x) => x.n === m0.n && x.estado === "por encomendar" && x.q === 10)).toBe(true);
    // as linhas que já foram ao Inventário têm o link para o detalhe (a encomenda ou a compra ao fornecedor)
    expect(within(grupo).queryAllByRole("button", { name: /Ver EC-1027-A1|Ver a compra/ }).length + L.filter((x) => x.estado === "garantido").length).toBeGreaterThan(0);
    // encomendar: o mesmo caminho (uma encomenda de ajuste nova, só com os 10 a mais)
    fireEvent.click(within(destaque).getByRole("button", { name: "Encomendar 1 material" }));
    expect(d.obra.ecsAjuste!.map((a) => a.n)).toEqual(["EC-1027-A1", "EC-1027-A2"]);
    expect(d.obra.ecsAjuste![1].linhas).toEqual([expect.objectContaining({ n: m0.n, q: 10 })]);
    expect(porEncomendarDe(d)).toEqual([]);
    expect(within(screen.queryByRole("region", { name: "Falta para as tarefas novas" }) ?? document.body).queryByText("por encomendar")).toBeNull();
  });

  it("a tarefa de uma adenda espera pelo pagamento dela (sem botão), com o link para a adenda", () => {
    const { A, d, redesenhar } = montar(true);
    const ti = A.novaTarefaPlano(d.id, PINT)!;
    const t = d.obra.plano!.tasks[ti];
    // como entrarAjusteDaAdenda faz: a tarefa é da adenda e nada está encomendado
    d.obra.ecsAjuste = []; t.ecs = []; t.adenda = "AD 2026/1027-1"; t.encomendado = [];
    const L = materiaisDasTarefasNovas(d, inv(d)).filter((x) => x.ti === ti);
    expect(L.every((x) => x.estado === "espera adenda" && x.adenda === "AD 2026/1027-1")).toBe(true);
    expect(resumoFalta(d, L).porEncomendar).toBe(0);
    redesenhar();
    abrirMateriais();
    const destaque = screen.getByRole("region", { name: "Falta para as tarefas novas" });
    expect(within(destaque).getAllByText("à espera da AD 2026/1027-1 paga").length).toBe(L.length);
    expect(within(destaque).queryByRole("button", { name: /^Encomendar/ })).toBeNull();
    expect(within(destaque).getAllByRole("button", { name: "Ver a adenda" }).length).toBe(L.length);
  });

  it("os equipamentos da obra veem-se no separador Materiais, com a origem; os das tarefas novas marcados", () => {
    const { S, A, d, redesenhar } = montar(false);
    // um ladrilhador numa tarefa nova, depois do contrato: a cortadora de azulejo vem de aluguer
    const sid = Object.keys(S.svc).find((k) => /ladrilh/i.test(S.svc[k].perfil) && S.svc[k].h > 0)!;
    expect(sid).toBeTruthy();
    const fim = Math.max(...d.obra.plano!.tasks.map((t) => t.dia + t.dur));
    A.novaTarefaPlano(d.id, { sid, q: 1, fase: 4, dia: fim + 2 });
    redesenhar();
    abrirMateriais();
    const E = screen.getByRole("region", { name: "Equipamentos" });
    expect(within(E).getByText(/Renault Master/)).toBeTruthy();
    expect(within(E).getAllByText("tarefa nova").length).toBeGreaterThan(0);
    // o aluguer pedido pela tarefa nova fora dos dias do contrato entra no destaque
    const destaque = screen.getByRole("region", { name: "Falta para as tarefas novas" });
    expect(within(destaque).getByText("Cortadora de azulejo 120 cm")).toBeTruthy();
    expect(within(destaque).getByText(/equipamento a alugar/)).toBeTruthy();
  });
});

