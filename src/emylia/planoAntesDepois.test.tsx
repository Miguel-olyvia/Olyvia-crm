// 25/11 (Rúben): o plano gerado pelo motor fica guardado; aprovar regista o antes e depois; «Recomeçar o plano do orçamento» (teste).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { esquecerInventario } from "./inventario/loja";
import { diferencasPlano, resumoDiferencas, retratoTarefas } from "./planoAntesDepois";
import { tarefasDaFase } from "./ordemPlano";
import { AntesDepoisPlano } from "./estudioObra/AntesDepoisPlano";

vi.mock("./erpEticadata", async (orig) => ({ ...(await orig<typeof import("./erpEticadata")>()), lerFaturaErp: vi.fn(async () => ({ ok: false, motivo: "sem_ligacao", msg: "Sem ligação ao Eticadata." })) }));
afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => { esquecerInventario(); });

/** O 1027 pago, com as medidas aceites e o plano por aprovar. */
function preparar() {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  const encher = (gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x"; };
  encher(FINANCEIRO); encher([OBRA[0]]);
  const A = acoes(S, vi.fn(), (fn) => fn());
  A.role("financeiro"); A.registarFaturaErp(d.id, `FT 2026/${d.id}`, null); A.validar(d.id);
  A.role("operacoes"); A.supervisorMedidas(d.id, "hn"); A.retificarMedidas(d.id);
  // uma mudança que não mexe no valor (o valor mudado pede a retificação antes de aprovar): a 2.ª tarefa de uma fase passa a 1.ª
  const p = d.obra.plano!;
  const fase = [1, 2, 3, 4].find((f) => tarefasDaFase(p, f).length >= 2)!;
  const [t1, t2] = tarefasDaFase(p, fase);
  const mexer = () => A.ordemTarefaPlano(d.id, t2, 0);
  return { S, d, A, mexer, t1, t2 };
}

describe("o antes e depois do plano", () => {
  it("as diferenças: técnico, duração, horas, juntada e tirada, pelo nome", () => {
    const g = [{ nome: "Pintura", tec: "a", dia: 0, dur: 2, h: 8, pos: 0 }, { nome: "Limpeza", tec: "b", dia: 2, dur: 1, h: 4, pos: 1 }];
    const f = [{ nome: "Pintura", tec: "c", dia: 0, dur: 3, h: 10, pos: 0 }, { nome: "Rodapés", tec: "a", dia: 3, dur: 1, h: 2, pos: 1 }];
    const l = diferencasPlano(g, f);
    expect(l.map((x) => x.tipo)).toEqual(["tecnico", "duracao", "horas", "juntada", "tirada"]);
    expect(resumoDiferencas(l)).toBe("5 mudanças: 1 técnico trocado, 1 duração, 1 horas mudadas, 1 tarefa juntada, 1 tarefa tirada");
    expect(resumoDiferencas([])).toBe("Validado sem mudanças ao plano gerado");
  });

  it("o plano nasce com o retrato do gerado; aprovar guarda o gerado, o validado e as mudanças", () => {
    const { d, A, mexer, t2 } = preparar();
    const p = d.obra.plano!;
    expect(p.estado).toBe("por aprovar");
    expect(p.gerado).toEqual(retratoTarefas(p));
    // o gestor arrasta uma tarefa para cima e aprova
    mexer();
    A.aprovarPlano(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    const r = d.obra.aprendizagem!.at(-1)!;
    expect(r.motivo).toBe("aprovado");
    expect(r.diferencas.some((x) => x.tipo === "ordem" && x.tarefa === p.tasks[t2].nome)).toBe(true);
    expect(r.final.find((t) => t.nome === p.tasks[t2].nome)!.manual).toBe(true);
    expect(d.hist.some((h) => h.t.startsWith("Plano validado: "))).toBe(true);
  });

  it("recomeçar volta ao plano do orçamento, por aprovar, e guarda o que estava mudado", () => {
    const { d, A, mexer } = preparar();
    const gerado = d.obra.plano!.gerado!;
    mexer();
    A.aprovarPlano(d.id);
    expect(A.recomecarPlano(d.id)).toBe(true);
    const p = d.obra.plano!;
    expect(p.estado).toBe("por aprovar");
    expect(p.tasks.map((t) => [t.nome, t.dur, t.h])).toEqual(gerado.map((t) => [t.nome, t.dur, t.h]));
    expect(p.tasks.some((t) => t.exec)).toBe(false);
    expect(d.obra.aprendizagem!.map((r) => r.motivo)).toEqual(["aprovado", "recomeçado"]);
    // e o gestor volta a poder aprovar
    A.aprovarPlano(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(d.obra.plano!.tasks.some((t) => t.ordem != null)).toBe(false);
    expect(d.obra.aprendizagem!.at(-1)!.diferencas).toEqual([]);
  });

  it("o ecrã mostra as mudanças ao vivo e os registos", () => {
    const { d, A, mexer } = preparar();
    mexer();
    const { unmount } = render(<AntesDepoisPlano d={d} />);
    expect(screen.getByRole("heading", { name: "O plano gerado e o validado" })).toBeTruthy();
    expect(screen.getByText(/Até agora:/).closest("p")!.textContent).toMatch(/mudanças? de ordem/);
    unmount();
    A.aprovarPlano(d.id);
    render(<AntesDepoisPlano d={d} />);
    expect(screen.getByRole("button", { name: /Validado · \d+ mudanças?: .*de ordem/ })).toBeTruthy();
  });
});
