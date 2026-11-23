// 23/11 (Rúben: «procura melhorias no estúdio da obra para o deixar mega next-level»): o cabeçalho com um número herói, a obra antes do
// arranque, a curva S, os materiais numa lista só, o 3D pelo tempo, o diário, o cliente, o fecho e o telemóvel.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { obraEm3DNoDia, tarefaDaPeca } from "./obra3d";
import { diasComRegistos, resumoDoDia } from "./resumoDoDia";
import { dispersaoDaEquipa } from "./dispersaoEquipa";
import { ocupacaoDosTecnicos } from "../preparacaoObra";
import { definirEncomendasReais, resumoDaBase, type LinhaDocEc } from "../real/encomendaReal";

afterEach(() => { cleanup(); definirEncomendasReais(null); });

export function montarObra(x = obraDeExemplo()) {
  const A = acoes(x.S, () => {}, (fn) => fn());
  const ctx = { S: x.S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
  return { ...x, A };
}
/** A obra de exemplo arrancada mas sem nada começado: a primeira tarefa daqui a 3 dias úteis. */
export function obraPorComecar() {
  const x = obraDeExemplo(), p = x.d.obra.plano!;
  for (const t of p.tasks) { delete t.exec; delete t.bloqueio; t.dia += 3; }
  p.dia = 0;
  return x;
}

describe("1. o cabeçalho com um número herói", () => {
  it("em curso: o dia da obra e o feito; o fim provável contra o do contrato; a margem com o desvio", () => {
    montarObra();
    const pulso = screen.getByRole("region", { name: "O pulso da obra" });
    expect(within(pulso).getByRole("button", { name: /^Feito: \d+%, dia 5 de \d+$/ })).toBeTruthy();
    const fim = within(pulso).getByRole("button", { name: /Fim provável/ });
    expect(fim.textContent).toMatch(/contrato/);
    expect(within(pulso).getByRole("button", { name: /Margem ao vivo/ }).textContent).toMatch(/orçamento/i);
  });
  it("antes do arranque: a contagem até à primeira tarefa, com o dia e quem a faz", () => {
    const x = obraPorComecar();
    montarObra(x);
    const pulso = screen.getByRole("region", { name: "O pulso da obra" });
    const heroi = within(pulso).getByRole("button", { name: /^Começa daqui a 3 dias úteis/ });
    expect(heroi.textContent).toMatch(/3 dias úteis/);
  });
});

describe("2. «Na obra hoje» antes do arranque", () => {
  it("a contagem, a primeira tarefa e a lista do arranque; o primeiro ponto que falta é o próximo passo e resolve-se ali", () => {
    const x = obraPorComecar();
    delete x.d.f.chaves; x.d.f.condominio = "Sim";
    montarObra(x);
    const hoje = screen.getByRole("region", { name: "Hoje na obra" });
    expect(within(hoje).getByText(/^Arranque · /)).toBeTruthy();
    expect(within(hoje).getByText(/Daqui a 3 dias úteis · primeira tarefa/)).toBeTruthy();
    const lista = within(hoje).getByRole("region", { name: "Lista do arranque" });
    expect(within(lista).getByText("Condomínio avisado")).toBeTruthy();
    expect(within(lista).getByText(/Próximo passo/)).toBeTruthy();
    fireEvent.click(within(lista).getByRole("button", { name: "Chave entregue" }));
    expect(x.d.f.chaves).toBe("Chave entregue");
  });
});

describe("3. a curva S e a margem", () => {
  it("em curso: a curva com hoje e a previsão; a margem num só indicador, com o desvio", () => {
    montarObra();
    const pv = screen.getByRole("region", { name: "A previsão viva" });
    expect(within(pv).getByRole("img", { name: /fim provável/ })).toBeTruthy();
    expect(within(pv).getByText("Previsão")).toBeTruthy();
    // revisão de 23/11: a margem fica só no cabeçalho; no Plano, o custo por fase
    expect(within(pv).queryByText("Margem ao vivo")).toBeNull();
    const c = within(pv).getByRole("region", { name: "O custo por fase" });
    expect(within(c).getAllByText(/Mão de obra .* € \(/).length).toBeGreaterThan(0);
  });
  it("antes do arranque: o calendário das fases em vez da curva vazia", () => {
    montarObra(obraPorComecar());
    const pv = screen.getByRole("region", { name: "A previsão viva" });
    expect(within(pv).getByText("As fases da obra")).toBeTruthy();
    expect(within(pv).queryByText("Horas planeadas e reais")).toBeNull();
  });
});

describe("4. os materiais numa lista só", () => {
  it("por fase, com o dia em que a tarefa precisa, a origem e o alerta do que chega tarde", () => {
    const x = obraDeExemplo();
    x.d.obra.ec!.linhas = []; x.d.obra.ec!.ref = "CT 2026/1027";
    const linha = (nome: string, po: string | null, recebida: boolean): LinhaDocEc => ({
      quote_line_id: nome, item_type: "product", product_id: null, product_name: nome, product_sku: null, quantity: 1, unidade: "un", line_status: null,
      purchase_order_id: po, qty_needed: 1, qty_reserved: recebida ? 1 : 0, qty_ordered: 1, qty_received: recebida ? 1 : 0, qty_missing: recebida ? 0 : 1,
      qty_served: 0, has_preferred_supplier: true, request_block_reason: null,
    });
    const inv = resumoDaBase({ order_number: "EC-1", lines: [linha("Base de Duche ZEUS 70x150", "po-1", false), linha("Cola cimentícia C2", null, true)] },
      [{ id: "po-1", order_number: "PO-1", status: "approved", expected_delivery: "2027-02-01", fornecedor: "Fornecedor Demo", publicada: true, prometida: "2027-02-01" }]);
    definirEncomendasReais(new Map([[x.d.obra.ec!.ref!, inv]]));
    montarObra(x);
    fireEvent.click(screen.getByRole("tab", { name: /Materiais/ }));
    expect(screen.queryByRole("region", { name: "As entregas" })).toBeNull();
    const sec = screen.getByRole("region", { name: "O que chegou e o que falta" });
    expect(within(sec).getAllByText(/^Precisa a /).length).toBeGreaterThan(0);
    expect(within(sec).getAllByText("modelo de obra").length).toBe(2); // nenhum dos dois está nos produtos do contrato do exemplo
    expect(within(sec).getByRole("alert").textContent).toMatch(/Base de Duche ZEUS 70x150 chega depois/);
    expect(within(sec).getByText("chega a 01/02")).toBeTruthy();
    expect(within(sec).getByText("no armazém")).toBeTruthy();
  });
});

describe("5. o 3D pelo tempo", () => {
  it("antes da demolição, a divisão como está; no fim do plano, tudo feito; a meio, só o que o plano já acabou", () => {
    const { d } = obraDeExemplo();
    const p = d.obra.plano!, fim = Math.max(...p.tasks.map((t) => t.dia + t.dur));
    const dem = p.tasks.find((t) => /demol/i.test(t.nome))!;
    const antes = obraEm3DNoDia(d, dem.dia)!;
    expect(antes.demolida).toBe(dem.dur > 1 ? false : true);
    const noFim = obraEm3DNoDia(d, fim - 1)!;
    expect(noFim.demolida).toBe(true);
    expect(noFim.porFazer.size).toBe(0);
    expect(noFim.feitas).toBe(noFim.total);
    const meio = obraEm3DNoDia(d, dem.dia + dem.dur)!;
    expect(meio.demolida).toBe(true);
    expect(meio.porFazer.size).toBeGreaterThan(0);
  });
  it("tocar numa peça: a tarefa do ofício dela", () => {
    const { d } = obraDeExemplo();
    const r = obraEm3DNoDia(d, 99)!;
    if (!r.cena.ok) throw new Error("devia abrir");
    const comTarefa = r.cena.espaco.pecas.map((x) => tarefaDaPeca(d, x.id)).filter((x) => x != null);
    expect(comTarefa.length).toBeGreaterThan(0);
  });
});

describe("6. o diário automático", () => {
  it("o resumo do dia a partir dos registos: quem fez o quê, as horas, as notas e as fotografias", () => {
    const { d } = obraDeExemplo();
    const p = d.obra.plano!;
    const L = diasComRegistos(p);
    expect(L.length).toBeGreaterThan(0);
    const R = resumoDoDia(p, 1)!;
    expect(R.frase).toMatch(/h registadas/);
    expect(R.linhas.some((x) => /Canalização/.test(x.t) && /feita/.test(x.t))).toBe(true);
    expect(R.linhas.some((x) => x.nota === "Ensaio de pressão feito, 30 min sem perdas")).toBe(true);
    expect(resumoDoDia(p, 40)).toBeNull();
  });
  it("no separador Diário: o resumo e as plantas antes e depois", () => {
    montarObra();
    fireEvent.click(screen.getByRole("tab", { name: /Diário/ }));
    expect(screen.getByRole("region", { name: "O resumo do dia" }).textContent).toMatch(/h registadas/);
    const pl = screen.getByRole("region", { name: "As plantas antes e depois" });
    expect(within(pl).getAllByRole("img").length).toBe(2);
  });
});

describe("7. o cliente", () => {
  it("o ponto da semana pronto a rever (não se publica sozinho) e a pré-visualização do portal", () => {
    const { A } = montarObra();
    void A;
    fireEvent.click(screen.getByRole("tab", { name: /Cliente/ }));
    const ponto = screen.getByRole("region", { name: "O ponto da semana" });
    expect(within(ponto).getByRole("button", { name: /Publicar no portal/ })).toBeTruthy();
    const portal = screen.getByRole("region", { name: "O que o cliente vê no portal" });
    expect(portal.textContent).toMatch(/custos/);
    expect(portal.textContent!.length).toBeGreaterThan(200);
  });
});

describe("8. o fecho", () => {
  it("o auto de receção antes de encerrar: os trabalhos com o nome curto, o antes e o depois com a planta final e a garantia", () => {
    const x = obraDeExemplo();
    x.d.f.garantia = "5 anos";
    montarObra(x);
    fireEvent.click(screen.getByRole("tab", { name: /Fecho/ }));
    fireEvent.click(screen.getByRole("button", { name: /Pré-visualizar o auto/ }));
    const dlg = screen.getByRole("dialog", { name: "O auto de receção" });
    expect(within(dlg).getByRole("region", { name: "Trabalhos executados" })).toBeTruthy();
    expect(within(dlg).getByRole("img", { name: /^A planta final/ })).toBeTruthy();
    expect(within(dlg).getByRole("region", { name: "Garantia" }).textContent).toMatch(/5 anos/);
    expect(x.d.obra.auto ?? null).toBeNull(); // só para ver: o auto não se cria
  });
});

describe("9. o telemóvel do gestor", () => {
  it("a barra do polegar: «Precisa de ti» com a contagem, o imprevisto e a ação principal", () => {
    montarObra();
    const nav = screen.getByRole("navigation", { name: "Ações rápidas" });
    expect(within(nav).getByRole("button", { name: /Precisa de ti/ })).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button", { name: "Imprevisto" }));
    expect(screen.getByRole("complementary", { name: "Registar imprevisto" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: /Validar a tarefa feita/ })).toBeTruthy();
  });
});

describe("A e B. sem repetições; «A seguir» com os próximos dias", () => {
  it("«Precisa de ti» só no painel; a margem só no cabeçalho", () => {
    montarObra();
    const pulso = screen.getByRole("region", { name: "O pulso da obra" });
    expect(within(pulso).queryByText(/Precisa de ti/)).toBeNull();
    expect(screen.getAllByText("Margem ao vivo")).toHaveLength(1);
  });
  it("antes do arranque, «A seguir» mostra os primeiros dias de trabalho, com quem e o quê", () => {
    const x = obraPorComecar();
    montarObra(x);
    const hoje = screen.getByRole("region", { name: "Hoje na obra" });
    const p = x.d.obra.plano!, primeira = [...p.tasks].sort((a, b) => a.dia - b.dia)[0];
    expect(within(hoje).getAllByTitle(primeira.nome).length).toBe(2); // o cartão do arranque e «A seguir»
  });
});

describe("C, D e E. sem cortes; o 3D antes do arranque", () => {
  it("antes do arranque, «A obra hoje» no 3D é a divisão como está", () => {
    montarObra(obraPorComecar());
    fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
    const sec = screen.getByRole("region", { name: "O projeto em 3D" });
    expect(within(sec).getByRole("img", { name: /^A divisão como está, antes da obra/ })).toBeTruthy();
    expect(sec.textContent).toMatch(/A obra ainda não começou/);
  });
});

describe("G. as saídas para a obra", () => {
  it("por dia e por quem leva, com o estado", () => {
    montarObra();
    fireEvent.click(screen.getByRole("tab", { name: /Materiais/ }));
    const sec = screen.getByRole("region", { name: "Saídas para a obra" });
    expect(within(sec).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(sec.textContent).toMatch(/leva \d+ materia/);
  });
});

describe("H. a equipa dispersa", () => {
  it("com poucas pessoas para a obra, não há aviso", () => {
    const { S, d } = obraDeExemplo();
    expect(dispersaoDaEquipa(d.obra.plano!, ocupacaoDosTecnicos(S, d.id))).toBeNull();
    montarObra();
    fireEvent.click(screen.getByRole("tab", { name: /Equipa/ }));
    expect(screen.queryByRole("region", { name: "A equipa dispersa" })).toBeNull();
  });
});
