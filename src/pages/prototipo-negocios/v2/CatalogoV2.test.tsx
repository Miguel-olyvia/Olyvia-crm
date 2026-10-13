import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "../motor";
import { CATALOGO } from "../catalogo";
import { CatalogoV2 } from "./CatalogoV2";
import { reporCustos } from "./custosStore";

afterEach(() => { cleanup(); reporCustos(); });

function pagina(S: Estado) {
  const run = (fn: () => void) => fn();
  return render(<CatalogoV2 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
}
const linhas = () => within(screen.getByRole("table", { name: /Serviços do Catálogo/ })).getAllByRole("row").slice(1);

describe("CatalogoV2 · a lista única", () => {
  it("mostra os em uso e o Catálogo numa só tabela, ordenada por uso (aria-sort), com âncoras para os Custos", () => {
    const S = seed();
    pagina(S);
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
    const total = new Set([...Object.keys(S.svc), ...CATALOGO.map((c) => c.id)]).size;
    expect(linhas()).toHaveLength(total);
    expect(screen.getByRole("columnheader", { name: "Uso" })).toHaveAttribute("aria-sort", "descending");
    expect(within(linhas()[0]).getByText("Em uso")).toBeInTheDocument();
    expect(within(linhas()[total - 1]).getByText("Não usado")).toBeInTheDocument();
    for (const t of ["Parâmetros", "Perfis", "Equipamentos", "Estrutura"]) expect(screen.getByRole("link", { name: t })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("os chips filtram e o cabeçalho ordena", () => {
    const S = seed();
    pagina(S);
    fireEvent.click(screen.getByRole("button", { name: /^Em uso/ }));
    expect(linhas()).toHaveLength(Object.keys(S.svc).length);
    fireEvent.click(screen.getByRole("button", { name: /^Em uso/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Preço desatualizado/ }));
    expect(linhas().map((r) => within(r).getAllByRole("button")[0].textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Revestimento de parede")]));
    fireEvent.click(screen.getByRole("button", { name: /^Preço desatualizado/ }));
    fireEvent.click(screen.getByRole("button", { name: "Serviço" }));
    expect(screen.getByRole("columnheader", { name: "Serviço" })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar serviço" }), { target: { value: "gás" } });
    expect(linhas().length).toBeGreaterThan(0);
    expect(linhas().every((r) => /g[aá]s/i.test(r.textContent ?? ""))).toBe(true);
  });
});

describe("CatalogoV2 · a ficha do serviço numa página", () => {
  it("abre no lugar da lista (sem modal), edita as horas na linha, que passam para o motor, e volta", () => {
    const S = seed();
    pagina(S);
    fireEvent.click(screen.getByRole("button", { name: /Demolição e entulho/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Demolição e entulho" })).toBeInTheDocument();
    for (const t of ["Mão de obra", "Equipamentos", "Consumíveis", "Preço"]) expect(screen.getByRole("heading", { level: 2, name: t })).toBeInTheDocument();
    const horas = screen.getByRole("textbox", { name: "Horas por m² de Execução" });
    fireEvent.change(horas, { target: { value: "0,8" } });
    fireEvent.blur(horas);
    expect(S.svc.demol.h).toBe(0.8);
    expect(screen.getByRole("status")).toHaveTextContent("Horas mudadas");
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
  });
  it("um só botão primário; mudar o preço fica no histórico e no motor", () => {
    const S = seed();
    pagina(S);
    fireEvent.click(screen.getByRole("button", { name: /^Canalização ?Canalizador$/ }));
    const guardar = screen.getByRole("button", { name: "Guardar o preço" });
    expect(guardar).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Preço de tabela/ }), { target: { value: "120" } });
    fireEvent.click(guardar);
    expect(S.svc.canal.preco).toBe(120);
    expect(screen.getByRole("heading", { name: "Histórico de preços" }).nextElementSibling).toHaveTextContent("120,00 €");
  });
  it("o salário só a Direção vê", () => {
    const S = seed();
    pagina(S);
    expect(screen.getAllByText("Só a Direção").length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: /Salário de/ })).toBeNull();
    cleanup();
    S.role = "direcao";
    pagina(S);
    expect(screen.getAllByRole("textbox", { name: /Salário de/ }).length).toBeGreaterThan(0);
  });
});
