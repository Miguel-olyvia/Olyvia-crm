// O painel de criar e editar um ativo: o que se pede em cada grupo, as validações no ecrã, os argumentos exatos das RPCs e os erros da base
// (ATV02 a ATV18) traduzidos junto do campo. As escritas e as opções são simuladas (vi.fn); aqui vê-se o que o ecrã envia e mostra.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { Ativo, OpcoesAtivo } from "./lib/tipos";

const m = vi.hoisted(() => ({
  criar: vi.fn(),
  alterar: vi.fn(),
  opcoes: null as unknown,
  erroOpcoes: null as string | null,
  opcoesLigadas: vi.fn(),
}));
vi.mock("@/hooks/useCountries", () => ({ useCountries: () => ({ countries: [], loading: false, error: null }) }));
vi.mock("@/hooks/ativos/useAtivoMutacoes", () => ({ useAtivoMutacoes: () => ({ criar: m.criar, alterar: m.alterar }) }));
vi.mock("@/hooks/ativos/useAtivosOpcoes", () => ({
  useAtivosOpcoes: (ligado: boolean) => { m.opcoesLigadas(ligado); return { opcoes: m.opcoes, erro: m.erroOpcoes, aCarregar: false }; },
}));

import { AtivoSheet } from "./AtivoSheet";

const OPCOES: OpcoesAtivo = {
  equipamentos: [
    { id: "c1", nome: "Berbequim", vidaAnos: 5, vidaHoras: null },
    { id: "c2", nome: "Compressor", vidaAnos: null, vidaHoras: 3000 },
  ],
  centrosCusto: [{ id: "cc1", nome: "Obras" }],
};

const EXISTENTE: Ativo = {
  id: "a1", grupo: "estrutura", tipo: "mobiliario", nome: "Mesa grande", codigo: "M-01", numSerie: null, catEquipamentoId: null,
  dataCompra: "2026-01-15", valorCompra: 1200, valorResidual: 200, vidaMeses: 60, manutencaoAno: 0, centroCustoId: null,
  localizacao: "Armazém", notas: null, estado: "ativo", desativadoEm: null, desativadoMotivo: null, desativadoNota: null,
  catEquipamento: null, atribuicao: null,
};

const aoFechar = vi.fn();
const aoGuardar = vi.fn();

function abrir(grupo: "servico" | "estrutura" | "pessoa", ativo: Ativo | null = null) {
  return render(
    <LanguageProvider>
      <AtivoSheet aberto grupo={grupo} ativo={ativo} aoFechar={aoFechar} aoGuardar={aoGuardar} />
    </LanguageProvider>,
  );
}

const campo = (nome: RegExp) => screen.getByLabelText(nome) as HTMLInputElement;
const escrever = (nome: RegExp, valor: string) => fireEvent.change(campo(nome), { target: { value: valor } });
function escolher(nome: RegExp, opcao: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: nome }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}
const guardar = () => fireEvent.click(screen.getByRole("button", { name: /^Guardar/ }));

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  m.criar.mockReset().mockResolvedValue({ ok: true, id: "novo" });
  m.alterar.mockReset().mockResolvedValue({ ok: true, id: "a1" });
  m.opcoes = OPCOES;
  m.erroOpcoes = null;
  aoFechar.mockReset();
  aoGuardar.mockReset();
  m.opcoesLigadas.mockReset();
});
afterEach(cleanup);

describe("AtivoSheet: o que se pede em cada grupo", () => {
  it("Serviço pede o modelo do catálogo (obrigatório); a vida é opcional e diz que usa a do modelo", () => {
    abrir("servico");
    expect(screen.getByRole("combobox", { name: /Modelo do catálogo/ })).toHaveAttribute("aria-required", "true");
    expect(screen.queryByRole("combobox", { name: /^Tipo/ })).not.toBeInTheDocument();
    expect(campo(/Vida útil/)).not.toBeRequired();
    expect(screen.getByText(/Vazio: usa a vida do modelo/)).toBeInTheDocument();
  });

  it("escolher o modelo diz quantos anos tem e preenche o nome vazio", () => {
    abrir("servico");
    escolher(/Modelo do catálogo/, "Berbequim");
    expect(screen.getByText("Vazio: usa a vida do modelo (5 anos).")).toBeInTheDocument();
    expect(campo(/^Nome/).value).toBe("Berbequim");
  });

  it("Estrutura não mostra o seletor de modelo e pede o tipo e a vida", () => {
    abrir("estrutura");
    expect(screen.queryByRole("combobox", { name: /Modelo do catálogo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^Tipo/ })).toBeInTheDocument();
    expect(campo(/Vida útil/)).toBeRequired();
  });

  it("Pessoas pede o tipo (os seis do RH) e a vida", () => {
    abrir("pessoa");
    fireEvent.keyDown(screen.getByRole("combobox", { name: /^Tipo/ }), { key: "Enter" });
    // A primeira linha é o convite «Escolha o tipo» (o campo mostra-o enquanto nada está escolhido).
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Escolha o tipo", "Telemóvel", "Portátil", "Viatura", "Fardamento", "Ferramentas", "Outro"]);
    expect(campo(/Vida útil/)).toBeRequired();
  });

  it("os seletores só pedem as opções com o painel aberto", () => {
    abrir("servico");
    expect(m.opcoesLigadas).toHaveBeenLastCalledWith(true);
  });

  it("falha a carregar as opções: avisa (role=alert) e não deixa o painel parecer vazio", () => {
    m.opcoes = null;
    m.erroOpcoes = "As opções falharam";
    abrir("servico");
    expect(screen.getByRole("alert")).toHaveTextContent("As opções falharam");
  });
});

describe("AtivoSheet: validações no ecrã (nada vai à base)", () => {
  it("Serviço sem modelo fica bloqueado com o texto do desenho", () => {
    abrir("servico");
    escrever(/^Nome/, "Berbequim 1");
    escrever(/Valor de compra/, "300");
    escrever(/Data de compra/, "2026-03-01");
    guardar();
    expect(screen.getByText("Escolha o modelo do catálogo a que este equipamento pertence.")).toBeInTheDocument();
    expect(m.criar).not.toHaveBeenCalled();
  });

  it("residual maior do que a compra fica bloqueado", () => {
    abrir("estrutura");
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Data de compra/, "2026-03-01");
    escrever(/Valor de compra/, "100");
    escrever(/Valor residual/, "150");
    escrever(/Vida útil/, "12");
    guardar();
    expect(screen.getByText("O valor residual não pode ser maior do que o valor de compra.")).toBeInTheDocument();
    expect(campo(/Valor residual/)).toHaveAttribute("aria-invalid", "true");
    expect(m.criar).not.toHaveBeenCalled();
  });

  it.each(["0", "601", "12,5", "abc"])("vida de «%s» meses não é aceite (1 a 600, inteiro)", (vida) => {
    abrir("pessoa");
    escrever(/^Nome/, "Portátil");
    escolher(/^Tipo/, "Portátil");
    escrever(/Data de compra/, "2026-03-01");
    escrever(/Valor de compra/, "900");
    escrever(/Vida útil/, vida);
    guardar();
    expect(screen.getByText("A vida útil tem de ser um número inteiro de meses, de 1 a 600.")).toBeInTheDocument();
    expect(m.criar).not.toHaveBeenCalled();
  });

  it("vida de 1 e de 600 meses passam", async () => {
    for (const vida of ["1", "600"]) {
      m.criar.mockClear();
      const { unmount } = abrir("estrutura");
      escrever(/^Nome/, "Armazém");
      escolher(/^Tipo/, "Instalações");
      escrever(/Data de compra/, "2026-03-01");
      escrever(/Valor de compra/, "60000");
      escrever(/Vida útil/, vida);
      guardar();
      await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
      unmount();
    }
  });

  it("Estrutura e Pessoas pedem a vida: vazia fica bloqueada", () => {
    abrir("estrutura");
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Data de compra/, "2026-03-01");
    escrever(/Valor de compra/, "100");
    guardar();
    expect(screen.getByText("Indique a vida útil, de 1 a 600 meses.")).toBeInTheDocument();
  });

  it("sem data de compra e com valor de compra a zero ficam bloqueados, e o foco vai para o primeiro campo com erro", () => {
    abrir("estrutura");
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Vida útil/, "12");
    escrever(/Valor de compra/, "0");
    guardar();
    expect(screen.getByText("Indique uma data de compra válida.")).toBeInTheDocument();
    expect(screen.getByText("O valor de compra tem de ser maior do que zero.")).toBeInTheDocument();
    expect(document.activeElement).toBe(campo(/Data de compra/));
  });
});

describe("AtivoSheet: o que se envia à base", () => {
  it("criar um ativo de serviço: rpc de criar com o grupo e os parâmetros certos", async () => {
    abrir("servico");
    escolher(/Modelo do catálogo/, "Berbequim");
    escrever(/^Nome/, "Berbequim nº 2");
    escrever(/Data de compra/, "2026-03-01");
    escrever(/Valor de compra/, "1 234,50");
    escrever(/Valor residual/, "100");
    escrever(/Manutenção por ano/, "50");
    escrever(/Código/, " B-02 ");
    escolher(/Centro de custo/, "Obras");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("servico", {
      p_nome: "Berbequim nº 2", p_tipo: null, p_cat_equipamento_id: "c1", p_data_compra: "2026-03-01", p_valor_compra: 1234.5,
      p_valor_residual: 100, p_vida_meses: null, p_manutencao_ano: 50, p_codigo: "B-02", p_num_serie: null, p_centro_custo_id: "cc1",
      p_localizacao: null, p_notas: null,
    });
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(aoGuardar).toHaveBeenCalledWith({ nome: "Berbequim nº 2", edicao: false });
  });

  it("criar de pessoa: tipo e vida seguem, sem modelo; residual e manutenção vazios vão a 0", async () => {
    abrir("pessoa");
    escrever(/^Nome/, "Portátil 7");
    escolher(/^Tipo/, "Portátil");
    escrever(/Data de compra/, "2026-02-10");
    escrever(/Valor de compra/, "900");
    escrever(/Vida útil/, "36");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("pessoa", expect.objectContaining({
      p_tipo: "portatil", p_cat_equipamento_id: null, p_vida_meses: 36, p_valor_residual: 0, p_manutencao_ano: 0, p_valor_compra: 900,
    }));
  });

  it("editar: rpc de alterar com o id e sem o grupo; o grupo aparece só para ler", async () => {
    abrir("estrutura", EXISTENTE);
    expect(screen.getByRole("heading", { name: "Editar ativo" })).toBeInTheDocument();
    expect(screen.getByText("Estrutura", { selector: "[data-testid='grupo-do-ativo']" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /^Grupo/ })).not.toBeInTheDocument();
    expect(campo(/^Nome/).value).toBe("Mesa grande");
    expect(campo(/Valor de compra/).value).toBe("1200");
    expect(campo(/Vida útil/).value).toBe("60");
    escrever(/^Nome/, "Mesa grande nova");
    guardar();
    await waitFor(() => expect(m.alterar).toHaveBeenCalledTimes(1));
    const [id, args] = m.alterar.mock.calls[0];
    expect(id).toBe("a1");
    expect(args).toMatchObject({ p_nome: "Mesa grande nova", p_tipo: "mobiliario", p_valor_compra: 1200, p_valor_residual: 200, p_vida_meses: 60, p_codigo: "M-01", p_localizacao: "Armazém" });
    expect(args).not.toHaveProperty("p_grupo");
    expect(m.criar).not.toHaveBeenCalled();
    expect(aoGuardar).toHaveBeenCalledWith({ nome: "Mesa grande nova", edicao: true });
  });

  it("um duplo clique em Guardar envia uma só vez", async () => {
    let resolver: (v: unknown) => void = () => {};
    m.criar.mockReturnValue(new Promise((r) => { resolver = r; }));
    abrir("estrutura");
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Data de compra/, "2026-03-01");
    escrever(/Valor de compra/, "100");
    escrever(/Vida útil/, "12");
    guardar();
    guardar();
    expect(m.criar).toHaveBeenCalledTimes(1);
    resolver({ ok: true, id: "x" });
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
  });
});

describe("AtivoSheet: os erros da base, traduzidos", () => {
  function preencherEstrutura() {
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Data de compra/, "2026-03-01");
    escrever(/Valor de compra/, "100");
    escrever(/Vida útil/, "12");
  }

  it.each([
    ["ATV12", "Já existe um ativo com este código.", /Código/],
    ["ATV09", "O valor residual não pode ser maior do que o valor de compra.", /Valor residual/],
    ["ATV05", "Escolha o modelo do catálogo a que este equipamento pertence.", /Modelo do catálogo/],
  ])("%s aparece junto do campo, em português", async (codigo, texto, rotulo) => {
    m.criar.mockResolvedValue({ ok: false, codigo, mensagem: texto });
    abrir(codigo === "ATV05" ? "servico" : "estrutura");
    if (codigo === "ATV05") {
      escolher(/Modelo do catálogo/, "Berbequim");
      escrever(/^Nome/, "B1"); escrever(/Data de compra/, "2026-03-01"); escrever(/Valor de compra/, "100");
    } else preencherEstrutura();
    guardar();
    await waitFor(() => expect(screen.getAllByText(texto).length).toBeGreaterThan(0));
    expect(aoFechar).not.toHaveBeenCalled();
    const alvo = rotulo.source.startsWith("Modelo") ? screen.getByRole("combobox", { name: rotulo }) : campo(rotulo);
    expect(alvo).toHaveAttribute("aria-invalid", "true");
  });

  it("um erro sem campo (ATV17, 42501) mostra-se num aviso role=alert e o painel fica aberto", async () => {
    m.criar.mockResolvedValue({ ok: false, codigo: null, mensagem: "Não tem permissão para gerir ativos." });
    abrir("estrutura");
    preencherEstrutura();
    guardar();
    const aviso = await screen.findByRole("alert");
    expect(within(aviso).getByText("Não tem permissão para gerir ativos.")).toBeInTheDocument();
    expect(aoFechar).not.toHaveBeenCalled();
  });
});
