// 23/11 (Rúben, no 1015): «não se percebe que serviços são porque é curto demais», «estes serviços a vermelho parece que estão errados»,
// «clico no erro de replanear e não permite fazer nada» e «uma visão destas [as linhas do contrato] numa das tabs».
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { acoes, totaisIva } from "../motor";
import type { Ctx } from "../pecas";
import { ocupacaoDosTecnicos } from "../preparacaoObra";
import { PREFIXO_PROD, textoProduto, type ProdVisita } from "../produtosVisita";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { alertasDaObra } from "./alertasObra";
import { nomeCurtoTarefa, replanear } from "./planoVivo";
import { contratoDaObra } from "./contratoDaObra";
import { materiaisPorFase } from "../obraOps";
import { resumoDaBase, type LinhaDocEc } from "../real/encomendaReal";
import { caminhoPorFase, iconeDaTarefa } from "./CaminhoCritico";
import { DoorOpen, Droplets, ShowerHead } from "lucide-react";

afterEach(cleanup);

function montar(d = obraDeExemplo()) {
  const { S } = d;
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  render(<EstudioObra ctx={ctx} d={d.d} fechar={() => {}} />);
  return { ...d, A };
}

describe("o nome curto das tarefas nas barras", () => {
  it("a etapa do modelo, sem «Instalação de» e sem a unidade", () => {
    expect(nomeCurtoTarefa("MO Modelo Remodelação Completa - Casa de Banho Comum · canalização")).toBe("Canalização");
    expect(nomeCurtoTarefa("MO Modelo Remodelação Completa - Casa de Banho Comum · demolição e remoção")).toBe("Demolição e remoção");
    expect(nomeCurtoTarefa("Instalação de Base de Duche")).toBe("Base de Duche");
    expect(nomeCurtoTarefa("Instalação de Revestimento m2")).toBe("Revestimento");
    expect(nomeCurtoTarefa("Instalação Janela PVC Oscilobatente")).toBe("Janela PVC Oscilobatente");
    expect(nomeCurtoTarefa("Canalização")).toBe("Canalização");
  });
  it("na vista por técnico, as barras levam o nome curto e o inteiro fica na dica", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Por técnico/ }));
    const plano = screen.getByRole("region", { name: "O plano vivo" });
    const t = d.obra.plano!.tasks[1];
    const barra = within(plano).getByRole("button", { name: new RegExp(`^${t.nome}:`) });
    expect(barra.getAttribute("title")).toContain(t.nome);
    expect(barra.textContent).toContain(nomeCurtoTarefa(t.nome));
  });
});

describe("o caminho crítico não parece um erro", () => {
  it("uma linha do tempo pelas fases da obra, com ícones e nomes curtos, sem o vermelho dos erros", () => {
    const { d } = montar();
    const sec = screen.getByRole("region", { name: "Caminho crítico" });
    expect(within(sec).getByText(/Não há nada de errado nestas tarefas/)).toBeTruthy();
    expect(sec.innerHTML).not.toMatch(/destructive/);
    const fases = within(sec).getAllByText(/^Fase \d$/).map((x) => Number(x.textContent!.slice(5)));
    expect(fases.length).toBeGreaterThan(0);
    expect([...fases].sort()).toEqual(fases); // pela ordem da obra
    const tarefas = within(sec).getAllByRole("button");
    expect(tarefas.length).toBeGreaterThan(0);
    for (const b of tarefas) {
      const t = d.obra.plano!.tasks.find((x) => x.nome === b.getAttribute("title"))!;
      expect(b.textContent).toContain(nomeCurtoTarefa(t.nome));
      expect(b.querySelector("svg")).toBeTruthy(); // o ícone do trabalho
    }
  });
  it("o ícone pelo trabalho e as fases pela fase da tarefa", () => {
    expect(iconeDaTarefa("MO Modelo Remodelação Completa - Casa de Banho Comum · canalização")).toBe(Droplets);
    expect(iconeDaTarefa("Instalação de Base de Duche")).toBe(ShowerHead);
    expect(iconeDaTarefa("Instalação de Porta em CPL")).toBe(DoorOpen);
    const { d } = obraDeExemplo();
    const p = d.obra.plano!;
    const F = caminhoPorFase(p, new Set(p.tasks.map((_, i) => i)));
    expect(F.map((f) => f.n)).toEqual([...F.map((f) => f.n)].sort());
    for (const f of F) for (const x of f.tarefas) expect(x.t.fase ?? 1).toBe(f.n);
  });
});

describe("o alerta do técnico noutra obra conta as horas", () => {
  /** O montador com uma tarefa de `h` horas noutra obra no primeiro dia da montagem desta. */
  function comOutraObra(h: number) {
    const x = obraDeExemplo();
    const p = x.d.obra.plano!, mont = p.tasks[p.tasks.length - 1];
    const op = x.S.deals.find((o) => o.id === 1022)!.obra.plano!;
    const ult = op.tasks[op.tasks.length - 1];
    ult.dia = mont.dia; ult.dur = 1; ult.h = h; ult.tec = mont.tec;
    mont.h = 2 * mont.dur;
    const ocup = ocupacaoDosTecnicos(x.S, x.d.id);
    return { ...x, ocup, alertas: alertasDaObra(x.d, x.S, ocup).filter((a) => a.id.startsWith("conflito-")) };
  }
  it("a tarefa que cabe ao lado da outra obra (até às 8 h do dia) não dá alerta", () => {
    expect(comOutraObra(2).alertas).toHaveLength(0);
  });
  it("com o dia cheio dá alerta, e o «Replanear» desse alerta tem sempre algo a mudar", () => {
    const { d, ocup, alertas } = comOutraObra(8);
    expect(alertas.length).toBeGreaterThan(0);
    expect(replanear(d.obra.plano!, ocup, { adiantar: true }).mudancas.length).toBeGreaterThan(0);
  });
  it("sem nada a mudar, o replanear diz porquê e fecha (não fica um botão desligado)", async () => {
    const x = obraDeExemplo();
    const p = x.d.obra.plano!;
    // tudo já no sítio: sem folga para adiantar
    const R = replanear(p, ocupacaoDosTecnicos(x.S, x.d.id), { adiantar: true });
    R.mudancas.forEach((m) => { p.tasks[m.ti].dia = m.para.dia; p.tasks[m.ti].dur = m.para.dur; });
    montar(x);
    fireEvent.click(screen.getByRole("button", { name: "Replanear" }));
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    expect(within(previa).getByText(/O plano já está em dia/)).toBeTruthy();
    expect(within(previa).queryByRole("button", { name: /Aplicar ao plano/ })).toBeNull();
    fireEvent.click(within(previa).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Antes de aplicar" })).toBeNull());
  });
});

describe("o separador «Contrato»", () => {
  it("o serviço e o produto que ele instala na mesma linha; os totais são os do orçamento", () => {
    const { S, d } = obraDeExemplo();
    const svc = d.orc!.linhas.find((l) => l.t === "svc")!;
    if (svc.t !== "svc") throw new Error("devia haver um serviço");
    const p: ProdVisita = { id: "prod-base", n: "Base de Duche ZEUS 70x150", un: "un", custo: 120, q: 1, no: null, svc: svc.sid, pvp: 208.5 };
    d.visita.prod = [...(d.visita.prod ?? []), p];
    d.orc!.linhas.push({ t: "mat", d: PREFIXO_PROD + textoProduto(p), custo: 120, preco: 208.5, prod: { custoUn: 120, precoUn: 208.5, q: 1 }, iva: 23 });
    const C = contratoDaObra(d, S)!;
    const g = C.grupos.find((x) => x.linhas.some((l) => l.nome === p.n))!;
    expect(g.linhas[0].tipo).toBe("servico");
    expect(g.linhas[1]).toMatchObject({ nome: p.n, tipo: "produto", iva: 23, q: 1 });
    const T = totaisIva(d, S);
    expect(C.total).toBeCloseTo(T.total, 2);
    expect(C.grupos.reduce((s, x) => s + x.total, 0)).toBeCloseTo(T.base, 2);
    expect(C.grupos.map((x) => x.n)).toEqual(C.grupos.map((_, i) => i + 1));
  });
  it("no Estúdio da obra, o separador mostra a tabela com os totais", () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Contrato/ }));
    const sec = screen.getByRole("region", { name: "As linhas do contrato" });
    expect(within(sec).getByRole("columnheader", { name: "SKU" })).toBeTruthy();
    expect(within(sec).getByText("Total com IVA")).toBeTruthy();
    expect(within(sec).getAllByRole("rowgroup").length).toBeGreaterThan(2);
  });
});

describe("os materiais da obra", () => {
  const linha = (nome: string, recebida: boolean): LinhaDocEc => ({
    quote_line_id: nome, item_type: "product", product_id: null, product_name: nome, product_sku: null, quantity: 1, unidade: "un", line_status: null,
    purchase_order_id: null, qty_needed: 1, qty_reserved: recebida ? 1 : 0, qty_ordered: 1, qty_received: recebida ? 1 : 0, qty_missing: recebida ? 0 : 1,
    qty_served: 0, has_preferred_supplier: true, request_block_reason: null,
  });
  it("a encomenda emitida no servidor (sem linhas na obra) mostra o que chegou e o que falta pela encomenda da base", () => {
    const { d } = obraDeExemplo();
    d.obra.ec!.linhas = [];
    const inv = resumoDaBase({ order_number: "EC-2026-0026", lines: [linha("Base de Duche ZEUS 70x150", true), linha("Sanita MEGA BTW Compacta", false)] }, []);
    const itens = materiaisPorFase(d, inv).flatMap((g) => g.itens);
    expect(itens.map((m) => m.n).sort()).toEqual(["Base de Duche ZEUS 70x150", "Sanita MEGA BTW Compacta"]);
    expect(itens.find((m) => m.n.startsWith("Base"))!.estado).toBe("reservado");
    expect(itens.find((m) => m.n.startsWith("Sanita"))!.estado).not.toBe("reservado");
  });
  it("«Pedir mais ou devolver»: as tarefas pelas fases, com o nome curto; escolher abre os materiais dela", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("tab", { name: /Materiais/ }));
    const sec = screen.getByRole("region", { name: "Pedir mais ou devolver" });
    const grupo = within(sec).getByRole("group", { name: "A tarefa" });
    expect(within(grupo).getAllByText(/^Fase \d$/).length).toBeGreaterThan(0);
    const p = d.obra.plano!, ti = p.tasks.findIndex((t) => t.nome === "Montagem de móveis");
    const b = within(grupo).getByTitle(p.tasks[ti].nome);
    expect(b.textContent).toContain(nomeCurtoTarefa(p.tasks[ti].nome));
    fireEvent.click(b);
    expect(b.getAttribute("aria-pressed")).toBe("true");
  });
});
