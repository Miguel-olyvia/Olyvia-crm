// O grupo «Quem pede» do passo Chamada: o tipo de cliente e o NIF, gravados pelos hooks próprios (simulados aqui) com a ordem contacto, tipo, NIF.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { Pessoa } from "../pessoasTipos";
import { ContactoDoGuia, type ContactoDoGuiaProps } from "./ContactoDoGuia";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

const estado = vi.hoisted(() => ({
  substituir: vi.fn(),
  preferencias: vi.fn(),
  guardarNif: vi.fn(),
  guardarIdentidade: vi.fn(),
  tipoRecebido: undefined as unknown,
}));

vi.mock("@/hooks/pessoas/useGuardarQualificacao", async (original) => ({
  ...(await original<object>()),
  useGuardarQualificacao: () => ({ guardar: vi.fn(), aGuardar: false, pronto: true }),
}));
vi.mock("@/hooks/pessoas/useSubstituirContactoPessoa", () => ({ useSubstituirContactoPessoa: () => ({ guardar: estado.substituir }) }));
vi.mock("@/hooks/pessoas/useGuardarContactoPessoa", async (original) => ({
  ...(await original<object>()),
  useGuardarContactoPessoa: () => ({ guardar: estado.preferencias }),
}));
vi.mock("@/hooks/pessoas/useGuardarNifPessoa", () => ({ useGuardarNifPessoa: () => ({ guardar: estado.guardarNif }) }));
vi.mock("@/hooks/pessoas/useGuardarIdentidadePessoa", () => ({
  useGuardarIdentidadePessoa: (_id: string, tipo: unknown) => { estado.tipoRecebido = tipo; return { guardar: estado.guardarIdentidade }; },
}));
vi.mock("@/hooks/pessoas/QuestionarioFormularioProvider", async () => {
  const { QuestionarioContext } = await import("@/components/negocio-metas/QuestionarioContexto");
  return {
    QuestionarioFormularioProvider: ({ children }: { children: ReactNode }) => (
      <QuestionarioContext.Provider
        value={{ questionario: { versao: 4, semBase: false, seccoes: [] } as QuestionarioForm, estado: "pronto", erro: null, podeGuardar: true, repetir: vi.fn(), recarregar: async () => null }}
      >
        {children}
      </QuestionarioContext.Provider>
    ),
  };
});

const PESSOA = {
  id: "pe1", nome: "Ana Lopes", contacto: { telefone: "927 118 300", email: "ana@exemplo.pt" }, comercial: "Rita", ultimoContactoDias: null,
  lingua: "pt", tipoCliente: "particular",
} as unknown as Pessoa;

function montar(pessoa: Partial<Pessoa> = {}, extra: Partial<ContactoDoGuiaProps> = {}) {
  const props: ContactoDoGuiaProps = {
    pessoa: { ...PESSOA, ...pessoa }, negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 0, visitaMarcada: false, podeEditar: true,
    podeRegistarChamada: true, aoRegistarChamada: vi.fn(), aoCriarNegocio: vi.fn(), aoMarcarVisita: vi.fn(), feitas: [], aoVerFase: vi.fn(), nivel: "h3",
    faseRotuloChave: "pessoasPagina.board.col.contactado", ...extra,
  };
  render(<ContactoDoGuia {...props} />);
  return props;
}
const continuar = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
const escrever = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const noPassoSeguinte = () => waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).toBeInTheDocument());

beforeEach(() => {
  window.sessionStorage.clear();
  estado.substituir.mockReset().mockResolvedValue({ mudou: true });
  estado.preferencias.mockReset().mockResolvedValue({ mudou: true });
  estado.guardarNif.mockReset().mockResolvedValue({ nifUltimos3: "789", mudou: true });
  estado.guardarIdentidade.mockReset().mockResolvedValue({ mudou: true });
});
afterEach(cleanup);

describe("Chamada: o grupo «Quem pede»", () => {
  it("aparece abaixo do contacto com o tipo de cliente atual e o NIF por preencher", () => {
    montar();
    const grupo = screen.getByRole("group", { name: "Quem pede" });
    expect(within(grupo).getByRole("radio", { name: "Particular" })).toBeChecked();
    expect(within(grupo).getByRole("radio", { name: "Empresa" })).not.toBeChecked();
    expect(within(grupo).getByRole("radio", { name: "Condomínio" })).not.toBeChecked();
    expect(within(grupo).getByLabelText("NIF")).toHaveValue("");
    expect(within(grupo).getByText("Ainda sem NIF.")).toBeInTheDocument();
  });

  it("diz quando a pessoa já tem NIF, sem o mostrar", () => {
    montar({ nifUltimos3: "789", temNif: true });
    expect(screen.getByText("NIF terminado em 789. O número completo não se mostra.")).toBeInTheDocument();
    expect(screen.getByLabelText("NIF")).toHaveValue("");
  });

  it("um NIF válido grava-se só com os dígitos e avança", async () => {
    montar();
    escrever("NIF", "123 456 789");
    continuar();
    await noPassoSeguinte();
    expect(estado.guardarNif).toHaveBeenCalledTimes(1);
    expect(estado.guardarNif).toHaveBeenCalledWith("123456789");
    expect(estado.guardarIdentidade).not.toHaveBeenCalled();
  });

  it("sem tocar no NIF não chama a base (nem limpa o que a pessoa já tem)", async () => {
    montar({ nifUltimos3: "789", temNif: true });
    continuar();
    await noPassoSeguinte();
    expect(estado.guardarNif).not.toHaveBeenCalled();
  });

  it("esvaziar o NIF limpa-o sempre, tenha a ficha NIF ou não (a função é idempotente)", async () => {
    montar({ nifUltimos3: "789", temNif: true });
    escrever("NIF", "123456789");
    escrever("NIF", "");
    continuar();
    await noPassoSeguinte();
    expect(estado.guardarNif).toHaveBeenCalledWith("");
    cleanup();
    estado.guardarNif.mockClear();
    montar();
    escrever("NIF", "12");
    escrever("NIF", "");
    continuar();
    await noPassoSeguinte();
    expect(estado.guardarNif).toHaveBeenCalledTimes(1);
    expect(estado.guardarNif).toHaveBeenCalledWith("");
  });

  it("um NIF inválido não grava nada (nem o telefone), diz porquê, marca o campo e não avança", async () => {
    montar();
    escrever("Telefone", "910 000 000");
    escrever("NIF", "123456780");
    continuar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Indique um NIF válido, com 9 dígitos.");
    expect(screen.getByLabelText("NIF")).toHaveAttribute("aria-invalid", "true");
    expect(estado.guardarNif).not.toHaveBeenCalled();
    expect(estado.substituir).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 3, name: "Chamada" })).toBeInTheDocument();
  });

  it("um NIF que já é de outra pessoa (NG030) diz-se, liga-se ao campo e fica no passo", async () => {
    estado.guardarNif.mockRejectedValue(new ErroNeg(null, "NG030", "pessoasPagina.erroNeg.ng030"));
    montar();
    escrever("NIF", "123456789");
    continuar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Este NIF já pertence a outra pessoa desta organização.");
    await waitFor(() => expect(screen.getByLabelText("NIF")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("heading", { level: 3, name: "Chamada" })).toBeInTheDocument();
  });

  it("a gravação do NIF ainda não disponível (função por aplicar) diz a razão e nunca falha em silêncio", async () => {
    estado.guardarNif.mockRejectedValue(new ErroNeg(null, null, "pessoasPagina.erroNeg.nifIndisponivel"));
    montar();
    escrever("NIF", "123456789");
    continuar();
    expect(await screen.findByRole("alert")).toHaveTextContent("A gravação do NIF ainda não está disponível.");
    expect(screen.getByRole("heading", { level: 3, name: "Chamada" })).toBeInTheDocument();
  });

  it("se o NIF falha depois de o telefone ficar gravado, diz que o telefone ficou e o que falhou", async () => {
    estado.guardarNif.mockRejectedValue(new ErroNeg(null, "NG030", "pessoasPagina.erroNeg.ng030"));
    montar();
    escrever("Telefone", "910 000 000");
    escrever("NIF", "123456789");
    continuar();
    const alerta = await screen.findByRole("alert");
    expect(estado.substituir).toHaveBeenCalledWith({ email: undefined, telefone: "910 000 000" });
    expect(alerta).toHaveTextContent("O que estava acima ficou gravado, mas o NIF não.");
    expect(alerta).toHaveTextContent("Este NIF já pertence a outra pessoa desta organização.");
  });

  it("a ficha refazer-se a meio não pisa o que se está a escrever (tipo, nome da empresa)", () => {
    const props: ContactoDoGuiaProps = {
      pessoa: { ...PESSOA }, negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 0, visitaMarcada: false, podeEditar: true,
      podeRegistarChamada: true, aoRegistarChamada: vi.fn(), aoCriarNegocio: vi.fn(), aoMarcarVisita: vi.fn(), feitas: [], aoVerFase: vi.fn(), nivel: "h3",
      faseRotuloChave: "pessoasPagina.board.col.contactado",
    };
    const { rerender } = render(<ContactoDoGuia {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    escrever("Nome da empresa", "Obras Lda");
    rerender(<ContactoDoGuia {...props} pessoa={{ ...PESSOA, nome: "Ana M. Lopes" } as Pessoa} />);
    expect(screen.getByRole("radio", { name: "Empresa" })).toBeChecked();
    expect(screen.getByLabelText("Nome da empresa")).toHaveValue("Obras Lda");
  });

  it("quando o tipo passa de desconhecido a conhecido, o formulário parte do que a base tem", () => {
    const props: ContactoDoGuiaProps = {
      pessoa: { ...PESSOA, tipoCliente: undefined } as Pessoa, negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 0, visitaMarcada: false, podeEditar: true,
      podeRegistarChamada: true, aoRegistarChamada: vi.fn(), aoCriarNegocio: vi.fn(), aoMarcarVisita: vi.fn(), feitas: [], aoVerFase: vi.fn(), nivel: "h3",
      faseRotuloChave: "pessoasPagina.board.col.contactado",
    };
    const { rerender } = render(<ContactoDoGuia {...props} />);
    rerender(<ContactoDoGuia {...props} pessoa={{ ...PESSOA, tipoCliente: "empresa", empresa: { nome: "Obras Lda" } } as Pessoa} />);
    expect(screen.getByRole("radio", { name: "Empresa" })).toBeChecked();
  });

  it("depois de uma gravação própria do tipo, a ficha refeita repõe o formulário", async () => {
    const props: ContactoDoGuiaProps = {
      pessoa: { ...PESSOA }, negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 0, visitaMarcada: false, podeEditar: true,
      podeRegistarChamada: true, aoRegistarChamada: vi.fn(), aoCriarNegocio: vi.fn(), aoMarcarVisita: vi.fn(), feitas: [], aoVerFase: vi.fn(), nivel: "h3",
      faseRotuloChave: "pessoasPagina.board.col.contactado",
    };
    const { rerender } = render(<ContactoDoGuia {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    escrever("Nome da empresa", "Obras Lda");
    continuar();
    await noPassoSeguinte();
    rerender(<ContactoDoGuia {...props} pessoa={{ ...PESSOA, tipoCliente: "empresa", nome: "Obras Lda", empresa: { nome: "Obras Lda" } } as Pessoa} />);
    fireEvent.click(screen.getByRole("button", { name: /Anterior/ }));
    expect(await screen.findByRole("radio", { name: "Empresa" })).toBeChecked();
    expect(screen.queryByLabelText("Nome da empresa")).not.toBeInTheDocument();
  });

  it("a mensagem parcial só menciona o NIF se havia pedido de NIF", async () => {
    estado.guardarIdentidade.mockRejectedValue(new ErroNeg(null, "NG003", "pessoasPagina.erroNeg.ng003"));
    montar();
    escrever("Telefone", "910 000 000");
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    escrever("Nome da empresa", "Obras Lda");
    continuar();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("O que estava acima ficou gravado, mas o tipo de cliente não.");
    expect(alerta).not.toHaveTextContent("NIF");
  });

  it("NG031 (recusa genérica do NIF) tem texto próprio", async () => {
    estado.guardarNif.mockRejectedValue(new ErroNeg(null, "NG031", "pessoasPagina.erroNeg.ng031"));
    montar();
    escrever("NIF", "123456789");
    continuar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gravar este NIF.");
  });

  it("sem o tipo conhecido (ficha por carregar) uma linha diz porque o tipo não se escolhe", () => {
    montar({ tipoCliente: undefined });
    expect(screen.getByText("O tipo de cliente só se escolhe depois de a ficha carregar.")).toBeInTheDocument();
  });

  it("a ordem é contacto, tipo e NIF", async () => {
    const ordem: string[] = [];
    estado.substituir.mockImplementation(async () => { ordem.push("contacto"); });
    estado.guardarIdentidade.mockImplementation(async () => { ordem.push("tipo"); });
    estado.guardarNif.mockImplementation(async () => { ordem.push("nif"); return { nifUltimos3: "789", mudou: true }; });
    montar();
    escrever("Telefone", "910 000 000");
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    escrever("Nome da empresa", "Obras Lda");
    escrever("NIF", "123456789");
    continuar();
    await noPassoSeguinte();
    expect(ordem).toEqual(["contacto", "tipo", "nif"]);
  });
});

describe("Chamada: o tipo de cliente", () => {
  it("de particular para empresa pede o nome da empresa e grava com o hook da identidade", async () => {
    montar();
    expect(screen.queryByLabelText("Nome da empresa")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    escrever("Nome da empresa", "  Obras   Lda ");
    continuar();
    await noPassoSeguinte();
    expect(estado.guardarIdentidade).toHaveBeenCalledWith({ tipo: "organization", nomeEmpresa: "Obras Lda" });
  });

  it("sem o nome da empresa não grava, diz o que falta e marca o campo", async () => {
    montar();
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    continuar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Indique o nome da empresa.");
    expect(screen.getByLabelText("Nome da empresa")).toHaveAttribute("aria-invalid", "true");
    expect(estado.guardarIdentidade).not.toHaveBeenCalled();
  });

  it("para condomínio o campo chama-se nome do condomínio", async () => {
    montar();
    fireEvent.click(screen.getByRole("radio", { name: "Condomínio" }));
    escrever("Nome do condomínio", "Edifício Sol");
    continuar();
    await noPassoSeguinte();
    expect(estado.guardarIdentidade).toHaveBeenCalledWith({ tipo: "condominio", nomeEmpresa: "Edifício Sol" });
  });

  it("de empresa para particular pede nome próprio e apelido", async () => {
    montar({ tipoCliente: "empresa", nome: "Obras Lda", empresa: { nome: "Obras Lda" } });
    fireEvent.click(screen.getByRole("radio", { name: "Particular" }));
    escrever("Nome próprio", "Rui");
    escrever("Apelido", "Costa");
    continuar();
    await noPassoSeguinte();
    expect(estado.guardarIdentidade).toHaveBeenCalledWith({ tipo: "person", nomeProprio: "Rui", apelido: "Costa" });
  });

  it("um condomínio nunca se despromove a empresa: a opção «Empresa» não existe", () => {
    montar({ tipoCliente: "condominio", nome: "Edifício Sol", empresa: { nome: "Edifício Sol" } });
    expect(screen.getByRole("radio", { name: "Condomínio" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Empresa" })).not.toBeInTheDocument();
  });

  it("sem tipo conhecido (ficha por carregar) o tipo não se edita e não se grava", async () => {
    montar({ tipoCliente: undefined });
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
    continuar();
    await noPassoSeguinte();
    expect(estado.guardarIdentidade).not.toHaveBeenCalled();
  });

  it("o hook da identidade recebe o tipo atual da pessoa (protege o condomínio)", () => {
    montar({ tipoCliente: "condominio" });
    expect(estado.tipoRecebido).toBe("condominio");
  });

  it("se o tipo falha depois de o telefone ficar gravado, diz que o telefone ficou e não tenta o NIF", async () => {
    estado.guardarIdentidade.mockRejectedValue(new ErroNeg(null, "NG003", "pessoasPagina.erroNeg.ng003"));
    montar();
    escrever("Telefone", "910 000 000");
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    escrever("Nome da empresa", "Obras Lda");
    escrever("NIF", "123456789");
    continuar();
    expect(await screen.findByRole("alert")).toHaveTextContent("O que estava acima ficou gravado, mas o tipo de cliente e o NIF não.");
    expect(estado.guardarNif).not.toHaveBeenCalled();
  });
});

describe("Chamada: sem permissão para editar", () => {
  it("o NIF e o tipo só se leem, e uma linha diz porquê", () => {
    montar({}, { podeEditar: false });
    expect(screen.getByText("Não tem permissão para alterar o tipo de cliente nem o NIF.")).toBeInTheDocument();
    expect(screen.getByLabelText("NIF")).toHaveAttribute("readonly");
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});
