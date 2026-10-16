import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { CATALOGO, novaLinhaDoCatalogo, type ChaveTrabalho } from "./catalogoTrabalhos";
import { EditorOrcamento } from "./EditorOrcamento";
import type { LinhaTrabalho } from "./orcamentoCalculo";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";
import type { DadosDoOrcamento } from "./transicoes";

vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());

beforeAll(prepararRadixNoJsdom);

const NEGOCIO: NegocioDoPasso = { id: "n1", nome: "Ana Silva", trabalho: "Cozinha" };
const linha = (trabalho: ChaveTrabalho, quantidade: number, precoUnitario?: number): LinhaTrabalho => ({
  ...novaLinhaDoCatalogo(trabalho, `l-${trabalho}`), quantidade, ...(precoUnitario === undefined ? {} : { precoUnitario }),
});

interface Extras {
  linhas?: LinhaTrabalho[];
  desconto?: number;
  vendaDireta?: boolean;
  versao?: number;
  faltas?: FaltaProcesso[];
}

function montar(extra: Extras = {}) {
  const aoGuardar = vi.fn((_d: DadosDoOrcamento): FaltaProcesso[] => extra.faltas ?? []);
  const aoFechar = vi.fn();
  const aoDevolverFoco = vi.fn(() => false);
  const inicial = { linhas: extra.linhas ?? [], desconto: extra.desconto ?? 0, vendaDireta: extra.vendaDireta ?? false, versao: extra.versao ?? 1 };
  const ui = (negocio: NegocioDoPasso | null) => (
    <EditorOrcamento
      negocio={negocio} inicial={inicial} aoGuardar={aoGuardar} explicar={(f) => `não: ${f.join(",")}`} aoFechar={aoFechar}
      aoDevolverFoco={aoDevolverFoco}
    />
  );
  const { rerender } = render(ui(NEGOCIO));
  return { aoGuardar, aoFechar, aoDevolverFoco, fechar: () => rerender(ui(null)) };
}

const campo = (nome: string | RegExp) => screen.getByLabelText(nome);
const guardar = () => fireEvent.click(screen.getByRole("button", { name: "Guardar o orçamento" }));
const totais = () => within(screen.getByRole("group", { name: "Totais do orçamento" }));
const juntar = async (servico: string) => {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Juntar um serviço" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: servico }));
};

describe("EditorOrcamento: o diálogo", () => {
  it("tem título e descrição; a versão só aparece a partir da segunda", () => {
    montar();
    const dialogo = screen.getByRole("dialog", { name: "Orçamento de Cozinha" });
    expect(dialogo).toHaveAccessibleDescription(/Ana Silva.*Só exemplo/);
  });

  it("com a versão 2 o título di-lo", () => {
    montar({ versao: 2 });
    expect(screen.getByRole("dialog", { name: "Orçamento de Cozinha · versão 2" })).toBeInTheDocument();
  });

  it("começa com as linhas que lhe dão (as do levantamento da visita): quantidade e preço em cada uma, com nomes únicos", () => {
    montar({ linhas: [linha("pavimento", 15.5), linha("pintura", 40)] });
    const lista = screen.getByRole("list", { name: "Linhas do orçamento" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(campo("Quantidade de Pavimento")).toHaveValue("15,5");
    expect(campo("Preço unit. (€) de Pavimento")).toHaveValue("30");
    expect(campo("Quantidade de Pintura")).toHaveValue("40");
    expect(campo("Preço unit. (€) de Pintura")).toHaveValue("8");
  });

  it("um trabalho escrito à mão no levantamento aparece com o seu nome", () => {
    montar({ linhas: [{ ...linha("outro", 1), nome: "Lareira" }] });
    expect(campo("Quantidade de Lareira")).toBeInTheDocument();
  });

  it("sem linhas diz que ainda não há nenhuma e como começar", () => {
    montar();
    expect(screen.getByText("Ainda sem linhas. Junte o primeiro serviço.")).toBeInTheDocument();
  });
});

describe("EditorOrcamento: totais e margem em tempo real", () => {
  it("mostra o valor sem IVA, o IVA, o total e a margem, e atualiza ao mudar a quantidade", () => {
    montar({ linhas: [linha("pavimento", 1)] });
    expect(totais().getByText("31,80 €")).toBeInTheDocument();
    fireEvent.change(campo("Quantidade de Pavimento"), { target: { value: "10" } });
    expect(totais().getByText("Sem IVA").nextElementSibling).toHaveTextContent("300,00 €");
    expect(totais().getByText("IVA (6 % mão de obra, 23 % materiais)").nextElementSibling).toHaveTextContent("18,00 €");
    expect(totais().getByText("Total").nextElementSibling).toHaveTextContent("318,00 €");
    expect(totais().getByText("Margem").nextElementSibling).toHaveTextContent("40 %");
  });

  it("muda ao mudar o preço (vírgula decimal incluída) e o total da linha acompanha", () => {
    montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.change(campo("Preço unit. (€) de Pavimento"), { target: { value: "25" } });
    expect(totais().getByText("Margem").nextElementSibling).toHaveTextContent("28 %");
    fireEvent.change(campo("Quantidade de Pavimento"), { target: { value: "2,5" } });
    expect(totais().getByText("Sem IVA").nextElementSibling).toHaveTextContent("62,50 €");
    expect(screen.getByText("Linha: 62,50 €")).toBeInTheDocument();
  });

  it("o desconto desce o total (10 % de 300 € dão 270 € sem IVA)", () => {
    montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.change(campo("Desconto (%)"), { target: { value: "10" } });
    expect(totais().getByText("Sem IVA").nextElementSibling).toHaveTextContent("270,00 €");
    expect(totais().getByText("Total").nextElementSibling).toHaveTextContent("286,20 €");
  });

  it("sem linhas os totais são zero", () => {
    montar();
    expect(totais().getByText("Total").nextElementSibling).toHaveTextContent("0,00 €");
  });
});

describe("EditorOrcamento: juntar e tirar linhas", () => {
  it("junta uma linha do catálogo (1 unidade ao preço de lista) e o serviço deixa de se oferecer", async () => {
    montar({ linhas: [linha("pintura", 40)] });
    await juntar("Pavimento");
    expect(campo("Quantidade de Pavimento")).toHaveValue("1");
    expect(campo("Preço unit. (€) de Pavimento")).toHaveValue("30");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Juntar um serviço" }), { key: "Enter" });
    expect(screen.queryByRole("option", { name: "Pavimento" })).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Trocar sanita" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Pintura" })).not.toBeInTheDocument();
  });

  it("a linha nova leva o foco (a quantidade)", async () => {
    montar();
    await juntar("Pavimento");
    await waitFor(() => expect(campo("Quantidade de Pavimento")).toHaveFocus());
  });

  it("'Tirar' tira a linha e o foco vai para a linha vizinha (e, sem linhas, para o campo de juntar serviços)", () => {
    montar({ linhas: [linha("pavimento", 10), linha("pintura", 40)] });
    fireEvent.click(screen.getByRole("button", { name: "Tirar Pavimento" }));
    expect(screen.queryByLabelText("Quantidade de Pavimento")).not.toBeInTheDocument();
    expect(campo("Quantidade de Pintura")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Tirar Pintura" }));
    expect(screen.getByRole("combobox", { name: "Juntar um serviço" })).toHaveFocus();
  });

  it("os botões 'Tirar' têm nomes únicos e começam pelo texto visível", () => {
    montar({ linhas: [linha("pavimento", 10), linha("pintura", 40)] });
    const nomes = screen.getAllByRole("button", { name: /^Tirar / }).map((b) => b.getAttribute("aria-label"));
    expect(nomes).toEqual(["Tirar Pavimento", "Tirar Pintura"]);
  });
});

describe("EditorOrcamento: guardar", () => {
  it("entrega as linhas (números, com a vírgula decimal lida), o desconto e a venda direta", () => {
    const { aoGuardar } = montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.change(campo("Quantidade de Pavimento"), { target: { value: "12,5" } });
    fireEvent.change(campo("Preço unit. (€) de Pavimento"), { target: { value: "31,5" } });
    fireEvent.change(campo("Desconto (%)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("switch", { name: /Venda direta/ }));
    guardar();
    expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({
      linhas: [{ ...linha("pavimento", 12.5, 31.5) }], desconto: 5, vendaDireta: true,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a venda direta explica o que faz e arranca como estava", () => {
    montar({ vendaDireta: true });
    const interruptor = screen.getByRole("switch", { name: /Venda direta/ });
    expect(interruptor).toBeChecked();
    expect(interruptor).toHaveAccessibleDescription("A proposta aceite dispensa o contrato.");
  });

  it("sem nenhuma linha, o portão diz que falta uma linha, num alerta dentro do diálogo, que continua aberto", () => {
    const { aoFechar } = montar({ faltas: ["orcamentoLinhas"] });
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("não: orcamentoLinhas");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("o mesmo motivo repetido volta a ser anunciado (o texto alterna um espaço inseparável)", () => {
    montar({ faltas: ["orcamentoLinhas"] });
    guardar();
    const primeiro = screen.getByRole("alert").textContent;
    guardar();
    const segundo = screen.getByRole("alert").textContent;
    expect(segundo).not.toBe(primeiro);
    expect(segundo?.trim()).toBe(primeiro?.trim());
  });
});

describe("EditorOrcamento: erros de campo", () => {
  it.each([["0"], [""], ["-2"], ["abc"]])("a quantidade '%s' não serve: erro em alerta ligado ao campo, foco nele e nada se guarda", (valor) => {
    const { aoGuardar } = montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.change(campo("Quantidade de Pavimento"), { target: { value: valor } });
    guardar();
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("A quantidade de Pavimento tem de ser maior que 0.");
    expect(alerta.className).toContain("text-foreground");
    const q = campo("Quantidade de Pavimento");
    expect(q).toHaveAttribute("aria-invalid", "true");
    expect(q.getAttribute("aria-describedby")).toContain(alerta.id);
    expect(q).toHaveFocus();
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("o preço a 0 não serve", () => {
    const { aoGuardar } = montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.change(campo("Preço unit. (€) de Pavimento"), { target: { value: "0" } });
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("O preço de Pavimento tem de ser maior que 0.");
    expect(campo("Preço unit. (€) de Pavimento")).toHaveFocus();
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it.each([["60"], ["-1"], ["abc"], ["50,5"]])("o desconto '%s' não serve (de 0 a 50 %)", (valor) => {
    const { aoGuardar } = montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.change(campo("Desconto (%)"), { target: { value: valor } });
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("O desconto tem de ser um número de 0 a 50 %.");
    expect(campo("Desconto (%)")).toHaveAttribute("aria-invalid", "true");
    expect(campo("Desconto (%)")).toHaveFocus();
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("o desconto vazio conta como 0 e 50 serve", () => {
    const { aoGuardar } = montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.change(campo("Desconto (%)"), { target: { value: "" } });
    guardar();
    expect(aoGuardar).toHaveBeenLastCalledWith(expect.objectContaining({ desconto: 0 }));
    fireEvent.change(campo("Desconto (%)"), { target: { value: "50" } });
    guardar();
    expect(aoGuardar).toHaveBeenLastCalledWith(expect.objectContaining({ desconto: 50 }));
  });

  it("os erros só aparecem depois de tentar guardar, e o foco vai para o primeiro (pela ordem das linhas)", () => {
    montar({ linhas: [linha("pavimento", 10), linha("pintura", 40)] });
    fireEvent.change(campo("Quantidade de Pintura"), { target: { value: "0" } });
    fireEvent.change(campo("Preço unit. (€) de Pavimento"), { target: { value: "0" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    guardar();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(campo("Preço unit. (€) de Pavimento")).toHaveFocus();
  });
});

describe("EditorOrcamento: fechar", () => {
  it("Esc e Cancelar fecham sem guardar", () => {
    const { aoFechar, aoGuardar } = montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(2);
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("ao fechar pede para devolver o foco", async () => {
    const { fechar, aoDevolverFoco } = montar();
    fechar();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(aoDevolverFoco).toHaveBeenCalled());
  });

  it("os botões e os campos têm 44 px de altura", () => {
    montar({ linhas: [linha("pavimento", 10)] });
    for (const nome of ["Cancelar", "Guardar o orçamento", "Tirar Pavimento"]) expect(screen.getByRole("button", { name: nome }).className).toContain("min-h-11");
    for (const nome of ["Quantidade de Pavimento", "Preço unit. (€) de Pavimento", "Desconto (%)"]) expect(campo(nome).className).toContain("min-h-11");
  });
});

describe("EditorOrcamento: o total de cada linha não é uma região live (anunciaria a cada tecla)", () => {
  it("não há nenhum <output> nem região live dentro das linhas; o total liga-se aos campos por aria-describedby e nomeia o trabalho", () => {
    montar({ linhas: [linha("pavimento", 10), linha("pintura", 5)] });
    const lista = screen.getByRole("list", { name: "Linhas do orçamento" });
    expect(lista.querySelectorAll("output")).toHaveLength(0);
    expect(within(lista).queryAllByRole("status")).toHaveLength(0);
    expect(campo("Quantidade de Pavimento")).toHaveAccessibleDescription(/Linha: 300,00\s€\sde Pavimento/);
    expect(campo("Preço unit. (€) de Pavimento")).toHaveAccessibleDescription(/Linha: 300,00\s€\sde Pavimento/);
    expect(campo("Quantidade de Pintura")).toHaveAccessibleDescription(/Linha: 40,00\s€\sde Pintura/);
  });

  it("a unidade (m², un.) liga-se ao campo da quantidade por aria-describedby", () => {
    montar({ linhas: [linha("pavimento", 10), linha("canalizacao", 1)] });
    expect(campo("Quantidade de Pavimento")).toHaveAccessibleDescription(/m²/);
    expect(campo("Quantidade de Trocar canalização")).toHaveAccessibleDescription(/\bun\b/);
  });

  it("depois de mudar a quantidade o total descrito acompanha", () => {
    montar({ linhas: [linha("pavimento", 10)] });
    fireEvent.change(campo("Quantidade de Pavimento"), { target: { value: "2,5" } });
    expect(campo("Quantidade de Pavimento")).toHaveAccessibleDescription(/Linha: 75,00\s€\sde Pavimento/);
  });
});

describe("EditorOrcamento: 'Tirar' diz o que fez e leva o foco ao sítio lógico", () => {
  const tirar = (servico: string) => fireEvent.click(screen.getByRole("button", { name: `Tirar ${servico}` }));
  const estado = (texto: RegExp) => screen.getByText(texto).closest('[role="status"]');

  it("com duas linhas, tirar a primeira diz '{trabalho} tirado. 1 linha.' num estado dentro do diálogo e foca a quantidade da linha vizinha", () => {
    montar({ linhas: [linha("pavimento", 10), linha("pintura", 5)] });
    tirar("Pavimento");
    const aviso = estado(/Pavimento tirado\. 1 linha\./);
    expect(aviso).not.toBeNull();
    expect(screen.getByRole("dialog").contains(aviso)).toBe(true);
    expect(campo("Quantidade de Pintura")).toHaveFocus();
  });

  it("tirar a última linha foca a quantidade da anterior e diz quantas ficam", () => {
    montar({ linhas: [linha("pavimento", 10), linha("pintura", 5), linha("paredes", 3)] });
    tirar("Paredes");
    expect(estado(/Paredes tirado\. 2 linhas\./)).not.toBeNull();
    expect(campo("Quantidade de Pintura")).toHaveFocus();
  });

  it("tirar a única linha diz que já não há linhas e foca 'Juntar um serviço'", () => {
    montar({ linhas: [linha("pavimento", 10)] });
    tirar("Pavimento");
    expect(estado(/Pavimento tirado\. Sem linhas\./)).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Juntar um serviço" })).toHaveFocus();
  });

  it("a região de estado já existe (vazia) antes de tirar nada, para o leitor de ecrã a anunciar; e tirar duas vezes seguidas anuncia as duas", () => {
    montar({ linhas: [linha("pavimento", 10), linha("pintura", 5), linha("paredes", 3)] });
    const antes = within(screen.getByRole("dialog")).getAllByRole("status").filter((r) => r.textContent === "");
    expect(antes.length).toBeGreaterThan(0);
    tirar("Paredes");
    const primeiro = estado(/Paredes tirado/)?.textContent;
    tirar("Pintura");
    const segundo = estado(/Pintura tirado/)?.textContent;
    expect(primeiro).toBeTruthy();
    expect(segundo).toContain("1 linha.");
  });
});

describe("EditorOrcamento: pormenores", () => {
  it("a etiqueta 'Juntar um serviço' só existe quando há serviços por juntar (sem eles fica só o texto)", () => {
    const todos = (Object.keys(CATALOGO) as ChaveTrabalho[]).map((c) => linha(c, 1));
    montar({ linhas: todos });
    expect(screen.queryByText("Juntar um serviço")).not.toBeInTheDocument();
    expect(screen.getByText("Já juntou todos os serviços do catálogo.")).toBeInTheDocument();
  });

  it("com serviços por juntar a etiqueta existe e está ligada ao seletor", () => {
    montar({ linhas: [linha("pavimento", 1)] });
    expect(screen.getByText("Juntar um serviço", { selector: "label" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Juntar um serviço" })).toBeInTheDocument();
  });

  it("o motivo de bloqueio limpa-se quando o utilizador volta a editar (quantidade, preço, desconto, venda direta, juntar ou tirar)", async () => {
    montar({ linhas: [linha("pavimento", 10), linha("pintura", 5)], faltas: ["orcamentoLinhas"] });
    const bloqueado = () => {
      guardar();
      expect(screen.getByRole("alert")).toHaveTextContent("não: orcamentoLinhas");
    };
    bloqueado();
    fireEvent.change(campo("Quantidade de Pavimento"), { target: { value: "11" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    bloqueado();
    fireEvent.change(campo("Preço unit. (€) de Pavimento"), { target: { value: "31" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    bloqueado();
    fireEvent.change(campo("Desconto (%)"), { target: { value: "5" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    bloqueado();
    fireEvent.click(screen.getByRole("switch", { name: "Venda direta" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    bloqueado();
    fireEvent.click(screen.getByRole("button", { name: "Tirar Pintura" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    bloqueado();
    await juntar("Teto");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("EditorOrcamento: campos obrigatórios", () => {
  it("quantidade e preço têm aria-required e um asterisco visível fora do rótulo (o nome acessível não muda)", () => {
    montar({ linhas: [linha("pavimento", 10)] });
    expect(campo("Quantidade de Pavimento")).toBeRequired();
    expect(campo("Preço unit. (€) de Pavimento")).toBeRequired();
    const marcas = screen.getByRole("list", { name: "Linhas do orçamento" }).querySelectorAll('[aria-hidden="true"]');
    const asteriscos = Array.from(marcas).filter((m) => m.textContent === "*");
    expect(asteriscos).toHaveLength(2);
  });

  it("o desconto e a venda direta não são obrigatórios", () => {
    montar({ linhas: [linha("pavimento", 10)] });
    expect(campo("Desconto (%)")).not.toBeRequired();
  });
});
