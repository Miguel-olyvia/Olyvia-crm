// 21/10: os ajustes à obra com materiais novos disparam encomendas de cliente de ajuste (EC-<id>-A1) e o plano espera por eles.
import { beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario, lerInventario } from "./inventario/loja";
import { anularEcNoInventario, resumoEcNegocio, sincronizarEcsNegocios } from "./inventario/ponteNegocios";
import { acoes, seed, type Negocio } from "./motor";
import { FINANCEIRO, emFalta } from "./campos";
import { aMais, diaDaChegada, linhasDaObra, porEncomendar } from "./encomendasAjuste";
import { materiaisDaTarefa } from "./tarefasValidador";

const preencher = (d: Negocio) => {
  for (let i = 0; i < 5; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
};
// 1027 Tiago Almeida: contrato assinado, plano por aprovar; o pagamento emite a EC-1027
const preparar = () => {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  return { S, A, d };
};
const pagar = ({ A, d }: ReturnType<typeof preparar>) => { preencher(d); A.role("financeiro"); A.emitir(d.id); A.validar(d.id); };
const ecInv = (id: string) => lerInventario().ecs.find((e) => e.id === id);

describe("encomendas de ajuste: os materiais novos depois da encomenda inicial", () => {
  beforeEach(() => { esquecerInventario(); });

  it("uma tarefa nova no plano emite a EC-1027-A1 com os materiais dela; a tarefa não começa antes de eles chegarem", () => {
    const ctx = preparar(), { A, d } = ctx;
    pagar(ctx);
    expect(d.obra.ec?.n).toBe("EC-1027");
    A.role("operacoes");
    const ti = A.novaTarefaPlano(d.id, { sid: "revest", q: 20, fase: 3 })!;
    const t = d.obra.plano!.tasks[ti];
    const a = d.obra.ecsAjuste![0];
    expect(a).toMatchObject({ n: "EC-1027-A1", ref: "CT 2026/1027 · A1", motivo: "tarefa nova Revestimento de parede" });
    expect(a.linhas.map((x) => x.n)).toEqual(t.mats!.map((m) => m.n));
    const e = ecInv("EC-1027-A1")!;
    expect(e.origin).toMatchObject({ k: "CT", ref: "CT 2026/1027 · A1" });
    expect(t.ecs).toEqual(["EC-1027-A1"]);
    expect(t.encomendado!.map((m) => m.q)).toEqual(t.mats!.map((m) => m.q));
    expect(porEncomendar(d.obra.plano)).toEqual([]);
    // o resumo do negócio junta as linhas das duas encomendas
    const r = resumoEcNegocio(lerInventario(), "CT 2026/1027")!;
    expect(r.ajustes).toEqual(["EC-1027-A1"]);
    expect(r.linhas.filter((l) => l.ec === "EC-1027-A1").map((l) => l.n)).toEqual(a.linhas.map((x) => x.n));
    expect(linhasDaObra(d).filter((y) => y.ec === "EC-1027-A1")).toHaveLength(a.linhas.length);
    // sem stock dos consumíveis: vão ao fornecedor (por aprovar) e a tarefa começa depois da chegada prevista
    const pos = r.linhas.filter((l) => l.ec === "EC-1027-A1").flatMap((l) => l.pos);
    expect(pos.length).toBeGreaterThan(0);
    const chegada = pos.map((x) => x.prevista).sort().at(-1)!;
    expect(t.dia).toBeGreaterThanOrEqual(diaDaChegada(d.obra.plano!, chegada)!);
    expect(d.hist.some((h) => h.t.startsWith("Encomenda de ajuste EC-1027-A1 emitida no Inventário"))).toBe(true);
  });

  it("antes do pagamento a tarefa nova fica por encomendar; o pagamento emite a inicial e logo a de ajuste", () => {
    const ctx = preparar(), { A, d } = ctx;
    A.role("operacoes");
    A.novaTarefaPlano(d.id, { sid: "pint", q: 10, fase: 4 });
    expect(d.obra.ecsAjuste ?? []).toEqual([]);
    expect(porEncomendar(d.obra.plano).length).toBeGreaterThan(0);
    pagar(ctx);
    expect(ecInv("EC-1027")).toBeTruthy();
    expect(ecInv("EC-1027-A1")).toBeTruthy();
    expect(d.obra.ecsAjuste![0].motivo).toBe("materiais das tarefas novas do plano");
    expect(porEncomendar(d.obra.plano)).toEqual([]);
  });

  it("materiais mudados à mão numa tarefa do orçamento: só o que se junta vai à encomenda, com o botão Encomendar", () => {
    const ctx = preparar(), { S, A, d } = ctx;
    pagar(ctx);
    A.role("operacoes");
    const p = d.obra.plano!, ti = p.tasks.findIndex((t) => t.svcs.includes("revest"));
    expect(ti).toBeGreaterThanOrEqual(0);
    // a receita já contava estes; junta-se silicone a mais
    const base = materiaisDaTarefa(p.tasks[ti], S.svc).map((m) => ({ ...m }));
    A.matsTarefa(d.id, ti, [...base, { n: "Silicone sanitário", q: 3, un: "tubo", preco: 6 }]);
    const falta = porEncomendar(p);
    expect(falta.map((x) => [x.m.n, x.q])).toEqual([["Silicone sanitário", 3]]);
    expect(d.obra.ecsAjuste ?? []).toEqual([]); // mudar não encomenda sozinho (cada clique mudava a encomenda)
    A.encomendarMateriais(d.id);
    expect(d.obra.ecsAjuste!.map((a) => a.n)).toEqual(["EC-1027-A1"]);
    expect(d.obra.ecsAjuste![0].linhas).toMatchObject([{ n: "Silicone sanitário", q: 3, un: "tubo" }]);
    // a menos: não mexe na encomenda (o que sobrar volta ao armazém)
    A.matsTarefa(d.id, ti, [...base, { n: "Silicone sanitário", q: 1, un: "tubo", preco: 6 }]);
    expect(porEncomendar(p)).toEqual([]);
    expect(aMais(p).map((x) => [x.m.n, x.q])).toEqual([["Silicone sanitário", 2]]);
    A.encomendarMateriais(d.id);
    expect(d.obra.ecsAjuste).toHaveLength(1);
  });

  it("tirar a tarefa nova anula a encomenda de ajuste dela no Inventário (reservas e encomendas a fornecedor)", () => {
    const ctx = preparar(), { A, d } = ctx;
    pagar(ctx);
    A.role("operacoes");
    const ti = A.novaTarefaPlano(d.id, { sid: "revest", q: 20, fase: 3 })!;
    A.tirarTarefaPlano(d.id, ti);
    expect(ecInv("EC-1027-A1")!.deleted).toBe(true);
    expect(d.obra.ecsAjuste![0].anulada).toBeTruthy();
    expect(linhasDaObra(d).some((y) => y.ec === "EC-1027-A1")).toBe(false);
    expect(resumoEcNegocio(lerInventario(), "CT 2026/1027")!.ajustes).toEqual([]);
    expect(lerInventario().pos.filter((p) => p.originKey === "CT 2026/1027 · A1" && !p.deleted).every((p) => p.lines.every((l) => l.ec !== "EC-1027-A1") || p.cancels.length > 0)).toBe(true);
  });

  it("a adenda assinada junta as tarefas com os materiais da receita e emite a encomenda de ajuste", () => {
    const ctx = preparar(), { A, d } = ctx;
    pagar(ctx);
    A.role("comercial");
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    A.assinarAdenda(d.id, "AD 2026/1027-1");
    const t = d.obra.plano!.tasks.find((x) => x.nome.includes("adenda AD 2026/1027-1"))!;
    expect(t.mats!.length).toBeGreaterThan(0);
    expect(t.ecs).toEqual(["EC-1027-A1"]);
    expect(d.obra.ecsAjuste![0].motivo).toBe("adenda AD 2026/1027-1");
    expect(ecInv("EC-1027-A1")).toBeTruthy();
  });

  it("anular o contrato leva as encomendas de ajuste; recarregar volta a emiti-las", () => {
    const ctx = preparar(), { S, A, d } = ctx;
    pagar(ctx);
    A.role("operacoes");
    A.novaTarefaPlano(d.id, { sid: "pint", q: 10, fase: 4 });
    // recarregar a página: o Inventário volta aos dados de exemplo e a sincronização volta a emitir as duas
    esquecerInventario();
    expect(sincronizarEcsNegocios(S.deals)).toBeGreaterThanOrEqual(2);
    expect(ecInv("EC-1027")).toBeTruthy();
    expect(ecInv("EC-1027-A1")?.origin.ref).toBe("CT 2026/1027 · A1");
    expect(anularEcNoInventario("CT 2026/1027", "teste").ok).toBe(true);
    expect(ecInv("EC-1027")!.deleted).toBe(true);
    expect(ecInv("EC-1027-A1")!.deleted).toBe(true);
  });
});
