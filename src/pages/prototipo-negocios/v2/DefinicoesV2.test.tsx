// As Definições da V2 no ecrã: uma página com pesquisa, secções com âncoras, "?" de ajuda, arranque e Lixo.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "../motor";
import { DefinicoesV2 } from "./DefinicoesV2";
import { esquecerDefinicoes, lerDefinicoes } from "./definicoesDados";
import { INDICE, SECOES } from "./definicoesIndice";

afterEach(cleanup);
beforeEach(() => esquecerDefinicoes());

function pagina(S: Estado = seed(), repor = vi.fn()) {
  const run = (fn: () => void) => fn();
  return render(<DefinicoesV2 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={repor} />);
}

describe("DefinicoesV2", () => {
  it("é uma só página: todas as secções e âncoras do índice existem, sem separadores nem diálogos", () => {
    const { container } = pagina();
    expect(screen.getByRole("heading", { level: 1, name: "Definições" })).toBeInTheDocument();
    for (const s of SECOES.filter((x) => !x.soDirecao)) expect(container.querySelector(`#${s.id}`)).not.toBeNull();
    for (const e of INDICE.filter((x) => !x.soDirecao)) expect(container.querySelector(`#${e.ancora}`), e.ancora).not.toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("um só botão primário (Aplicar do arranque)", () => {
    const { container } = pagina();
    const primarios = [...container.querySelectorAll("button")].filter((b) => /(^|\s)bg-primary(\s|$)/.test(b.className) && !b.hasAttribute("aria-pressed") && b.getAttribute("role") !== "switch");
    expect(primarios).toHaveLength(1);
    expect(primarios[0]).toHaveTextContent("Aplicar o modelo");
  });

  it("'/' vai para a pesquisa, que mostra os resultados do índice", () => {
    pagina();
    const caixa = screen.getByRole("searchbox", { name: "Procurar nas Definições" });
    fireEvent.keyDown(window, { key: "/" });
    expect(caixa).toHaveFocus();
    fireEvent.change(caixa, { target: { value: "smtp" } });
    const res = screen.getByRole("list", { name: "Resultados" });
    expect(within(res).getByRole("link", { name: /Servidor de email/ })).toHaveAttribute("href", "#email-smtp");
    fireEvent.change(caixa, { target: { value: "xyzzy" } });
    expect(screen.getByText("Nada com esse nome nas Definições.")).toBeInTheDocument();
  });

  it("o '?' abre a ajuda na própria página", () => {
    pagina();
    const b = screen.getByRole("button", { name: "Ajuda: Dados" });
    expect(b).toHaveAttribute("aria-expanded", "false");
    const texto = document.getElementById(b.getAttribute("aria-controls")!)!;
    expect(texto).not.toBeVisible();
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-expanded", "true");
    expect(texto).toBeVisible();
    expect(texto).toHaveTextContent("30 dias no Lixo");
  });

  it("o arranque: escolhe-se com chips, mostra o que vai aplicar e aplica o modelo", () => {
    const S = seed();
    pagina(S);
    const aplicar = screen.getByRole("button", { name: "Aplicar o modelo" });
    expect(aplicar).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Limpeza" }));
    fireEvent.click(screen.getByRole("button", { name: "Pós-obra" }));
    fireEvent.click(screen.getByRole("button", { name: "2 a 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Por mês" }));
    fireEvent.click(screen.getByRole("button", { name: "Uma empresa" }));
    const resumo = screen.getByRole("region", { name: "O que vai ser aplicado" });
    expect(resumo).toHaveTextContent("Cliente · Espaço · Serviço");
    expect(resumo).toHaveTextContent("mínima 20% · alvo 28%");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar o modelo Limpeza" }));
    expect(S.setor).toBe("limpeza");
    expect(S.cfg.min).toBe(20);
    expect(lerDefinicoes().termos.local).toBe("Espaço");
    expect(lerDefinicoes().margensLinha).toEqual([{ linha: "Pós-obra", min: 20, alvo: 28 }]);
  });

  it("o Lixo filtra por tipo com chips e restaura", () => {
    pagina();
    const lixo = document.getElementById("dados-lixo")!;
    fireEvent.click(within(lixo).getByRole("button", { name: /^Pessoa/ }));
    const lista = within(lixo).getByRole("list", { name: "No Lixo" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(within(lista).getByRole("button", { name: "Restaurar Marta Silva (repetida)" }));
    expect(lerDefinicoes().lixo.some((x) => x.tipo === "Pessoa")).toBe(false);
    expect(within(lixo).getByText("Não há nada deste tipo no Lixo.")).toBeInTheDocument();
  });

  it("as falhas de envio reenviam-se e os perfis dizem o que podem", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Reenviar Confirmação da visita/ }));
    expect(lerDefinicoes().falhas).toHaveLength(1);
    const perfis = document.getElementById("equipa-perfis")!.nextElementSibling as HTMLElement;
    for (const p of ["Comercial", "Direção", "Financeiro", "Armazém", "Operações"]) expect(within(perfis).getByText(p)).toBeInTheDocument();
  });

  it("as margens mudam no motor e o nome da fase aparece nos campos", () => {
    const S = seed();
    pagina(S);
    fireEvent.click(screen.getByRole("button", { name: "Mais · Margem mínima · toda a empresa" }));
    expect(S.cfg.min).toBe(29);
    const nome = screen.getByRole("textbox", { name: "Nome da fase 3 (Visita)" });
    fireEvent.change(nome, { target: { value: "Levantamento" } });
    fireEvent.blur(nome);
    expect(lerDefinicoes().nomesFases[2]).toBe("Levantamento");
    expect(screen.getByRole("radio", { name: "Levantamento" })).toBeChecked();
  });

  it("Repor a demonstração chama a reposição de sempre e volta estas Definições ao início", () => {
    const repor = vi.fn();
    pagina(seed(), repor);
    fireEvent.click(screen.getByRole("button", { name: /Restaurar Cozinha/ }));
    fireEvent.click(screen.getByRole("button", { name: "Repor a demonstração" }));
    expect(repor).toHaveBeenCalledTimes(1);
    expect(lerDefinicoes().lixo).toHaveLength(6);
  });
});
