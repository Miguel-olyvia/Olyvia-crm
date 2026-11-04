// 03/11/2026: o Catálogo e custos desliga a edição sem as permissões que as funções cat_* exigem (antes deixava mexer e a gravação
// falhava com CT001). Só services.view: tudo para consultar, nada para mudar.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { PODE_TUDO, ProvedorPermissoesCatalogo, permissoesCatalogo, podeCriarTipo, type PermissoesCatalogo } from "./permissoesCatalogo";

afterEach(() => { cleanup(); reporCustos(); window.history.replaceState(null, "", "/"); });

const SO_VER: PermissoesCatalogo = { servicos: false, custos: false, produtos: false, pvp: false };

function pagina(perms: PermissoesCatalogo, S: Estado = seed()) {
  const run = (fn: () => void) => fn();
  render(
    <ProvedorPermissoesCatalogo valor={perms}>
      <CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />
    </ProvedorPermissoesCatalogo>,
  );
  return S;
}
const abrirCanalizacao = () => { fireEvent.click(screen.getByRole("tab", { name: "Serviços" })); fireEvent.click(screen.getAllByRole("button", { name: /^Canalização/ })[0]); };

describe("permissoesCatalogo", () => {
  it("lê as quatro permissões", () => {
    const tem = new Set(["services.edit", "products.manage_prices"]);
    expect(permissoesCatalogo((c) => tem.has(c))).toEqual({ servicos: true, custos: false, produtos: false, pvp: true });
  });
  it("serviços, equipamentos e técnicos com services.edit; produtos e consumíveis com products.edit", () => {
    const so = { ...SO_VER, servicos: true };
    expect(["servico", "equipamento", "tecnico"].every((t) => podeCriarTipo(so, t as "servico"))).toBe(true);
    expect(podeCriarTipo(so, "produto")).toBe(false);
    expect(podeCriarTipo(so, "consumivel")).toBe(false);
    expect(podeCriarTipo({ ...SO_VER, produtos: true }, "produto")).toBe(true);
  });
});

describe("Catálogo só com services.view", () => {
  it("não há botão Criar", () => {
    pagina(SO_VER);
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar" })).toBeNull();
  });

  it("a ficha do serviço abre, avisa que é só de leitura e tem os controlos desligados (voltar continua)", () => {
    pagina(SO_VER);
    abrirCanalizacao();
    expect(screen.getByRole("heading", { level: 1, name: "Canalização" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/Só de leitura/);
    expect(screen.getByRole("switch", { name: "Opcional: Fita e vedante" })).toBeDisabled();
    expect(within(screen.getByRole("group", { name: "A quantidade vem de" })).getByRole("radio", { name: "Pontos de água" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar o preço" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
  });

  it("os equipamentos não têm «Editar» e os técnicos não têm o salário", () => {
    const S = seed();
    S.role = "direcao";
    pagina(SO_VER, S);
    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));
    expect(within(screen.getByRole("tabpanel")).queryAllByRole("button", { name: /^Editar / })).toHaveLength(0);
    fireEvent.click(screen.getByRole("tab", { name: "Técnicos" }));
    expect(within(screen.getByRole("tabpanel")).queryAllByRole("spinbutton", { name: /^Salário de / })).toHaveLength(0);
    expect(within(screen.getByRole("tabpanel")).queryAllByRole("textbox", { name: /^Salário de / })).toHaveLength(0);
  });
});

describe("Catálogo com services.edit e sem products.edit", () => {
  it("Criar abre só com serviço, equipamento e técnico", () => {
    pagina({ ...SO_VER, servicos: true });
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    const tipos = within(screen.getByRole("radiogroup", { name: "O que criar" })).getAllByRole("radio").map((r) => r.textContent ?? "");
    expect(tipos.some((t) => t.startsWith("Serviço"))).toBe(true);
    expect(tipos.some((t) => t.startsWith("Produto"))).toBe(false);
    expect(tipos.some((t) => t.startsWith("Consumível"))).toBe(false);
  });

  it("a direção com services.edit vê o salário dos técnicos", () => {
    const S = seed();
    S.role = "direcao";
    pagina({ ...SO_VER, servicos: true }, S);
    fireEvent.click(screen.getByRole("tab", { name: "Técnicos" }));
    expect(within(screen.getByRole("tabpanel")).getAllByRole("textbox", { name: /^Salário de / }).length).toBeGreaterThan(0);
  });

  it("a ficha do serviço e os equipamentos são editáveis", () => {
    pagina({ ...SO_VER, servicos: true });
    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));
    expect(within(screen.getByRole("tabpanel")).getAllByRole("button", { name: /^Editar / }).length).toBeGreaterThan(0);
    abrirCanalizacao();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("switch", { name: "Opcional: Fita e vedante" })).toBeEnabled();
  });
});

describe("sem provedor (protótipo) pode tudo, como antes", () => {
  it("PODE_TUDO é o valor por omissão", () => {
    expect(PODE_TUDO).toEqual({ servicos: true, custos: true, produtos: true, pvp: true });
    const run = (fn: () => void) => fn();
    const S = seed();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
  });
});
