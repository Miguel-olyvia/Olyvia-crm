// O ecrã do equipamento que é um ativo (aba Custo da ficha): a lista (rótulos, botões de corrigir só com ativos.edit), «Atribuir equipamento»
// (Comprado, Alugado, Já existe e está livre; a farda fica como hoje) e «Corrigir equipamento» / «Corrigir datas». Hooks da base simulados.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { contaRepartida, contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import type { AtivoDoEquipamento, EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import type { EquipamentoLivre } from "@/hooks/hr/useEquipamentosLivres";

const estado = vi.hoisted(() => ({
  permissoes: [] as string[],
  pessoasDoAtivo: 2 as number | null,
  livres: [] as unknown[],
  acoes: { atribuir: vi.fn(), devolver: vi.fn(), alterarConta: vi.fn(), corrigir: vi.fn() },
}));

vi.mock("@/contexts/PermissionsContext", () => ({
  usePermissionsOpcional: () => ({ hasPermission: (p: string) => estado.permissoes.includes(p) }),
}));
vi.mock("@/components/rh-exemplo/hooks/useEquipamentosCusto", () => ({
  useEquipamentosCustoAcoes: () => estado.acoes,
  useEquipamentosCusto: () => ({ equipamentos: [], aCarregar: false, erro: null, ...estado.acoes }),
}));
vi.mock("@/hooks/hr/useEquipamentosLivres", () => ({
  useEquipamentosLivres: () => ({ livres: estado.livres, aCarregar: false, erro: null }),
  useOcupacoesDoAtivo: () => ({ pessoas: estado.pessoasDoAtivo, aCarregar: false }),
}));
vi.mock("@/hooks/ativos/useAtivosOpcoes", () => ({
  useAtivosOpcoes: () => ({ opcoes: { equipamentos: [{ id: "cat-1", nome: "Berbequim", vidaAnos: 5, vidaHoras: null }, { id: "cat-2", nome: "Sem vida", vidaAnos: null, vidaHoras: 800 }], centrosCusto: [] }, aCarregar: false, erro: null }),
}));

import { CustoEquipamentos } from "./CustoEquipamentos";
import { EquipamentoSheet } from "./EquipamentoSheet";

const PORTATIL: AtivoDoEquipamento = {
  forma: "comprado", codigo: "PC-0001", nome: "Portátil 14", tipo: "portatil", estado: "ativo", valorCompra: 1200, valorResidual: 0,
  dataCompra: "2026-01-05", vidaMeses: 36, vidaOrigem: "pagamento", desativadoEm: null,
};
const VIATURA: AtivoDoEquipamento = {
  forma: "alugado", codigo: "VIA-0001", nome: "Viatura de serviço", tipo: "viatura", estado: "ativo", rendaMensal: 450, inicioAluguer: "2026-01-01",
  fimAluguer: null, desativadoEm: null,
};
const linha = (p: Partial<EquipamentoPessoa> & Pick<EquipamentoPessoa, "id">): EquipamentoPessoa => ({
  pessoaId: "p1", tipo: "portatil", descricao: "Portátil 14", valor: 1200, entrega: "2026-01-10", conta: contaUmaVez(), estado: "atribuido",
  devolucao: null, estadoDevolucao: null, autor: "", ...p,
});
const EQUIPAMENTOS: EquipamentoPessoa[] = [
  linha({ id: "e-portatil", ativoId: "at-1", ativo: PORTATIL, contaDesde: "2026-01-10" }),
  linha({ id: "e-viatura", tipo: "viatura", descricao: "Viatura de serviço", valor: 450, entrega: "2026-02-01", ativoId: "at-2", ativo: VIATURA, contaDesde: "2026-02-01" }),
  linha({ id: "e-farda", tipo: "fardamento", descricao: "Colete", valor: 36, entrega: "2026-03-02", conta: contaRepartida(12), ativoId: null, ativo: null }),
];

const renderizar = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  window.localStorage.setItem("language", "pt");
  estado.permissoes = [];
  estado.pessoasDoAtivo = 2;
  estado.livres = [];
  for (const a of Object.values(estado.acoes)) a.mockReset();
  estado.acoes.atribuir.mockResolvedValue({ ok: true, erro: null, mensagem: null, id: "novo" });
  estado.acoes.corrigir.mockResolvedValue({ ok: true, erro: null, mensagem: null, pessoasAfetadas: 2 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const lista = (podeGerir = true) =>
  renderizar(<CustoEquipamentos pessoaId="p1" pessoaNome="Ana" mes="2026-10" autor="RH" equipamentos={EQUIPAMENTOS} podeGerir={podeGerir} />);

describe("a lista de equipamentos com ativo", () => {
  it("mostra o código do ativo e o rótulo vindo do ativo: «Comprado, 36 meses» e «Alugado, 450,00 € por mês»", () => {
    lista();
    const tabela = screen.getByRole("table", { name: "Equipamentos atribuídos" });
    expect(within(tabela).getByText("PC-0001")).toBeInTheDocument();
    expect(within(tabela).getByText("Comprado, 36 meses")).toBeInTheDocument();
    expect(within(tabela).getByText(/Alugado, .*450,00.* por mês/)).toBeInTheDocument();
    // A farda continua com o «como conta» da linha.
    expect(within(tabela).getByText("Repartido por 12 meses")).toBeInTheDocument();
    expect(screen.getByText(/conta no mês de quem o tem no último dia do mês/)).toBeInTheDocument();
  });

  it("o mês de outubro conta a quota (33,33 €) e a renda (450 €); a farda de 36 € em 12 meses conta 3 €", () => {
    lista();
    const tabela = screen.getByRole("table", { name: "Equipamentos atribuídos" });
    const linhaDe = (texto: string) => within(tabela).getByText(texto).closest("tr") as HTMLElement;
    expect(linhaDe("Portátil 14")).toHaveTextContent(/33,33/);
    expect(linhaDe("Viatura de serviço")).toHaveTextContent(/450,00/);
    expect(linhaDe("Colete")).toHaveTextContent(/3,00/);
  });

  it("sem ativos.edit não há «Corrigir»: diz «Para corrigir, peça a um administrador»; a farda continua a poder «Alterar como conta»", () => {
    estado.permissoes = [];
    lista();
    expect(screen.queryByRole("button", { name: /Corrigir equipamento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Corrigir datas/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Para corrigir, peça a um administrador")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Alterar como conta de Colete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alterar como conta de Portátil 14" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alterar como conta de Viatura de serviço" })).not.toBeInTheDocument();
  });

  it("a permissão das retribuições (hr.pessoas.retribuicao.edit) NÃO chega para corrigir: só ativos.edit", () => {
    estado.permissoes = ["hr.pessoas.retribuicao.edit", "hr.pessoas.retribuicao.view"];
    lista();
    expect(screen.queryByRole("button", { name: /Corrigir equipamento/ })).not.toBeInTheDocument();
  });

  it("com ativos.edit aparecem «Corrigir equipamento» e «Corrigir datas» nas linhas com ativo, e não na farda", () => {
    estado.permissoes = ["ativos.edit"];
    lista();
    expect(screen.getByRole("button", { name: "Corrigir equipamento Portátil 14" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Corrigir datas de Viatura de serviço" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Corrigir equipamento Colete/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Para corrigir, peça a um administrador")).not.toBeInTheDocument();
  });

  it("só para ver (sem editar o RH) não há nenhum botão", () => {
    lista(false);
    expect(screen.queryByRole("button", { name: /Corrigir|Devolver|Alterar/ })).not.toBeInTheDocument();
  });
});

describe("«Corrigir equipamento»", () => {
  const abrir = () => {
    estado.permissoes = ["ativos.edit"];
    lista();
    fireEvent.click(screen.getByRole("button", { name: "Corrigir equipamento Portátil 14" }));
    return screen.getByRole("dialog");
  };

  it("avisa ANTES de confirmar a quantas pessoas muda o custo em meses passados", () => {
    const d = abrir();
    expect(within(d).getByRole("note")).toHaveTextContent("Isto muda o custo de 2 pessoas em meses passados.");
  });

  it("sem o número (sem ativos.view) mostra o aviso geral", () => {
    estado.pessoasDoAtivo = null;
    const d = abrir();
    expect(within(d).getByRole("note")).toHaveTextContent("Isto pode mudar o custo de pessoas em meses passados.");
  });

  it("sem mudar nada não vai à base e diz que não mudou nada", async () => {
    const d = abrir();
    fireEvent.click(within(d).getByRole("button", { name: "Guardar correção" }));
    expect(await within(d).findByRole("alert")).toHaveTextContent("Não mudou nada.");
    expect(estado.acoes.corrigir).not.toHaveBeenCalled();
  });

  it("corrigir o valor manda só esse campo, com o id do ativo", async () => {
    const d = abrir();
    fireEvent.change(within(d).getByLabelText(/Valor de aquisição/), { target: { value: "1300" } });
    fireEvent.click(within(d).getByRole("button", { name: "Guardar correção" }));
    await waitFor(() => expect(estado.acoes.corrigir).toHaveBeenCalledWith("at-1", { campos: ["valor_compra"], valorCompra: 1300 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("mostra a recusa da base (sem texto cru) e não fecha", async () => {
    estado.acoes.corrigir.mockResolvedValue({ ok: false, erro: null, mensagem: "Para corrigir um equipamento precisa da permissão de editar ativos. Peça a um administrador.", pessoasAfetadas: null });
    const d = abrir();
    fireEvent.change(within(d).getByLabelText(/Valor de aquisição/), { target: { value: "1300" } });
    fireEvent.click(within(d).getByRole("button", { name: "Guardar correção" }));
    expect(await within(d).findByRole("alert")).toHaveTextContent(/permissão de editar ativos/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("um alugado corrige a renda e as datas do contrato (não o valor de compra)", async () => {
    estado.permissoes = ["ativos.edit"];
    lista();
    fireEvent.click(screen.getByRole("button", { name: "Corrigir equipamento Viatura de serviço" }));
    const d = screen.getByRole("dialog");
    expect(within(d).queryByLabelText(/Valor de aquisição/)).not.toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText(/Renda mensal/), { target: { value: "480" } });
    fireEvent.click(within(d).getByRole("button", { name: "Guardar correção" }));
    await waitFor(() => expect(estado.acoes.corrigir).toHaveBeenCalledWith("at-2", { campos: ["renda_mensal"], rendaMensal: 480 }));
  });
});

describe("«Corrigir datas»", () => {
  it("corrige a entrega desta linha: leva a ocupação e só a data que mudou", async () => {
    estado.permissoes = ["ativos.edit"];
    lista();
    fireEvent.click(screen.getByRole("button", { name: "Corrigir datas de Portátil 14" }));
    const d = screen.getByRole("dialog");
    expect(within(d).queryByLabelText(/Data de devolução/)).not.toBeInTheDocument();
    expect(within(d).getByText(/o dia da devolução conta/)).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText(/Data de entrega/), { target: { value: "2026-01-12" } });
    fireEvent.click(within(d).getByRole("button", { name: "Guardar correção" }));
    await waitFor(() => expect(estado.acoes.corrigir).toHaveBeenCalledWith("at-1", { campos: ["entrega"], pessoaEquipamentoId: "e-portatil", entrega: "2026-01-12" }));
  });
});

describe("«Atribuir equipamento»", () => {
  const abrirSheet = () => {
    renderizar(<EquipamentoSheet aberto pessoaId="p1" pessoas={[{ id: "p1", nome: "Ana" }]} aoFechar={() => undefined} />);
    return screen.getByRole("dialog");
  };
  const escolherTipo = (painel: HTMLElement, nome: string) => {
    fireEvent.keyDown(within(painel).getByRole("combobox", { name: /^Tipo/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: nome }));
  };

  it("oferece Comprado (por omissão), Alugado e «Já existe e está livre»; só a farda tem «Como conta»", () => {
    const p = abrirSheet();
    const grupo = within(p).getByRole("radiogroup", { name: "O que vai entregar?" });
    expect(within(grupo).getAllByRole("radio")).toHaveLength(3);
    expect(within(grupo).getByRole("radio", { name: /Comprado/ })).toHaveAttribute("aria-checked", "true");
    expect(within(grupo).getByRole("radio", { name: /Alugado/ })).toBeInTheDocument();
    expect(within(grupo).getByRole("radio", { name: /Já existe e está livre/ })).toBeInTheDocument();
    expect(within(p).queryByRole("radiogroup", { name: "Como conta" })).not.toBeInTheDocument();
    escolherTipo(p, "Fardamento");
    expect(within(p).queryByRole("radiogroup", { name: "O que vai entregar?" })).not.toBeInTheDocument();
    expect(within(p).getByRole("radiogroup", { name: "Como conta" })).toBeInTheDocument();
  });

  it("comprado: manda sempre a vida (meses de pagamento por omissão, 36) e a data de compra vazia vai nula", async () => {
    const p = abrirSheet();
    fireEvent.change(within(p).getByLabelText(/Descrição/), { target: { value: "Portátil 15" } });
    fireEvent.change(within(p).getByLabelText(/Valor de aquisição/), { target: { value: "1200" } });
    fireEvent.change(within(p).getByLabelText(/Data de entrega/), { target: { value: "2026-10-01" } });
    expect(within(p).getByRole("status")).toHaveTextContent(/1\s?200,00.* amortizados em 36 meses = 33,33.* por mês, a partir de outubro de 2026/);
    fireEvent.click(within(p).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(estado.acoes.atribuir).toHaveBeenCalledTimes(1));
    expect(estado.acoes.atribuir).toHaveBeenCalledWith(expect.objectContaining({
      pessoaId: "p1", forma: "comprado", tipo: "portatil", descricao: "Portátil 15", valor: 1200, entrega: "2026-10-01", dataCompra: null,
      vidaMeses: 36, vidaOrigem: "pagamento", catEquipamentoId: null,
    }));
  });

  it("comprado à mão: a vida escrita (60) vai com a origem «manual»", async () => {
    const p = abrirSheet();
    fireEvent.change(within(p).getByLabelText(/Descrição/), { target: { value: "Máquina" } });
    fireEvent.change(within(p).getByLabelText(/Valor de aquisição/), { target: { value: "600" } });
    fireEvent.click(within(p).getByRole("radio", { name: /Escrever à mão/ }));
    fireEvent.change(within(p).getByLabelText(/Vida útil em meses/), { target: { value: "60" } });
    fireEvent.click(within(p).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(estado.acoes.atribuir).toHaveBeenCalledWith(expect.objectContaining({ vidaMeses: 60, vidaOrigem: "manual" })));
  });

  it("a vida do catálogo só se oferece a quem tem ativos.edit, e manda o equipamento do catálogo e os meses (5 anos = 60)", async () => {
    const p1 = abrirSheet();
    expect(within(p1).queryByRole("radio", { name: /Do equipamento do catálogo/ })).not.toBeInTheDocument();
    cleanup();
    estado.permissoes = ["ativos.edit"];
    const p = abrirSheet();
    fireEvent.change(within(p).getByLabelText(/Descrição/), { target: { value: "Berbequim Bosch" } });
    fireEvent.change(within(p).getByLabelText(/Valor de aquisição/), { target: { value: "300" } });
    fireEvent.click(within(p).getByRole("radio", { name: /Do equipamento do catálogo/ }));
    fireEvent.keyDown(within(p).getByRole("combobox", { name: /Do equipamento do catálogo/ }), { key: "Enter" });
    // Só aparecem os que têm vida em anos.
    expect(screen.queryByRole("option", { name: /Sem vida/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Berbequim/ }));
    fireEvent.click(within(p).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(estado.acoes.atribuir).toHaveBeenCalledWith(expect.objectContaining({ vidaMeses: 60, vidaOrigem: "catalogo", catEquipamentoId: "cat-1" })));
  });

  it("alugado: pede renda e datas do contrato, não tem vida nem valor de compra, e manda a renda com o início (a entrega por omissão)", async () => {
    const p = abrirSheet();
    fireEvent.click(within(p).getByRole("radio", { name: /Alugado/ }));
    expect(within(p).queryByLabelText(/Valor de aquisição/)).not.toBeInTheDocument();
    expect(within(p).queryByLabelText(/Vida útil/)).not.toBeInTheDocument();
    fireEvent.change(within(p).getByLabelText(/Descrição/), { target: { value: "Impressora em renting" } });
    fireEvent.change(within(p).getByLabelText(/Renda mensal/), { target: { value: "45" } });
    fireEvent.change(within(p).getByLabelText(/Data de entrega/), { target: { value: "2026-10-01" } });
    fireEvent.click(within(p).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(estado.acoes.atribuir).toHaveBeenCalledWith(expect.objectContaining({
      forma: "alugado", tipo: "portatil", descricao: "Impressora em renting", rendaMensal: 45, inicioAluguer: "2026-10-01", fimAluguer: null,
    })));
  });

  it("viatura alugada mostra o aviso fixo da Frota; outro tipo alugado não", () => {
    const p = abrirSheet();
    fireEvent.click(within(p).getByRole("radio", { name: /Alugado/ }));
    expect(within(p).queryByRole("note")).not.toBeInTheDocument();
    escolherTipo(p, "Viatura");
    expect(within(p).getByRole("note")).toHaveTextContent(/Se esta viatura também está na Frota com renda, a renda fica em dois sítios/);
  });

  it("alugado com a entrega antes do início do contrato: mostra o erro junto do formulário, com texto claro", async () => {
    estado.acoes.atribuir.mockImplementation(async () => ({ ok: false, erro: "entregaAntesDoInicio", mensagem: null, id: null }));
    const p = abrirSheet();
    fireEvent.click(within(p).getByRole("radio", { name: /Alugado/ }));
    fireEvent.change(within(p).getByLabelText(/Descrição/), { target: { value: "Carrinha" } });
    fireEvent.change(within(p).getByLabelText(/Renda mensal/), { target: { value: "300" } });
    fireEvent.change(within(p).getByLabelText(/Início do aluguer/), { target: { value: "2026-11-01" } });
    fireEvent.click(within(p).getByRole("button", { name: "Atribuir" }));
    expect(await within(p).findByRole("alert")).toHaveTextContent("A entrega não pode ser antes do início do aluguer.");
  });

  it("«Já existe e está livre»: lista os livres, mostra o que já se amortizou e o que falta (466,62 € e 733,38 € em 22 meses) e manda só o ativo", async () => {
    const livre: EquipamentoLivre = {
      id: "at-9", codigo: "PC-0009", nome: "Portátil 9", tipo: "portatil", ultimaDevolucao: "2028-01-10",
      ativo: { forma: "comprado", codigo: "PC-0009", nome: "Portátil 9", tipo: "portatil", estado: "ativo", valorCompra: 1200, valorResidual: 0, dataCompra: "2027-01-05", vidaMeses: 36, vidaOrigem: "pagamento", desativadoEm: null },
    };
    estado.livres = [livre];
    const p = abrirSheet();
    fireEvent.click(within(p).getByRole("radio", { name: /Já existe e está livre/ }));
    expect(within(p).queryByLabelText(/Valor de aquisição/)).not.toBeInTheDocument();
    fireEvent.change(within(p).getByLabelText(/Data de entrega/), { target: { value: "2028-03-15" } });
    fireEvent.keyDown(within(p).getByRole("combobox", { name: /Equipamento livre/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: /PC-0009 · Portátil 9 · Comprado/ }));
    expect(within(p).getByRole("status")).toHaveTextContent(/Já amortizado: 466,62.* Falta: 733,38.* em 22 meses/);
    expect(within(p).getByRole("status")).toHaveTextContent(/contam como custo da estrutura/);
    fireEvent.click(within(p).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(estado.acoes.atribuir).toHaveBeenCalledWith({ pessoaId: "p1", entrega: "2028-03-15", idPedido: expect.any(String), forma: "existente", ativoId: "at-9" }));
  });

  it("«Já existe»: uma viatura alugada livre também leva o aviso fixo da Frota", () => {
    estado.livres = [{
      id: "at-v", codigo: "VIA-0002", nome: "Carrinha", tipo: "viatura", ultimaDevolucao: null,
      ativo: { forma: "alugado", codigo: "VIA-0002", nome: "Carrinha", tipo: "viatura", estado: "ativo", rendaMensal: 300, inicioAluguer: "2026-01-01", fimAluguer: "2027-12-31", desativadoEm: null },
    } satisfies EquipamentoLivre];
    const p = abrirSheet();
    fireEvent.click(within(p).getByRole("radio", { name: /Já existe e está livre/ }));
    escolherTipo(p, "Viatura");
    fireEvent.keyDown(within(p).getByRole("combobox", { name: /Equipamento livre/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: /VIA-0002/ }));
    expect(within(p).getByRole("note")).toHaveTextContent(/a renda fica em dois sítios/);
    expect(within(p).getByRole("status")).toHaveTextContent(/Renda de .*300,00.* por mês, de 01\/01\/2026 a 31\/12\/2027/);
  });

  it("«Já existe» sem escolher nenhum é recusado com «Escolhe o equipamento.»", async () => {
    estado.acoes.atribuir.mockImplementation(async () => ({ ok: false, erro: "semAtivo", mensagem: null, id: null }));
    const p = abrirSheet();
    fireEvent.click(within(p).getByRole("radio", { name: /Já existe e está livre/ }));
    fireEvent.click(within(p).getByRole("button", { name: "Atribuir" }));
    expect(await within(p).findByRole("alert")).toHaveTextContent("Escolhe o equipamento.");
  });
});
