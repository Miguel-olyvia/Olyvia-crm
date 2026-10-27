// O módulo «Custos» do RH: as pessoas e a retribuição do mês vêm do processamento salarial REAL (aqui entram por
// argumento, ao nível do hook `useCustoDaOrganizacao`, por isso não há Supabase); equipamentos e taxas continuam em
// memória. Os valores avulsos são lançamentos pontuais da base: aqui o `criar` e o `anular` do processamento são
// simulados e gravam no store de exemplo, só para os totais e as listas se poderem ver mexer. A ficha da pessoa é substituída por um painel que mostra só o separador Custo (a ficha real
// tem testes próprios). Data fixa (14/10/2026).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { PessoaParaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";

const estado = vi.hoisted(() => ({
  pessoas: [] as PessoaParaCusto[],
  calculo: {} as Record<string, unknown>,
  periodoAberto: true,
  vinculos: { error: null as string | null, recusado: false },
}));

vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" }, isLoading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useMinhaPessoa", () => ({ useMinhaPessoa: () => ({ nome: "Sofia" }) }));
vi.mock("@/components/rh-exemplo/processamento/useCalculoReal", () => ({ RecolhaDeAssiduidade: () => null }));
vi.mock("@/components/rh-exemplo/custo/useCustoDaPessoa", async () => {
  const { useCusto } = await import("@/components/rh-exemplo/dados/lojaCusto");
  const { custoDaPessoa, linhasDaOrganizacao } = await import("@/components/rh-exemplo/custo/custoLido");
  const { lerCusto, registarAvulso, anularAvulso } = await import("@/components/rh-exemplo/dados/lojaCusto");
  const lancamentos = (mes: string) => ({
    periodoAberto: estado.periodoAberto,
    aGravar: false,
    codigos: [{ id: "cod-1", codigo: "PRM", nome: "Prémio" }],
    criar: async (n: { pessoaId: string; descricao: string; valor: number }) => {
      const { erro } = registarAvulso({
        pessoaId: n.pessoaId, tipo: "pontual", data: `${mes}-01`, descricao: n.descricao, quantidade: 1, valorUnitario: n.valor, autor: "", podeProcessar: true,
      });
      return erro;
    },
    anular: async (id: string, motivo: string) => anularAvulso(id, motivo, "", true).erro,
  });
  const porPessoa = () => {
    const mapa = new Map<string, ReturnType<typeof lerCusto>["avulsos"]>();
    for (const a of lerCusto().avulsos) mapa.set(a.pessoaId, [...(mapa.get(a.pessoaId) ?? []), a]);
    return mapa;
  };
  // Recalcula quando o store em memoria dos avulsos, equipamentos e taxas muda (como o hook verdadeiro).
  const useAssinar = () => {
    useCusto((e) => e.avulsos);
    useCusto((e) => e.equipamentos);
    useCusto((e) => e.definicoes);
    useCusto((e) => e.excecoes);
  };
  return {
    useCustoDaOrganizacao: (mes: string) => {
      useAssinar();
      return {
        linhas: linhasDaOrganizacao(mes, estado.pessoas, lerCusto().avulsos), calculo: estado.calculo, ano: Number(mes.slice(0, 4)), mesNum: Number(mes.slice(5, 7)),
        vinculosHook: estado.vinculos, avulsosPorPessoa: porPessoa(), lancamentos: lancamentos(mes),
      };
    },
    useCustoDaPessoa: (pessoa: { id: string }, mes: string) => {
      useAssinar();
      const p = estado.pessoas.find((x) => x.pessoaId === pessoa.id);
      return { custo: p ? custoDaPessoa(p, mes, 0, lerCusto().avulsos) : null, aCarregar: false, retribuicaoRecusada: false, incompleta: false, lancamentos: lancamentos(mes) };
    },
  };
});
vi.mock("@/components/rh-exemplo/ficha/FichaPessoaRh", async () => {
  const { AbaCusto } = await import("@/components/rh-exemplo/custo/AbaCusto");
  return {
    FichaPessoaRh: ({ id, aberta }: { id: string | null; aberta: boolean }) =>
      aberta && id ? (
        <div role="dialog" aria-label="Ficha">
          <AbaCusto
            pessoa={{ id, nome_completo: estado.pessoas.find((p) => p.pessoaId === id)?.nome ?? id } as never}
            ctx={{ nomePorPessoaId: new Map(), minhaPessoaId: null } as never}
            ficha={null as never}
          />
        </div>
      ) : null,
  };
});

import { lerCusto, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { valorDoEquipamentoNoMes, type EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { rhExemploCustosTranslations } from "@/translations/rhExemploCustos";
import { rhExemploProcessamentoRealTranslations } from "@/translations/rhExemploProcessamentoReal";
import RhCustos from "./RhCustos";

const pessoa = (pessoaId: string, nome: string, retribuicaoMes: number | null, extra: Partial<PessoaParaCusto> = {}): PessoaParaCusto => ({
  pessoaId, nome, cargo: "Cargo", centroId: null, centro: null, filialId: null, filial: null, tipoContrato: null, retribuicaoMes, horasSemanais: 40, ...extra,
});

const PESSOAS: PessoaParaCusto[] = [
  pessoa("p-hugo", "Hugo Teixeira", 1400, { centroId: "l-porto", centro: "Loja Porto", filialId: "fil-porto", filial: "Filial Porto", tipoContrato: "sem_termo" }),
  pessoa("p-ines", "Inês Cardoso", 1100, { centroId: "l-colombo", centro: "Loja Colombo", filialId: "fil-lisboa", filial: "Filial Lisboa", tipoContrato: "sem_termo" }),
  pessoa("p-tiago", "Tiago Pinheiro", 950.55, { centroId: "l-colombo", centro: "Loja Colombo", filialId: "fil-lisboa", filial: "Filial Lisboa", tipoContrato: "termo_certo" }),
  pessoa("p-marta", "Marta Figueiredo", 2000, { centroId: "l-porto", centro: "Loja Porto", filialId: "fil-porto", filial: "Filial Porto", tipoContrato: "sem_termo" }),
];

function calculo(extra: Record<string, unknown> = {}) {
  return {
    pessoasActivas: PESSOAS.map((p) => ({ id: p.pessoaId, nome_completo: p.nome })),
    pessoasACarregar: false, pessoasErro: null, aCarregar: false, pendentes: 0, incompletas: 0,
    retribuicoesHook: { recusado: false },
    periodoHook: { periodo: { id: "per", estado: "aberto" }, recusado: false },
    ...extra,
  };
}

const noRouter = () =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/rh-exemplo/custos"]}>
        <Routes><Route path="/rh-exemplo/custos" element={<RhCustos />} /></Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeAll(() => {
  // O Radix Select e o ResizeObserver precisam de APIs que o jsdom não traz.
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
  repor();
  reporCusto();
  estado.pessoas = PESSOAS;
  estado.calculo = calculo();
  estado.periodoAberto = true;
  estado.vinculos = { error: null, recusado: false };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const linhas = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>("tbody tr[data-pessoa-id]"));
const linhaDe = (nome: string): HTMLElement => linhas().find((l) => l.textContent?.includes(nome)) as HTMLElement;
const totalDoCabecalho = (chave: string): string => screen.getByTestId(`rhcustos-total-${chave}`).textContent ?? "";

describe("traduções do módulo Custos", () => {
  it("en e pt têm exatamente as mesmas chaves", () => {
    const { en, pt } = rhExemploCustosTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("as do processamento real também, e as que reescrevem textos de outros módulos existem nesses módulos", () => {
    const { en, pt } = rhExemploProcessamentoRealTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    expect(Object.keys(pt).filter((k) => k.startsWith("rhCustos.")).every((k) => k in rhExemploCustosTranslations.pt)).toBe(true);
    // Nenhum texto vazio, e os marcadores {n}, {erro}, {mes}... são os mesmos nas duas línguas.
    const marcadores = (texto: string) => (texto.match(/\{[a-z]+\}/g) ?? []).sort().join(",");
    for (const chave of Object.keys(pt)) {
      expect(pt[chave].trim(), chave).not.toBe("");
      expect(en[chave].trim(), chave).not.toBe("");
      expect(marcadores(en[chave]), chave).toBe(marcadores(pt[chave]));
    }
  });
});

describe("o módulo Custos", () => {
  it("abre em Setembro de 2026 com as pessoas do processamento, os totais e os cabeçalhos da tabela", () => {
    noRouter();
    expect(screen.getByRole("heading", { level: 1, name: /Custos/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-09");
    expect(linhas()).toHaveLength(PESSOAS.length);
    expect(within(linhaDe("Hugo Teixeira")).getByText("Hugo Teixeira")).toBeInTheDocument();
    const tabela = screen.getByRole("table", { name: /Custo de cada pessoa em setembro de 2026/i });
    const cabecalhos = within(tabela).getAllByRole("columnheader").map((c) => c.textContent);
    for (const nome of ["Pessoa", "Centro e filial", "Retribuição do mês", "Encargos", "Avulsos", "Equipamentos", "Seguro", "Custo total do mês", "Custo por hora", "Composição"]) {
      expect(cabecalhos.some((c) => c?.includes(nome))).toBe(true);
    }
    expect(within(tabela).getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending");
  });

  it("a retribuição de cada linha é o total do processamento e a soma bate com o cabeçalho", () => {
    noRouter();
    expect(totalDoCabecalho("retribuicao")).toMatch(/5.?450,55/);
    expect(within(linhaDe("Tiago Pinheiro")).getAllByText(/950,55/).length).toBeGreaterThan(0);
  });

  it("o total da linha de totais é o total do cabeçalho, e o texto não mostra chaves por traduzir", () => {
    noRouter();
    expect(screen.getByTestId("rhcustos-linha-total").textContent).toBe(totalDoCabecalho("total"));
    expect(totalDoCabecalho("pessoas")).toBe(String(linhas().length));
    expect(document.body.textContent).not.toMatch(/\brhCustos\.[A-Za-z]+/);
    expect(document.body.textContent).not.toMatch(/\brhProcReal\.[A-Za-z]+/);
  });

  it("ordena por qualquer coluna, nos dois sentidos, e diz a ordem no cabeçalho", () => {
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Custo total do mês/ }));
    const primeira = linhas()[0].getAttribute("data-pessoa-id");
    expect(screen.getByRole("columnheader", { name: /Custo total do mês/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Custo total do mês.*decrescente/ }));
    expect(screen.getByRole("columnheader", { name: /Custo total do mês/ })).toHaveAttribute("aria-sort", "ascending");
    expect(linhas()[0].getAttribute("data-pessoa-id")).not.toBe(primeira);
  });

  it("filtra por nome e mostra um estado vazio útil, com o botão de limpar", () => {
    noRouter();
    const total = linhas().length;
    fireEvent.change(screen.getByLabelText("Procurar por nome"), { target: { value: "ines" } });
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0]).toHaveTextContent("Inês Cardoso");
    expect(screen.getByText(`1 de ${total} pessoas`)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Procurar por nome"), { target: { value: "zzzz" } });
    expect(screen.getByText("Nenhuma pessoa com estes filtros.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Limpar filtros" })[0]);
    expect(linhas()).toHaveLength(total);
  });

  it("filtra por filial e por tipo de contrato", () => {
    noRouter();
    fireEvent.change(screen.getByLabelText("Centro ou filial"), { target: { value: "f:fil-porto" } });
    expect(linhas().map((l) => l.textContent).every((t) => /Porto/.test(t ?? ""))).toBe(true);
    expect(linhas().length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Centro ou filial"), { target: { value: "todos" } });
    fireEvent.change(screen.getByLabelText("Tipo de contrato"), { target: { value: "termo_certo" } });
    expect(linhaDe("Tiago Pinheiro")).toBeDefined();
    expect(linhas().some((l) => l.textContent?.includes("Marta Figueiredo"))).toBe(false);
  });

  it("sem tipo de contrato na base o filtro de contrato só tem «todos» (não há como o saber para toda a organização)", () => {
    estado.pessoas = PESSOAS.map((p) => ({ ...p, tipoContrato: null }));
    noRouter();
    const opcoes = within(screen.getByLabelText("Tipo de contrato")).getAllByRole("option");
    expect(opcoes).toHaveLength(1);
  });

  it("a composição de cada pessoa tem texto e percentagem, e abre e fecha sem botões dentro de botões", () => {
    noRouter();
    const linha = linhaDe("Hugo Teixeira");
    expect(linha.querySelectorAll("button button")).toHaveLength(0);
    const botao = within(linha).getByRole("button", { name: /Ver composição de Hugo Teixeira/ });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao).toHaveTextContent(/Retribuição \d+,\d %/);
    fireEvent.click(botao);
    const lista = screen.getByRole("list", { name: /Composição do custo de Hugo Teixeira/ });
    expect(within(lista).getByText("Equipamentos")).toBeInTheDocument();
    expect(lista.textContent).toMatch(/\d+,\d %/);
    fireEvent.click(within(linhaDe("Hugo Teixeira")).getByRole("button", { name: /Esconder composição de Hugo Teixeira/ }));
    expect(screen.queryByRole("list", { name: /Composição do custo de Hugo Teixeira/ })).not.toBeInTheDocument();
  });

  it("clicar numa linha abre a ficha da pessoa no custo dela", () => {
    noRouter();
    fireEvent.click(within(linhaDe("Tiago Pinheiro")).getByRole("button", { name: /Abrir a ficha de Tiago Pinheiro/ }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByText("Custo total do mês")).toBeInTheDocument();
    expect(within(ficha).getByRole("heading", { name: "Equipamentos" })).toBeInTheDocument();
    expect(within(ficha).getAllByText("Telemóvel").length).toBeGreaterThan(0);
  });
});

describe("o que a base diz e o que falta dizer", () => {
  it("um erro a carregar as pessoas aparece como alerta", () => {
    estado.pessoas = [];
    estado.calculo = calculo({ pessoasErro: "falha ao ler", pessoasActivas: [] });
    noRouter();
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível carregar as pessoas: falha ao ler/);
  });

  it("sem permissão para ver retribuições avisa que o custo não se calcula", () => {
    estado.calculo = calculo({ retribuicoesHook: { recusado: true } });
    noRouter();
    expect(screen.getByText("Não tem permissão para ver as retribuições: o custo não se calcula.")).toBeInTheDocument();
  });

  it("assiduidade lida só em parte e pessoas por calcular são ditas", () => {
    estado.calculo = calculo({ incompletas: 2, pendentes: 3 });
    noRouter();
    expect(screen.getByText(/assiduidade de 2 pessoa\(s\) só se leu em parte/)).toBeInTheDocument();
    expect(screen.getByText(/A calcular a retribuição de 3 pessoa\(s\)/)).toBeInTheDocument();
  });

  it("sem período aberto no mês diz que a retribuição é a estimada, sem valores pontuais", () => {
    estado.calculo = calculo({ periodoHook: { periodo: null, recusado: false } });
    noRouter();
    expect(screen.getByText(/ainda não tem período de processamento aberto/)).toBeInTheDocument();
  });

  it("com período aberto, ou sem permissão para o ver, não diz que falta o período", () => {
    noRouter();
    expect(screen.queryByText(/ainda não tem período de processamento aberto/)).not.toBeInTheDocument();
    cleanup();
    estado.calculo = calculo({ periodoHook: { periodo: null, recusado: true } });
    noRouter();
    expect(screen.queryByText(/ainda não tem período de processamento aberto/)).not.toBeInTheDocument();
  });

  it("a nota do fundo diz o que está ligado e o que ainda é de exemplo", () => {
    noRouter();
    expect(screen.getByText(/total bruto estimado do processamento salarial/)).toBeInTheDocument();
    expect(screen.getByText(/só existem em memória/)).toBeInTheDocument();
  });
});

describe("atribuir equipamento (em memória) e registar valor avulso (lançamento pontual)", () => {
  it("atribuir na ficha aparece na lista da pessoa e muda o total de equipamentos do módulo", () => {
    noRouter();
    const antes = totalDoCabecalho("equipamentos");
    const custoAntes = totalDoCabecalho("total");
    fireEvent.click(within(linhaDe("Tiago Pinheiro")).getByRole("button", { name: /Abrir a ficha de Tiago Pinheiro/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Atribuir equipamento" }));
    const painel = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    fireEvent.change(within(painel).getByLabelText(/Descrição/), { target: { value: "Tablet de loja" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    expect(within(painel).getByRole("alert")).toHaveTextContent("O valor tem de ser maior que 0.");
    fireEvent.change(within(painel).getByLabelText(/Valor de aquisição/), { target: { value: "720" } });
    fireEvent.change(within(painel).getByLabelText(/Data de entrega/), { target: { value: "2026-09-02" } });
    expect(within(painel).getByRole("status")).toHaveTextContent(/720,00.* repartidos por 36 meses = 20,00.* por mês, de setembro de 2026 até à devolução/);
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByText("Tablet de loja")).toBeInTheDocument();
    expect(lerCusto().equipamentos.at(-1)).toMatchObject({ pessoaId: "p-tiago", descricao: "Tablet de loja", valor: 720, estado: "atribuido" });
    expect(totalDoCabecalho("equipamentos")).not.toBe(antes);
    expect(totalDoCabecalho("total")).not.toBe(custoAntes);
    expect(screen.getByTestId("rhcustos-linha-total").textContent).toBe(totalDoCabecalho("total"));
  });

  it("devolver na ficha pede data e estado e deixa o equipamento como devolvido", () => {
    noRouter();
    fireEvent.click(within(linhaDe("Tiago Pinheiro")).getByRole("button", { name: /Abrir a ficha de Tiago Pinheiro/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Devolver Telemóvel" }));
    const dialogo = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolver equipamento" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Escolhe o estado em que volta.");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Estado em que volta/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Com desgaste" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolver equipamento" }));
    const devolvido = lerCusto().equipamentos.find((e) => e.pessoaId === "p-tiago" && e.tipo === "telemovel");
    expect(devolvido).toMatchObject({ estado: "devolvido", estadoDevolucao: "desgaste" });
    expect(within(screen.getByRole("dialog")).getByText(/Devolvido em .*: Com desgaste/)).toBeInTheDocument();
  });

  it("o botão do topo abre o painel com a pessoa a escolher e recusa sem pessoa", () => {
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: "Atribuir equipamento" }));
    const painel = screen.getByRole("dialog");
    expect(within(painel).getByRole("combobox", { name: /Pessoa/ })).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    expect(within(painel).getByRole("alert")).toHaveTextContent("Escolhe a pessoa.");
    fireEvent.keyDown(within(painel).getByRole("combobox", { name: /Pessoa/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Hugo Teixeira" }));
    fireEvent.change(within(painel).getByLabelText(/Descrição/), { target: { value: "Colete refletor" } });
    fireEvent.change(within(painel).getByLabelText(/Valor de aquisição/), { target: { value: "36" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    expect(lerCusto().equipamentos.at(-1)).toMatchObject({ pessoaId: "p-hugo", descricao: "Colete refletor", valor: 36 });
    expect(screen.getByText("Equipamento atribuído a Hugo Teixeira.")).toBeInTheDocument();
  });

  it("registar valor avulso no topo escolhe a pessoa, pede descrição e valor, regista e conta no mês visto, sem saltar para outro", async () => {
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: "Registar valor avulso" }));
    const dialogo = screen.getByRole("dialog");
    // Só o que a base guarda: nada de quilómetros, ajudas de custo, repartido nem «todos os meses».
    expect(within(dialogo).queryByLabelText("Quilómetros")).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("radiogroup", { name: "Como conta" })).not.toBeInTheDocument();
    expect(within(dialogo).getByText(/Conta de uma vez, em setembro de 2026/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar valor" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Escolhe a pessoa.");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Pessoa/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Inês Cardoso" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar valor" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Escreva uma descrição.");
    fireEvent.change(within(dialogo).getByLabelText(/^Descrição/), { target: { value: "Prémio de loja" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar valor" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Escreva um valor diferente de zero.");
    fireEvent.change(within(dialogo).getByLabelText(/^Valor/), { target: { value: "20" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar valor" }));
    expect(await screen.findByText(/Valor registado\. Conta em setembro de 2026\./)).toBeInTheDocument();
    expect(lerCusto().avulsos.at(-1)).toMatchObject({ pessoaId: "p-ines", valor: 20, descricao: "Prémio de loja", data: "2026-09-01", conta: { modo: "umaVez" } });
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-09");
  });

  it("num período que não está aberto avisa e não deixa registar", () => {
    estado.periodoAberto = false;
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: "Registar valor avulso" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByRole("status")).toHaveTextContent(/não está aberto/);
    expect(within(dialogo).getByRole("button", { name: "Registar valor" })).toBeDisabled();
  });

  it("anular na ficha pede o motivo, o valor continua visível mas deixa de contar", async () => {
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: "Registar valor avulso" }));
    const registo = screen.getByRole("dialog");
    fireEvent.keyDown(within(registo).getByRole("combobox", { name: /Pessoa/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Inês Cardoso" }));
    fireEvent.change(within(registo).getByLabelText(/^Descrição/), { target: { value: "Prémio por engano" } });
    fireEvent.change(within(registo).getByLabelText(/^Valor/), { target: { value: "75" } });
    fireEvent.click(within(registo).getByRole("button", { name: "Registar valor" }));
    await screen.findByText(/Valor registado\./);
    fireEvent.click(within(linhaDe("Inês Cardoso")).getByRole("button", { name: /Abrir a ficha de Inês Cardoso/ }));
    const ficha = screen.getByRole("dialog");
    const linha = within(ficha).getByText("Prémio por engano").closest("tr") as HTMLElement;
    fireEvent.click(within(linha).getByRole("button", { name: "Anular" }));
    const dialogo = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Indica o motivo");
    fireEvent.change(within(dialogo).getByLabelText(/^Motivo/), { target: { value: "Registado por engano" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(lerCusto().avulsos.find((a) => a.descricao === "Prémio por engano")?.anulado).toMatchObject({ motivo: "Registado por engano" }));
    expect(within(within(screen.getByRole("dialog")).getByText("Prémio por engano").closest("tr") as HTMLElement).getByText("Anulado")).toBeInTheDocument();
  });

  it("o seletor de mês e «Hoje» mudam o mês mostrado", () => {
    noRouter();
    fireEvent.change(screen.getByLabelText("Mês"), { target: { value: "2026-08" } });
    expect(screen.getByRole("table", { name: /agosto de 2026/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-10");
    expect(screen.getByRole("button", { name: "Hoje" })).toBeDisabled();
  });
});

/** O valor em euros de um texto como «1 234,50 €» (os totais do cabeçalho). */
const euroDe = (texto: string): number => Number(texto.replace(/[^\d,-]/g, "").replace(",", "."));
const irParaMes = (mes: string) => fireEvent.change(screen.getByLabelText("Mês"), { target: { value: mes } });

function atribuirNoTopo(valor: string, entrega: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Atribuir equipamento" }));
  const painel = screen.getByRole("dialog");
  fireEvent.keyDown(within(painel).getByRole("combobox", { name: /Pessoa/ }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: "Hugo Teixeira" }));
  fireEvent.change(within(painel).getByLabelText(/Descrição/), { target: { value: "Colete de teste" } });
  fireEvent.change(within(painel).getByLabelText(/Valor de aquisição/), { target: { value: valor } });
  fireEvent.change(within(painel).getByLabelText(/Data de entrega/), { target: { value: entrega } });
  return painel;
}

describe("«Como conta» no painel de atribuir e na ficha", () => {
  it("oferece três opções em linguagem simples, repartido por 36 meses por omissão, e a ajuda abre com texto visível", () => {
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: "Atribuir equipamento" }));
    const painel = screen.getByRole("dialog");
    const grupo = within(painel).getByRole("radiogroup", { name: "Como conta" });
    const opcoes = within(grupo).getAllByRole("radio");
    expect(opcoes).toHaveLength(3);
    expect(within(grupo).getByRole("radio", { name: /Pago de uma vez/ })).toHaveAttribute("aria-checked", "false");
    expect(within(grupo).getByRole("radio", { name: /Repartido por N meses/ })).toHaveAttribute("aria-checked", "true");
    expect(within(grupo).getByRole("radio", { name: /Todos os meses/ })).toBeInTheDocument();
    expect(within(painel).getByLabelText(/Número de meses/)).toHaveValue(36);
    const ajuda = within(painel).getByRole("button", { name: "O que quer dizer «repartido»?" });
    expect(ajuda).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(ajuda);
    expect(ajuda).toHaveAttribute("aria-expanded", "true");
    expect(within(painel).getByText(/um portátil de 900 € repartido por 36 meses conta 25 € por mês/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/amortiza/i);
  });

  it("as setas mudam de opção, e escolher outra troca os campos e a frase de efeito", async () => {
    noRouter();
    atribuirNoTopo("360", "2026-09-10");
    const painel = screen.getByRole("dialog");
    const repartido = within(painel).getByRole("radio", { name: /Repartido por N meses/ });
    repartido.focus();
    fireEvent.keyDown(repartido, { key: "ArrowDown" });
    await waitFor(() => expect(within(painel).getByRole("radio", { name: /Todos os meses/ })).toHaveAttribute("aria-checked", "true"));
    expect(within(painel).getByLabelText("Conta desde o mês")).toHaveValue("2026-09");
    expect(within(painel).getByLabelText(/Valor por mês/)).toBeInTheDocument();
    expect(within(painel).getByRole("status")).toHaveTextContent(/360,00.* por mês desde setembro de 2026 até à devolução/);
    fireEvent.click(within(painel).getByRole("radio", { name: /Pago de uma vez/ }));
    expect(within(painel).getByRole("status")).toHaveTextContent(/360,00.* contam todos em setembro de 2026\./);
    expect(within(painel).queryByLabelText(/Número de meses/)).not.toBeInTheDocument();
  });

  it("a frase de efeito atualiza com o número de meses e com a data de entrega", () => {
    noRouter();
    const painel = atribuirNoTopo("900", "2026-11-05");
    expect(within(painel).getByRole("status")).toHaveTextContent(/900,00.* repartidos por 36 meses = 25,00.* por mês, de novembro de 2026/);
    fireEvent.change(within(painel).getByLabelText(/Número de meses/), { target: { value: "12" } });
    expect(within(painel).getByRole("status")).toHaveTextContent(/repartidos por 12 meses = 75,00.* por mês/);
    fireEvent.change(within(painel).getByLabelText(/Data de entrega/), { target: { value: "2027-01-10" } });
    expect(within(painel).getByRole("status")).toHaveTextContent(/de janeiro de 2027/);
    fireEvent.change(within(painel).getByLabelText(/Número de meses/), { target: { value: "0" } });
    expect(within(painel).getByRole("status")).toHaveTextContent("Preenche o valor e a data para ver como conta.");
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    expect(within(painel).getByRole("alert")).toHaveTextContent("Indica um número inteiro de meses entre 1 e 120.");
    expect(lerCusto().equipamentos.some((e) => e.descricao === "Colete de teste")).toBe(false);
  });

  it("pago de uma vez aparece só no mês da entrega; mudar para repartido por 12 aparece nos 12 meses", () => {
    noRouter();
    const set = totalDoCabecalho("equipamentos");
    irParaMes("2026-10");
    const out = totalDoCabecalho("equipamentos");
    irParaMes("2026-09");
    const painel = atribuirNoTopo("360", "2026-09-10");
    fireEvent.click(within(painel).getByRole("radio", { name: /Pago de uma vez/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    expect(lerCusto().equipamentos.at(-1)).toMatchObject({ descricao: "Colete de teste", conta: { modo: "umaVez" } });
    expect(euroDe(totalDoCabecalho("equipamentos")) - euroDe(set)).toBeCloseTo(360, 2);
    irParaMes("2026-10");
    expect(totalDoCabecalho("equipamentos")).toBe(out);

    fireEvent.click(within(linhaDe("Hugo Teixeira")).getByRole("button", { name: /Abrir a ficha de Hugo Teixeira/ }));
    const ficha = screen.getByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Alterar como conta de Colete de teste" }));
    const editar = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    fireEvent.click(within(editar).getByRole("radio", { name: /Repartido por N meses/ }));
    fireEvent.change(within(editar).getByLabelText(/Número de meses/), { target: { value: "12" } });
    expect(within(editar).getByRole("status")).toHaveTextContent(/360,00.* repartidos por 12 meses = 30,00.* por mês/);
    fireEvent.click(within(editar).getByRole("button", { name: "Guardar" }));
    expect(lerCusto().equipamentos.at(-1)?.conta).toMatchObject({ modo: "repartido", meses: 12 });
    expect(euroDe(totalDoCabecalho("equipamentos")) - euroDe(out)).toBeCloseTo(30, 2);
    const colete = lerCusto().equipamentos.at(-1) as EquipamentoPessoa;
    expect(["2026-09", "2026-10", "2027-08", "2027-09"].map((m) => valorDoEquipamentoNoMes(colete, m))).toEqual([30, 30, 30, 0]);
  });

  it("a ficha mostra Como conta, o que conta no mês, o que já contou e o que falta; o módulo mostra-o na linha aberta", () => {
    noRouter();
    fireEvent.click(within(linhaDe("Hugo Teixeira")).getByRole("button", { name: /Ver composição de Hugo Teixeira/ }));
    const itens = screen.getByRole("list", { name: /O que conta em setembro de 2026/ });
    expect(itens).toHaveTextContent(/Como conta: Todos os meses, desde/);
    expect(itens).toHaveTextContent(/Como conta: Repartido por 36 meses/);
    fireEvent.click(within(linhaDe("Hugo Teixeira")).getByRole("button", { name: /Abrir a ficha de Hugo Teixeira/ }));
    const tabela = within(screen.getByRole("dialog")).getByRole("table", { name: "Equipamentos atribuídos" });
    const cabecalhos = within(tabela).getAllByRole("columnheader").map((c) => c.textContent);
    for (const nome of ["Valor de aquisição", "Como conta", "Conta neste mês", "Já contou", "Falta contar"]) expect(cabecalhos).toContain(nome);
    expect(within(tabela).getByText(/389,00.* por mês/)).toBeInTheDocument();
  });

  it("registar um avulso noutro mês regista-o nesse mês (o período que está a ser visto)", async () => {
    noRouter();
    irParaMes("2026-08");
    fireEvent.click(screen.getByRole("button", { name: "Registar valor avulso" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(/Conta de uma vez, em agosto de 2026/)).toBeInTheDocument();
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Pessoa/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Inês Cardoso" }));
    fireEvent.change(within(dialogo).getByLabelText(/^Descrição/), { target: { value: "Formação" } });
    fireEvent.change(within(dialogo).getByLabelText(/^Valor/), { target: { value: "40" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar valor" }));
    await screen.findByText(/Valor registado\. Conta em agosto de 2026\./);
    expect(lerCusto().avulsos.at(-1)).toMatchObject({ valor: 40, data: "2026-08-01", conta: { modo: "umaVez" } });
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-08");
  });

  it("uma falha na leitura dos contratos aparece, e sem permissão diz-se", () => {
    estado.vinculos = { error: "Sem rede", recusado: false };
    noRouter();
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível ler os contratos da organização \(Sem rede\)/);
    cleanup();
    estado.vinculos = { error: null, recusado: true };
    noRouter();
    expect(screen.getByText(/Não tens permissão para ver os contratos/)).toBeInTheDocument();
  });
});
