import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { NegociosV2, esquecerNegociosV2 } from "./NegociosV2";
import { NegocioExemploPainel } from "./NegocioExemploPainel";
import { PessoasSimples, esquecerPessoas } from "./PessoasSimples";
import { negociosDe, semPaginaPropria } from "./negociosApp";
import { todosApp } from "./pessoasDocs";
import { linhasNegocios } from "./filtrosNegocios";

const original = window.matchMedia;
beforeEach(() => {
  esquecerPessoas();
  esquecerNegociosV2();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); window.matchMedia = original; });

function quadro(S: Estado = seed()) {
  const run = (fn: () => void) => fn();
  const A = acoes(S, vi.fn(), run);
  const abrir = vi.spyOn(A, "abrir");
  const setQ = vi.fn();
  const r = render(<NegociosV2 S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" setQ={setQ} repor={vi.fn()} />);
  return { S, A, abrir, setQ, ...r };
}
/** O botão principal do cartão com este título, na coluna do computador (a do telemóvel repete-a). */
function cartao(container: HTMLElement, titulo: string, exemplo = true): HTMLElement {
  const li = [...container.querySelectorAll<HTMLElement>('section[aria-labelledby$="-d"] > ul > li')].find((x) => x.textContent?.includes(titulo) && x.textContent.includes("exemplo") === exemplo);
  if (!li) throw new Error(`Sem cartão: ${titulo}`);
  return within(li).getAllByRole("button")[0];
}

describe("V2 de Negócios · clicar num cartão de exemplo", () => {
  it("abre o painel com o título e os orçamentos desse negócio, sem abrir o negócio base nem mudar de ecrã", async () => {
    const { container, abrir, S } = quadro();
    const vista = S.view;
    fireEvent.click(cartao(container, "Casa de banho e pintura"));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByRole("heading", { level: 2, name: "Casa de banho e pintura" })).toBeInTheDocument();
    expect(painel).toHaveAccessibleDescription(/Carla Nunes · Lead/);
    const docs = within(within(painel).getByRole("list", { name: "Documentos do negócio" })).getAllByRole("listitem");
    expect(docs[0]).toHaveTextContent(/Orçamento.*Casa de banho completa.*4\.850,00 €/);
    expect(docs[1]).toHaveTextContent(/Orçamento.*Pintura e tetos.*1\.920,00 €/);
    expect(within(painel).getByText("Valor total").nextSibling).toHaveTextContent("6.770,00 €");
    expect(within(painel).getByRole("list", { name: "Percurso do negócio" })).toBeInTheDocument();
    expect(within(painel).getByText("Negócio de exemplo: não tem página própria nem ações.")).toBeInTheDocument();
    // Só os dois botões do próprio painel: nenhuma ação do negócio (abrir, enviar, gerar).
    expect(within(painel).getAllByRole("button").map((x) => x.textContent?.trim()).filter((t) => t && t !== "Close")).toEqual(["Fechar", "Ver a pessoa"]);
    expect(abrir).not.toHaveBeenCalled();
    expect(S.view).toBe(vista);
  });
  it("mostra a proposta com 'inclui N orçamentos' e o contrato com o estado (Joana Ribeiro)", async () => {
    const { container } = quadro();
    fireEvent.click(cartao(container, "WC de serviço e lavandaria"));
    const docs = within(within(await screen.findByRole("dialog")).getByRole("list", { name: "Documentos do negócio" })).getAllByRole("listitem");
    expect(docs[2]).toHaveTextContent(/Proposta.*inclui 2 orçamentos/);
    expect(docs[3]).toHaveTextContent(/Contrato.*Enviado ao cliente/);
  });
  it("um cartão da seed continua a abrir o negócio com o id certo", () => {
    const { container, abrir, S } = quadro();
    fireEvent.click(cartao(container, "Carla Nunes", false));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(S.deals.find((d) => d.id === abrir.mock.calls[0][0])?.nome).toBe("Carla Nunes");
    expect(S.view).toBe("negocio");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("Esc fecha o painel e devolve o foco ao cartão; o foco entrou no título", async () => {
    const { container } = quadro();
    const c = cartao(container, "Climatização e isolamento");
    fireEvent.click(c);
    const painel = await screen.findByRole("dialog");
    await waitFor(() => expect(document.activeElement).toBe(within(painel).getByRole("heading", { name: "Climatização e isolamento" })));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(c);
  });
  it("o botão Fechar faz desaparecer o painel e o cartão recupera o foco", async () => {
    const { container } = quadro();
    const c = cartao(container, "Pintura exterior");
    fireEvent.click(c);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(c));
  });
  it("o negócio principal de uma pessoa de exemplo (90208, Hotel Praia Dourada) abre o painel: não chama A.abrir nem muda de ecrã", async () => {
    const { container, abrir, S } = quadro();
    const vista = S.view;
    fireEvent.click(cartao(container, "Cozinha do restaurante"));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByRole("heading", { level: 2, name: "Cozinha do restaurante" })).toBeInTheDocument();
    expect(painel).toHaveAccessibleDescription(/Hotel Praia Dourada/);
    expect(abrir).not.toHaveBeenCalled();
    expect(S.view).toBe(vista);
  });
  it("todos os cartões de exemplo (ex-901xx, ex-903xx e os das pessoas 902xx) mostram 'exemplo'; nenhum da seed mostra", () => {
    const S = seed();
    const { container } = quadro(S);
    const cartoes = linhasNegocios(S).flatMap((l) => (l.cartao ? [l.cartao] : []));
    const lis = [...container.querySelectorAll<HTMLElement>('section[aria-labelledby$="-d"] > ul > li')];
    expect(lis).toHaveLength(cartoes.length);
    const deExemplo = cartoes.filter((c) => semPaginaPropria(c));
    expect(deExemplo.some((c) => c.id.startsWith("ex-"))).toBe(true);
    expect(deExemplo.some((c) => c.id.startsWith("neg-902"))).toBe(true);
    expect(cartoes.some((c) => !semPaginaPropria(c))).toBe(true);
    for (const c of cartoes) {
      const li = lis.find((x) => x.textContent?.includes(c.nome) && x.textContent.includes(c.servico))!;
      expect(!!li, c.id).toBe(true);
      expect(within(li).queryByText("exemplo") !== null, c.id).toBe(semPaginaPropria(c));
    }
  });
  it("'Ver a pessoa' fecha o painel, guarda a pessoa na memória de Pessoas e vai para Pessoas", async () => {
    const { container, S } = quadro();
    fireEvent.click(cartao(container, "Casa de banho e pintura"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Ver a pessoa" }));
    expect(S.view).toBe("pessoas");
    expect(S.deal).toBeNull();
    cleanup();
    const run = (fn: () => void) => fn();
    render(<PessoasSimples S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: "Carla Nunes" })).toBeInTheDocument();
  });
  it("'Ver a pessoa' limpa a pesquisa global, para a pessoa aparecer em Pessoas", async () => {
    const { container, setQ } = quadro();
    fireEvent.click(cartao(container, "Casa de banho e pintura"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Ver a pessoa" }));
    expect(setQ).toHaveBeenCalledWith("");
  });
  it("com a memória de Pessoas limpa por esquecerPessoas (Repor), a ficha deixa de abrir", async () => {
    const { container, S } = quadro();
    fireEvent.click(cartao(container, "Casa de banho e pintura"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Ver a pessoa" }));
    esquecerPessoas();
    cleanup();
    const run = (fn: () => void) => fn();
    render(<PessoasSimples S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Painel de um negócio de exemplo · a pessoa", () => {
  const exemplo = (S: Estado, nome: string) => ({ ...negociosDe(S, "Carla Nunes").find((x) => x.demo)!, nome });
  it("perdida: mostra 'Lead perdida' e 'Ver a pessoa' entrega o papel perdida", () => {
    const S = seed();
    const perdida = todosApp(S).find((p) => p.perdida !== null)!;
    const verPessoa = vi.fn();
    render(<NegocioExemploPainel S={S} n={exemplo(S, perdida.nome)} fechar={vi.fn()} verPessoa={verPessoa} retorno={createRef<HTMLElement>()} />);
    const painel = screen.getByRole("dialog");
    expect(painel).toHaveAccessibleDescription(new RegExp(`${perdida.nome} · Lead perdida`));
    fireEvent.click(within(painel).getByRole("button", { name: "Ver a pessoa" }));
    expect(verPessoa).toHaveBeenCalledWith(perdida.nome, "perdida");
  });
  it("que não existe: não inventa o papel, o botão fica desativado e a razão está em texto", () => {
    const S = seed();
    const verPessoa = vi.fn();
    render(<NegocioExemploPainel S={S} n={exemplo(S, "Fulano Inexistente")} fechar={vi.fn()} verPessoa={verPessoa} retorno={createRef<HTMLElement>()} />);
    const painel = screen.getByRole("dialog");
    expect(painel).not.toHaveAccessibleDescription(/Lead|Cliente/);
    const botao = within(painel).getByRole("button", { name: "Ver a pessoa" });
    expect(botao).toBeDisabled();
    expect(within(painel).getByText(/A pessoa não está na lista de Pessoas/)).toBeInTheDocument();
    fireEvent.click(botao);
    expect(verPessoa).not.toHaveBeenCalled();
  });
  it("fechar com o cartão já desmontado não rebenta", async () => {
    const S = seed();
    const retorno = { current: document.createElement("button") as HTMLElement | null };
    const { rerender } = render(<NegocioExemploPainel S={S} n={exemplo(S, "Carla Nunes")} fechar={vi.fn()} verPessoa={vi.fn()} retorno={retorno} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(() => rerender(<NegocioExemploPainel S={S} n={undefined} fechar={vi.fn()} verPessoa={vi.fn()} retorno={retorno} />)).not.toThrow();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Painel de um negócio de exemplo perdido", () => {
  it("mostra o motivo e não tem percurso, próximo passo nem ações", () => {
    const S = seed();
    const n = negociosDe(S, "Marta Lima").find((x) => x.titulo === "Pavimento exterior")!;
    expect(n.perdido).toBe("preço");
    render(<NegocioExemploPainel S={S} n={n} fechar={vi.fn()} verPessoa={vi.fn()} retorno={createRef<HTMLElement>()} />);
    const painel = screen.getByRole("dialog");
    expect(within(painel).getByText("Motivo").nextSibling).toHaveTextContent("preço");
    expect(within(painel).getByText("Estado").nextSibling).toHaveTextContent("Perdido");
    expect(within(painel).queryByRole("list", { name: "Percurso do negócio" })).toBeNull();
    expect(within(painel).queryByText("Próximo passo")).toBeNull();
    expect(within(painel).getByText("Pavimento em pedra")).toBeInTheDocument();
  });
});
