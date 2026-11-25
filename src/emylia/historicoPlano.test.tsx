// 25/11 (Rúben): «qualquer alteração deve ir para um histórico, porque precisamos de aprender a longo prazo: o sistema tem de aprender».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TECS, acoes, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { esquecerInventario } from "./inventario/loja";
import { tarefasDaFase } from "./ordemPlano";
import { MAX_ALTERACOES, detalheMicro, guardarAlteracao, type Alteracao } from "./historicoPlano";
import { AntesDepoisPlano } from "./estudioObra/AntesDepoisPlano";

vi.mock("./erpEticadata", async (orig) => ({ ...(await orig<typeof import("./erpEticadata")>()), lerFaturaErp: vi.fn(async () => ({ ok: false, motivo: "sem_ligacao", msg: "Sem ligação ao Eticadata." })) }));
afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => { esquecerInventario(); });

/** O 1027 pago, com as medidas aceites e o plano por aprovar (como em planoAntesDepois.test). */
function preparar() {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  const encher = (gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x"; };
  encher(FINANCEIRO); encher([OBRA[0]]);
  const A = acoes(S, vi.fn(), (fn) => fn());
  A.role("financeiro"); A.registarFaturaErp(d.id, `FT 2026/${d.id}`, null); A.validar(d.id);
  A.role("operacoes"); A.supervisorMedidas(d.id, "hn"); A.retificarMedidas(d.id);
  return { S, d, A };
}

describe("o histórico de todas as alterações ao plano", () => {
  it("o plano nasce sem alterações; trocar o técnico fica registado, com a ação, o estado e o antes e depois", () => {
    const { d, A } = preparar();
    expect(d.obra.mudancasPlano ?? []).toEqual([]);
    const p = d.obra.plano!, ti = p.tasks.findIndex((t) => t.tec), t = p.tasks[ti];
    const outro = TECS.find((x) => x.id !== t.tec && x.sk === t.sk) ?? TECS.find((x) => x.id !== t.tec)!;
    const antes = TECS.find((x) => x.id === t.tec)!.n;
    A.trocarTec(d.id, ti, outro.id);
    const a = d.obra.mudancasPlano!.at(-1)!;
    expect(a.acao).toBe("trocarTec");
    expect(a.estado).toBe("por aprovar");
    expect(Number.isNaN(Date.parse(a.q))).toBe(false);
    expect(a.mudancas).toContainEqual({ tipo: "tecnico", tarefa: t.nome, antes, depois: outro.n });
  });

  it("mudar a ordem e as microtarefas também; cada ação é uma entrada", () => {
    const { d, A } = preparar();
    const p = d.obra.plano!;
    const fase = [1, 2, 3, 4].find((f) => tarefasDaFase(p, f).length >= 2)!;
    const [, t2] = tarefasDaFase(p, fase);
    A.ordemTarefaPlano(d.id, t2, 0);
    A.microtarefas(d.id, t2, { k: "juntar", n: "Proteger a base com cartão" });
    const l = d.obra.mudancasPlano!;
    expect(l.map((x) => x.acao)).toEqual(["ordemTarefaPlano", "microtarefas"]);
    expect(l[0].mudancas.some((m) => m.tipo === "ordem" && m.tarefa === p.tasks[t2].nome)).toBe(true);
    const m = l[1].mudancas.find((x) => x.tipo === "microtarefas")!;
    expect(m.tarefa).toBe(p.tasks[t2].nome);
    expect(m.detalhe).toContain("+ Proteger a base com cartão");
  });

  it("uma ação que não muda o plano não deixa entrada; aprovar deixa a mudança de estado", () => {
    const { d, A } = preparar();
    A.trocarTec(d.id, 0, d.obra.plano!.tasks[0].tec ?? ""); // o mesmo técnico: nada muda
    expect(d.obra.mudancasPlano ?? []).toEqual([]);
    A.aprovarPlano(d.id);
    const a = d.obra.mudancasPlano!.at(-1)!;
    expect(a.acao).toBe("aprovarPlano");
    expect(a.mudancas).toContainEqual({ tipo: "obra", tarefa: "Plano", antes: "por aprovar", depois: "aprovado" });
  });

  it("o detalhe das microtarefas e o tecto por obra", () => {
    expect(detalheMicro(["A (1 h)", "B", "C"], ["B", "A (2 h)", "D"])).toBe("+ D · − C · tempo: A (2 h) · nova ordem");
    const o: { mudancasPlano?: Alteracao[] } = {};
    for (let i = 0; i < MAX_ALTERACOES + 5; i++) guardarAlteracao(o, { q: String(i), quem: "", acao: "x", estado: "aprovado", dia: 0, mudancas: [] });
    expect(o.mudancasPlano!.length).toBe(MAX_ALTERACOES);
    expect(o.mudancasPlano![0].q).toBe("5");
  });

  it("o ecrã mostra todas as alterações, da mais recente", () => {
    const { d, A } = preparar();
    const p = d.obra.plano!;
    const fase = [1, 2, 3, 4].find((f) => tarefasDaFase(p, f).length >= 2)!;
    const [, t2] = tarefasDaFase(p, fase);
    A.ordemTarefaPlano(d.id, t2, 0);
    A.microtarefas(d.id, t2, { k: "juntar", n: "Proteger a base com cartão" });
    render(<AntesDepoisPlano d={d} />);
    fireEvent.click(screen.getByRole("button", { name: /Todas as alterações ao plano/ }));
    const itens = screen.getByRole("list", { name: "Alterações ao plano, da mais recente" }).children;
    expect(itens[0].textContent).toContain("Mudou as microtarefas");
    expect(itens[1].textContent).toContain("Mudou a ordem");
  });
});
