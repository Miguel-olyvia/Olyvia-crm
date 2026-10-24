import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { PessoasSimples, esquecerPessoas } from "./PessoasSimples";
import { documentosDe, todosApp } from "./pessoasDocs";

const original = window.matchMedia;
beforeEach(() => {
  esquecerPessoas();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); window.matchMedia = original; });

function pagina() {
  const S: Estado = seed();
  const run = (fn: () => void) => fn();
  const A = acoes(S, vi.fn(), run);
  const abrir = vi.spyOn(A, "abrir");
  render(<PessoasSimples S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
  return { S, abrir };
}
const tabela = (): HTMLElement => screen.getByRole("table");
const separador = (painel: HTMLElement, nome: string): void => { fireEvent.mouseDown(within(painel).getByRole("tab", { name: nome }), { button: 0 }); };
const lista = async (painel: HTMLElement): Promise<HTMLElement> => within(painel).findByRole("list", { name: "Negócios desta pessoa" });

describe("Ficha · negócios de exemplo não abrem o negócio base de outra pessoa", () => {
  it("o próximo passo e os documentos de um negócio de exemplo são texto, com a nota, e não chamam A.abrir", async () => {
    const { abrir, S } = pagina();
    const vista = S.view;
    fireEvent.click(within(tabela()).getByRole("button", { name: /Carla Nunes/ }));
    const painel = await screen.findByRole("dialog");
    separador(painel, "Negócios");
    fireEvent.click(within(await lista(painel)).getByRole("button", { name: /Casa de banho e pintura/ }));
    const detalhe = within(painel).getByRole("region", { name: "Negócio: Casa de banho e pintura" });
    expect(within(detalhe).getByText("Próximo passo")).toBeInTheDocument();
    expect(within(detalhe).queryAllByRole("button")).toHaveLength(0); // nem o próximo passo nem os "Abrir" são botões
    expect(within(detalhe).queryByText("Abrir")).toBeNull();
    expect(within(detalhe).getByText("Negócio de exemplo: sem ações.")).toBeInTheDocument();
    expect(within(within(detalhe).getByRole("list", { name: "Documentos do negócio" })).getAllByRole("listitem")).toHaveLength(3);
    expect(abrir).not.toHaveBeenCalled();
    expect(S.view).toBe(vista);
  });
  it("o negócio da seed da mesma pessoa mantém o próximo passo e os Abrir, que abrem esse negócio", async () => {
    const { abrir, S } = pagina();
    fireEvent.click(within(tabela()).getByRole("button", { name: /Carla Nunes/ }));
    const painel = await screen.findByRole("dialog");
    separador(painel, "Negócios");
    fireEvent.click(within(await lista(painel)).getByRole("button", { name: /^Cozinha/ }));
    const detalhe = within(painel).getByRole("region", { name: "Negócio: Cozinha" });
    expect(detalhe).not.toHaveTextContent("Negócio de exemplo");
    const botoes = within(detalhe).getAllByRole("button");
    expect(botoes.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(within(detalhe).getByRole("list", { name: "Documentos do negócio" })).getAllByRole("button")[0]);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith(1031);
    expect(S.view).toBe("negocio");
  });
  it("numa pessoa de exemplo o botão principal diz 'Ver negócios' e muda para o separador Negócios, sem abrir nada", async () => {
    const { abrir, S } = pagina();
    const vista = S.view;
    fireEvent.click(within(tabela()).getByRole("button", { name: /Inês Carvalho/ }));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true");
    expect(within(painel).queryByRole("button", { name: /Abrir negócio/ })).toBeNull();
    fireEvent.click(within(painel).getByRole("button", { name: /Ver negócios/ }));
    expect(within(painel).getByRole("tab", { name: "Negócios" })).toHaveAttribute("aria-selected", "true");
    expect(within(await lista(painel)).getAllByRole("button").some((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(abrir).not.toHaveBeenCalled();
    expect(S.view).toBe(vista);
  });
  it("numa pessoa da seed o botão principal continua a ser o do motor (Pedro Lopes: Registar chamada)", async () => {
    pagina();
    fireEvent.click(within(tabela()).getByRole("button", { name: /Pedro Lopes/ }));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByRole("button", { name: "Registar chamada" })).toBeInTheDocument();
    expect(within(painel).queryByRole("button", { name: /Ver negócios/ })).toBeNull();
  });
  it("em Contratos e documentos, só os documentos de negócios da seed têm 'Abrir o negócio' (Joana Ribeiro)", async () => {
    const { S, abrir } = pagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Clientes/ }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: /Joana Ribeiro/ }));
    const painel = await screen.findByRole("dialog");
    separador(painel, "Contratos e documentos");
    const docs = documentosDe(todosApp(S).find((p) => p.nome === "Joana Ribeiro")!);
    const exemplos = docs.filter((d) => d.exemplo), reais = docs.filter((d) => !d.exemplo);
    expect(exemplos.length).toBeGreaterThan(0);
    expect(reais.length).toBeGreaterThan(0);
    const itens = within(await within(painel).findByRole("list", { name: "Contratos e documentos" })).getAllByRole("listitem");
    expect(itens).toHaveLength(docs.length);
    expect(within(painel).getAllByRole("button", { name: /Abrir o negócio/ })).toHaveLength(reais.length);
    for (const li of itens.filter((x) => x.textContent?.includes("WC de serviço e lavandaria"))) expect(within(li).queryByRole("button")).toBeNull();
    fireEvent.click(within(painel).getAllByRole("button", { name: /Abrir o negócio/ })[0]);
    expect(abrir).toHaveBeenCalledTimes(1);
  });
});
