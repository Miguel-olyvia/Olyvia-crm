import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { MatrizEditavel } from "./MatrizEditavel";
import { MatrizPermissoes } from "./MatrizPermissoes";
import { permissoesVisiveis } from "./logica";
import type { Permissao } from "./tipos";

const p = (codigo: string, nome: string, extra: Partial<Permissao> = {}): Permissao =>
  ({ codigo, nome, categoria: codigo.split(".")[0] ?? "", perigosa: false, comAmbito: false, ...extra });

const CATALOGO: Permissao[] = [
  p("suppliers.view", "Ver fornecedores"), p("suppliers.create", "Criar fornecedores"), p("suppliers.edit", "Editar fornecedores"),
  p("suppliers.delete", "Eliminar fornecedores", { perigosa: true, descricao: "Apaga o fornecedor e o histórico." }),
  p("suppliers.export", "Exportar fornecedores"),
  p("warehouses.view", "Ver armazéns"),
  p("hr.pessoas.view", "Ver fichas", { categoria: "hr" }), p("hr.pessoas.view.own", "Ver a própria ficha", { categoria: "hr" }),
];

function Editor({ visiveis = CATALOGO, inicial = [] as string[], somenteLeitura = false }) {
  const [concedidas, setConcedidas] = useState(inicial);
  return (
    <LanguageProvider>
      <MatrizEditavel visiveis={visiveis} concedidas={concedidas} aoMudar={setConcedidas} somenteLeitura={somenteLeitura} />
      <output data-testid="concedidas">{[...concedidas].sort().join(",")}</output>
    </LanguageProvider>
  );
}

const abrir = (grupo: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${grupo}`) }));
const tabela = (nome: RegExp) => screen.getByRole("table", { name: nome });
const caixa = (nome: string) => screen.getByRole("checkbox", { name: nome });
const concedidas = () => screen.getByTestId("concedidas").textContent;

beforeEach(() => localStorage.setItem("language", "pt"));
afterEach(cleanup);

describe("GrelhaRecursoAcao (editor de papéis)", () => {
  it("tabela recurso × ação: colunas fixas, Outras e '–' onde não há permissão", () => {
    render(<Editor />);
    abrir("Inventário");
    const t = tabela(/Inventário/);
    const cabecalhos = within(t).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(cabecalhos).toEqual(["Recurso", "Ver", "Criar", "Editar", "Eliminar", "Outras"]);
    const linhas = within(t).getAllByRole("row").slice(1);
    expect(linhas.map((l) => within(l).getByRole("rowheader").textContent)).toEqual(["Fornecedores", "Armazéns"]);
    const armazens = linhas[1];
    expect(within(armazens).getAllByText("Não se aplica")).toHaveLength(3);
    expect(within(armazens).getByRole("checkbox", { name: "Armazéns: Ver" })).toBeInTheDocument();
    expect(within(linhas[0]).getByRole("button", { name: "Fornecedores: Exportar" })).toHaveAttribute("aria-pressed", "false");
  });

  it("dependência de Ver: bloqueada até Ver estar marcado; tirar Ver tira as dependentes, com aviso", () => {
    render(<Editor />);
    abrir("Inventário");
    fireEvent.click(caixa("Fornecedores: Criar"));
    expect(concedidas()).toBe("");
    expect(caixa("Fornecedores: Criar")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("aviso-matriz")).toHaveTextContent("Precisa primeiro da permissão Ver");

    fireEvent.click(caixa("Fornecedores: Ver"));
    fireEvent.click(caixa("Fornecedores: Criar"));
    expect(caixa("Fornecedores: Criar")).toHaveAttribute("aria-checked", "true");
    expect(concedidas()).toBe("suppliers.create,suppliers.view");

    fireEvent.click(caixa("Fornecedores: Ver"));
    expect(concedidas()).toBe("");
    expect(screen.getByTestId("aviso-matriz")).toHaveTextContent("Também retiradas, porque precisam de Ver: Criar fornecedores");
  });

  it("chips de Outras: botão liga/desliga com aria-pressed", () => {
    render(<Editor inicial={["suppliers.view"]} />);
    abrir("Inventário");
    const chip = screen.getByRole("button", { name: "Fornecedores: Exportar" });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(concedidas()).toBe("suppliers.export,suppliers.view");
  });

  it("marcar linha (com perigosa: pede confirmação) e estado indeterminado da coluna", () => {
    render(<Editor />);
    abrir("Inventário");
    fireEvent.click(caixa("Todas as permissões de Fornecedores"));
    // suppliers.delete é perigosa: confirmação antes de conceder.
    fireEvent.click(screen.getByRole("button", { name: "Conceder" }));
    expect(concedidas()).toBe("suppliers.create,suppliers.delete,suppliers.edit,suppliers.export,suppliers.view");
    expect(caixa("Todas as permissões de Fornecedores")).toHaveAttribute("aria-checked", "true");
    expect(caixa("Coluna Ver em Inventário")).toHaveAttribute("aria-checked", "mixed");
    expect(caixa("Coluna Criar em Inventário")).toHaveAttribute("aria-checked", "true");

    fireEvent.click(caixa("Fornecedores: Editar"));
    expect(caixa("Todas as permissões de Fornecedores")).toHaveAttribute("aria-checked", "mixed");
    fireEvent.click(caixa("Todas as permissões de Fornecedores"));
    expect(concedidas()).toBe("suppliers.create,suppliers.delete,suppliers.edit,suppliers.export,suppliers.view");
  });

  it("marcar coluna: Ver marca as duas linhas; Criar sem Ver fica por marcar, com aviso; desmarcar Ver limpa as dependentes", () => {
    render(<Editor />);
    abrir("Inventário");
    fireEvent.click(caixa("Coluna Criar em Inventário"));
    expect(concedidas()).toBe("");
    expect(screen.getByTestId("aviso-matriz")).toHaveTextContent("Ficaram por marcar, porque precisam primeiro de Ver: Criar fornecedores");

    fireEvent.click(caixa("Coluna Ver em Inventário"));
    expect(concedidas()).toBe("suppliers.view,warehouses.view");
    fireEvent.click(caixa("Coluna Criar em Inventário"));
    expect(concedidas()).toBe("suppliers.create,suppliers.view,warehouses.view");
    fireEvent.click(caixa("Coluna Ver em Inventário"));
    expect(concedidas()).toBe("");
  });

  it(".own vai para Outras como 'Ver (só as suas)'; Ver é o 'ver tudo'", () => {
    render(<Editor />);
    abrir("Recursos Humanos");
    expect(caixa("Pessoas: ficha: Ver")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pessoas: ficha: Ver (só as suas)" })).toBeInTheDocument();
  });

  it("perigosas assinaladas e descrição acessível com nome, descrição e aviso", () => {
    render(<Editor inicial={["suppliers.view"]} />);
    abrir("Inventário");
    const eliminar = caixa("Fornecedores: Eliminar");
    const descricao = document.getElementById(eliminar.getAttribute("aria-describedby") ?? "");
    expect(descricao).toHaveTextContent("Eliminar fornecedores");
    expect(descricao).toHaveTextContent("Apaga o fornecedor e o histórico.");
    expect(descricao).toHaveTextContent("Perigosa");
  });

  it("quem não é administrador só vê as permissões que tem", () => {
    const visiveis = permissoesVisiveis(CATALOGO, { administradorSistema: false, codigos: ["suppliers.view", "suppliers.export"] });
    render(<Editor visiveis={visiveis} />);
    expect(screen.queryByRole("button", { name: /^Recursos Humanos/ })).not.toBeInTheDocument();
    abrir("Inventário");
    const linhas = within(tabela(/Inventário/)).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(1);
    expect(within(linhas[0]).getAllByText("Não se aplica")).toHaveLength(3);
    expect(screen.queryByRole("checkbox", { name: "Fornecedores: Criar" })).not.toBeInTheDocument();
  });

  it("role de sistema: tudo desligado, sem marcar linha/coluna", () => {
    render(<Editor somenteLeitura inicial={["suppliers.view"]} />);
    abrir("Inventário");
    expect(caixa("Fornecedores: Ver")).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: /Todas as permissões/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /^Coluna/ })).not.toBeInTheDocument();
  });

  it("ficha da role (só leitura): a mesma grelha com Tem/Não tem", () => {
    render(
      <LanguageProvider>
        <MatrizPermissoes
          role={{ id: "r", codigo: "x", nome: "X", descricao: "", sistema: false, podeAssinar: false, permissoes: ["suppliers.view"] }}
          visiveis={CATALOGO}
        />
      </LanguageProvider>,
    );
    abrir("Inventário");
    const t = tabela(/Inventário/);
    expect(within(t).getByText("Fornecedores: Ver: Tem")).toBeInTheDocument();
    expect(within(t).getByText("Fornecedores: Criar: Não tem")).toBeInTheDocument();
    expect(within(t).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
