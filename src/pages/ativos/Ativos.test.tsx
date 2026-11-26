// O ecrã «Ativos» (v2): separadores Serviço, Estrutura e Pessoas; no topo de cada um os TOTAIS (quantos, valor de compra, valor atual);
// a lista mostra só o que decide (nome com código, o que o liga, valor atual e estado de relance); o resto abre no DETALHE, onde vivem as
// ações. Pesquisa e filtro por estado sempre à vista, estados vazios com «Registar ativo», e o cliente tolerante (indisponível, sem acesso,
// erro). A leitura e as escritas são simuladas. Data fixa (15/06/2026): uma mesa de 1200 € a 12 meses, comprada em janeiro, vale 600 €.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { Ativo, AtivosLidos, OcupacaoDoAtivo } from "@/components/ativos/lib/tipos";

const m = vi.hoisted(() => ({
  permissoes: [] as string[],
  estado: "ok" as string,
  dados: null as unknown,
  mensagem: null as string | null,
  useAtivos: vi.fn(),
  refazer: vi.fn(),
  mut: { criar: vi.fn(), alterar: vi.fn(), desativar: vi.fn(), reativar: vi.fn() },
  semEmpresa: false,
  /** O ativo lido por `rpc_ativo_ler` (ocupações com o nome da pessoa); `null` = a ficha fica com os dados da lista. */
  lido: null as unknown,
  valorStock: { valor: null as number | null, aCarregar: false, falhou: false },
}));
vi.mock("@/hooks/useCountries", () => ({ useCountries: () => ({ countries: [], loading: false, error: null }) }));
vi.mock("@/hooks/ativos/useAtivos", () => ({
  useAtivos: (o: unknown) => { m.useAtivos(o); return { estado: m.estado, dados: m.dados, mensagem: m.mensagem, aAtualizar: false, semOrganizacao: false, refazer: m.refazer }; },
}));
vi.mock("@/hooks/ativos/useAtivoMutacoes", () => ({ useAtivoMutacoes: () => m.mut }));
vi.mock("@/hooks/ativos/useAtivoLido", () => ({ useAtivoLido: () => ({ ativo: m.lido, aCarregar: false }) }));
vi.mock("@/hooks/ativos/useValorStockArmazem", () => ({ useValorStockArmazem: () => m.valorStock }));
vi.mock("@/hooks/ativos/useAtivosOpcoes", () => ({
  useAtivosOpcoes: () => ({ opcoes: { equipamentos: [{ id: "c1", nome: "Berbequim Hilti", vidaAnos: 5, vidaHoras: null }], centrosCusto: [], armazens: [], podeVerArmazens: false }, erro: null, aCarregar: false }),
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
  catEquipamento: null, atribuicao: null, ligado: false, forma: "comprado", rendaMensal: null, inicioAluguer: null, fimAluguer: null, vidaOrigem: null, armazem: null, armazemLigado: false, ocupacoes: [],
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
  rhOculto: false,
  podeVerArmazens: true,
  centrosCusto: [{ id: "cc1", nome: "Obras" }],
  truncado: false,
};

const norm = (s: string | null) => (s ?? "").replace(/\p{Zs}/gu, " ");
const EDITAR = ["ativos.view", "ativos.edit"];

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
  m.lido = null;
  m.valorStock = { valor: null, aCarregar: false, falhou: false };
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

  it("Pessoas: a pessoa que o tem; sem ninguém diz «Livre»", () => {
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(item("Portátil 1")).getByText("Ana Silva")).toBeInTheDocument();
    expect(within(item("Portátil 1")).getByTestId("estado-etiqueta")).toHaveTextContent("Em uso");
    expect(within(item("Telemóvel 1")).getByTestId("estado-etiqueta")).toHaveTextContent("Livre");
  });

  it("Serviço sem equipamento do catálogo ligado: «Sem equipamento ligado»", () => {
    m.dados = { ...DADOS, servico: [ativo({ id: "s9", grupo: "servico", tipo: null, nome: "Furadora", catEquipamentoId: null, catEquipamento: null, vidaMeses: 12 })] };
    ver();
    expect(within(item("Furadora")).getByTestId("estado-etiqueta")).toHaveTextContent("Sem equipamento ligado");
  });

  it("Pessoas sem permissão para ver o RH: nenhum nome, «Reservado ao RH», aviso e sem a secção do RH", () => {
    m.dados = { ...DADOS, rhOculto: true };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument();
    expect(within(item("Portátil 1")).getByText("Reservado ao RH")).toBeInTheDocument();
    // A chave `ligado` vem da base mesmo sem permissão do RH: dá para dizer que falta a ligação sem dizer a quem.
    expect(within(item("Telemóvel 1")).getByTestId("estado-etiqueta")).toHaveTextContent("Livre");
    expect(within(item("Portátil 1")).getByTestId("estado-etiqueta")).toHaveTextContent("Em uso");
    expect(screen.getByText("Sem permissão para ver a quem estão atribuídos.")).toBeInTheDocument();
    expect(screen.queryByText("Atribuídos no RH sem ativo registado")).not.toBeInTheDocument();
  });

  it("Pessoas: a lista «atribuídos no RH sem ativo registado» saiu (o equipamento do RH passa a ser um ativo sozinho)", () => {
    ver();
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByText("Atribuídos no RH sem ativo registado")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ver em Custos/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Rui Costa")).not.toBeInTheDocument();
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
    m.dados = { ...DADOS, rhOculto: true };
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

  it("Reativar (só nos desativados) pede confirmação, com o aviso do passado, e só então chama a RPC; um desativado não se edita nem se desativa outra vez", async () => {
    m.permissoes = EDITAR;
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    const d = within(await abrirDetalhe("Cadeira velha"));
    expect(d.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(d.queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
    fireEvent.click(d.getByRole("button", { name: "Reativar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Reativar «Cadeira velha»?" });
    expect(within(dialogo).getByTestId("reativar-aviso")).toHaveTextContent("Reativar apaga a data de desativação");
    expect(within(dialogo).getByTestId("reativar-aviso")).toHaveTextContent("também nos meses passados");
    expect(m.mut.reativar).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reativar" }));
    await waitFor(() => expect(m.mut.reativar).toHaveBeenCalledWith("e2"));
    expect(await screen.findByText("Ativo «Cadeira velha» reativado.")).toBeInTheDocument();
  });

  it("Reativar: «Cancelar» não faz nada", async () => {
    m.permissoes = EDITAR;
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    fireEvent.click(within(await abrirDetalhe("Cadeira velha")).getByRole("button", { name: "Reativar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Reativar «Cadeira velha»?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reativar «Cadeira velha»?" })).not.toBeInTheDocument());
    expect(m.mut.reativar).not.toHaveBeenCalled();
  });

  it("Reativar: quando a base avisa que o passado muda, o aviso fica dito na página", async () => {
    m.permissoes = EDITAR;
    m.mut.reativar.mockResolvedValue({ ok: true, id: "e2", aviso: true });
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    fireEvent.click(within(await abrirDetalhe("Cadeira velha")).getByRole("button", { name: "Reativar" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Reativar «Cadeira velha»?" })).getByRole("button", { name: "Reativar" }));
    expect(await screen.findByText(/reativado\. A quota ou a renda voltam a contar desde a desativação, também nos meses passados\./)).toBeInTheDocument();
  });

  it("Reativar: um erro da base (ATV30, o armazém já tem outro ativo) aparece no diálogo e o diálogo fica aberto", async () => {
    m.permissoes = EDITAR;
    m.mut.reativar.mockResolvedValue({ ok: false, codigo: "ATV30", mensagem: "Este armazém já tem outro ativo ativo. Desative esse primeiro ou desligue o armazém." });
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    fireEvent.click(within(await abrirDetalhe("Cadeira velha")).getByRole("button", { name: "Reativar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Reativar «Cadeira velha»?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reativar" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Este armazém já tem outro ativo ativo.");
    expect(screen.getByRole("dialog", { name: "Reativar «Cadeira velha»?" })).toBeInTheDocument();
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
    expect(within(dialogo).getByText("Indique uma data válida: a partir da compra ou do início do aluguer e não antes da última devolução.")).toBeInTheDocument();
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

describe("Ativos: criar a partir do topo (e Ligar e Desligar saíram)", () => {
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

  it("Ligar e Desligar saíram: nem com todas as permissões há botões para ligar a uma pessoa ou desligar (devolve-se no RH)", async () => {
    m.permissoes = [...EDITAR, "hr.pessoas.retribuicao.view", "hr.pessoas.retribuicao.edit"];
    ver();
    abrirSeparador(/^Pessoas/);
    for (const nome of ["Portátil 1", "Telemóvel 1"]) {
      const d = within(await abrirDetalhe(nome));
      expect(d.queryByRole("button", { name: /Ligar|Desligar/ })).not.toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("dialog", { name: nome }), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog", { name: nome })).not.toBeInTheDocument());
    }
  });
});

describe("Ativos: o que a revisão apanhou", () => {
  const SEM_VIDA = { id: "c3", nome: "Escada", vidaAnos: null, vidaHoras: null, usoAnoHoras: null };

  it("um ativo atribuído a uma pessoa não oferece Desativar: explica que se devolve primeiro no RH (chave `ligado`, mesmo sem ver o RH)", async () => {
    m.permissoes = EDITAR;
    ver();
    abrirSeparador(/^Pessoas/);
    let d = within(await abrirDetalhe("Portátil 1"));
    expect(d.queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
    expect(d.getByTestId("detalhe-desativar-bloqueado")).toHaveTextContent("Este ativo está atribuído a uma pessoa. Devolva-o primeiro no RH.");
    expect(d.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    cleanup();
    m.permissoes = EDITAR;
    m.dados = { ...DADOS, rhOculto: true };
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
    m.permissoes = EDITAR;
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

  it("as listas e as fichas são cartões e listas, nunca uma tabela (sem scroll horizontal no telemóvel)", async () => {
    ver();
    for (const g of [/^Serviço/, /^Estrutura/, /^Pessoas/]) {
      abrirSeparador(g);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    }
    await abrirDetalhe("Portátil 1");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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

// A1: comprado ou alugado. Data fixa (15/06/2026). Um portátil de 1 200 € a 12 meses comprado a 15/01/2026 amortiza 100 € por mês (janeiro a
// junho = 6 quotas = 600 €); uma viatura alugada a 450 € por mês desde 01/01/2026 já custou 6 rendas = 2 700 €.
const OC = (parcial: Partial<OcupacaoDoAtivo> & Pick<OcupacaoDoAtivo, "entrega">): OcupacaoDoAtivo => ({
  pessoaEquipamentoId: "o", pessoaId: null, pessoaNome: null, estado: null, devolucao: null, contaDesde: null, ...parcial,
});
const PORTATIL = (parcial: Partial<Ativo> = {}): Ativo => ativo({
  id: "p1", grupo: "pessoa", tipo: "portatil", nome: "Portátil 1", codigo: "POR-0001", valorCompra: 1200, vidaMeses: 12, vidaOrigem: "pagamento", ...parcial,
});
const VIATURA = (parcial: Partial<Ativo> = {}): Ativo => ativo({
  id: "v1", grupo: "pessoa", tipo: "viatura", nome: "Carrinha", codigo: "VIA-0001", forma: "alugado", dataCompra: null, valorCompra: null, vidaMeses: null,
  rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: null, ...parcial,
});

describe("Ativos: totais só dos comprados e as rendas à parte", () => {
  it("Pessoas: compra, amortizado e valor atual são só dos comprados; o alugado vai na linha «Rendas»", () => {
    m.dados = { ...DADOS, pessoa: [PORTATIL(), VIATURA()] };
    ver();
    abrirSeparador(/^Pessoas/);
    const totais = screen.getByRole("region", { name: "Totais de Pessoas" });
    expect(within(totais).getByTestId("total-quantidade")).toHaveTextContent("2");
    expect(norm(within(totais).getByTestId("total-compra").textContent)).toBe("1200,00 €");
    expect(norm(within(totais).getByTestId("total-amortizado").textContent)).toBe("600,00 €");
    expect(norm(within(totais).getByTestId("total-atual").textContent)).toBe("600,00 €");
    expect(norm(within(totais).getByTestId("total-rendas").textContent)).toBe("Rendas: 450,00 € por mês (1 alugado)");
    expect(totais).toHaveTextContent("só os comprados");
  });

  it("sem alugados não há linha de rendas nem a nota dos comprados", () => {
    ver();
    expect(screen.queryByTestId("total-rendas")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Totais de Serviço" })).not.toHaveTextContent("só os comprados");
  });

  it("vários alugados: a soma das rendas e a contagem", () => {
    m.dados = { ...DADOS, pessoa: [VIATURA(), VIATURA({ id: "v2", nome: "Carrinha 2", rendaMensal: 300 })] };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(norm(screen.getByTestId("total-rendas").textContent)).toBe("Rendas: 750,00 € por mês (2 alugados)");
    expect(norm(screen.getByTestId("total-compra").textContent)).toBe("0,00 €");
  });

  it("Estrutura: o que os equipamentos de Pessoas sem ninguém custam este mês é custo da estrutura", () => {
    const devolvido = PORTATIL({ id: "p7", nome: "Portátil devolvido", ocupacoes: [OC({ entrega: "2026-02-01", devolucao: "2026-05-10", contaDesde: "2026-02-01" })] });
    m.dados = { ...DADOS, pessoa: [devolvido, PORTATIL({ id: "p8", ocupacoes: [OC({ entrega: "2026-02-01", contaDesde: "2026-02-01" })] })] };
    ver();
    abrirSeparador(/^Estrutura/);
    expect(norm(screen.getByTestId("total-parado").textContent)).toBe("Equipamentos parados (sem pessoa): 100,00 € este mês.");
    abrirSeparador(/^Pessoas/);
    expect(screen.queryByTestId("total-parado")).not.toBeInTheDocument();
  });

  it("Estrutura sem equipamentos parados (todos entregues, ou nenhum de Pessoas) não mostra a linha", () => {
    m.dados = { ...DADOS, pessoa: [] };
    ver();
    abrirSeparador(/^Estrutura/);
    expect(screen.queryByTestId("total-parado")).not.toBeInTheDocument();
  });

  it("um armazém alugado é uma renda de estrutura: não entra na compra nem no valor atual", () => {
    const armazem = ativo({
      id: "w", nome: "Armazém Porto", tipo: "instalacoes", forma: "alugado", dataCompra: null, valorCompra: null, vidaMeses: null,
      rendaMensal: 900, inicioAluguer: "2025-01-01", fimAluguer: "2030-12-31", armazemLigado: true, armazem: { id: "w1", nome: "Porto", apagado: false },
    });
    m.dados = { ...DADOS, estrutura: [armazem] };
    ver();
    abrirSeparador(/^Estrutura/);
    const totais = screen.getByRole("region", { name: "Totais de Estrutura" });
    expect(norm(within(totais).getByTestId("total-rendas").textContent)).toBe("Rendas: 900,00 € por mês (1 alugado)");
    expect(norm(within(totais).getByTestId("total-compra").textContent)).toBe("0,00 €");
    expect(norm(within(totais).getByTestId("total-atual").textContent)).toBe("0,00 €");
  });
});

describe("Ativos: a lista mostra a renda do alugado e «Livre»", () => {
  it("o alugado diz «Alugado» ao lado do código e mostra a renda por mês em vez do valor atual", () => {
    m.dados = { ...DADOS, pessoa: [PORTATIL(), VIATURA()] };
    ver();
    abrirSeparador(/^Pessoas/);
    const l = within(item("Carrinha"));
    expect(l.getByText("Alugado · VIA-0001")).toBeInTheDocument();
    expect(norm(l.getByTestId("valor-renda").textContent)).toBe("450,00 € por mês");
    expect(l.queryByTestId("valor-atual")).not.toBeInTheDocument();
    expect(within(item("Portátil 1")).getByTestId("valor-atual")).toBeInTheDocument();
  });

  it("um alugado que ninguém tem está «Livre» (não é um aviso)", () => {
    m.dados = { ...DADOS, pessoa: [VIATURA()] };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(item("Carrinha")).getByTestId("estado-etiqueta")).toHaveTextContent("Livre");
  });
});

describe("Ativos: a ficha de um comprado mostra a amortização", () => {
  it("valor atual em grande e, por baixo, quanto já amortizou em euros e em %, os meses, o que falta e o mês em que acaba", async () => {
    ver();
    abrirSeparador(/^Estrutura/);
    const d = within(await abrirDetalhe("Mesa grande"));
    expect(norm(d.getByTestId("detalhe-valor-atual").textContent)).toBe("600,00 €");
    expect(norm(d.getByTestId("detalhe-amortizado").textContent)).toBe("600,00 € (50,0 %)");
    expect(d.getByTestId("detalhe-meses")).toHaveTextContent("6 de 12");
    expect(norm(d.getByTestId("detalhe-falta").textContent)).toBe("600,00 € em 6 meses");
    expect(d.getByTestId("detalhe-fim-amortizacao")).toHaveTextContent("12/2026");
    expect(norm(d.getByTestId("detalhe-valor-compra").textContent)).toBe("1200,00 €");
  });

  it("a barra de progresso diz a percentagem (aria) e acompanha o amortizado", async () => {
    ver();
    abrirSeparador(/^Estrutura/);
    const barra = within(await abrirDetalhe("Mesa grande")).getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "50");
    expect(barra).toHaveAttribute("aria-valuemin", "0");
    expect(barra).toHaveAttribute("aria-valuemax", "100");
    expect(barra).toHaveAccessibleName("Amortizado: 50,0 %");
  });

  it("totalmente amortizado: 100%, sem «falta» e o fim diz «desde»", async () => {
    m.dados = { ...DADOS, estrutura: [ativo({ id: "e5", nome: "Mesa velha", dataCompra: "2024-01-15", valorCompra: 1200, vidaMeses: 12 })] };
    ver();
    abrirSeparador(/^Estrutura/);
    const d = within(await abrirDetalhe("Mesa velha"));
    expect(d.getByTestId("detalhe-amortizado")).toHaveTextContent("(100,0 %)");
    expect(d.queryByTestId("detalhe-falta")).not.toBeInTheDocument();
    expect(d.getByText("Totalmente amortizado desde")).toBeInTheDocument();
    expect(d.getByTestId("detalhe-fim-amortizacao")).toHaveTextContent("12/2024");
  });

  it("desativado: a amortização parou (o fim é o mês da desativação) e não se diz o que falta", async () => {
    ver();
    abrirSeparador(/^Estrutura/);
    mostrarTodos();
    const d = within(await abrirDetalhe("Cadeira velha"));
    expect(d.getByText("A amortização parou em")).toBeInTheDocument();
    expect(d.getByTestId("detalhe-fim-amortizacao")).toHaveTextContent("03/2026");
    expect(d.queryByTestId("detalhe-falta")).not.toBeInTheDocument();
  });

  it("o serviço «por uso» (só horas) não tem barra de amortização", async () => {
    ver();
    expect(within(await abrirDetalhe("Compressor")).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("a ficha diz como se definiu a vida útil (meses de pagamento, catálogo ou à mão)", async () => {
    m.dados = { ...DADOS, pessoa: [PORTATIL()] };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(await abrirDetalhe("Portátil 1")).getByTestId("detalhe-vida-origem")).toHaveTextContent("Meses de pagamento");
  });
});

describe("Ativos: a ficha de um alugado", () => {
  const verViatura = async (parcial: Partial<Ativo> = {}) => {
    m.dados = { ...DADOS, pessoa: [VIATURA(parcial)] };
    ver();
    abrirSeparador(/^Pessoas/);
    return within(await abrirDetalhe("Carrinha"));
  };

  it("mostra a renda em grande, as datas do contrato e quanto já se pagou, sem valor de compra nem amortização", async () => {
    const d = await verViatura();
    expect(norm(d.getByTestId("detalhe-renda").textContent)).toBe("450,00 € por mês");
    expect(d.getByTestId("detalhe-inicio-aluguer")).toHaveTextContent("01/01/2026");
    expect(d.getByTestId("detalhe-fim-aluguer")).toHaveTextContent("Sem fim");
    expect(d.getByTestId("detalhe-aluguer-meses")).toHaveTextContent("6");
    expect(norm(d.getByTestId("detalhe-aluguer-pago").textContent)).toBe("2700,00 €");
    expect(d.queryByRole("progressbar")).not.toBeInTheDocument();
    for (const id of ["detalhe-valor-compra", "detalhe-residual", "detalhe-vida", "detalhe-valor-atual", "detalhe-amortizado", "detalhe-data-compra"]) {
      expect(d.queryByTestId(id)).not.toBeInTheDocument();
    }
  });

  it("com fim: mostra a data de fim", async () => {
    const d = await verViatura({ fimAluguer: "2029-12-31" });
    expect(d.getByTestId("detalhe-fim-aluguer")).toHaveTextContent("31/12/2029");
  });

  it("alugado desativado: a renda pára no mês da desativação", async () => {
    m.permissoes = EDITAR;
    m.dados = { ...DADOS, pessoa: [VIATURA({ estado: "desativado", desativadoEm: "2026-03-20", desativadoMotivo: "outro" })] };
    ver();
    abrirSeparador(/^Pessoas/);
    mostrarTodos();
    const d = within(await abrirDetalhe("Carrinha"));
    expect(d.getByTestId("detalhe-aluguer-meses")).toHaveTextContent("3");
    expect(norm(d.getByTestId("detalhe-aluguer-pago").textContent)).toBe("1350,00 €");
  });

  it("aviso: alugado sem fim, já devolvido e nunca desativado (a renda continua a contar como custo de estrutura)", async () => {
    const d = await verViatura({ ocupacoes: [OC({ entrega: "2026-01-01", devolucao: "2026-03-31", contaDesde: "2026-01-01" })] });
    expect(d.getByTestId("detalhe-aviso-alugadoSemFimDevolvido")).toHaveTextContent("nunca foi desativado");
  });

  it("sem esse aviso quando o equipamento ainda está entregue, ou o aluguer tem fim", async () => {
    let d = await verViatura({ ocupacoes: [OC({ entrega: "2026-01-01", contaDesde: "2026-01-01" })] });
    expect(d.queryByTestId("detalhe-aviso-alugadoSemFimDevolvido")).not.toBeInTheDocument();
    cleanup();
    d = await verViatura({ fimAluguer: "2029-12-31", ocupacoes: [OC({ entrega: "2026-01-01", devolucao: "2026-03-31", contaDesde: "2026-01-01" })] });
    expect(d.queryByTestId("detalhe-aviso-alugadoSemFimDevolvido")).not.toBeInTheDocument();
  });

  it("aviso: contrato terminado com o equipamento ainda entregue", async () => {
    const d = await verViatura({ fimAluguer: "2026-05-31", ocupacoes: [OC({ entrega: "2026-01-01", contaDesde: "2026-01-01" })] });
    expect(d.getByTestId("detalhe-aviso-aluguerTerminadoEntregue")).toBeInTheDocument();
  });
});

describe("Ativos: quem paga cada mês", () => {
  const ANA = OC({ pessoaEquipamentoId: "o1", entrega: "2026-02-01", devolucao: "2026-03-31", contaDesde: "2026-02-01", pessoaNome: "Ana Silva", estado: "devolvido" });
  const BRUNO = OC({ pessoaEquipamentoId: "o2", entrega: "2026-05-10", contaDesde: "2026-05-10", pessoaNome: "Bruno Costa", estado: "atribuido" });

  it("lista cada pessoa com o período e o que pagou, e a estrutura nos meses em que ninguém o tinha (soma = amortizado até hoje)", async () => {
    // Quota de 100 €: janeiro (a 31/01 ainda ninguém) é da estrutura; fevereiro e março são da Ana (devolve a 31/03); abril (a 30/04 ninguém) é da estrutura;
    // maio e junho são do Bruno.
    const comNomes = PORTATIL({ ligado: true, ocupacoes: [ANA, BRUNO] });
    m.dados = { ...DADOS, pessoa: [comNomes] };
    m.lido = comNomes;
    ver();
    abrirSeparador(/^Pessoas/);
    const d = within(await abrirDetalhe("Portátil 1"));
    const quem = within(d.getByTestId("detalhe-quem-paga"));
    expect(quem.getByTestId("quem-pessoa-0")).toHaveTextContent("Ana Silva");
    expect(quem.getByTestId("quem-pessoa-0")).toHaveTextContent("De 01/02/2026 a 31/03/2026");
    expect(norm(quem.getByTestId("quem-pessoa-0").textContent)).toContain("200,00 € em 2 meses");
    expect(quem.getByTestId("quem-pessoa-1")).toHaveTextContent("Bruno Costa");
    expect(quem.getByTestId("quem-pessoa-1")).toHaveTextContent("Desde 10/05/2026, ainda com a pessoa");
    expect(norm(quem.getByTestId("quem-pessoa-1").textContent)).toContain("200,00 € em 2 meses");
    expect(norm(quem.getByTestId("quem-estrutura").textContent)).toContain("200,00 € em 2 meses");
    expect(norm(quem.getByTestId("quem-total").textContent)).toContain("600,00 € em 6 meses");
    expect(quem.getByText(/o dia da devolução conta/)).toBeInTheDocument();
  });

  it("sem a permissão do RH não há nomes («Reservado ao RH»), mas os valores e a estrutura mostram-se na mesma", async () => {
    m.dados = { ...DADOS, rhOculto: true, pessoa: [PORTATIL({ ligado: true, ocupacoes: [ANA, BRUNO] })] };
    ver();
    abrirSeparador(/^Pessoas/);
    const quem = within((within(await abrirDetalhe("Portátil 1"))).getByTestId("detalhe-quem-paga"));
    expect(quem.queryByText("Ana Silva")).not.toBeInTheDocument();
    expect(quem.getByTestId("quem-pessoa-0")).toHaveTextContent("Reservado ao RH");
    expect(quem.getByTestId("quem-estrutura")).toBeInTheDocument();
  });

  it("sem nome vindo da base (a lista só traz o id da pessoa) a ficha diz «Pessoa», sem inventar um nome", async () => {
    const semNome = { ...ANA, pessoaNome: null };
    m.dados = { ...DADOS, pessoa: [PORTATIL({ ligado: true, ocupacoes: [semNome, BRUNO] })] };
    ver();
    abrirSeparador(/^Pessoas/);
    const quem = within(within(await abrirDetalhe("Portátil 1")).getByTestId("detalhe-quem-paga"));
    expect(quem.getByTestId("quem-pessoa-0")).toHaveTextContent("Pessoa");
    expect(quem.getByTestId("quem-pessoa-0")).not.toHaveTextContent("Ana");
  });

  it("viatura em renting: o João paga os meses até devolver a 31/03 (março é dele, o dia da devolução conta) e a Ana os seguintes; estrutura 0", async () => {
    const joao = OC({ pessoaEquipamentoId: "j", entrega: "2026-01-01", devolucao: "2026-03-31", contaDesde: "2026-01-01", pessoaNome: "João" });
    const ana = OC({ pessoaEquipamentoId: "a", entrega: "2026-04-05", contaDesde: "2026-04-05", pessoaNome: "Ana" });
    m.dados = { ...DADOS, pessoa: [VIATURA({ ligado: true, ocupacoes: [joao, ana] })] };
    ver();
    abrirSeparador(/^Pessoas/);
    const quem = within(within(await abrirDetalhe("Carrinha")).getByTestId("detalhe-quem-paga"));
    expect(norm(quem.getByTestId("quem-pessoa-0").textContent)).toContain("1350,00 € em 3 meses");
    expect(norm(quem.getByTestId("quem-pessoa-1").textContent)).toContain("1350,00 € em 3 meses");
    expect(quem.queryByTestId("quem-estrutura")).not.toBeInTheDocument();
    expect(norm(quem.getByTestId("quem-total").textContent)).toContain("2700,00 € em 6 meses");
  });

  it("um ativo de Pessoas que nunca foi entregue: tudo é custo da estrutura, e diz-se", async () => {
    m.dados = { ...DADOS, pessoa: [PORTATIL()] };
    ver();
    abrirSeparador(/^Pessoas/);
    const quem = within(within(await abrirDetalhe("Portátil 1")).getByTestId("detalhe-quem-paga"));
    expect(quem.getByText("Ainda não foi entregue a ninguém: tudo conta como custo da estrutura.")).toBeInTheDocument();
    expect(norm(quem.getByTestId("quem-estrutura").textContent)).toContain("600,00 € em 6 meses");
  });

  it("um comprado de Estrutura (uma mesa) não tem esta secção; um armazém alugado diz que o custo é da estrutura", async () => {
    ver();
    abrirSeparador(/^Estrutura/);
    expect(within(await abrirDetalhe("Mesa grande")).queryByTestId("detalhe-quem-paga")).not.toBeInTheDocument();
    cleanup();
    const armazem = ativo({
      id: "w", nome: "Armazém Porto", tipo: "instalacoes", forma: "alugado", dataCompra: null, valorCompra: null, vidaMeses: null,
      rendaMensal: 900, inicioAluguer: "2026-01-01", fimAluguer: null,
    });
    m.dados = { ...DADOS, estrutura: [armazem] };
    ver();
    abrirSeparador(/^Estrutura/);
    const quem = within(within(await abrirDetalhe("Armazém Porto")).getByTestId("detalhe-quem-paga"));
    expect(quem.getByText(/o custo é sempre da estrutura/)).toBeInTheDocument();
    expect(norm(quem.getByTestId("quem-estrutura").textContent)).toContain("5400,00 € em 6 meses");
    expect(quem.queryByTestId("quem-pessoa-0")).not.toBeInTheDocument();
  });
});

describe("Ativos: o armazém do Stock e o valor em produtos", () => {
  const ARMAZEM = (parcial: Partial<Ativo> = {}): Ativo => ativo({
    id: "w", nome: "Armazém Porto", tipo: "instalacoes", valorCompra: 60000, vidaMeses: 600, armazemLigado: true,
    armazem: { id: "w1", nome: "Porto", apagado: false }, ...parcial,
  });
  const verArmazem = async (parcial: Partial<Ativo> = {}) => {
    m.dados = { ...DADOS, estrutura: [ARMAZEM(parcial)] };
    ver();
    abrirSeparador(/^Estrutura/);
    return within(await abrirDetalhe("Armazém Porto"));
  };

  it("com inventory.view e products.view_cost: o nome do armazém e o valor em produtos, que NÃO entra nos totais", async () => {
    m.permissoes = ["ativos.view", "inventory.view", "products.view_cost"];
    m.valorStock = { valor: 12345.6, aCarregar: false, falhou: false };
    const d = await verArmazem();
    expect(d.getByTestId("detalhe-armazem-nome")).toHaveTextContent("Porto");
    expect(norm(d.getByTestId("detalhe-armazem-valor").textContent)).toBe("12 345,60 €");
    expect(d.getByText(/Não entra nos totais dos ativos/)).toBeInTheDocument();
    // O total de estrutura só tem a conta do armazém (60 000 € a 600 meses = 100 € por mês, 6 meses): 59 400 €; os 12 345,60 € nunca somam.
    expect(norm(screen.getByTestId("total-atual").textContent)).toBe("59 400,00 €");
  });

  it("sem products.view_cost (mesmo com inventory.view) o valor em produtos não aparece, e a ficha não dá erro", async () => {
    m.permissoes = ["ativos.view", "inventory.view"];
    const d = await verArmazem();
    expect(d.getByTestId("detalhe-armazem-nome")).toHaveTextContent("Porto");
    expect(d.queryByTestId("detalhe-armazem-valor")).not.toBeInTheDocument();
    expect(d.queryByText(/Não entra nos totais dos ativos/)).not.toBeInTheDocument();
  });

  it("sem inventory.view a ficha diz que está ligado a um armazém, sem dizer qual", async () => {
    m.permissoes = ["ativos.view"];
    const d = await verArmazem({ armazem: null });
    expect(d.getByTestId("detalhe-armazem-nome")).toHaveTextContent("Ligado a um armazém. Só quem vê o Stock vê qual.");
    expect(d.queryByTestId("detalhe-armazem-valor")).not.toBeInTheDocument();
  });

  it("um armazém apagado no Stock: o ativo fica, a ficha diz-o e o valor aparece «—»", async () => {
    m.permissoes = ["ativos.view", "inventory.view", "products.view_cost"];
    const d = await verArmazem({ armazem: { id: "w1", nome: "Porto", apagado: true } });
    expect(d.getByTestId("detalhe-armazem-apagado")).toHaveTextContent("O armazém foi apagado no Stock.");
    expect(d.getByTestId("detalhe-armazem-valor")).toHaveTextContent("—");
  });

  it("a leitura do valor falhada (recusa) esconde só essa linha", async () => {
    m.permissoes = ["ativos.view", "inventory.view", "products.view_cost"];
    m.valorStock = { valor: null, aCarregar: false, falhou: true };
    const d = await verArmazem();
    expect(d.getByTestId("detalhe-armazem-nome")).toHaveTextContent("Porto");
    expect(d.queryByTestId("detalhe-armazem-valor")).not.toBeInTheDocument();
  });

  it("um ativo que não está ligado a nenhum armazém não tem a secção", async () => {
    ver();
    abrirSeparador(/^Estrutura/);
    expect(within(await abrirDetalhe("Mesa grande")).queryByTestId("detalhe-armazem")).not.toBeInTheDocument();
  });
});

describe("Ativos: as ações da ficha continuam por permissão", () => {
  it("só com ativos.edit há Editar, Desativar e Reativar; só com ativos.view, nenhuma", async () => {
    m.dados = { ...DADOS, pessoa: [VIATURA()] };
    ver();
    abrirSeparador(/^Pessoas/);
    const d = within(await abrirDetalhe("Carrinha"));
    for (const nome of ["Editar", "Desativar", "Reativar"]) expect(d.queryByRole("button", { name: nome })).not.toBeInTheDocument();
  });

  it("um alugado entregue não se desativa (diz que se devolve primeiro no RH); um livre sim, com a data a partir do início do contrato", async () => {
    m.permissoes = EDITAR;
    m.dados = { ...DADOS, pessoa: [VIATURA({ ligado: true }), VIATURA({ id: "v2", nome: "Carrinha livre", ocupacoes: [OC({ entrega: "2026-01-01", devolucao: "2026-03-31", contaDesde: "2026-01-01" })] })] };
    ver();
    abrirSeparador(/^Pessoas/);
    expect(within(await abrirDetalhe("Carrinha")).getByTestId("detalhe-desativar-bloqueado")).toBeInTheDocument();
    cleanup();
    ver();
    abrirSeparador(/^Pessoas/);
    fireEvent.click(within(await abrirDetalhe("Carrinha livre")).getByRole("button", { name: "Desativar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Desativar ativo" });
    // Não se desativa antes da última devolução (ATV29): o campo diz o mínimo.
    expect(within(dialogo).getByLabelText(/Data de desativação/)).toHaveAttribute("min", "2026-03-31");
  });
});
