// A identidade da pessoa na ficha real: tipo e nome (e nome da empresa, como em Clientes), SEM NIF. Edita-se com `aoGuardar`; um erro da base
// aparece traduzido e não fecha o formulário.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import type { DadosIdentidade } from "@/hooks/pessoas/useGuardarIdentidadePessoa";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { IdentidadeFichaReal } from "./IdentidadeFichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
beforeAll(prepararRadixNoJsdom);

type Props = Parameters<typeof IdentidadeFichaReal>[0];
function desenhar(sobre: Partial<Props> = {}) {
  const aoGuardar = vi.fn<(d: DadosIdentidade) => Promise<unknown>>().mockResolvedValue({});
  const props: Props = { nome: "Ana Maria Lopes", tipo: "person", empresaNome: null, podeEditar: true, aoGuardar, ...sobre };
  return { aoGuardar, ...render(<IdentidadeFichaReal {...props} />) };
}
const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Editar identidade" }));
const escrever = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const guardar = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
// Ao editar a identidade, a NG003 genérica («Esta pessoa já não está disponível») dá lugar a um texto que explica que a identidade não se edita.
const TEXTO_NG003 = pessoasPaginaTranslations.pt["pessoasPagina.real.ficha.identity.errorUnavailable"];

describe("IdentidadeFichaReal: o que mostra", () => {
  it("uma pessoa singular: o tipo e o nome", () => {
    desenhar();
    expect(screen.getByRole("heading", { name: "Identidade" })).toBeInTheDocument();
    expect(screen.getByText("Pessoa singular")).toBeInTheDocument();
    expect(screen.getByText("Ana Maria Lopes")).toBeInTheDocument();
  });

  it("uma empresa: o tipo e o nome da empresa", () => {
    desenhar({ nome: "Obras Lda", tipo: "organization", empresaNome: "Obras Lda" });
    expect(screen.getByText("Empresa")).toBeInTheDocument();
    expect(screen.getByText("Nome da empresa")).toBeInTheDocument();
    expect(screen.getByText("Obras Lda")).toBeInTheDocument();
  });

  it("nunca mostra nem pede NIF", () => {
    desenhar();
    abrir();
    expect(screen.queryByText(/nif/i)).toBeNull();
    expect(screen.queryByLabelText(/nif/i)).toBeNull();
  });

  it("sem o tipo (uma leitura antiga da base) mostra o nome e não oferece editar", () => {
    desenhar({ tipo: null });
    expect(screen.getByText("Ana Maria Lopes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar identidade" })).toBeNull();
  });

  it("sem permissão para editar não há botão", () => {
    desenhar({ podeEditar: false });
    expect(screen.queryByRole("button", { name: "Editar identidade" })).toBeNull();
  });
});

describe("IdentidadeFichaReal: editar uma empresa", () => {
  const empresa = { nome: "Obras Lda", tipo: "organization" as const, empresaNome: "Obras Lda" };

  it("abre com o tipo e o nome atuais e guarda o novo nome (aparado), fechando em sucesso", async () => {
    const { aoGuardar } = desenhar(empresa);
    abrir();
    expect(screen.getByRole("radio", { name: "Empresa" })).toBeChecked();
    expect(screen.getByLabelText("Nome da empresa")).toHaveValue("Obras Lda");
    escrever("Nome da empresa", "  Obras Novas Lda  ");
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ tipo: "organization", nomeEmpresa: "Obras Novas Lda" }));
    await waitFor(() => expect(screen.queryByLabelText("Nome da empresa")).toBeNull());
  });

  it("mudar para pessoa singular exige nome próprio e apelido (sem chamar a base)", () => {
    const { aoGuardar } = desenhar(empresa);
    abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Pessoa singular" }));
    expect(screen.getByLabelText("Nome próprio")).toHaveValue("");
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique o nome próprio e o apelido.");
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("mudar para pessoa singular com nome e apelido guarda os dois", async () => {
    const { aoGuardar } = desenhar(empresa);
    abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Pessoa singular" }));
    escrever("Nome próprio", "Rui");
    escrever("Apelido", "Sousa");
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ tipo: "person", nomeProprio: "Rui", apelido: "Sousa" }));
  });

  it("um nome de empresa só com espaços é recusado", () => {
    const { aoGuardar } = desenhar(empresa);
    abrir();
    escrever("Nome da empresa", "   ");
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique o nome da empresa.");
    expect(aoGuardar).not.toHaveBeenCalled();
  });
});

describe("IdentidadeFichaReal: editar uma pessoa singular", () => {
  it("abre com o nome partido em nome próprio e apelido", () => {
    desenhar();
    abrir();
    expect(screen.getByRole("radio", { name: "Pessoa singular" })).toBeChecked();
    expect(screen.getByLabelText("Nome próprio")).toHaveValue("Ana");
    expect(screen.getByLabelText("Apelido")).toHaveValue("Maria Lopes");
  });

  it("mudar para empresa exige o nome da empresa e guarda-o", async () => {
    const { aoGuardar } = desenhar();
    abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    expect(screen.getByLabelText("Nome da empresa")).toHaveValue("");
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique o nome da empresa.");
    expect(aoGuardar).not.toHaveBeenCalled();
    escrever("Nome da empresa", "Lopes e Filhos");
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ tipo: "organization", nomeEmpresa: "Lopes e Filhos" }));
  });

  it("alterar o nome manda nome próprio e apelido", async () => {
    const { aoGuardar } = desenhar();
    abrir();
    escrever("Apelido", "Gomes");
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ tipo: "person", nomeProprio: "Ana", apelido: "Gomes" }));
  });

  it("esvaziar só um dos dois nomes é recusado", () => {
    const { aoGuardar } = desenhar();
    abrir();
    escrever("Apelido", "");
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique o nome próprio e o apelido.");
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("guardar sem mudar nada fecha sem chamar a base", () => {
    const { aoGuardar } = desenhar();
    abrir();
    guardar();
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nome próprio")).toBeNull();
  });

  it("um nome de uma só palavra não rebenta (apelido vazio, recusado até se preencher)", () => {
    desenhar({ nome: "Madonna" });
    abrir();
    expect(screen.getByLabelText("Nome próprio")).toHaveValue("Madonna");
    expect(screen.getByLabelText("Apelido")).toHaveValue("");
  });
});

describe("IdentidadeFichaReal: guardar, erros e foco", () => {
  it("um erro da base aparece traduzido e o formulário não fecha", async () => {
    const aoGuardar = vi.fn().mockRejectedValue(new ErroNeg(null, "NG003", "pessoasPagina.erroNeg.ng003"));
    desenhar({ aoGuardar, nome: "Obras Lda", tipo: "organization", empresaNome: "Obras Lda" });
    abrir();
    escrever("Nome da empresa", "Outra");
    guardar();
    expect(await screen.findByRole("alert")).toHaveTextContent(TEXTO_NG003);
    expect(screen.getByLabelText("Nome da empresa")).toHaveValue("Outra");
  });

  it("enquanto guarda o botão fica ocupado (aria-disabled, continua focável), e um segundo clique não repete o pedido nem cancela", async () => {
    let terminar: () => void = () => undefined;
    const aoGuardar = vi.fn().mockReturnValue(new Promise<void>((r) => { terminar = r; }));
    desenhar({ aoGuardar, nome: "Obras Lda", tipo: "organization", empresaNome: "Obras Lda" });
    abrir();
    escrever("Nome da empresa", "Outra");
    guardar();
    const botao = screen.getByRole("button", { name: /A guardar/ });
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Nome da empresa")).toBeInTheDocument();
    terminar();
    await waitFor(() => expect(screen.queryByLabelText("Nome da empresa")).toBeNull());
  });

  it("cancelar fecha sem guardar e devolve o foco ao botão de editar", async () => {
    const { aoGuardar } = desenhar();
    abrir();
    escrever("Apelido", "Outro");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoGuardar).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar identidade" })).toHaveFocus());
  });

  it("depois de guardar o foco volta ao botão de editar", async () => {
    desenhar({ nome: "Obras Lda", tipo: "organization", empresaNome: "Obras Lda" });
    abrir();
    escrever("Nome da empresa", "Outra");
    guardar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar identidade" })).toHaveFocus());
  });

  it("reabrir depois de cancelar volta aos valores da base, não ao que se escreveu", () => {
    desenhar();
    abrir();
    escrever("Apelido", "Outro");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    abrir();
    expect(screen.getByLabelText("Apelido")).toHaveValue("Maria Lopes");
  });
});

describe("IdentidadeFichaReal: nome em duas partes da base", () => {
  it("abre com first_name e last_name (Ana Maria + Silva) e sem o aviso de palpite", () => {
    desenhar({ nome: "Ana Maria Silva", nomeProprio: "Ana Maria", apelido: "Silva" });
    abrir();
    expect(screen.getByLabelText("Nome próprio")).toHaveValue("Ana Maria");
    expect(screen.getByLabelText("Apelido")).toHaveValue("Silva");
    expect(screen.queryByText(/palpite/)).toBeNull();
  });

  it("sem as duas partes, mantém o palpite e o aviso", () => {
    desenhar({ nome: "Ana Maria Silva" });
    abrir();
    expect(screen.getByLabelText("Nome próprio")).toHaveValue("Ana");
    expect(screen.getByText(/palpite/)).toBeInTheDocument();
  });

  it("mudar só o apelido manda as duas partes tal como estão", async () => {
    const { aoGuardar } = desenhar({ nome: "Ana Maria Silva", nomeProprio: "Ana Maria", apelido: "Silva" });
    abrir();
    escrever("Apelido", "Santos");
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ tipo: "person", nomeProprio: "Ana Maria", apelido: "Santos" }));
  });
});
