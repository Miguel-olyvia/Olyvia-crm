import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { CondicoesForm } from "./condicoesProposta";
import { EnviarProposta } from "./EnviarProposta";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";

vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());

beforeAll(prepararRadixNoJsdom);

const HOJE = "2026-10-13";
const NEGOCIO: NegocioDoPasso = { id: "n1", nome: "Ana Silva", trabalho: "Cozinha" };
const INICIAIS: CondicoesForm = { validade: "30", prazo: "20", inicio: "", pagamento: "metade", garantia: "2", notas: "" };

function montar(extra: { faltas?: FaltaProcesso[]; iniciais?: Partial<CondicoesForm> } = {}) {
  const aoEnviar = vi.fn((_c: CondicoesForm): FaltaProcesso[] => extra.faltas ?? []);
  const aoFechar = vi.fn();
  const aoDevolverFoco = vi.fn(() => false);
  const explicar = (faltas: FaltaProcesso[]) => `não: ${faltas.join(",")}`;
  const ui = (negocio: NegocioDoPasso | null) => (
    <EnviarProposta
      negocio={negocio} total={1234.5} hoje={HOJE} iniciais={{ ...INICIAIS, ...extra.iniciais }} aoEnviar={aoEnviar} explicar={explicar}
      aoFechar={aoFechar} aoDevolverFoco={aoDevolverFoco}
    />
  );
  const { rerender } = render(ui(NEGOCIO));
  return { aoEnviar, aoFechar, aoDevolverFoco, fechar: () => rerender(ui(null)) };
}

const campo = (nome: string | RegExp) => screen.getByLabelText(nome);
const enviar = () => fireEvent.click(screen.getByRole("button", { name: "Enviar a proposta" }));
const preencherInicio = (dia = "2026-11-16") => fireEvent.change(campo("Início previsto"), { target: { value: dia } });

describe("EnviarProposta: o diálogo", () => {
  it("tem título e descrição com o trabalho, a pessoa e o total", () => {
    montar();
    const dialogo = screen.getByRole("dialog", { name: "Enviar a proposta de Cozinha" });
    expect(dialogo).toHaveAccessibleDescription(/Ana Silva.*1\.234,50 €.*Só exemplo/);
  });

  it("abre com os valores habituais: 30 dias, o prazo sugerido, 50 % + 50 % e 2 anos; o início por escolher", () => {
    montar();
    expect(screen.getByRole("radio", { name: "30 dias" })).toBeChecked();
    expect(campo("Prazo de execução (dias úteis)")).toHaveValue("20");
    expect(screen.getByRole("radio", { name: "50 % + 50 % no fim" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "2 anos" })).toBeChecked();
    expect(campo("Início previsto")).toHaveValue("");
  });

  it("oferece as três validades, as quatro formas de pagamento e as três garantias", () => {
    montar();
    for (const nome of ["15 dias", "30 dias", "60 dias", "100 % na adjudicação", "50 % + 50 % no fim", "30 % + 40 % + 30 %", "Por fases", "1 ano", "2 anos", "5 anos"]) {
      expect(screen.getByRole("radio", { name: nome }), nome).toBeInTheDocument();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(10);
  });

  it("o início não pode ser anterior a hoje (o campo já o diz)", () => {
    montar();
    expect(campo("Início previsto")).toHaveAttribute("min", HOJE);
  });
});

describe("EnviarProposta: campos obrigatórios e erros", () => {
  it("sem o início previsto não envia: erro em alerta ligado ao campo, foco nele", () => {
    const { aoEnviar } = montar();
    enviar();
    const inicio = campo("Início previsto");
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Escolha o início previsto.");
    expect(inicio).toHaveAttribute("aria-invalid", "true");
    expect(inicio.getAttribute("aria-describedby")).toContain(alerta.id);
    expect(inicio).toHaveFocus();
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it("um erro só aparece depois de tentar enviar", () => {
    montar();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([[""], ["0"], ["61"], ["1,5"], ["abc"]])("o prazo '%s' não serve: diz que é de 1 a 60 dias úteis", (prazo) => {
    const { aoEnviar } = montar();
    preencherInicio();
    fireEvent.change(campo("Prazo de execução (dias úteis)"), { target: { value: prazo } });
    enviar();
    expect(screen.getByRole("alert")).toHaveTextContent("O prazo tem de ser um número inteiro de dias úteis, de 1 a 60.");
    expect(campo("Prazo de execução (dias úteis)")).toHaveAttribute("aria-invalid", "true");
    expect(campo("Prazo de execução (dias úteis)")).toHaveFocus();
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it("um início no passado diz que não pode ser anterior a hoje", () => {
    const { aoEnviar } = montar();
    preencherInicio("2026-10-12");
    enviar();
    expect(screen.getByRole("alert")).toHaveTextContent("O início previsto não pode ser anterior a hoje.");
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it("as notas passam dos 140 caracteres: erro ligado ao campo; o contador diz quantos há", () => {
    const { aoEnviar } = montar();
    preencherInicio();
    const notas = campo("Notas para o cliente (opcional)");
    fireEvent.change(notas, { target: { value: "a".repeat(141) } });
    expect(screen.getByText("141 de 140 caracteres")).toBeInTheDocument();
    enviar();
    expect(screen.getByRole("alert")).toHaveTextContent("As notas não podem ter mais de 140 caracteres.");
    expect(notas.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
    expect(notas).toHaveFocus();
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it("vários erros: o foco vai para o primeiro campo com erro, pela ordem do formulário (prazo antes do início)", () => {
    montar({ iniciais: { prazo: "" } });
    enviar();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(campo("Prazo de execução (dias úteis)")).toHaveFocus();
  });

  it("o texto dos erros não depende da cor", () => {
    montar();
    enviar();
    expect(screen.getByRole("alert").className).toContain("text-foreground");
  });
});

describe("EnviarProposta: enviar", () => {
  it("com tudo preenchido entrega as condições tal como estão no formulário", () => {
    const { aoEnviar } = montar();
    preencherInicio();
    fireEvent.click(screen.getByRole("radio", { name: "60 dias" }));
    fireEvent.change(campo("Prazo de execução (dias úteis)"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("radio", { name: "Por fases" }));
    fireEvent.click(screen.getByRole("radio", { name: "5 anos" }));
    fireEvent.change(campo("Notas para o cliente (opcional)"), { target: { value: "Ligar antes." } });
    enviar();
    expect(aoEnviar).toHaveBeenCalledExactlyOnceWith({
      validade: "60", prazo: "25", inicio: "2026-11-16", pagamento: "fases", garantia: "5", notas: "Ligar antes.",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("as notas são opcionais: vazias não impedem o envio", () => {
    const { aoEnviar } = montar();
    preencherInicio();
    enviar();
    expect(aoEnviar).toHaveBeenCalledTimes(1);
  });

  it("se o envio diz que falta algo, diz-se dentro do diálogo (alerta), que continua aberto; a repetição volta a ser anunciada", () => {
    const { aoFechar } = montar({ faltas: ["porVerificar"] });
    preencherInicio();
    enviar();
    const primeiro = screen.getByRole("alert").textContent;
    expect(primeiro?.trim()).toBe("não: porVerificar");
    enviar();
    const segundo = screen.getByRole("alert").textContent;
    expect(segundo).not.toBe(primeiro);
    expect(segundo?.trim()).toBe("não: porVerificar");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe("EnviarProposta: fechar", () => {
  it("Esc e Cancelar fecham sem enviar", () => {
    const { aoFechar, aoEnviar } = montar();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(2);
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it("ao fechar pede para devolver o foco", async () => {
    const { fechar, aoDevolverFoco } = montar();
    fechar();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(aoDevolverFoco).toHaveBeenCalled());
  });

  it("os botões e os campos têm 44 px de altura", () => {
    montar();
    for (const nome of ["Cancelar", "Enviar a proposta"]) expect(screen.getByRole("button", { name: nome }).className).toContain("min-h-11");
    expect(campo("Início previsto").className).toContain("min-h-11");
    expect(campo("Prazo de execução (dias úteis)").className).toContain("min-h-11");
  });
});

describe("EnviarProposta: campos obrigatórios e tema escuro", () => {
  it("o prazo e o início têm aria-required e um asterisco visível fora do rótulo", () => {
    montar();
    expect(campo("Prazo de execução (dias úteis)")).toBeRequired();
    expect(campo("Início previsto")).toBeRequired();
    expect(campo("Notas para o cliente (opcional)")).not.toBeRequired();
    const dialogo = screen.getByRole("dialog");
    const asteriscos = Array.from(dialogo.querySelectorAll('[aria-hidden="true"]')).filter((m) => m.textContent === "*");
    expect(asteriscos.length).toBeGreaterThanOrEqual(2);
  });

  it("o seletor de data pede os controlos nativos escuros no tema escuro (color-scheme só neste controlo)", () => {
    montar();
    expect(campo("Início previsto").className).toContain("dark:[color-scheme:dark]");
  });

  it("os grupos de opções têm nome (a legenda)", () => {
    montar();
    expect(screen.getAllByRole("radiogroup").map((g) => g.getAttribute("aria-labelledby"))).not.toContain(null);
    expect(screen.getByRole("radiogroup", { name: "Validade da proposta" })).toBeInTheDocument();
  });
});
