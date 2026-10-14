// A ficha do serviço no V1 revista (14/10/2026): sem <select>, o seletor com pesquisa para juntar e tirar
// equipamentos e consumíveis, o "Opcional" a mexer no custo e a secção "Entulho" com a conta que se atualiza.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { lerCatalogo, reporCatalogo } from "./v2/catalogoStore";

afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

function pagina(S: Estado = seed()) {
  const run = (fn: () => void) => fn();
  const r = render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
  return { S, container: r.container };
}
const abrir = (nome: RegExp, procura?: string) => {
  fireEvent.click(screen.getByRole("tab", { name: "Serviços" }));
  if (procura) fireEvent.change(screen.getByRole("searchbox", { name: "Procurar serviço" }), { target: { value: procura } });
  fireEvent.click(screen.getAllByRole("button", { name: nome })[0]);
};
/** Abre um seletor com pesquisa, escreve e escolhe com Enter. */
const escolher = (gatilho: string, texto: string) => {
  fireEvent.click(screen.getByRole("button", { name: gatilho }));
  const cx = screen.getByRole("combobox", { name: `Procurar: ${gatilho}` });
  fireEvent.change(cx, { target: { value: texto } });
  fireEvent.keyDown(cx, { key: "Enter" });
};
const conta = () => screen.getByTestId("conta-entulho").textContent ?? "";

describe("a ficha do serviço sem dropdowns", () => {
  it("nenhum <select> na ficha (técnico, medida, artigo, equipamento, consumível, ramo, pergunta, quantidade)", () => {
    const { container } = pagina();
    abrir(/^Canalização/);
    expect(screen.getByRole("heading", { level: 1, name: "Canalização" })).toBeInTheDocument();
    expect(container.querySelector("article")!.querySelector("select")).toBeNull();
    // o tipo de técnico escolhe-se num seletor com pesquisa, com o €/h à direita
    fireEvent.click(screen.getAllByRole("button", { name: /^Tipo de técnico de / })[0]);
    expect(within(screen.getByRole("listbox")).getAllByRole("option")[0].textContent).toMatch(/€\/h|sem salário/);
  });
  it("juntar e tirar um equipamento pelo seletor com pesquisa", () => {
    const { S } = pagina();
    abrir(/^Canalização/);
    const antes = S.svc.canal.eq;
    escolher("Juntar equipamento", "martelo demolidor");
    const lista = screen.getByRole("list", { name: "Equipamentos do serviço" });
    expect(within(lista).getByText("Martelo demolidor")).toBeInTheDocument();
    expect(S.svc.canal.eq).toBeGreaterThan(antes);
    fireEvent.click(screen.getByRole("button", { name: "Retirar Martelo demolidor" }));
    expect(within(screen.getByRole("list", { name: "Equipamentos do serviço" })).queryByText("Martelo demolidor")).toBeNull();
    expect(S.svc.canal.eq).toBeCloseTo(antes, 6);
  });
  it("juntar e tirar um consumível pelo seletor com pesquisa; o total do bloco acompanha", () => {
    const { S } = pagina();
    abrir(/^Canalização/);
    const antes = S.svc.canal.cons;
    escolher("Juntar consumível", "cimento-cola");
    expect(screen.getAllByRole("textbox", { name: "Consumível" }).some((x) => (x as HTMLInputElement).value.startsWith("Cimento-cola"))).toBe(true);
    expect(S.svc.canal.cons).toBeCloseTo(antes + 4.75, 6);
    expect(screen.getByTestId("total-co-t")).toHaveTextContent(`${(antes + 4.75).toFixed(2).replace(".", ",")} €/pt`);
    fireEvent.click(screen.getByRole("button", { name: /^Retirar Cimento-cola/ }));
    expect(S.svc.canal.cons).toBeCloseTo(antes, 6);
  });
  it("o «Opcional» (switch) tira o consumível do custo: fica esbatido e «fora do custo»", () => {
    const { S } = pagina();
    abrir(/^Canalização/);
    const antes = S.svc.canal.cons;
    fireEvent.click(screen.getByRole("switch", { name: "Opcional: Fita e vedante" }));
    expect(S.svc.canal.cons).toBeCloseTo(antes - 0.5, 6);
    expect(screen.getByText("fora do custo")).toBeInTheDocument();
    expect(screen.getByTestId("opcionais")).toHaveTextContent("mais 0,50 €");
  });
});

describe("a ficha do serviço: o entulho", () => {
  it("a sanita trocada: «Do produto que sai», com a conta de exemplo, que se atualiza ao mudar o m³ do produto", () => {
    pagina();
    abrir(/^Instalação de Sanita Compacta/, "sanita compacta");
    const sec = screen.getByRole("region", { name: "Entulho" });
    expect(within(sec).getByRole("radio", { name: /Do produto que sai/ })).toBeChecked();
    expect(conta()).toContain("2 un × 0,06 m³ = 0,12 m³ · ≈ 50 kg → deposição 7,60 € + carga 4,43 €");
    expect(conta()).toContain("parâmetros de produção");
    const m3 = within(sec).getByRole("textbox", { name: "m³ de Sanita suspensa com estrutura" });
    act(() => { fireEvent.change(m3, { target: { value: "0,08" } }); fireEvent.blur(m3); });
    expect(conta()).toContain("2 un × 0,08 m³ = 0,16 m³");
    expect(lerCatalogo().produtos.find((p) => p.n === "Sanita suspensa com estrutura")!.entulho).toEqual({ m3: 0.08, kg: 25 });
  });
  it("mudar o modo: m³ por unidade (com os dois números), artigo de demolição (com T_dem) e não gera", () => {
    pagina();
    abrir(/^Instalação de Sanita Compacta/, "sanita compacta");
    const sec = () => screen.getByRole("region", { name: "Entulho" });
    fireEvent.click(within(sec()).getByRole("radio", { name: /m³ por unidade/ }));
    expect(lerCatalogo().entulhoServico!.c13).toMatchObject({ modo: "m3", m3: 0.06, kg: 25 });
    const kg = within(sec()).getByRole("textbox", { name: "kg por un" });
    act(() => { fireEvent.change(kg, { target: { value: "0" } }); fireEvent.blur(kg); });
    expect(conta()).toContain("2 un × 0,06 m³ = 0,12 m³ · ≈ 168 kg"); // sem kg: volume × 1,4 t/m³
    fireEvent.click(within(sec()).getByRole("radio", { name: /Do artigo de demolição/ }));
    expect(lerCatalogo().artigoDoServico!.c13).toBe("DEM-SAN-01");
    expect(conta()).toMatch(/demolição 27,67 € \+ deposição 7,60 € \+ carga 4,43 € \+ consumíveis 6,00 €/);
    fireEvent.click(within(sec()).getByRole("radio", { name: /Não gera/ }));
    expect(lerCatalogo().artigoDoServico!.c13).toBeUndefined();
    expect(conta()).toMatch(/Não gera entulho/);
    expect(screen.getByTestId("total-ent-t")).toHaveTextContent("não gera");
    // um só primário
    expect(screen.getAllByRole("button").filter((b) => /(^|\s)bg-primary(\s|$)/.test(b.className)).map((b) => b.textContent)).toEqual(["Guardar o preço"]);
  });
});
