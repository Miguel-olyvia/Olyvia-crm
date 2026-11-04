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
  p("leads.view", "Ver leads"), p("leads.create", "Criar leads"), p("leads.assign", "Atribuir leads"), p("leads.edit", "Editar leads"),
  p("clients.view", "Ver clientes"),
  p("negocios.contacto.registar", "Registar contacto", { categoria: "pessoas" }),
  p("negocios.orcamento.editar", "Editar o orçamento do negócio", { categoria: "pessoas" }),
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
const caixa = (nome: string) => screen.getByRole("checkbox", { name: nome });
const botao = (nome: string) => screen.getByRole("button", { name: nome });
const concedidas = () => screen.getByTestId("concedidas").textContent;
const secao = (titulo: string) => document.querySelector(`tbody[data-secao="${titulo}"]`) as HTMLElement;

beforeEach(() => localStorage.setItem("language", "pt"));
afterEach(cleanup);

describe("GrelhaRecursoAcao (editor de papéis, v2)", () => {
  it("uma tabela por grupo, colunas fixas e Outras, '–' só onde falta uma CRUD; sem caixas de marcar linha/coluna", () => {
    render(<Editor />);
    abrir("Inventário");
    const tabelas = screen.getAllByRole("table");
    expect(tabelas).toHaveLength(1);
    const cabecalhos = within(tabelas[0]).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(cabecalhos).toEqual(["Recurso", "Ver", "Criar", "Editar", "Eliminar", "Outras"]);
    const linhas = within(tabelas[0]).getAllByRole("rowheader").map((h) => h.textContent);
    expect(linhas).toEqual(["Fornecedores", "Armazéns"]);
    const armazens = within(tabelas[0]).getAllByRole("row").find((r) => r.textContent?.startsWith("Armazéns")) as HTMLElement;
    expect(within(armazens).getAllByText("Não se aplica")).toHaveLength(3);
    expect(caixa("Fornecedores: Ver")).toBeInTheDocument();
    // Só caixas de permissões: nenhuma de linha ou coluna.
    expect(within(tabelas[0]).getAllByRole("checkbox")).toHaveLength(5);
    expect(botao("Fornecedores: Exportar")).toHaveAttribute("aria-pressed", "false");
  });

  it("Negócios: o recurso inteiro numa linha (leads.view/create/assign com o resto de Leads) e as fases como chips", () => {
    render(<Editor />);
    abrir("Negócios");
    expect(screen.getAllByRole("table")).toHaveLength(1);
    const pessoas = secao("Pessoas");
    expect(within(pessoas).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Leads", "Clientes"]);
    expect(within(pessoas).getByRole("checkbox", { name: "Leads: Ver" })).toBeInTheDocument();
    expect(within(pessoas).getByRole("checkbox", { name: "Leads: Criar" })).toBeInTheDocument();
    expect(within(pessoas).getByRole("button", { name: "Leads: Atribuir" })).toBeInTheDocument();

    const fases = secao("Fases do negócio");
    expect(within(fases).queryAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Fases do negócio"]);
    expect(within(fases).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(fases).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Contacto", "Negócio"]);
    expect(within(fases).getByRole("button", { name: "Contacto: Registar contacto" })).toBeInTheDocument();
    expect(within(fases).getByRole("button", { name: "Negócio: Editar orçamento" })).toBeInTheDocument();
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

  it("chips de Outras: botão liga/desliga com aria-pressed e rótulo encurtado", () => {
    render(<Editor inicial={["suppliers.view"]} />);
    abrir("Inventário");
    const chip = botao("Fornecedores: Exportar");
    expect(chip).toHaveTextContent("Exportar");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(concedidas()).toBe("suppliers.export,suppliers.view");
  });

  it("'Tudo' da linha (com perigosa: pede confirmação) passa a 'Nenhum' e desmarca", () => {
    render(<Editor />);
    abrir("Inventário");
    fireEvent.click(botao("Marcar todas as permissões de Fornecedores"));
    fireEvent.click(botao("Conceder"));
    expect(concedidas()).toBe("suppliers.create,suppliers.delete,suppliers.edit,suppliers.export,suppliers.view");
    const nenhum = botao("Desmarcar todas as permissões de Fornecedores");
    expect(nenhum).toHaveTextContent("Nenhum");
    fireEvent.click(nenhum);
    expect(concedidas()).toBe("");
  });

  it("'Tudo' da secção e 'Tudo'/'Limpar' do grupo", () => {
    render(<Editor />);
    abrir("Negócios");
    fireEvent.click(botao("Marcar todas as permissões de Fases do negócio"));
    expect(concedidas()).toBe("negocios.contacto.registar,negocios.orcamento.editar");
    fireEvent.click(botao("Marcar todas as permissões de Negócios"));
    expect(concedidas()).toBe("clients.view,leads.assign,leads.create,leads.edit,leads.view,negocios.contacto.registar,negocios.orcamento.editar");
    fireEvent.click(botao("Limpar todas as permissões de Negócios"));
    expect(concedidas()).toBe("");
  });

  it(".own vai para Outras como chip; Ver é o 'ver tudo'", () => {
    render(<Editor />);
    abrir("Recursos Humanos");
    expect(caixa("Ficha: Ver")).toBeInTheDocument();
    expect(botao("Ficha: Ver a própria ficha")).toBeInTheDocument();
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
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Fornecedores"]);
    expect(screen.getAllByText("Não se aplica")).toHaveLength(3);
    expect(screen.queryByRole("checkbox", { name: "Fornecedores: Criar" })).not.toBeInTheDocument();
  });

  it("role de sistema: tudo desligado, sem 'Tudo'", () => {
    render(<Editor somenteLeitura inicial={["suppliers.view"]} />);
    abrir("Inventário");
    expect(caixa("Fornecedores: Ver")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Marcar todas/ })).not.toBeInTheDocument();
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
    const t = screen.getByRole("table");
    expect(within(t).getByText("Fornecedores: Ver: Tem")).toBeInTheDocument();
    expect(within(t).getByText("Fornecedores: Criar: Não tem")).toBeInTheDocument();
    expect(within(t).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
