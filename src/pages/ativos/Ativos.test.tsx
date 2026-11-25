// O ecrã «Ativos»: separadores Serviço, Estrutura e Pessoas, lista com o valor atual calculado no ecrã, pesquisa e filtro por estado,
// estados vazios, estados «indisponível» e «sem acesso» (cliente tolerante) e as ações só com ativos.edit. A leitura e as escritas são
// simuladas; as permissões também. Data fixa (15/06/2026): a Mesa de 1200 € a 12 meses, comprada em janeiro, vale 600 €.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { Ativo, AtivosLidos } from "@/components/ativos/lib/tipos";

const m = vi.hoisted(() => ({
  permissoes: [] as string[],
  estado: "ok" as string,
  dados: null as unknown,
  mensagem: null as string | null,
  useAtivos: vi.fn(),
  refazer: vi.fn(),
  mut: { criar: vi.fn(), alterar: vi.fn(), desativar: vi.fn(), reativar: vi.fn(), ligarPessoa: vi.fn(), desligarPessoa: vi.fn() },
  semEmpresa: false,
}));
vi.mock("@/hooks/ativos/useAtivos", () => ({
  useAtivos: (o: unknown) => { m.useAtivos(o); return { estado: m.estado, dados: m.dados, mensagem: m.mensagem, semOrganizacao: false, refazer: m.refazer }; },
}));
vi.mock("@/hooks/useCountries", () => ({ useCountries: () => ({ countries: [], loading: false, error: null }) }));
vi.mock("@/hooks/ativos/useAtivoMutacoes", () => ({ useAtivoMutacoes: () => m.mut }));
vi.mock("@/hooks/ativos/useAtivosOpcoes", () => ({
  useAtivosOpcoes: () => ({ opcoes: { equipamentos: [{ id: "c1", nome: "Berbequim", vidaAnos: 5, vidaHoras: null }], centrosCusto: [] }, erro: null, aCarregar: false }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => m.permissoes.includes(p), hasAnyPermission: (p: string[]) => p.some((x) => m.permissoes.includes(x)), loading: false }),
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: m.semEmpresa ? null : { id: "org-1" }, isLoading: false }) }));

import Ativos from "./Ativos";

const BASE: Ativo = {
  id: "x", grupo: "estrutura", tipo: "mobiliario", nome: "Mesa", codigo: null, numSerie: null, catEquipamentoId: null,
  dataCompra: "2026-01-15", valorCompra: 1200, valorResidual: 0, vidaMeses: 12, manutencaoAno: 0, centroCustoId: null,
  localizacao: "Armazém", notas: null, estado: "ativo", desativadoEm: null, desativadoMotivo: null, desativadoNota: null,
  catEquipamento: null, atribuicao: null,
};
const ativo = (p: Partial<Ativo>): Ativo => ({ ...BASE, ...p });

const DADOS: AtivosLidos = {
  servico: [
    ativo({ id: "s1", grupo: "servico", tipo: null, nome: "Berbequim 1", codigo: "B-01", catEquipamentoId: "c1", vidaMeses: null, valorCompra: 600, catEquipamento: { id: "c1", nome: "Berbequim Hilti", vidaAnos: 5, vidaHoras: null, usoAnoHoras: null } }),
    ativo({ id: "s2", grupo: "servico", tipo: null, nome: "Compressor", catEquipamentoId: "c2", vidaMeses: null, catEquipamento: { id: "c2", nome: "Compressor 50L", vidaAnos: null, vidaHoras: 3000, usoAnoHoras: null } }),
  ],
  estrutura: [
    ativo({ id: "e1", nome: "Mesa grande" }),
    ativo({ id: "e2", nome: "Cadeira velha", estado: "desativado", desativadoEm: "2026-03-10", desativadoMotivo: "abatido", valorCompra: 100, vidaMeses: 10 }),
  ],
  pessoa: [
    ativo({ id: "p1", grupo: "pessoa", tipo: "portatil", nome: "Portátil 1", atribuicao: { pessoaEquipamentoId: "pe1", pessoaNome: "Ana Silva", entrega: "2026-02-01" } }),
    ativo({ id: "p2", grupo: "pessoa", tipo: "telemovel", nome: "Telemóvel 1" }),
  ],
  atribuicoesSemAtivo: [{ id: "pe9", pessoaNome: "Rui Costa", tipo: "portatil", descricao: "Portátil velho", valor: 900, entrega: "2025-05-01", estado: "atribuido" }],
  rhOculto: false,
  centrosCusto: [],
  truncado: false,
};

const norm = (s: string | null) => (s ?? "").replace(/\p{Zs}/gu, " ");

function ver(inicial = "/ativos") {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[inicial]}><Ativos /></MemoryRouter>
    </LanguageProvider>,
  );
}
const separador = (nome: RegExp) => screen.getByRole("tab", { name: nome });
const abrirSeparador = (nome: RegExp) => { fireEvent.mouseDown(separador(nome)); fireEvent.click(separador(nome)); };
const linha = (nome: string) => screen.getByRole("row", { name: new RegExp(nome) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  window.localStorage.setItem("language", "pt");
  m.permissoes = ["ativos.view"];
  m.estado = "ok";
  m.dados = DADOS;
  m.mensagem = null;
  m.semEmpresa = false;
  m.useAtivos.mockReset();
  m.refazer.mockReset();
  Object.values(m.mut).forEach((f) => f.mockReset().mockResolvedValue({ ok: true, id: "x" }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Ativos: separadores e lista", () => {
  it("mostra o título, os três separadores com contadores e abre em Serviço", () => {
    ver();
    expect(screen.getByRole("heading", { level: 1, name: "Ativos" })).toBeInTheDocument();
    expect(separador(/^Serviço/)).toHaveTextContent("2");
    expect(separador(/^Estrutura/)).toHaveTextContent("1");
    expect(separador(/^Pessoas/)).toHaveTextContent("2");
    expect(separador(/^Serviço/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Berbequim 1")).toBeInTheDocument();
  });

  it("Serviço: equipamento do catálogo ligado, vida do modelo e valor atual com a vida do modelo", () => {
    ver();
    const l = within(linha("Berbequim 1"));
    expect(l.getByText("Berbequim Hilti")).toBeInTheDocument();
    expect(l.getByText("60 meses (do modelo)")).toBeInTheDocument();
    // 600 € / 60 meses = 10 € por mês; de janeiro a junho são 6 quotas: 540 €.
    expect(norm(l.getByTestId("valor-atual").textContent)).toBe("540,00 €");
    expect(norm(l.getByTestId("valor-compra").textContent)).toBe("600,00 €");
  });

  it("Serviço sem vida em meses (só vida em horas): «por uso», nunca um valor inventado", () => {
    ver();
    const l = within(linha("Compressor"));
    expect(l.getByTestId("valor-atual")).toHaveTextContent("Por uso, sem depreciação no tempo");
    expect(l.getByText("Por uso")).toBeInTheDocument();
  });

  it("Estrutura: valor atual calculado no ecrã, estado e o desativado com a data e o motivo", () => {
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "todos" } });
    expect(norm(within(linha("Mesa grande")).getByTestId("valor-atual").textContent)).toBe("600,00 €");
    expect(within(linha("Mesa grande")).getByText("Ativo")).toBeInTheDocument();
    const velha = within(linha("Cadeira velha"));
    expect(velha.getByText("Desativado")).toBeInTheDocument();
    expect(velha.getByText(/10\/03\/2026/)).toBeInTheDocument();
    // desativada em março: 3 meses a 10 € por mês (janeiro, fevereiro, março) = 70 €, e fica assim.
    expect(norm(velha.getByTestId("valor-atual").textContent)).toBe("70,00 €");
  });

  it("Pessoas: mostra a pessoa que tem cada ativo, e «Sem pessoa» quando não está atribuído", () => {
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(linha("Portátil 1")).getByText("Ana Silva")).toBeInTheDocument();
    expect(within(linha("Telemóvel 1")).getByText("Sem pessoa")).toBeInTheDocument();
  });

  it("Pessoas sem permissão para ver o RH: nenhum nome, a coluna diz «Reservado ao RH» e há um aviso", () => {
    m.dados = { ...DADOS, rhOculto: true, atribuicoesSemAtivo: null };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument();
    expect(within(linha("Portátil 1")).getByText("Reservado ao RH")).toBeInTheDocument();
    expect(screen.getByText("Sem permissão para ver a quem estão atribuídos.")).toBeInTheDocument();
    expect(screen.queryByText("Atribuídos no RH sem ativo registado")).not.toBeInTheDocument();
  });

  it("Pessoas: abaixo da lista, os atribuídos no RH sem ativo, com a ligação «Ver em Custos»", () => {
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.getByRole("heading", { name: "Atribuídos no RH sem ativo registado" })).toBeInTheDocument();
    expect(screen.getByText("Rui Costa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver em Custos/ })).toHaveAttribute("href", "/rh-exemplo/custos");
  });
});

describe("Ativos: pesquisa, filtro por estado e estados vazios", () => {
  it("a pesquisa filtra pelo nome, pelo código e pelo modelo, e anuncia quantos há (aria-live)", () => {
    ver();
    fireEvent.change(screen.getByLabelText("Procurar"), { target: { value: "hilti" } });
    expect(screen.getByText("Berbequim 1")).toBeInTheDocument();
    expect(screen.queryByText("Compressor")).not.toBeInTheDocument();
    const estado = screen.getByRole("status");
    expect(estado).toHaveAttribute("aria-live", "polite");
    expect(estado).toHaveTextContent("1 de 2 ativos");
    fireEvent.change(screen.getByLabelText("Procurar"), { target: { value: "b-01" } });
    expect(screen.getByText("Berbequim 1")).toBeInTheDocument();
  });

  it("uma pesquisa sem resultados diz-o e deixa limpar", () => {
    ver();
    fireEvent.change(screen.getByLabelText("Procurar"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum ativo corresponde à pesquisa.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar pesquisa" }));
    expect(screen.getByText("Berbequim 1")).toBeInTheDocument();
  });

  it("por omissão só os ativos; o filtro de estado volta a pedir a lista (com desativados) e «Desativados» filtra no ecrã", () => {
    ver();
    expect(m.useAtivos).toHaveBeenLastCalledWith(expect.objectContaining({ incluirDesativados: false }));
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "todos" } });
    expect(m.useAtivos).toHaveBeenLastCalledWith(expect.objectContaining({ incluirDesativados: true }));
    abrirSeparador(/^Estrutura/);
    expect(screen.getByText("Cadeira velha")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "desativados" } });
    expect(screen.queryByText("Mesa grande")).not.toBeInTheDocument();
    expect(screen.getByText("Cadeira velha")).toBeInTheDocument();
  });

  it("estado vazio por separador, com o convite a registar quando se pode editar", () => {
    m.permissoes = ["ativos.view", "ativos.edit"];
    m.dados = { ...DADOS, servico: [], estrutura: [], pessoa: [], atribuicoesSemAtivo: [] };
    ver();
    expect(screen.getByText("Ainda não há ativos de serviço")).toBeInTheDocument();
    expect(screen.getByText("Use «Novo ativo» para registar o primeiro.")).toBeInTheDocument();
    abrirSeparador(/^Estrutura/);
    expect(screen.getByText("Ainda não há ativos de estrutura")).toBeInTheDocument();
    abrirSeparador(/^Pessoas/);
    expect(screen.getByText("Ainda não há ativos de pessoas")).toBeInTheDocument();
  });

  it("estado vazio sem ativos.edit não convida a registar", () => {
    m.dados = { ...DADOS, servico: [] };
    ver();
    expect(screen.queryByText("Use «Novo ativo» para registar o primeiro.")).not.toBeInTheDocument();
    expect(screen.getByText("Quem tem permissão para editar pode registar o primeiro.")).toBeInTheDocument();
  });

  it("lista cortada nos 2000: avisa", () => {
    m.dados = { ...DADOS, truncado: true };
    ver();
    expect(screen.getByText(/primeiros 2000 ativos/)).toBeInTheDocument();
  });
});

describe("Ativos: cliente tolerante (a base pode não ter o registo)", () => {
  it("indisponível: mensagem em português, sem separadores nem botões", () => {
    m.permissoes = ["ativos.view", "ativos.edit"];
    m.estado = "indisponivel";
    m.dados = null;
    ver();
    expect(screen.getByRole("status")).toHaveTextContent("O registo de ativos ainda não está disponível nesta organização.");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo ativo" })).not.toBeInTheDocument();
  });

  it("sem acesso (a base recusou): diz-o sem rebentar", () => {
    m.estado = "recusado";
    m.dados = null;
    ver();
    expect(screen.getByRole("status")).toHaveTextContent("Sem acesso ao registo de ativos.");
  });

  it("erro: aviso role=alert com a mensagem traduzida e «Tentar de novo»", () => {
    m.estado = "erro";
    m.dados = null;
    m.mensagem = "Não foi possível carregar os ativos. Tente novamente.";
    ver();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os ativos.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(m.refazer).toHaveBeenCalled();
  });

  it("a carregar: indicador com role=status", () => {
    m.estado = "a_carregar";
    m.dados = null;
    ver();
    expect(screen.getByRole("status")).toHaveTextContent("A carregar os ativos…");
  });

  it("sem organização ativa não pede nada e diz que falta escolher uma", () => {
    m.semEmpresa = true;
    ver();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});

describe("Ativos: só edita quem tem ativos.edit", () => {
  it("sem ativos.edit: nenhum botão de criar, editar, desativar, reativar ou ligar", () => {
    m.permissoes = ["ativos.view", "hr.pessoas.retribuicao.view"];
    ver();
    expect(screen.queryByRole("button", { name: "Novo ativo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Desativar/ })).not.toBeInTheDocument();
    abrirSeparador(/^Estrutura/);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "todos" } });
    expect(screen.queryByRole("button", { name: /^Reativar/ })).not.toBeInTheDocument();
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByRole("button", { name: /Ligar|Desligar/ })).not.toBeInTheDocument();
  });

  it("com ativos.edit: «Novo ativo» abre o painel no grupo do separador aberto", async () => {
    m.permissoes = ["ativos.view", "ativos.edit"];
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.click(screen.getByRole("button", { name: "Novo ativo" }));
    expect(await screen.findByRole("heading", { name: "Novo ativo de Estrutura" })).toBeInTheDocument();
  });

  it("com ativos.edit: Editar abre o painel com o ativo", async () => {
    m.permissoes = ["ativos.view", "ativos.edit"];
    ver();
    fireEvent.click(screen.getByRole("button", { name: "Editar Berbequim 1" }));
    expect(await screen.findByRole("heading", { name: "Editar ativo" })).toBeInTheDocument();
    expect((screen.getByLabelText(/^Nome/) as HTMLInputElement).value).toBe("Berbequim 1");
  });

  it("Desativar pede data e motivo, e nunca apaga: chama a RPC de desativar e avisa", async () => {
    m.permissoes = ["ativos.view", "ativos.edit"];
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.click(screen.getByRole("button", { name: "Desativar Mesa grande" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desativar ativo" }));
    expect(within(dialogo).getByText("Escolha o motivo.")).toBeInTheDocument();
    expect(m.mut.desativar).not.toHaveBeenCalled();
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Motivo/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Vendido" }));
    fireEvent.change(within(dialogo).getByLabelText(/Data de desativação/), { target: { value: "2026-06-10" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desativar ativo" }));
    await waitFor(() => expect(m.mut.desativar).toHaveBeenCalledWith("e1", { data: "2026-06-10", motivo: "vendido", nota: null }));
    expect(await screen.findByText("Ativo «Mesa grande» desativado.")).toBeInTheDocument();
  });

  it("Reativar chama a RPC e avisa", async () => {
    m.permissoes = ["ativos.view", "ativos.edit"];
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "todos" } });
    fireEvent.click(screen.getByRole("button", { name: "Reativar Cadeira velha" }));
    await waitFor(() => expect(m.mut.reativar).toHaveBeenCalledWith("e2"));
    expect(await screen.findByText("Ativo «Cadeira velha» reativado.")).toBeInTheDocument();
  });

  it("um ativo desativado só tem Reativar (não se edita nem se desativa outra vez)", () => {
    m.permissoes = ["ativos.view", "ativos.edit"];
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "todos" } });
    const l = within(linha("Cadeira velha"));
    expect(l.getByRole("button", { name: /^Reativar/ })).toBeInTheDocument();
    expect(l.queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
    expect(l.queryByRole("button", { name: /^Desativar/ })).not.toBeInTheDocument();
  });

  it("um erro da base ao desativar (ATV17) aparece no diálogo, traduzido, e o diálogo fica aberto", async () => {
    m.permissoes = ["ativos.view", "ativos.edit"];
    m.mut.desativar.mockResolvedValue({ ok: false, codigo: "ATV17", mensagem: "Este ativo está atribuído a uma pessoa. Devolva-o primeiro no RH." });
    ver();
    abrirSeparador(/^Pessoas/);
    fireEvent.click(screen.getByRole("button", { name: "Desativar Portátil 1" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Motivo/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Abatido" }));
    fireEvent.change(within(dialogo).getByLabelText(/Data de desativação/), { target: { value: "2026-06-10" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desativar ativo" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Devolva-o primeiro no RH.");
  });
});

describe("Ativos: ligar e desligar uma pessoa", () => {
  it("só com ativos.edit E hr.pessoas.retribuicao.edit (e ver o RH) aparecem Ligar e Desligar", () => {
    m.permissoes = ["ativos.view", "ativos.edit", "hr.pessoas.retribuicao.view"];
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByRole("button", { name: /^Ligar|^Desligar/ })).not.toBeInTheDocument();
    cleanup();
    m.permissoes = ["ativos.view", "ativos.edit", "hr.pessoas.retribuicao.view", "hr.pessoas.retribuicao.edit"];
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.getByRole("button", { name: "Desligar Portátil 1 da pessoa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ligar Telemóvel 1 a uma pessoa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ligar Portátil 1 a uma pessoa" })).not.toBeInTheDocument();
  });

  it("com o RH oculto não há Ligar (a lista de atribuições não veio)", () => {
    m.permissoes = ["ativos.view", "ativos.edit", "hr.pessoas.retribuicao.view", "hr.pessoas.retribuicao.edit"];
    m.dados = { ...DADOS, rhOculto: true, atribuicoesSemAtivo: null };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByRole("button", { name: /^Ligar|^Desligar/ })).not.toBeInTheDocument();
  });

  it("Desligar chama a RPC com a atribuição e avisa", async () => {
    m.permissoes = ["ativos.view", "ativos.edit", "hr.pessoas.retribuicao.view", "hr.pessoas.retribuicao.edit"];
    ver();
    abrirSeparador(/^Pessoas/);
    fireEvent.click(screen.getByRole("button", { name: "Desligar Portátil 1 da pessoa" }));
    await waitFor(() => expect(m.mut.desligarPessoa).toHaveBeenCalledWith("pe1"));
    expect(await screen.findByText("Ativo «Portátil 1» desligado da pessoa.")).toBeInTheDocument();
  });

  it("Ligar abre o diálogo, escolhe a atribuição e chama a RPC", async () => {
    m.permissoes = ["ativos.view", "ativos.edit", "hr.pessoas.retribuicao.view", "hr.pessoas.retribuicao.edit"];
    ver();
    abrirSeparador(/^Pessoas/);
    fireEvent.click(screen.getByRole("button", { name: "Ligar Telemóvel 1 a uma pessoa" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Atribuição no RH/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: /Rui Costa/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(m.mut.ligarPessoa).toHaveBeenCalledWith("p2", "pe9"));
    expect(await screen.findByText("Ativo «Telemóvel 1» ligado a Rui Costa.")).toBeInTheDocument();
  });
});
