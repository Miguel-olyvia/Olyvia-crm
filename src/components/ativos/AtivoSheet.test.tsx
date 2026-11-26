// O painel de registar e editar um ativo (v2): os campos essenciais primeiro (grupo, equipamento do catálogo no serviço, nome, tipo, valor, data,
// vida), com valores por omissão, e os avançados numa secção recolhida; a regra «serviço precisa de equipamento do catálogo» é um passo
// guiado com pesquisa; os erros da base (ATV02 a ATV18) saem traduzidos junto do campo. As escritas e as opções são simuladas.
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
    { id: "c3", nome: "Andaime", vidaAnos: 10, vidaHoras: null },
  ],
  centrosCusto: [{ id: "cc1", nome: "Obras" }],
  armazens: [{ id: "w1", nome: "Armazém Porto", codigo: "ARM1" }, { id: "w2", nome: "Armazém Faro", codigo: null }],
  podeVerArmazens: true,
};

const EXISTENTE: Ativo = {
  id: "a1", grupo: "estrutura", tipo: "mobiliario", nome: "Mesa grande", codigo: "M-01", numSerie: null, catEquipamentoId: null,
  dataCompra: "2026-01-15", valorCompra: 1200, valorResidual: 200, vidaMeses: 60, manutencaoAno: 0, centroCustoId: null,
  localizacao: "Armazém", notas: null, estado: "ativo", desativadoEm: null, desativadoMotivo: null, desativadoNota: null,
  catEquipamento: null, atribuicao: null, ligado: false, forma: "comprado", rendaMensal: null, inicioAluguer: null, fimAluguer: null, vidaOrigem: null, armazem: null, armazemLigado: false, ocupacoes: [],
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
const maisDetalhes = () => fireEvent.click(screen.getByRole("button", { name: /Mais detalhes/ }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  window.localStorage.setItem("language", "pt");
  m.criar.mockReset().mockResolvedValue({ ok: true, id: "novo" });
  m.alterar.mockReset().mockResolvedValue({ ok: true, id: "a1" });
  m.opcoes = OPCOES;
  m.erroOpcoes = null;
  aoFechar.mockReset();
  aoGuardar.mockReset();
  m.opcoesLigadas.mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("AtivoSheet: poucos passos, o essencial primeiro", () => {
  it("o título é «Registar ativo» e o grupo escolhe-se aqui, já com o do separador marcado", () => {
    abrir("estrutura");
    expect(screen.getByRole("heading", { name: "Registar ativo" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Serviço/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Estrutura/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Pessoas/ })).not.toBeChecked();
  });

  it("valores por omissão: a data de hoje e a vida habitual do grupo (36 meses em Pessoas, 60 em Estrutura)", () => {
    abrir("estrutura");
    expect(campo(/Data de compra/).value).toBe("2026-06-15");
    expect(campo(/Vida útil/).value).toBe("60");
    cleanup();
    abrir("pessoa");
    expect(campo(/Vida útil/).value).toBe("36");
  });

  it("os campos avançados ficam recolhidos até se pedir (e cada campo essencial tem uma ajuda curta)", () => {
    abrir("estrutura");
    for (const avancado of [/Código/, /Número de série/, /Valor residual/, /Manutenção por ano/, /Localização/, /Notas/]) expect(screen.queryByLabelText(avancado)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Centro de custo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mais detalhes/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Quanto custou.")).toBeInTheDocument();
    maisDetalhes();
    expect(screen.getByRole("button", { name: /Mais detalhes/ })).toHaveAttribute("aria-expanded", "true");
    for (const avancado of [/Código/, /Número de série/, /Valor residual/, /Manutenção por ano/, /Localização/, /Notas/]) expect(screen.getByLabelText(avancado)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Centro de custo/ })).toBeInTheDocument();
  });

  it("mudar de grupo troca os campos: Serviço pede o equipamento, os outros pedem o tipo", () => {
    abrir("estrutura");
    expect(screen.getByRole("combobox", { name: /^Tipo/ })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Equipamento do catálogo/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Serviço/ }));
    expect(screen.queryByRole("combobox", { name: /^Tipo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Equipamento do catálogo/ })).toBeInTheDocument();
    expect(campo(/Vida útil/).value).toBe("");
    fireEvent.click(screen.getByRole("radio", { name: /Pessoas/ }));
    expect(campo(/Vida útil/).value).toBe("36");
  });

  it("Pessoas pede o tipo (os seis do RH)", () => {
    abrir("pessoa");
    fireEvent.keyDown(screen.getByRole("combobox", { name: /^Tipo/ }), { key: "Enter" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Escolha o tipo", "Telemóvel", "Portátil", "Viatura", "Fardamento", "Ferramentas", "Outro"]);
  });

  it("os seletores só pedem as opções com o painel aberto; falha a carregar: avisa em role=alert", () => {
    m.opcoes = null;
    m.erroOpcoes = "As opções falharam";
    abrir("servico");
    expect(m.opcoesLigadas).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("alert")).toHaveTextContent("As opções falharam");
  });
});

describe("AtivoSheet: o passo guiado do equipamento do catálogo (Serviço)", () => {
  it("diz o que fazer, com pesquisa e uma escolha única", () => {
    abrir("servico");
    const grupo = screen.getByRole("group", { name: /Equipamento do catálogo/ });
    expect(within(grupo).getByText("Escolha o equipamento do catálogo a que esta máquina corresponde.")).toBeInTheDocument();
    expect(within(grupo).getAllByRole("radio")).toHaveLength(3);
    expect(within(grupo).getByRole("radio", { name: /Berbequim/ })).toHaveAccessibleName(/5 anos/);
    expect(campo(/Vida útil/)).not.toBeRequired();
  });

  it("a pesquisa filtra a lista, anuncia quantos há e diz quando não há nenhum", () => {
    abrir("servico");
    escrever(/Procurar equipamento/, "comp");
    expect(screen.getAllByRole("radio", { name: /Compressor/ })).toHaveLength(1);
    expect(screen.queryByRole("radio", { name: /Berbequim/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 equipamento")).toBeInTheDocument();
    escrever(/Procurar equipamento/, "xyz");
    expect(screen.getByText("Nenhum equipamento corresponde à pesquisa.")).toBeInTheDocument();
  });

  it("escolher o equipamento diz quantos anos tem e preenche o nome vazio", () => {
    abrir("servico");
    fireEvent.click(screen.getByRole("radio", { name: /Berbequim/ }));
    expect(screen.getByRole("radio", { name: /Berbequim/ })).toBeChecked();
    expect(screen.getByText("Vazio: usa a vida do modelo (5 anos).")).toBeInTheDocument();
    expect(campo(/^Nome/).value).toBe("Berbequim");
  });

  it("a ajuda da vida diz a verdade quando o modelo só tem vida em horas ou não tem vida nenhuma", () => {
    abrir("servico");
    fireEvent.click(screen.getByRole("radio", { name: /Compressor/ }));
    expect(screen.getByText("Vazio: o modelo só tem vida em horas, por isso não deprecia no tempo. Indique os meses para ver o valor atual.")).toBeInTheDocument();
    cleanup();
    m.opcoes = { ...OPCOES, equipamentos: [{ id: "c4", nome: "Escada", vidaAnos: null, vidaHoras: null }] };
    abrir("servico");
    fireEvent.click(screen.getByRole("radio", { name: /Escada/ }));
    expect(screen.getByText("O modelo não tem vida definida. Indique a vida em meses para ver o valor atual.")).toBeInTheDocument();
  });

  it("escolher o equipamento não apaga um nome já escrito", () => {
    abrir("servico");
    escrever(/^Nome/, "Berbequim nº 2");
    fireEvent.click(screen.getByRole("radio", { name: /Berbequim/ }));
    expect(campo(/^Nome/).value).toBe("Berbequim nº 2");
  });

  it("sem equipamento fica bloqueado, com o texto do desenho, e o foco vai para a pesquisa do passo", () => {
    abrir("servico");
    escrever(/^Nome/, "Berbequim 1");
    escrever(/Valor de compra/, "300");
    guardar();
    expect(screen.getByText("Escolha o equipamento do catálogo a que esta máquina corresponde, antes de guardar.")).toBeInTheDocument();
    expect(m.criar).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(campo(/Procurar equipamento/));
  });
});

describe("AtivoSheet: validações no ecrã (nada vai à base)", () => {
  function preencher(grupo: "estrutura" | "pessoa" = "estrutura") {
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, grupo === "estrutura" ? "Mobiliário" : "Portátil");
    escrever(/Valor de compra/, "100");
  }

  it("só faltam o nome, o tipo e o valor: o resto já vem preenchido (registar em poucos passos)", async () => {
    abrir("estrutura");
    preencher();
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("estrutura", {
      p_nome: "Mesa", p_tipo: "mobiliario", p_cat_equipamento_id: null, p_data_compra: "2026-06-15", p_valor_compra: 100, p_valor_residual: 0,
      p_vida_meses: 60, p_manutencao_ano: 0, p_codigo: null, p_num_serie: null, p_centro_custo_id: null, p_localizacao: null, p_notas: null,
      p_vida_origem: "manual", p_warehouse_id: null, p_forma_aquisicao: "comprado", p_renda_mensal: null, p_inicio_aluguer: null, p_fim_aluguer: null,
    });
  });

  it("residual maior do que a compra fica bloqueado; com a secção recolhida volta a abri-la e leva o foco ao campo", () => {
    abrir("estrutura");
    preencher();
    maisDetalhes();
    escrever(/Valor residual/, "150");
    maisDetalhes();
    expect(screen.queryByLabelText(/Valor residual/)).not.toBeInTheDocument();
    guardar();
    expect(screen.getByText("O valor residual não pode ser maior do que o valor de compra.")).toBeInTheDocument();
    expect(campo(/Valor residual/)).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(campo(/Valor residual/));
    expect(m.criar).not.toHaveBeenCalled();
  });

  it.each(["0", "601", "12,5", "abc"])("vida de «%s» meses não é aceite (1 a 600, inteiro)", (vida) => {
    abrir("pessoa");
    escrever(/^Nome/, "Portátil");
    escolher(/^Tipo/, "Portátil");
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
      preencher();
      escrever(/Vida útil/, vida);
      guardar();
      await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
      unmount();
    }
  });

  it("a data de compra vai até hoje + 7 dias (como a base): o campo diz o máximo e uma data a mais fica bloqueada", () => {
    abrir("estrutura");
    expect(campo(/Data de compra/).max).toBe("2026-06-22");
    preencher();
    escrever(/Data de compra/, "2026-06-23");
    guardar();
    expect(screen.getByText("Indique uma data de compra válida.")).toBeInTheDocument();
    expect(m.criar).not.toHaveBeenCalled();
  });

  it("o valor aceita «1.234,50», «1234,50» e «1 234,50»", async () => {
    for (const texto of ["1.234,50", "1234,50", "1 234,50"]) {
      m.criar.mockClear();
      const { unmount } = abrir("estrutura");
      escrever(/^Nome/, "Mesa");
      escolher(/^Tipo/, "Mobiliário");
      escrever(/Valor de compra/, texto);
      guardar();
      await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
      expect(m.criar).toHaveBeenCalledWith("estrutura", expect.objectContaining({ p_valor_compra: 1234.5 }));
      unmount();
    }
  });

  it("Estrutura e Pessoas pedem a vida: vazia fica bloqueada", () => {
    abrir("estrutura");
    preencher();
    escrever(/Vida útil/, "");
    guardar();
    expect(screen.getByText("Indique a vida útil, de 1 a 600 meses.")).toBeInTheDocument();
  });

  it("sem data de compra e com valor de compra a zero ficam bloqueados, e o foco vai para o primeiro campo com erro", () => {
    abrir("estrutura");
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Data de compra/, "");
    escrever(/Valor de compra/, "0");
    guardar();
    expect(screen.getByText("Indique uma data de compra válida.")).toBeInTheDocument();
    expect(screen.getByText("O valor de compra tem de ser maior do que zero.")).toBeInTheDocument();
    expect(document.activeElement).toBe(campo(/Valor de compra/));
  });
});

describe("AtivoSheet: o que se envia à base", () => {
  it("criar um ativo de serviço: grupo e parâmetros certos, com os avançados que se preencheram", async () => {
    abrir("servico");
    fireEvent.click(screen.getByRole("radio", { name: /Berbequim/ }));
    escrever(/^Nome/, "Berbequim nº 2");
    escrever(/Data de compra/, "2026-03-01");
    escrever(/Valor de compra/, "1 234,50");
    maisDetalhes();
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
      p_vida_origem: null, p_warehouse_id: null, p_forma_aquisicao: "comprado", p_renda_mensal: null, p_inicio_aluguer: null, p_fim_aluguer: null,
    });
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(aoGuardar).toHaveBeenCalledWith({ nome: "Berbequim nº 2", edicao: false });
  });

  it("criar de pessoa: tipo e vida seguem, sem equipamento; residual e manutenção vazios vão a 0", async () => {
    abrir("pessoa");
    escrever(/^Nome/, "Portátil 7");
    escolher(/^Tipo/, "Portátil");
    escrever(/Data de compra/, "2026-02-10");
    escrever(/Valor de compra/, "900");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("pessoa", expect.objectContaining({
      p_tipo: "portatil", p_cat_equipamento_id: null, p_vida_meses: 36, p_valor_residual: 0, p_manutencao_ano: 0, p_valor_compra: 900,
    }));
  });

  it("mudar de grupo a meio não leva o equipamento nem o tipo do outro grupo", async () => {
    abrir("servico");
    fireEvent.click(screen.getByRole("radio", { name: /Berbequim/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Estrutura/ }));
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Valor de compra/, "100");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("estrutura", expect.objectContaining({ p_cat_equipamento_id: null, p_tipo: "mobiliario" }));
  });

  it("editar: rpc de alterar com o id e sem o grupo; o grupo aparece só para ler e os avançados já preenchidos vêm abertos", async () => {
    abrir("estrutura", EXISTENTE);
    expect(screen.getByRole("heading", { name: "Editar ativo" })).toBeInTheDocument();
    expect(screen.getByText("Estrutura", { selector: "[data-testid='grupo-do-ativo']" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(campo(/^Nome/).value).toBe("Mesa grande");
    expect(campo(/Valor de compra/).value).toBe("1200");
    expect(campo(/Vida útil/).value).toBe("60");
    expect(campo(/Valor residual/).value).toBe("200");
    expect(campo(/Data de compra/).value).toBe("2026-01-15");
    escrever(/^Nome/, "Mesa grande nova");
    guardar();
    await waitFor(() => expect(m.alterar).toHaveBeenCalledTimes(1));
    const [id, args] = m.alterar.mock.calls[0];
    expect(id).toBe("a1");
    expect(args).toMatchObject({ p_nome: "Mesa grande nova", p_tipo: "mobiliario", p_valor_compra: 1200, p_valor_residual: 200, p_vida_meses: 60, p_codigo: "M-01", p_localizacao: "Armazém", p_data_compra: "2026-01-15" });
    expect(args).not.toHaveProperty("p_grupo");
    expect(m.criar).not.toHaveBeenCalled();
    expect(aoGuardar).toHaveBeenCalledWith({ nome: "Mesa grande nova", edicao: true });
  });

  it("editar mostra os valores com vírgula e dois decimais (1234,50 e não 1234.5)", () => {
    abrir("estrutura", { ...EXISTENTE, valorCompra: 1234.5, valorResidual: 99.9, manutencaoAno: 12 });
    expect(campo(/Valor de compra/).value).toBe("1234,50");
    expect(campo(/Valor residual/).value).toBe("99,90");
    expect(campo(/Manutenção por ano/).value).toBe("12");
  });

  it("um duplo clique em Guardar envia uma só vez", async () => {
    let resolver: (v: unknown) => void = () => {};
    m.criar.mockReturnValue(new Promise((r) => { resolver = r; }));
    abrir("estrutura");
    escrever(/^Nome/, "Mesa");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Valor de compra/, "100");
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
    escrever(/Valor de compra/, "100");
  }

  it.each([
    ["ATV12", "Já existe um ativo com este código.", /Código/],
    ["ATV09", "O valor residual não pode ser maior do que o valor de compra.", /Valor residual/],
  ])("%s aparece junto do campo (a secção avançada abre-se), em português", async (codigo, texto, rotulo) => {
    m.criar.mockResolvedValue({ ok: false, codigo, mensagem: texto });
    abrir("estrutura");
    preencherEstrutura();
    guardar();
    await waitFor(() => expect(screen.getAllByText(texto).length).toBeGreaterThan(0));
    expect(aoFechar).not.toHaveBeenCalled();
    expect(campo(rotulo)).toHaveAttribute("aria-invalid", "true");
  });

  it("ATV05 aparece no passo do equipamento (Serviço), traduzido", async () => {
    const texto = "Escolha o modelo do catálogo a que este equipamento pertence.";
    m.criar.mockResolvedValue({ ok: false, codigo: "ATV05", mensagem: texto });
    abrir("servico");
    fireEvent.click(screen.getByRole("radio", { name: /Berbequim/ }));
    escrever(/^Nome/, "B1");
    escrever(/Valor de compra/, "100");
    guardar();
    await waitFor(() => expect(screen.getAllByText(texto).length).toBeGreaterThan(0));
    expect(campo(/Procurar equipamento/)).toHaveAttribute("aria-invalid", "true");
  });

  it("ATV03 sobre as notas (campo dito pelo DETAIL da base): abre a secção recolhida e marca o campo certo", async () => {
    const texto = "As notas têm no máximo 1000 caracteres.";
    m.criar.mockResolvedValue({ ok: false, codigo: "ATV03", campo: "notas", mensagem: texto });
    abrir("estrutura");
    preencherEstrutura();
    guardar();
    await waitFor(() => expect(screen.getAllByText(texto).length).toBeGreaterThan(0));
    expect(campo(/Notas/)).toHaveAttribute("aria-invalid", "true");
    expect(campo(/^Nome/)).not.toHaveAttribute("aria-invalid");
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

const ALUGADO_EXISTENTE: Ativo = {
  ...EXISTENTE, id: "r1", grupo: "pessoa", tipo: "viatura", nome: "Carrinha", codigo: "VIA-0001", dataCompra: null, valorCompra: null, valorResidual: 0, vidaMeses: null,
  forma: "alugado", rendaMensal: 450, inicioAluguer: "2026-01-01", fimAluguer: "2029-12-31", localizacao: null,
};
const norm = (s: string | null) => (s ?? "").replace(/\p{Zs}/gu, " ");

describe("AtivoSheet: comprado ou alugado", () => {
  it("Pessoas e Estrutura perguntam como foi adquirido, com «Comprado» marcado; o Serviço não pergunta (nunca se aluga)", () => {
    abrir("pessoa");
    expect(screen.getByRole("radio", { name: /Comprado/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Alugado/ })).not.toBeChecked();
    cleanup();
    abrir("estrutura");
    expect(screen.getByRole("radio", { name: /Alugado/ })).toBeInTheDocument();
    cleanup();
    abrir("servico");
    expect(screen.queryByRole("radio", { name: /Alugado/ })).not.toBeInTheDocument();
  });

  it("escolher «Alugado» troca os campos: renda, início e fim em vez de valor de compra, data de compra e vida útil", () => {
    abrir("pessoa");
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    expect(campo(/Renda mensal/)).toBeInTheDocument();
    expect(campo(/Início do aluguer/)).toBeInTheDocument();
    expect(campo(/Fim do aluguer/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Valor de compra/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Data de compra/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Vida útil/)).not.toBeInTheDocument();
    maisDetalhes();
    expect(screen.queryByLabelText(/Valor residual/)).not.toBeInTheDocument();
  });

  it("voltar a «Comprado» traz os campos da compra de volta, com o que já estava escrito", () => {
    abrir("pessoa");
    escrever(/Valor de compra/, "900");
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Comprado/ }));
    expect(campo(/Valor de compra/).value).toBe("900");
  });

  it("passar de Pessoas para Serviço tira a pergunta e volta a comprado, mesmo com «Alugado» escolhido", () => {
    abrir("pessoa");
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Serviço/ }));
    expect(screen.queryByRole("radio", { name: /Alugado/ })).not.toBeInTheDocument();
    expect(campo(/Valor de compra/)).toBeInTheDocument();
  });

  it("alugado: renda, início e fim são validados junto do campo, e o foco vai para o primeiro com erro", () => {
    abrir("pessoa");
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    escrever(/^Nome/, "Carrinha");
    escolher(/^Tipo/, "Viatura");
    escrever(/Início do aluguer/, "");
    guardar();
    expect(m.criar).not.toHaveBeenCalled();
    expect(campo(/Renda mensal/)).toHaveAttribute("aria-invalid", "true");
    expect(campo(/Início do aluguer/)).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(campo(/Renda mensal/));
    escrever(/Renda mensal/, "450");
    escrever(/Início do aluguer/, "2026-01-01");
    escrever(/Fim do aluguer/, "2025-12-31");
    guardar();
    expect(campo(/Fim do aluguer/)).toHaveAttribute("aria-invalid", "true");
    expect(m.criar).not.toHaveBeenCalled();
  });

  it("criar um alugado: renda e datas seguem, a compra e a vida vão a null, e o fim vazio é «sem fim»", async () => {
    abrir("pessoa");
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    escrever(/^Nome/, "Carrinha");
    escolher(/^Tipo/, "Viatura");
    escrever(/Renda mensal/, "450,50");
    escrever(/Início do aluguer/, "2026-01-01");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("pessoa", expect.objectContaining({
      p_nome: "Carrinha", p_tipo: "viatura", p_forma_aquisicao: "alugado", p_renda_mensal: 450.5, p_inicio_aluguer: "2026-01-01", p_fim_aluguer: null,
      p_data_compra: null, p_valor_compra: null, p_valor_residual: null, p_vida_meses: null, p_vida_origem: null, p_cat_equipamento_id: null,
    }));
  });

  it("a viatura alugada avisa que a Frota não está ligada (a renda não fica em dois sítios); um portátil alugado não", () => {
    abrir("pessoa");
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    expect(screen.queryByTestId("aviso-frota")).not.toBeInTheDocument();
    escolher(/^Tipo/, "Portátil");
    expect(screen.queryByTestId("aviso-frota")).not.toBeInTheDocument();
    escolher(/^Tipo/, "Viatura");
    expect(screen.getByTestId("aviso-frota")).toHaveTextContent("a renda fica em dois sítios");
  });

  it("uma viatura comprada não tem o aviso da Frota", () => {
    abrir("pessoa");
    escolher(/^Tipo/, "Viatura");
    expect(screen.queryByTestId("aviso-frota")).not.toBeInTheDocument();
  });

  it("a prévia diz quanto custa por mês: comprado (quota e último mês) e alugado (com e sem fim)", () => {
    abrir("pessoa");
    escrever(/Valor de compra/, "1200");
    expect(norm(screen.getByTestId("previa-conta").textContent)).toBe("Perde 33,33 € por mês durante 36 meses, até 05/2029.");
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    expect(screen.getByTestId("previa-conta")).toHaveTextContent("Preencha os valores");
    escrever(/Renda mensal/, "450");
    expect(norm(screen.getByTestId("previa-conta").textContent)).toBe("Custa 450,00 € por mês, desde 15/06/2026, sem data de fim.");
    escrever(/Fim do aluguer/, "2029-12-31");
    expect(norm(screen.getByTestId("previa-conta").textContent)).toBe("Custa 450,00 € por mês, de 15/06/2026 a 31/12/2029.");
  });

  it("em edição a forma só se lê (um ativo não muda de comprado para alugado) e o alugado vem preenchido", () => {
    abrir("pessoa", ALUGADO_EXISTENTE);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByTestId("forma-do-ativo")).toHaveTextContent("Alugado");
    expect(campo(/Renda mensal/).value).toBe("450");
    expect(campo(/Início do aluguer/).value).toBe("2026-01-01");
    expect(campo(/Fim do aluguer/).value).toBe("2029-12-31");
  });

  it("editar um alugado: alterar com a forma, a renda e as datas, e a compra a null", async () => {
    abrir("pessoa", ALUGADO_EXISTENTE);
    escrever(/Renda mensal/, "500");
    escrever(/Fim do aluguer/, "");
    guardar();
    await waitFor(() => expect(m.alterar).toHaveBeenCalledTimes(1));
    const [id, args] = m.alterar.mock.calls[0];
    expect(id).toBe("r1");
    expect(args).toMatchObject({
      p_forma_aquisicao: "alugado", p_renda_mensal: 500, p_inicio_aluguer: "2026-01-01", p_fim_aluguer: null, p_data_compra: null, p_valor_compra: null, p_vida_meses: null,
    });
  });

  it("um ativo que já esteve entregue avisa que corrigir muda o custo das pessoas, também no passado", () => {
    abrir("pessoa", { ...ALUGADO_EXISTENTE, ocupacoes: [{ pessoaEquipamentoId: "o1", pessoaId: null, pessoaNome: null, estado: null, entrega: "2026-02-01", devolucao: null, contaDesde: "2026-02-01" }] });
    expect(screen.getByTestId("aviso-edicao-passado")).toHaveTextContent("muda o custo");
    cleanup();
    abrir("pessoa", ALUGADO_EXISTENTE);
    expect(screen.queryByTestId("aviso-edicao-passado")).not.toBeInTheDocument();
  });

  it("os erros da renda (ATV20) e das datas (ATV21) da base aparecem junto do campo certo", async () => {
    m.criar.mockResolvedValueOnce({ ok: false, codigo: "ATV20", campo: null, mensagem: "A renda mensal tem de ser maior do que zero." });
    abrir("pessoa");
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    escrever(/^Nome/, "Carrinha");
    escolher(/^Tipo/, "Viatura");
    escrever(/Renda mensal/, "450");
    guardar();
    await waitFor(() => expect(campo(/Renda mensal/)).toHaveAttribute("aria-invalid", "true"));
    m.criar.mockResolvedValueOnce({ ok: false, codigo: "ATV21", campo: null, mensagem: "As datas do aluguer não são válidas." });
    guardar();
    await waitFor(() => expect(campo(/Início do aluguer/)).toHaveAttribute("aria-invalid", "true"));
  });
});

describe("AtivoSheet: a vida útil (meses de pagamento, do catálogo ou à mão)", () => {
  const origem = (opcao: string) => escolher(/Como se define a vida útil/, opcao);
  const opcoesDe = (nome: RegExp) => {
    fireEvent.keyDown(screen.getByRole("combobox", { name: nome }), { key: "Enter" });
    return screen.getAllByRole("option").map((o) => o.textContent);
  };

  it("a vida define-se em Pessoas e Estrutura por uma de três (duas na estrutura, que não tem catálogo); o Serviço mantém o campo de sempre", () => {
    abrir("pessoa");
    expect(opcoesDe(/Como se define a vida útil/)).toEqual(["Meses de pagamento", "Do equipamento do catálogo", "Escrever à mão"]);
    cleanup();
    abrir("estrutura");
    expect(opcoesDe(/Como se define a vida útil/)).toEqual(["Meses de pagamento", "Escrever à mão"]);
    cleanup();
    abrir("servico");
    expect(screen.queryByRole("combobox", { name: /Como se define a vida útil/ })).not.toBeInTheDocument();
  });

  it("meses de pagamento: o campo muda de nome e a origem segue para a base", async () => {
    abrir("pessoa");
    origem("Meses de pagamento");
    escrever(/Meses de pagamento/, "24");
    escrever(/^Nome/, "Telemóvel");
    escolher(/^Tipo/, "Telemóvel");
    escrever(/Valor de compra/, "600");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("pessoa", expect.objectContaining({ p_vida_meses: 24, p_vida_origem: "pagamento", p_cat_equipamento_id: null }));
  });

  it("do catálogo: só aparecem os equipamentos com vida em anos, e a vida é a do escolhido (anos x 12)", async () => {
    abrir("pessoa");
    origem("Do equipamento do catálogo");
    expect(screen.queryByLabelText(/Vida útil/)).not.toBeInTheDocument();
    expect(opcoesDe(/^Equipamento do catálogo/)).toEqual(["Escolha o equipamento", "Berbequim (5 anos)", "Andaime (10 anos)"]);
    fireEvent.click(screen.getByRole("option", { name: "Berbequim (5 anos)" }));
    expect(screen.getByText("A vida do equipamento escolhido são 60 meses.")).toBeInTheDocument();
    escrever(/^Nome/, "Berbequim");
    escolher(/^Tipo/, "Ferramentas");
    escrever(/Valor de compra/, "600");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("pessoa", expect.objectContaining({ p_vida_meses: 60, p_vida_origem: "catalogo", p_cat_equipamento_id: "c1" }));
  });

  it("do catálogo sem escolher o equipamento fica bloqueado, com o erro junto do seletor", () => {
    abrir("pessoa");
    origem("Do equipamento do catálogo");
    escrever(/^Nome/, "Berbequim");
    escolher(/^Tipo/, "Ferramentas");
    escrever(/Valor de compra/, "600");
    guardar();
    expect(m.criar).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: /^Equipamento do catálogo/ })).toHaveAttribute("aria-invalid", "true");
  });

  it("à mão é o que vem por omissão e leva a vida habitual do grupo", async () => {
    abrir("pessoa");
    escrever(/^Nome/, "Portátil");
    escolher(/^Tipo/, "Portátil");
    escrever(/Valor de compra/, "900");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("pessoa", expect.objectContaining({ p_vida_meses: 36, p_vida_origem: "manual" }));
  });

  it("editar um ativo do catálogo que não mudou de equipamento mantém a vida que ele já tinha (não muda o passado sozinho)", async () => {
    const doCatalogo: Ativo = {
      ...EXISTENTE, grupo: "pessoa", tipo: "ferramentas", catEquipamentoId: "c1", vidaMeses: 48, vidaOrigem: "catalogo",
      catEquipamento: { id: "c1", nome: "Berbequim", vidaAnos: 5, vidaHoras: null, usoAnoHoras: null },
    };
    abrir("pessoa", doCatalogo);
    guardar();
    await waitFor(() => expect(m.alterar).toHaveBeenCalledTimes(1));
    expect(m.alterar.mock.calls[0][1]).toMatchObject({ p_vida_meses: 48, p_vida_origem: "catalogo", p_cat_equipamento_id: "c1" });
  });
});

describe("AtivoSheet: o armazém do Stock", () => {
  const instalacoes = () => { escrever(/^Nome/, "Armazém Porto"); escolher(/^Tipo/, "Armazéns e instalações"); };

  it("o tipo chama-se «Armazéns e instalações» e a ligação ao armazém aparece logo por baixo dele, antes da forma e do valor de compra", () => {
    abrir("estrutura");
    escolher(/^Tipo/, "Armazéns e instalações");
    const tipo = screen.getByRole("combobox", { name: /^Tipo/ });
    const armazem = screen.getByRole("combobox", { name: /Armazém do Stock/ });
    const antes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    // Imediatamente a seguir ao Tipo: nenhum outro seletor entre os dois.
    const seletores = screen.getAllByRole("combobox");
    expect(seletores.indexOf(armazem)).toBe(seletores.indexOf(tipo) + 1);
    expect(antes(tipo, armazem)).toBe(true);
    // E antes da forma (Comprado/Alugado) e do valor de compra.
    expect(antes(armazem, screen.getByRole("radio", { name: /Comprado/ }))).toBe(true);
    expect(antes(armazem, campo(/Valor de compra/))).toBe(true);
  });

  it("com outro tipo não aparece o armazém nem a frase de falta de acesso", () => {
    abrir("estrutura");
    escolher(/^Tipo/, "Mobiliário");
    expect(screen.queryByRole("combobox", { name: /Armazém do Stock/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("armazem-sem-acesso")).not.toBeInTheDocument();
    cleanup();
    m.opcoes = { ...OPCOES, armazens: [], podeVerArmazens: false };
    abrir("estrutura");
    escolher(/^Tipo/, "Mobiliário");
    expect(screen.queryByTestId("armazem-sem-acesso")).not.toBeInTheDocument();
  });

  it("sem acesso ao Stock, o tipo «Armazéns e instalações» diz que é preciso acesso ao Stock para ligar a um armazém, sem o campo", () => {
    m.opcoes = { ...OPCOES, armazens: [], podeVerArmazens: false };
    abrir("estrutura");
    expect(screen.queryByTestId("armazem-sem-acesso")).not.toBeInTheDocument();
    escolher(/^Tipo/, "Armazéns e instalações");
    expect(screen.queryByRole("combobox", { name: /Armazém do Stock/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("armazem-sem-acesso")).toHaveTextContent("Para ligar a um armazém é preciso ter acesso ao Stock.");
  });

  it("com acesso ao Stock, a frase de falta de acesso não aparece", () => {
    abrir("estrutura");
    escolher(/^Tipo/, "Armazéns e instalações");
    expect(screen.getByRole("combobox", { name: /Armazém do Stock/ })).toBeInTheDocument();
    expect(screen.queryByTestId("armazem-sem-acesso")).not.toBeInTheDocument();
  });

  it("enquanto as opções não chegaram, não se diz que falta acesso (ainda não se sabe)", () => {
    m.opcoes = null;
    abrir("estrutura");
    escolher(/^Tipo/, "Armazéns e instalações");
    expect(screen.queryByTestId("armazem-sem-acesso")).not.toBeInTheDocument();
  });

  it("só um ativo de estrutura do tipo Armazéns e instalações oferece o armazém, e só a quem vê o Stock", () => {
    abrir("estrutura");
    expect(screen.queryByRole("combobox", { name: /Armazém do Stock/ })).not.toBeInTheDocument();
    escolher(/^Tipo/, "Mobiliário");
    expect(screen.queryByRole("combobox", { name: /Armazém do Stock/ })).not.toBeInTheDocument();
    escolher(/^Tipo/, "Armazéns e instalações");
    expect(screen.getByRole("combobox", { name: /Armazém do Stock/ })).toBeInTheDocument();
    cleanup();
    m.opcoes = { ...OPCOES, armazens: [], podeVerArmazens: false };
    abrir("estrutura");
    escolher(/^Tipo/, "Armazéns e instalações");
    expect(screen.queryByRole("combobox", { name: /Armazém do Stock/ })).not.toBeInTheDocument();
  });

  it("escolher um armazém liga-o: o id segue na criação", async () => {
    abrir("estrutura");
    instalacoes();
    escrever(/Valor de compra/, "5000");
    escolher(/Armazém do Stock/, "Armazém Porto");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("estrutura", expect.objectContaining({ p_tipo: "instalacoes", p_warehouse_id: "w1" }));
  });

  it("mudar o tipo para outro que não Armazéns e instalações larga o armazém escolhido", async () => {
    abrir("estrutura");
    instalacoes();
    escolher(/Armazém do Stock/, "Armazém Porto");
    escolher(/^Tipo/, "Mobiliário");
    escrever(/Valor de compra/, "100");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("estrutura", expect.objectContaining({ p_tipo: "mobiliario", p_warehouse_id: null }));
  });

  it("um armazém alugado: renda de estrutura ligada ao armazém", async () => {
    abrir("estrutura");
    instalacoes();
    fireEvent.click(screen.getByRole("radio", { name: /Alugado/ }));
    escrever(/Renda mensal/, "900");
    escolher(/Armazém do Stock/, "Armazém Faro");
    guardar();
    await waitFor(() => expect(m.criar).toHaveBeenCalledTimes(1));
    expect(m.criar).toHaveBeenCalledWith("estrutura", expect.objectContaining({ p_forma_aquisicao: "alugado", p_renda_mensal: 900, p_warehouse_id: "w2" }));
  });

  it("sem inventory.view, editar um armazém já ligado manda null (a base mantém a ligação: nunca se desliga sem permissão)", async () => {
    m.opcoes = { ...OPCOES, armazens: [], podeVerArmazens: false };
    abrir("estrutura", { ...EXISTENTE, tipo: "instalacoes", nome: "Armazém Porto", armazemLigado: true, armazem: null });
    expect(screen.queryByRole("combobox", { name: /Armazém do Stock/ })).not.toBeInTheDocument();
    escrever(/^Nome/, "Armazém do Porto");
    guardar();
    await waitFor(() => expect(m.alterar).toHaveBeenCalledTimes(1));
    expect(m.alterar.mock.calls[0][1]).toMatchObject({ p_warehouse_id: null, p_tipo: "instalacoes" });
  });

  it("com inventory.view, editar mostra o armazém ligado (mesmo apagado no Stock) e mantém-no", async () => {
    abrir("estrutura", { ...EXISTENTE, tipo: "instalacoes", nome: "Armazém Velho", armazemLigado: true, armazem: { id: "w9", nome: "Velho", apagado: true } });
    expect(screen.getByRole("combobox", { name: /Armazém do Stock/ })).toHaveTextContent("Velho");
    guardar();
    await waitFor(() => expect(m.alterar).toHaveBeenCalledTimes(1));
    expect(m.alterar.mock.calls[0][1]).toMatchObject({ p_warehouse_id: "w9" });
  });

  it("ATV22 (armazém inválido) aparece junto do seletor do armazém", async () => {
    m.criar.mockResolvedValueOnce({ ok: false, codigo: "ATV22", campo: null, mensagem: "Este armazém já está ligado a outro ativo." });
    abrir("estrutura");
    instalacoes();
    escrever(/Valor de compra/, "5000");
    escolher(/Armazém do Stock/, "Armazém Porto");
    guardar();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /Armazém do Stock/ })).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getAllByText("Este armazém já está ligado a outro ativo.").length).toBeGreaterThan(0);
  });
});
