// O ecrã «Ativos» (v2): separadores Serviço, Estrutura e Pessoas; no topo de cada um os TOTAIS (quantos, valor de compra, valor atual);
// a lista mostra só o que decide (nome com código, o que o liga, valor atual e estado de relance); o resto abre no DETALHE, onde vivem as
// ações. Pesquisa e filtro por estado sempre à vista, estados vazios com «Registar ativo», e o cliente tolerante (indisponível, sem acesso,
// erro). A leitura e as escritas são simuladas. Data fixa (15/06/2026): uma mesa de 1200 € a 12 meses, comprada em janeiro, vale 600 €.
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
vi.mock("@/hooks/useCountries", () => ({ useCountries: () => ({ countries: [], loading: false, error: null }) }));
vi.mock("@/hooks/ativos/useAtivos", () => ({
  useAtivos: (o: unknown) => { m.useAtivos(o); return { estado: m.estado, dados: m.dados, mensagem: m.mensagem, aAtualizar: false, semOrganizacao: false, refazer: m.refazer }; },
}));
vi.mock("@/hooks/ativos/useAtivoMutacoes", () => ({ useAtivoMutacoes: () => m.mut }));
vi.mock("@/hooks/ativos/useAtivosOpcoes", () => ({
  useAtivosOpcoes: () => ({ opcoes: { equipamentos: [{ id: "c1", nome: "Berbequim Hilti", vidaAnos: 5, vidaHoras: null }], centrosCusto: [] }, erro: null, aCarregar: false }),
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
  catEquipamento: null, atribuicao: null, ligado: false,
};
const ativo = (p: Partial<Ativo>): Ativo => ({ ...BASE, ...p });

const DADOS: AtivosLidos = {
  servico: [
    ativo({ id: "s1", grupo: "servico", tipo: null, nome: "Berbequim 1", codigo: "B-01", catEquipamentoId: "c1", vidaMeses: null, valorCompra: 600, manutencaoAno: 40, centroCustoId: "cc1", localizacao: "Armazém Porto", notas: "Comprado com garantia", catEquipamento: { id: "c1", nome: "Berbequim Hilti", vidaAnos: 5, vidaHoras: null, usoAnoHoras: null } }),
    ativo({ id: "s2", grupo: "servico", tipo: null, nome: "Compressor", catEquipamentoId: "c2", vidaMeses: null, valorCompra: 890, catEquipamento: { id: "c2", nome: "Compressor 50L", vidaAnos: null, vidaHoras: 3000, usoAnoHoras: null } }),
  ],
  estrutura: [
    ativo({ id: "e1", nome: "Mesa grande", tipo: "mobiliario" }),
    ativo({ id: "e2", nome: "Cadeira velha", estado: "desativado", desativadoEm: "2026-03-10", desativadoMotivo: "abatido", desativadoNota: "Partiu-se", valorCompra: 100, vidaMeses: 10, localizacao: null }),
  ],
  pessoa: [
    ativo({ id: "p1", grupo: "pessoa", tipo: "portatil", nome: "Portátil 1", ligado: true, atribuicao: { pessoaEquipamentoId: "pe1", pessoaNome: "Ana Silva", entrega: "2026-02-01" } }),
    ativo({ id: "p2", grupo: "pessoa", tipo: "telemovel", nome: "Telemóvel 1" }),
  ],
  atribuicoesSemAtivo: [{ id: "pe9", pessoaNome: "Rui Costa", tipo: "telemovel", descricao: "Telemóvel velho", valor: 900, entrega: "2025-05-01", estado: "atribuido" }],
  rhOculto: false,
  centrosCusto: [{ id: "cc1", nome: "Obras" }],
  truncado: false,
};

const norm = (s: string | null) => (s ?? "").replace(/\p{Zs}/gu, " ");
const EDITAR = ["ativos.view", "ativos.edit"];
const EDITAR_E_LIGAR = [...EDITAR, "hr.pessoas.retribuicao.view", "hr.pessoas.retribuicao.edit"];

function ver() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/ativos"]}><Ativos /></MemoryRouter>
    </LanguageProvider>,
  );
}
const separador = (nome: RegExp) => screen.getByRole("tab", { name: nome });
const abrirSeparador = (nome: RegExp) => { fireEvent.mouseDown(separador(nome)); fireEvent.click(separador(nome)); };
const botaoDe = (nome: string) => screen.getByRole("button", { name: `Ver detalhe de ${nome}` });
const item = (nome: string) => botaoDe(nome).closest("li") as HTMLElement;
const mostrarTodos = () => fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "todos" } });
async function abrirDetalhe(nome: string) {
  fireEvent.click(botaoDe(nome));
  return screen.findByRole("dialog", { name: nome });
}

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

describe("Ativos: separadores e totais", () => {
  it("mostra o título, os três separadores com contadores e abre em Serviço", () => {
    ver();
    expect(screen.getByRole("heading", { level: 1, name: "Ativos" })).toBeInTheDocument();
    expect(separador(/^Serviço/)).toHaveTextContent("2");
    expect(separador(/^Estrutura/)).toHaveTextContent("1");
    expect(separador(/^Pessoas/)).toHaveTextContent("2");
    expect(separador(/^Serviço/)).toHaveAttribute("aria-selected", "true");
  });

  it("no topo do separador: quantos ativos, valor de compra total e valor atual total (o «por uso» fica assinalado)", () => {
    ver();
    const totais = screen.getByRole("region", { name: "Totais de Serviço" });
    expect(within(totais).getByTestId("total-quantidade")).toHaveTextContent("2");
    expect(norm(within(totais).getByTestId("total-compra").textContent)).toBe("1490,00 €");
    // 600 € / 60 meses = 10 € por mês; de janeiro a junho são 6 quotas: 540 €. O compressor só tem vida em horas: fica fora.
    expect(norm(within(totais).getByTestId("total-atual").textContent)).toBe("540,00 €");
    expect(totais).toHaveTextContent("1 sem valor atual (por uso ou sem vida definida no modelo)");
  });

  it("os totais mudam com o separador e batem com a soma das linhas", () => {
    ver();
    abrirSeparador(/^Estrutura/);
    const totais = screen.getByRole("region", { name: "Totais de Estrutura" });
    expect(within(totais).getByTestId("total-quantidade")).toHaveTextContent("1");
    expect(norm(within(totais).getByTestId("total-atual").textContent)).toBe(norm(within(item("Mesa grande")).getByTestId("valor-atual").textContent));
    expect(totais).not.toHaveTextContent("sem valor atual");
  });

  it("os desativados não entram nos totais, mesmo com o filtro em «Todos»", () => {
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    expect(within(screen.getByRole("region", { name: "Totais de Estrutura" })).getByTestId("total-quantidade")).toHaveTextContent("1");
  });
});

describe("Ativos: a lista (só o que decide)", () => {
  it("cada ativo mostra o nome com o código, o equipamento do catálogo, o valor atual e o estado", () => {
    ver();
    const l = within(item("Berbequim 1"));
    expect(l.getByText("B-01")).toBeInTheDocument();
    expect(l.getByText("Berbequim Hilti")).toBeInTheDocument();
    expect(norm(l.getByTestId("valor-atual").textContent)).toBe("540,00 €");
    expect(l.getByTestId("estado-etiqueta")).toHaveTextContent("Em uso");
  });

  it("não é uma tabela de colunas: sem valor de compra, vida útil, data de compra nem localização na linha", () => {
    ver();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const l = within(item("Berbequim 1"));
    expect(l.queryByText(/600,00/)).not.toBeInTheDocument();
    expect(l.queryByText(/meses/)).not.toBeInTheDocument();
    expect(l.queryByText("15/01/2026")).not.toBeInTheDocument();
    expect(l.queryByText("Armazém Porto")).not.toBeInTheDocument();
  });

  it("sem vida em meses (só horas): «Por uso», nunca um valor inventado", () => {
    ver();
    expect(within(item("Compressor")).getByTestId("valor-atual")).toHaveTextContent("Por uso");
  });

  it("Estrutura: liga-se ao local (ou ao tipo) e a lista dos desativados diz o estado em cinza e texto", () => {
    ver();
    abrirSeparador(/^Estrutura/);
    expect(within(item("Mesa grande")).getByText("Armazém")).toBeInTheDocument();
    mostrarTodos();
    expect(within(item("Cadeira velha")).getByTestId("estado-etiqueta")).toHaveTextContent("Desativado");
    expect(within(item("Cadeira velha")).getByText("Mobiliário")).toBeInTheDocument();
  });

  it("Pessoas: a pessoa que o tem; sem atribuição diz «Sem pessoa ligada»", () => {
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(item("Portátil 1")).getByText("Ana Silva")).toBeInTheDocument();
    expect(within(item("Portátil 1")).getByTestId("estado-etiqueta")).toHaveTextContent("Em uso");
    expect(within(item("Telemóvel 1")).getByTestId("estado-etiqueta")).toHaveTextContent("Sem pessoa ligada");
  });

  it("Serviço sem equipamento do catálogo ligado: «Sem equipamento ligado»", () => {
    m.dados = { ...DADOS, servico: [ativo({ id: "s9", grupo: "servico", tipo: null, nome: "Furadora", catEquipamentoId: null, catEquipamento: null, vidaMeses: 12 })] };
    ver();
    expect(within(item("Furadora")).getByTestId("estado-etiqueta")).toHaveTextContent("Sem equipamento ligado");
  });

  it("Pessoas sem permissão para ver o RH: nenhum nome, «Reservado ao RH», aviso e sem a secção do RH", () => {
    m.dados = { ...DADOS, rhOculto: true, atribuicoesSemAtivo: null };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument();
    expect(within(item("Portátil 1")).getByText("Reservado ao RH")).toBeInTheDocument();
    // A chave `ligado` vem da base mesmo sem permissão do RH: dá para dizer que falta a ligação sem dizer a quem.
    expect(within(item("Telemóvel 1")).getByTestId("estado-etiqueta")).toHaveTextContent("Sem pessoa ligada");
    expect(within(item("Portátil 1")).getByTestId("estado-etiqueta")).toHaveTextContent("Em uso");
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
  it("a pesquisa e o filtro estão sempre à vista e anunciam quantos há (aria-live)", () => {
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
    mostrarTodos();
    expect(m.useAtivos).toHaveBeenLastCalledWith(expect.objectContaining({ incluirDesativados: true }));
    abrirSeparador(/^Estrutura/);
    expect(screen.getByText("Cadeira velha")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "desativados" } });
    expect(screen.queryByText("Mesa grande")).not.toBeInTheDocument();
    expect(screen.getByText("Cadeira velha")).toBeInTheDocument();
  });

  it("estado vazio de cada separador: duas linhas a explicar o que ali vai e o botão «Registar ativo»", () => {
    m.permissoes = EDITAR;
    m.dados = { ...DADOS, servico: [], estrutura: [], pessoa: [], atribuicoesSemAtivo: [] };
    ver();
    let vazio = screen.getByTestId("estado-vazio");
    expect(within(vazio).getByText("Ainda não há ativos de serviço")).toBeInTheDocument();
    expect(vazio).toHaveTextContent("uma linha por máquina");
    expect(within(vazio).getByRole("button", { name: "Registar ativo" })).toBeInTheDocument();
    abrirSeparador(/^Estrutura/);
    vazio = screen.getByTestId("estado-vazio");
    expect(within(vazio).getByText("Ainda não há ativos de estrutura")).toBeInTheDocument();
    abrirSeparador(/^Pessoas/);
    vazio = screen.getByTestId("estado-vazio");
    expect(within(vazio).getByText("Ainda não há ativos de pessoas")).toBeInTheDocument();
  });

  it("o botão do estado vazio abre o formulário já no grupo do separador", async () => {
    m.permissoes = EDITAR;
    m.dados = { ...DADOS, estrutura: [] };
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.click(within(screen.getByTestId("estado-vazio")).getByRole("button", { name: "Registar ativo" }));
    expect(await screen.findByRole("heading", { name: "Registar ativo" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Estrutura/ })).toBeChecked();
  });

  it("estado vazio sem ativos.edit não tem botão e diz quem pode registar", () => {
    m.dados = { ...DADOS, servico: [] };
    ver();
    expect(within(screen.getByTestId("estado-vazio")).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Quem tem permissão para editar pode registar o primeiro.")).toBeInTheDocument();
  });

  it("lista cortada nos 2000: aviso em cada separador, totais marcados como parciais e sem prometer que a pesquisa acha o resto", () => {
    m.dados = { ...DADOS, truncado: true };
    ver();
    const aviso = screen.getByTestId("aviso-truncado");
    expect(aviso).toHaveTextContent("2000");
    expect(aviso).not.toHaveTextContent(/pesquisa/i);
    expect(screen.getByRole("region", { name: "Totais de Serviço" })).toHaveTextContent("Totais parciais");
    abrirSeparador(/^Estrutura/);
    expect(screen.getByTestId("aviso-truncado")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Totais de Estrutura" })).toHaveTextContent("Totais parciais");
  });

  it("sem corte não há aviso nem «parciais»", () => {
    ver();
    expect(screen.queryByTestId("aviso-truncado")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Totais de Serviço" })).not.toHaveTextContent("parciais");
  });

  it("com «Todos» ou «Desativados» os totais dizem que contam só os ativos em uso", () => {
    ver();
    abrirSeparador(/^Estrutura/);
    expect(screen.getByRole("region", { name: "Totais de Estrutura" })).not.toHaveTextContent("só os ativos em uso");
    mostrarTodos();
    expect(screen.getByRole("region", { name: "Totais de Estrutura" })).toHaveTextContent("Os totais contam só os ativos em uso.");
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "desativados" } });
    expect(screen.getByRole("region", { name: "Totais de Estrutura" })).toHaveTextContent("Os totais contam só os ativos em uso.");
  });

  it("uma releitura falhada com dados na mão mantém a lista e mostra o aviso (não desmonta o ecrã)", () => {
    m.mensagem = "Não foi possível carregar os ativos. Tente novamente.";
    ver();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os ativos.");
    expect(screen.getByText("Berbequim 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
  });
});

describe("Ativos: cliente tolerante (a base pode não ter o registo)", () => {
  it("indisponível: mensagem em português, sem separadores nem botões", () => {
    m.permissoes = EDITAR;
    m.estado = "indisponivel";
    m.dados = null;
    ver();
    expect(screen.getByRole("status")).toHaveTextContent("O registo de ativos ainda não está disponível nesta organização.");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registar ativo" })).not.toBeInTheDocument();
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

  it("sem organização ativa não mostra a lista", () => {
    m.semEmpresa = true;
    ver();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});

describe("Ativos: o detalhe (o resto da informação, com números exatos)", () => {
  it("abre ao escolher o ativo e mostra o valor atual, a regra em frase e os valores exatos com unidades e datas", async () => {
    ver();
    const d = within(await abrirDetalhe("Berbequim 1"));
    expect(norm(d.getByTestId("detalhe-valor-atual").textContent)).toBe("540,00 €");
    expect(d.getByTestId("detalhe-frase")).toHaveTextContent("Perde 10,00 € por mês até 12/2030.");
    expect(norm(d.getByTestId("detalhe-valor-compra").textContent)).toBe("600,00 €");
    expect(norm(d.getByTestId("detalhe-residual").textContent)).toBe("0,00 €");
    expect(norm(d.getByTestId("detalhe-manutencao").textContent)).toBe("40,00 € por ano");
    expect(d.getByTestId("detalhe-vida")).toHaveTextContent("60 meses (5 anos, do modelo)");
    expect(d.getByTestId("detalhe-data-compra")).toHaveTextContent("15/01/2026");
    expect(d.getByTestId("detalhe-localizacao")).toHaveTextContent("Armazém Porto");
    expect(d.getByTestId("detalhe-centro")).toHaveTextContent("Obras");
    expect(d.getByTestId("detalhe-equipamento")).toHaveTextContent("Berbequim Hilti");
    expect(d.getByText("Comprado com garantia")).toBeInTheDocument();
    expect(d.getByText("B-01")).toBeInTheDocument();
    expect(d.getByTestId("estado-etiqueta")).toHaveTextContent("Em uso");
  });

  it("sem vida em meses: «Por uso, sem depreciação no tempo.»", async () => {
    ver();
    const d = within(await abrirDetalhe("Compressor"));
    expect(d.getByTestId("detalhe-frase")).toHaveTextContent("Por uso, sem depreciação no tempo.");
    expect(d.getByTestId("detalhe-vida")).toHaveTextContent("Por uso");
  });

  it("desativado: a data, o motivo e a nota, e a frase diz que deixou de depreciar", async () => {
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    const d = within(await abrirDetalhe("Cadeira velha"));
    expect(d.getByTestId("detalhe-desativado")).toHaveTextContent("Desativado em 10/03/2026 (abatido). Partiu-se");
    expect(d.getByTestId("detalhe-frase")).toHaveTextContent("Deixou de depreciar em 03/2026 e ficou a valer 70,00 €.");
  });

  it("Pessoas: a pessoa e desde quando; sem permissão do RH, «Reservado ao RH»", async () => {
    ver();
    abrirSeparador(/^Pessoas/);
    const d = within(await abrirDetalhe("Portátil 1"));
    expect(d.getByTestId("detalhe-pessoa")).toHaveTextContent("Ana Silva, desde 01/02/2026");
    cleanup();
    m.dados = { ...DADOS, rhOculto: true, atribuicoesSemAtivo: null };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(await abrirDetalhe("Portátil 1")).getByTestId("detalhe-pessoa")).toHaveTextContent("Reservado ao RH");
  });

  it("sem ativos.edit o detalhe não tem nenhuma ação, só o botão de fechar", async () => {
    ver();
    const d = within(await abrirDetalhe("Berbequim 1"));
    for (const nome of ["Editar", "Desativar", "Reativar", "Ligar a pessoa", "Desligar"]) expect(d.queryByRole("button", { name: nome })).not.toBeInTheDocument();
  });

  it("com ativos.edit: Editar fecha o detalhe e abre o painel com o ativo", async () => {
    m.permissoes = EDITAR;
    ver();
    const d = within(await abrirDetalhe("Berbequim 1"));
    fireEvent.click(d.getByRole("button", { name: "Editar" }));
    expect(await screen.findByRole("heading", { name: "Editar ativo" })).toBeInTheDocument();
    expect((screen.getByLabelText(/^Nome/) as HTMLInputElement).value).toBe("Berbequim 1");
    expect(screen.queryByRole("dialog", { name: "Berbequim 1" })).not.toBeInTheDocument();
  });

  it("Desativar pede data e motivo, e nunca apaga: chama a RPC de desativar e avisa", async () => {
    m.permissoes = EDITAR;
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.click(within(await abrirDetalhe("Mesa grande")).getByRole("button", { name: "Desativar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Desativar ativo" });
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

  it("Reativar (só nos desativados) chama a RPC e avisa; um desativado não se edita nem se desativa outra vez", async () => {
    m.permissoes = EDITAR;
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    const d = within(await abrirDetalhe("Cadeira velha"));
    expect(d.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(d.queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
    fireEvent.click(d.getByRole("button", { name: "Reativar" }));
    await waitFor(() => expect(m.mut.reativar).toHaveBeenCalledWith("e2"));
    expect(await screen.findByText("Ativo «Cadeira velha» reativado.")).toBeInTheDocument();
  });

  it("a data de desativação não passa de hoje + 7 dias (como a base: ATV16)", async () => {
    m.permissoes = EDITAR;
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.click(within(await abrirDetalhe("Mesa grande")).getByRole("button", { name: "Desativar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Desativar ativo" });
    expect((within(dialogo).getByLabelText(/Data de desativação/) as HTMLInputElement).max).toBe("2026-06-22");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Motivo/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Vendido" }));
    fireEvent.change(within(dialogo).getByLabelText(/Data de desativação/), { target: { value: "2026-06-23" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desativar ativo" }));
    expect(within(dialogo).getByText("Indique uma data válida, a partir da data de compra.")).toBeInTheDocument();
    expect(m.mut.desativar).not.toHaveBeenCalled();
  });

  it("um erro da base ao desativar (ATV16, por exemplo) aparece no diálogo, traduzido, e o diálogo fica aberto", async () => {
    m.permissoes = EDITAR;
    m.mut.desativar.mockResolvedValue({ ok: false, codigo: "ATV17", mensagem: "Este ativo está atribuído a uma pessoa. Devolva-o primeiro no RH." });
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.click(within(await abrirDetalhe("Mesa grande")).getByRole("button", { name: "Desativar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Desativar ativo" });
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Motivo/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Abatido" }));
    fireEvent.change(within(dialogo).getByLabelText(/Data de desativação/), { target: { value: "2026-06-10" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desativar ativo" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Devolva-o primeiro no RH.");
  });
});

describe("Ativos: criar a partir do topo e ligar a pessoas", () => {
  it("«Registar ativo» no topo abre o formulário já no grupo do separador aberto", async () => {
    m.permissoes = EDITAR;
    ver();
    abrirSeparador(/^Estrutura/);
    fireEvent.click(screen.getByRole("button", { name: "Registar ativo" }));
    expect(await screen.findByRole("heading", { name: "Registar ativo" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Estrutura/ })).toBeChecked();
  });

  it("sem ativos.edit não há «Registar ativo»", () => {
    ver();
    expect(screen.queryByRole("button", { name: "Registar ativo" })).not.toBeInTheDocument();
  });

  it("só com ativos.edit E hr.pessoas.retribuicao.edit aparecem Ligar e Desligar", async () => {
    m.permissoes = [...EDITAR, "hr.pessoas.retribuicao.view"];
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(await abrirDetalhe("Telemóvel 1")).queryByRole("button", { name: /Ligar|Desligar/ })).not.toBeInTheDocument();
    cleanup();
    m.permissoes = EDITAR_E_LIGAR;
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(await abrirDetalhe("Portátil 1")).getByRole("button", { name: "Desligar" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Portátil 1" })).queryByRole("button", { name: "Ligar a pessoa" })).not.toBeInTheDocument();
  });

  it("com o RH oculto não há Ligar (a lista de atribuições não veio)", async () => {
    m.permissoes = EDITAR_E_LIGAR;
    m.dados = { ...DADOS, rhOculto: true, atribuicoesSemAtivo: null };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(await abrirDetalhe("Telemóvel 1")).queryByRole("button", { name: /Ligar|Desligar/ })).not.toBeInTheDocument();
  });

  it("Desligar pede confirmação (diz de quem) e só então chama a RPC; «Cancelar» não faz nada", async () => {
    m.permissoes = EDITAR_E_LIGAR;
    ver();
    abrirSeparador(/^Pessoas/);
    fireEvent.click(within(await abrirDetalhe("Portátil 1")).getByRole("button", { name: "Desligar" }));
    const confirmar = await screen.findByRole("alertdialog");
    expect(confirmar).toHaveTextContent("Desligar «Portátil 1» de Ana Silva?");
    fireEvent.click(within(confirmar).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(m.mut.desligarPessoa).not.toHaveBeenCalled();
  });

  it("Desligar, confirmado, chama a RPC com a atribuição e avisa", async () => {
    m.permissoes = EDITAR_E_LIGAR;
    ver();
    abrirSeparador(/^Pessoas/);
    fireEvent.click(within(await abrirDetalhe("Portátil 1")).getByRole("button", { name: "Desligar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desligar" }));
    await waitFor(() => expect(m.mut.desligarPessoa).toHaveBeenCalledWith("pe1"));
    expect(await screen.findByText("Ativo «Portátil 1» desligado da pessoa.")).toBeInTheDocument();
  });

  it("Ligar abre o diálogo, escolhe a atribuição e chama a RPC", async () => {
    m.permissoes = EDITAR_E_LIGAR;
    ver();
    abrirSeparador(/^Pessoas/);
    fireEvent.click(within(await abrirDetalhe("Telemóvel 1")).getByRole("button", { name: "Ligar a pessoa" }));
    const dialogo = await screen.findByRole("dialog", { name: "Ligar a pessoa" });
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Atribuição no RH/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: /Rui Costa/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(m.mut.ligarPessoa).toHaveBeenCalledWith("p2", "pe9"));
    expect(await screen.findByText("Ativo «Telemóvel 1» ligado a Rui Costa.")).toBeInTheDocument();
  });
});

describe("Ativos: o que a revisão apanhou", () => {
  const SEM_VIDA = { id: "c3", nome: "Escada", vidaAnos: null, vidaHoras: null, usoAnoHoras: null };

  it("um ativo atribuído a uma pessoa não oferece Desativar: explica que se devolve primeiro no RH (chave `ligado`, mesmo sem ver o RH)", async () => {
    m.permissoes = EDITAR_E_LIGAR;
    ver();
    abrirSeparador(/^Pessoas/);
    let d = within(await abrirDetalhe("Portátil 1"));
    expect(d.queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
    expect(d.getByTestId("detalhe-desativar-bloqueado")).toHaveTextContent("Este ativo está atribuído a uma pessoa. Devolva-o primeiro no RH.");
    expect(d.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    cleanup();
    m.permissoes = EDITAR;
    m.dados = { ...DADOS, rhOculto: true, atribuicoesSemAtivo: null };
    ver();
    abrirSeparador(/^Pessoas/);
    d = within(await abrirDetalhe("Portátil 1"));
    expect(d.queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
    expect(d.getByTestId("detalhe-desativar-bloqueado")).toBeInTheDocument();
    // Um ativo de pessoa sem ligação continua a poder desativar-se.
    cleanup();
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(await abrirDetalhe("Telemóvel 1")).getByRole("button", { name: "Desativar" })).toBeInTheDocument();
  });

  it("pessoa já apagada (ligado, sem nome): «Ligado a uma pessoa», sem Ligar, sem Desligar e sem Desativar", async () => {
    m.permissoes = EDITAR_E_LIGAR;
    m.dados = { ...DADOS, pessoa: [ativo({ id: "p5", grupo: "pessoa", tipo: "portatil", nome: "Portátil órfão", ligado: true, atribuicao: null })] };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(item("Portátil órfão")).getByText("Ligado a uma pessoa")).toBeInTheDocument();
    expect(within(item("Portátil órfão")).getByTestId("estado-etiqueta")).toHaveTextContent("Em uso");
    const d = within(await abrirDetalhe("Portátil órfão"));
    expect(d.getByTestId("detalhe-pessoa")).toHaveTextContent("Ligado a uma pessoa");
    for (const nome of ["Ligar a pessoa", "Desligar", "Desativar"]) expect(d.queryByRole("button", { name: nome })).not.toBeInTheDocument();
  });

  it("a frase nunca diz «Perde 0,00 €»: com residual igual à compra diz «Não perde valor.»", async () => {
    m.dados = { ...DADOS, estrutura: [ativo({ id: "e9", nome: "Terreno", valorCompra: 5000, valorResidual: 5000, vidaMeses: 600 })] };
    ver();
    abrirSeparador(/^Estrutura/);
    const frase = within(await abrirDetalhe("Terreno")).getByTestId("detalhe-frase");
    expect(frase).toHaveTextContent("Não perde valor.");
    expect(frase).not.toHaveTextContent("Perde");
  });

  it("«Por uso» só quando é mesmo por uso: um modelo sem vida diz «Sem vida definida», na lista e no detalhe", async () => {
    m.dados = { ...DADOS, servico: [ativo({ id: "s7", grupo: "servico", tipo: null, nome: "Escada 1", catEquipamentoId: "c3", vidaMeses: null, catEquipamento: SEM_VIDA })] };
    ver();
    expect(within(item("Escada 1")).getByTestId("valor-atual")).toHaveTextContent("Sem vida definida");
    expect(within(item("Escada 1")).getByTestId("valor-atual")).not.toHaveTextContent("Por uso");
    expect(screen.getByRole("region", { name: "Totais de Serviço" })).toHaveTextContent("1 sem valor atual");
    const d = within(await abrirDetalhe("Escada 1"));
    expect(d.getByTestId("detalhe-frase")).toHaveTextContent("O modelo do catálogo não tem vida útil definida: não se calcula o valor atual.");
    expect(d.getByTestId("detalhe-vida")).toHaveTextContent("Sem vida definida");
  });

  it("o detalhe diz a vida restante e quando acaba de depreciar", async () => {
    ver();
    const d = within(await abrirDetalhe("Berbequim 1"));
    expect(d.getByTestId("detalhe-vida-restante")).toHaveTextContent("54 meses (acaba em 12/2030)");
  });

  it("desativado: o valor tem a legenda «à data da desativação» e não há vida restante", async () => {
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    const d = within(await abrirDetalhe("Cadeira velha"));
    expect(d.getByTestId("detalhe-valor-rotulo")).toHaveTextContent("Valor à data da desativação");
    expect(norm(d.getByTestId("detalhe-valor-atual").textContent)).toBe("70,00 €");
    expect(d.queryByTestId("detalhe-vida-restante")).not.toBeInTheDocument();
    cleanup();
    ver();
    expect(within(await abrirDetalhe("Berbequim 1")).getByTestId("detalhe-valor-rotulo")).toHaveTextContent("Valor atual");
  });

  it("a linha de ligação tem rótulo acessível (equipamento, local, pessoa)", () => {
    ver();
    expect(within(item("Berbequim 1")).getByText("Equipamento do catálogo:")).toBeInTheDocument();
    abrirSeparador(/^Estrutura/);
    expect(within(item("Mesa grande")).getByText("Local:")).toBeInTheDocument();
    abrirSeparador(/^Pessoas/);
    expect(within(item("Portátil 1")).getByText("Pessoa:")).toBeInTheDocument();
  });

  it("«sem ativo registado» são cartões (sem tabela, sem scroll horizontal)", () => {
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Atribuídos no RH sem ativo registado" });
    expect(within(lista).getByText("Rui Costa")).toBeInTheDocument();
    expect(within(lista).getByText("Telemóvel velho")).toBeInTheDocument();
  });

  it("ao fechar o detalhe o foco volta ao ativo que o abriu", async () => {
    ver();
    const botao = botaoDe("Berbequim 1");
    fireEvent.click(botao);
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Berbequim 1" }), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(botao));
  });

  it("Editar a partir do detalhe: ao fechar o painel o foco volta ao ativo da lista (não se perde)", async () => {
    m.permissoes = EDITAR;
    ver();
    const botao = botaoDe("Berbequim 1");
    fireEvent.click(botao);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Berbequim 1" })).getByRole("button", { name: "Editar" }));
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Editar ativo" }), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(botao));
  });

  it("ao fechar o formulário de registar o foco volta ao botão que o abriu", async () => {
    m.permissoes = EDITAR;
    ver();
    const registar = screen.getByRole("button", { name: "Registar ativo" });
    fireEvent.click(registar);
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Registar ativo" }), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(registar));
  });
});
