// A identidade na ficha: um erro de validação leva o foco ao campo em falta e liga-lhe a mensagem; um nome de várias palavras avisa;
// e a pessoa indisponível (NG003) explica que a identidade não se edita, em vez da frase genérica.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import type { DadosIdentidade } from "@/hooks/pessoas/useGuardarIdentidadePessoa";
import { IdentidadeFichaReal } from "./IdentidadeFichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
beforeAll(prepararRadixNoJsdom);

type Props = Parameters<typeof IdentidadeFichaReal>[0];
function desenhar(sobre: Partial<Props> = {}) {
  const aoGuardar = vi.fn<(d: DadosIdentidade) => Promise<unknown>>().mockResolvedValue({});
  render(<IdentidadeFichaReal nome="Ana Lopes" tipo="person" empresaNome={null} podeEditar aoGuardar={aoGuardar} {...sobre} />);
  return { aoGuardar };
}
const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Editar identidade" }));
const escrever = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const guardar = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

describe("IdentidadeFichaReal: validação com foco e associação", () => {
  it("pessoa: sem apelido, o foco vai para o Apelido, que fica inválido e ligado à mensagem", async () => {
    const { aoGuardar } = desenhar();
    abrir();
    escrever("Apelido", "");
    guardar();
    const apelido = screen.getByLabelText("Apelido");
    const alerta = screen.getByRole("alert");
    await waitFor(() => expect(apelido).toHaveFocus());
    expect(apelido).toHaveAttribute("aria-invalid", "true");
    expect(apelido).toHaveAccessibleDescription(alerta.textContent ?? "");
    expect(screen.getByLabelText("Nome próprio")).not.toHaveAttribute("aria-invalid", "true");
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("pessoa: sem nome próprio, o foco vai para o Nome próprio", async () => {
    desenhar();
    abrir();
    escrever("Nome próprio", "");
    guardar();
    await waitFor(() => expect(screen.getByLabelText("Nome próprio")).toHaveFocus());
    expect(screen.getByLabelText("Nome próprio")).toHaveAttribute("aria-invalid", "true");
  });

  it("empresa sem nome: o foco vai para o Nome da empresa", async () => {
    desenhar({ nome: "Obras Lda", tipo: "organization", empresaNome: "Obras Lda" });
    abrir();
    escrever("Nome da empresa", "  ");
    guardar();
    const campo = screen.getByLabelText("Nome da empresa");
    await waitFor(() => expect(campo).toHaveFocus());
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveAccessibleDescription("Indique o nome da empresa.");
  });

  it("ao escrever, a marca de inválido e a mensagem saem", async () => {
    desenhar();
    abrir();
    escrever("Apelido", "");
    guardar();
    await waitFor(() => expect(screen.getByLabelText("Apelido")).toHaveFocus());
    escrever("Apelido", "Silva");
    expect(screen.getByLabelText("Apelido")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("IdentidadeFichaReal: nome com várias palavras", () => {
  it("três palavras: avisa que a divisão é um palpite e liga o aviso aos dois campos", () => {
    desenhar({ nome: "Ana Maria Silva" });
    abrir();
    const aviso = screen.getByText(/várias palavras/i);
    expect(screen.getByLabelText("Nome próprio")).toHaveAccessibleDescription(aviso.textContent ?? "");
    expect(screen.getByLabelText("Apelido")).toHaveAccessibleDescription(aviso.textContent ?? "");
  });

  it("duas palavras: sem aviso", () => {
    desenhar({ nome: "Ana Lopes" });
    abrir();
    expect(screen.queryByText(/várias palavras/i)).toBeNull();
  });

  it("uma empresa não leva o aviso", () => {
    desenhar({ nome: "Obras e Filhos Lda", tipo: "organization", empresaNome: "Obras e Filhos Lda" });
    abrir();
    expect(screen.queryByText(/várias palavras/i)).toBeNull();
  });
});

describe("IdentidadeFichaReal: pessoa indisponível (NG003)", () => {
  it("diz que a identidade não se edita aqui, e não só «Esta pessoa já não está disponível»", async () => {
    const aoGuardar = vi.fn().mockRejectedValue(new ErroNeg(null, "NG003", "pessoasPagina.erroNeg.ng003"));
    desenhar({ aoGuardar });
    abrir();
    escrever("Apelido", "Outro");
    guardar();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não pode ser editada/i);
  });

  it("outros erros mantêm a sua própria mensagem", async () => {
    const aoGuardar = vi.fn().mockRejectedValue(new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009"));
    desenhar({ aoGuardar });
    abrir();
    escrever("Apelido", "Outro");
    guardar();
    const alerta = await screen.findByRole("alert");
    expect(alerta).not.toHaveTextContent(/não pode ser editada/i);
  });
});
