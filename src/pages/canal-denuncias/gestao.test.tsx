// Arranque da gestão de denúncias da organização ativa: a lista mostra as 12 (anónimas e identificadas), abrir uma
// anónima não mostra identidade, confirmar a receção muda o estado e o prazo e «Ver identidade» regista no histórico.
// O menu, o isolamento por organização e «A minha área» estão em src/pages/rh-exemplo/denuncias.test.tsx. Tudo em memória.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { lerDenuncias, repor } from "@/components/canal-denuncias/dados/loja";
import { denunciasDeExemplo } from "@/components/canal-denuncias/dados/exemplo";
import { ORG_ATIVA } from "@/components/canal-denuncias/dados/organizacoes";
import { PaginaGestao } from "@/components/canal-denuncias/gestao/PaginaGestao";

const mostrar = () =>
  render(
    <LanguageProvider>
      <MemoryRouter>
        <PaginaGestao organizacaoId={ORG_ATIVA.id} organizacaoNome={ORG_ATIVA.nome} />
      </MemoryRouter>
    </LanguageProvider>,
  );

const clicar = (nome: RegExp | string) => fireEvent.click(screen.getByRole("button", { name: nome }));
const aba = (nome: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(nome) }));
const abrir = (codigo: string) => clicar(`Abrir denúncia ${codigo}`);
const painel = () => screen.getByRole("dialog");
const linhas = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  repor();
});

describe("lista da gestão", () => {
  it("mostra as 12 denúncias, o aviso de acesso e os totais", () => {
    mostrar();
    expect(screen.getByRole("heading", { level: 1, name: "Gestão de denúncias" })).toBeInTheDocument();
    expect(screen.getByText("Só o responsável do canal vê esta página.")).toBeInTheDocument();
    expect(linhas()).toHaveLength(12);
    for (const [rotulo, n] of [["Novas por confirmar", "2"], ["Em análise", "7"], ["A vencer prazo", "3"], ["Concluídas", "2"]]) {
      expect(within(screen.getByLabelText("Totais")).getByText(rotulo).previousElementSibling).toHaveTextContent(new RegExp(`^${n}$`));
    }
  });

  it("cada linha tem código, tipo, resumo, origem em texto, estado, prazo e responsável", () => {
    mostrar();
    const cabecalho = within(screen.getByRole("table")).getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabecalho).toEqual(["Código", "Tipo", "Resumo", "Origem", "Estado", "Prazo", "Responsável"]);
    const nova = linhas().find((l) => within(l).queryByText("DEN-2026-0041"))!;
    expect(within(nova).getByText("Segurança e saúde no trabalho")).toBeInTheDocument();
    expect(within(nova).getByText("Identificada")).toBeInTheDocument();
    expect(within(nova).getByText("Recebida")).toBeInTheDocument();
    expect(within(nova).getByText("Confirmar até 18/10")).toBeInTheDocument();
    expect(within(nova).getByText("Sem responsável")).toBeInTheDocument();
    const emAnalise = linhas().find((l) => within(l).queryByText("DEN-2026-0039"))!;
    expect(within(emAnalise).getByText("Anónima")).toBeInTheDocument();
    expect(within(emAnalise).getByText("Responder até 21/12")).toBeInTheDocument();
    expect(within(emAnalise).getByText("Rui Barbosa")).toBeInTheDocument();
  });

  it("o atrasado diz-se em texto («Atrasado») e a lista começa pelo mais urgente", () => {
    mostrar();
    const primeira = linhas()[0];
    expect(within(primeira).getByText("DEN-2026-0034")).toBeInTheDocument();
    expect(within(primeira).getByText(/Responder até 08\/09 · Atrasado/)).toBeInTheDocument();
    expect(screen.getAllByText(/Atrasado/)).toHaveLength(1);
  });

  it("filtra por origem, estado, prazo e pesquisa, e limpa os filtros", () => {
    mostrar();
    aba("Anónimas");
    expect(linhas()).toHaveLength(5);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "recebida" } });
    expect(linhas()).toHaveLength(1);
    clicar("Limpar filtros");
    expect(linhas()).toHaveLength(12);
    fireEvent.click(screen.getByRole("checkbox", { name: "Prazo a vencer ou atrasado" }));
    expect(linhas()).toHaveLength(3);
    clicar("Limpar filtros");
    fireEvent.change(screen.getByLabelText("Pesquisar por código ou texto", { selector: "input" }), { target: { value: "extintores" } });
    expect(linhas()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Pesquisar por código ou texto", { selector: "input" }), { target: { value: "zzzz" } });
    expect(screen.getByText("Nenhuma denúncia corresponde a estes filtros.")).toBeInTheDocument();
  });

  it("filtra por responsável e por «sem responsável»", () => {
    mostrar();
    fireEvent.change(screen.getByLabelText("Responsável", { selector: "select" }), { target: { value: "sem" } });
    expect(linhas()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Responsável", { selector: "select" }), { target: { value: "r1" } });
    expect(linhas().every((l) => within(l).queryByText("Helena Matos"))).toBe(true);
  });
});

describe("painel de uma denúncia", () => {
  it("abrir uma anónima não mostra identidade em lado nenhum", () => {
    mostrar();
    abrir("DEN-2026-0039");
    const p = painel();
    expect(within(p).getByText("Identidade desconhecida")).toBeInTheDocument();
    expect(within(p).queryByRole("button", { name: "Ver identidade" })).not.toBeInTheDocument();
    const nomes = denunciasDeExemplo().flatMap((d) => (d.identidade ? [d.identidade.nome, d.identidade.email] : []));
    expect(nomes.length).toBeGreaterThan(3);
    for (const nome of nomes) expect(p).not.toHaveTextContent(nome);
    for (const separador of ["conversa", "notas", "decisao", "historico"]) {
      aba(separador === "decisao" ? "Decisão" : separador === "historico" ? "Histórico" : separador === "notas" ? "Notas" : "Conversa");
      for (const nome of nomes) expect(painel()).not.toHaveTextContent(nome);
    }
  });

  it("tem as cinco abas e a conversa mostra as mensagens do denunciante anónimo sem nome", () => {
    mostrar();
    abrir("DEN-2026-0039");
    const abas = within(painel()).getAllByRole("tab").map((t) => t.textContent ?? "");
    expect(abas).toHaveLength(5);
    ["Resumo", "Conversa", "Notas internas", "Decisão", "Histórico"].forEach((nome, i) => expect(abas[i]).toContain(nome));
    aba("Conversa");
    const conversa = within(painel()).getByRole("list", { name: "Mensagens" });
    expect(within(conversa).getAllByRole("listitem")).toHaveLength(3);
    expect(within(conversa).getByText(/Duas em Março/)).toBeInTheDocument();
    expect(within(conversa).getAllByText("Denunciante").length).toBeGreaterThan(0);
  });

  it("confirmar a receção muda o estado e o prazo, na lista e no painel", () => {
    mostrar();
    expect(screen.getByText("Confirmar até 18/10")).toBeInTheDocument();
    abrir("DEN-2026-0041");
    clicar("Confirmar receção");
    expect(within(painel()).getByText("Em análise")).toBeInTheDocument();
    expect(within(painel()).queryByRole("button", { name: "Confirmar receção" })).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmar até 18/10")).not.toBeInTheDocument();
    expect(screen.getByText("Responder até 11/01")).toBeInTheDocument();
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0041")).toMatchObject({ estado: "em_analise", confirmadaEm: "2026-10-15" });
    aba("Histórico");
    expect(within(painel()).getByText("Receção confirmada")).toBeInTheDocument();
  });

  it("«Ver identidade» mostra a identificada e regista quem viu e quando no histórico", () => {
    mostrar();
    abrir("DEN-2026-0037");
    const p = painel();
    expect(within(p).getByText("Identidade protegida")).toBeInTheDocument();
    expect(p).not.toHaveTextContent("Inês Cardoso");
    clicar("Ver identidade");
    expect(painel()).toHaveTextContent("Inês Cardoso");
    expect(painel()).toHaveTextContent("ines.cardoso@exemplo.pt");
    expect(within(painel()).getByText("Esta consulta ficou registada no histórico.")).toBeInTheDocument();
    aba("Histórico");
    const eventos = within(painel()).getByRole("list", { name: "Histórico da denúncia" });
    const visto = within(eventos).getByText("Identidade vista").closest("li")!;
    expect(visto).toHaveTextContent("Helena Matos");
    expect(visto).toHaveTextContent("15/10/2026");
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0037")!.historico.filter((e) => e.acao === "identidade_vista")).toHaveLength(1);
  });

  it("atribuir responsável: quem é visado pela denúncia fica bloqueado com aviso", () => {
    mostrar();
    abrir("DEN-2026-0037");
    const escolha = screen.getByLabelText("Escolher responsável");
    expect(within(escolha).getByRole("option", { name: "Carla Nunes (visado pela denúncia)" })).toBeInTheDocument();
    fireEvent.change(escolha, { target: { value: "r3" } });
    clicar("Atribuir responsável");
    expect(within(painel()).getByRole("alert")).toHaveTextContent("Carla Nunes é visado pela denúncia e não pode ficar com o caso.");
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0037")?.responsavelId).toBe("r1");
    fireEvent.change(screen.getByLabelText("Escolher responsável"), { target: { value: "r2" } });
    clicar("Atribuir responsável");
    expect(within(painel()).queryByRole("alert")).not.toBeInTheDocument();
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0037")?.responsavelId).toBe("r2");
  });

  it("declarar um conflito de interesses passa a bloquear essa pessoa", () => {
    mostrar();
    abrir("DEN-2026-0041");
    fireEvent.change(screen.getByLabelText("Pessoa em conflito"), { target: { value: "r4" } });
    clicar("Declarar conflito");
    expect(within(painel()).getByText(/Impedidos: Paulo Seixas \(conflito de interesses\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Escolher responsável"), { target: { value: "r4" } });
    clicar("Atribuir responsável");
    expect(within(painel()).getByRole("alert")).toHaveTextContent("tem conflito de interesses");
  });

  it("alterar a gravidade fica no histórico", () => {
    mostrar();
    abrir("DEN-2026-0041");
    fireEvent.change(screen.getByLabelText("Gravidade"), { target: { value: "baixa" } });
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0041")?.gravidade).toBe("baixa");
    expect(within(painel()).getAllByText("Gravidade baixa").length).toBeGreaterThan(0);
  });

  it("conversa: enviar mensagem e pedir informação (só depois de confirmar a receção)", () => {
    mostrar();
    abrir("DEN-2026-0041");
    aba("Conversa");
    expect(screen.getByRole("button", { name: "Pedir mais informação" })).toBeDisabled();
    clicar("Confirmar receção");
    fireEvent.change(screen.getByLabelText("Escrever mensagem"), { target: { value: "Podes dizer-nos desde quando?" } });
    clicar("Pedir mais informação");
    expect(within(painel()).getByText("Podes dizer-nos desde quando?")).toBeInTheDocument();
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0041")?.estado).toBe("mais_info");
    expect(within(painel()).getByText("Pedimos mais informação")).toBeInTheDocument();
    clicar("Enviar mensagem");
    expect(within(painel()).getByText("Escreve alguma coisa primeiro.")).toBeInTheDocument();
  });

  it("notas internas: só aparecem aqui e adicionam-se", () => {
    mostrar();
    abrir("DEN-2026-0039");
    aba("Notas");
    expect(within(painel()).getByText(/Cruzar com o registo de presentes/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nova nota"), { target: { value: "Pedir os contratos de 2026." } });
    clicar("Adicionar nota");
    expect(within(painel()).getByText("Pedir os contratos de 2026.")).toBeInTheDocument();
  });

  it("concluir exige resultado e fundamentação e depois mostra a decisão; reabrir volta a pôr em análise", () => {
    mostrar();
    abrir("DEN-2026-0039");
    aba("Decisão");
    clicar("Concluir denúncia");
    expect(within(painel()).getByText("Escolhe o resultado.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Resultado/), { target: { value: "parcialmente_procedente" } });
    fireEvent.change(screen.getByLabelText(/^Fundamentação/), { target: { value: "Há provas de dois dos três casos." } });
    clicar("Concluir denúncia");
    expect(within(painel()).getByText("Parcialmente procedente")).toBeInTheDocument();
    expect(within(painel()).getByText("Há provas de dois dos três casos.")).toBeInTheDocument();
    expect(within(painel()).getByText("Concluída")).toBeInTheDocument();
    clicar("Reabrir");
    expect(within(painel()).getByText("Em análise")).toBeInTheDocument();
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0039")).toMatchObject({ estado: "em_analise", decisao: null });
  });

  it("arquivar exige um motivo de pelo menos 3 caracteres", () => {
    mostrar();
    abrir("DEN-2026-0039");
    aba("Decisão");
    fireEvent.change(screen.getByLabelText("Motivo do arquivamento"), { target: { value: "ab" } });
    clicar("Arquivar denúncia");
    expect(within(painel()).getByText("O motivo tem de ter pelo menos 3 caracteres.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo do arquivamento"), { target: { value: "Duplicada" } });
    clicar("Arquivar denúncia");
    expect(within(painel()).getByText("Arquivada")).toBeInTheDocument();
    expect(within(painel()).getByText("Duplicada")).toBeInTheDocument();
  });

  it("uma nova não se conclui antes de confirmar a receção", () => {
    mostrar();
    abrir("DEN-2026-0040");
    aba("Decisão");
    expect(screen.getByRole("button", { name: "Concluir denúncia" })).toBeDisabled();
    expect(within(painel()).getByText(/Confirma a receção e põe a denúncia em análise/)).toBeInTheDocument();
  });
});
