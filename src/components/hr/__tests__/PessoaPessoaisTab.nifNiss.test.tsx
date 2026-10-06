/**
 * A edicao de NIF e NISS pelo RH, na ficha, com a mesma validacao do convite e
 * do formulario de criar:
 *
 *  - digito de controlo errado -> erro junto do campo e NAO grava (nem sequer
 *    pergunta aos duplicados);
 *  - numero que ja esta noutra ficha da organizacao -> diz de quem e, com
 *    ligacao para essa ficha, e NAO grava;
 *  - numero valido e livre -> grava, sem espacos;
 *  - se a verificacao de duplicados nao puder correr, a gravacao segue (os
 *    indices unicos da base apanham o resto);
 *  - o botao do NISS ja nao depende de ter exactamente onze algarismos: um
 *    NISS com o digito errado tambem tem onze, e quem diz porque nao serve e
 *    a validacao.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const TEXTOS: Record<string, string> = {
  "hr.convite.erro.nifInvalido": "O NIF não é válido. Verifique os números.",
  "hr.convite.erro.nissInvalido": "O número da Segurança Social não é válido. Verifique os números.",
  "hr.duplicados.nifNaFicha": "Este NIF já está na ficha de {{nome}}.",
  "hr.duplicados.nissNaFicha": "Este NISS já está na ficha de {{nome}}.",
  "hr.duplicados.abrirFicha": "Abrir ficha",
};

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (chave: string, params?: Record<string, string | number>) => {
      let texto = TEXTOS[chave] ?? chave;
      Object.entries(params ?? {}).forEach(([k, v]) => {
        texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      });
      return texto;
    },
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const verificar = vi.fn();
vi.mock("@/hooks/usePessoaDuplicados", () => ({
  usePessoaDuplicados: () => ({ verificar }),
}));

import { toast } from "@/lib/toast";
import { PessoaPessoaisTab, type PessoaPessoaisPermissoes } from "@/components/hr/PessoaPessoaisTab";

const PERMISSOES: PessoaPessoaisPermissoes = {
  pessoaisView: false,
  pessoaisEdit: false,
  identificacaoView: true,
  identificacaoEdit: true,
  identificacaoReveal: false,
  moradaView: false,
  moradaEdit: false,
  emergenciaView: false,
  emergenciaEdit: false,
  bancariosView: false,
  bancariosEdit: false,
  saudeView: false,
  saudeEdit: false,
  nucleoEdit: false,
  laboraisView: false,
  laboraisEdit: false,
};

function montar() {
  const onGuardarIdentificacao = vi.fn().mockResolvedValue(null);
  const onDefinirNiss = vi.fn().mockResolvedValue(null);
  render(
    <MemoryRouter>
      <PessoaPessoaisTab
        pessoaId="p1"
        organizationId="org-nike"
        dadosPessoais={null}
        identificacao={{
          id: "i1",
          pessoa_id: "p1",
          organization_id: "org-nike",
          tipo_documento: null,
          numero_documento: null,
          validade_documento: null,
          nif: "",
          niss_ultimos4: null,
          carta_conducao_numero: null,
          carta_conducao_categorias: null,
          carta_conducao_validade: null,
        }}
        morada={null}
        emergencia={null}
        bancarios={null}
        saude={null}
        fardamento={null}
        emailPessoal={null}
        permissoes={PERMISSOES}
        saving={false}
        onGuardarDadosPessoais={vi.fn().mockResolvedValue(null)}
        onGuardarPessoa={vi.fn().mockResolvedValue(null)}
        onGuardarIdentificacao={onGuardarIdentificacao}
        onGuardarMorada={vi.fn().mockResolvedValue(null)}
        onGuardarEmergencia={vi.fn().mockResolvedValue(null)}
        onGuardarSaude={vi.fn().mockResolvedValue(null)}
        onGuardarFardamento={vi.fn().mockResolvedValue(null)}
        onRevelarNiss={vi.fn().mockResolvedValue(null)}
        onDefinirNiss={onDefinirNiss}
        onDefinirConta={vi.fn().mockResolvedValue(null)}
      />
    </MemoryRouter>,
  );
  return { onGuardarIdentificacao, onDefinirNiss };
}

function escreverNif(valor: string) {
  fireEvent.change(document.getElementById("hr-nif") as HTMLInputElement, { target: { value: valor } });
}

/** O botao Gravar do bloco (o ultimo `update`; o primeiro e o do NISS). */
function gravarBloco() {
  const botoes = screen.getAllByText("employees.form.update");
  fireEvent.click(botoes[botoes.length - 1]);
}

describe("PessoaPessoaisTab: NIF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verificar.mockResolvedValue([]);
  });

  it("um NIF com o digito errado mostra o erro e nao grava nem pergunta aos duplicados", async () => {
    const { onGuardarIdentificacao } = montar();
    escreverNif("123456788");
    gravarBloco();

    expect(await screen.findByText("O NIF não é válido. Verifique os números.")).toBeInTheDocument();
    expect(onGuardarIdentificacao).not.toHaveBeenCalled();
    expect(verificar).not.toHaveBeenCalled();
    expect(document.getElementById("hr-nif")).toHaveAttribute("aria-invalid", "true");
  });

  it("um NIF que ja esta noutra ficha diz de quem e, com ligacao, e nao grava", async () => {
    verificar.mockResolvedValue([
      {
        pessoaId: "p-outra",
        nomeCompleto: "Joana Pires",
        campoCoincidente: "nif",
        forca: "travao",
        estado: "activa",
      },
    ]);
    const { onGuardarIdentificacao } = montar();
    escreverNif("123456789");
    gravarBloco();

    expect(
      await screen.findByText(/Este NIF já está na ficha de Joana Pires/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir ficha" })).toHaveAttribute(
      "href",
      "/rh/pessoas/p-outra",
    );
    expect(onGuardarIdentificacao).not.toHaveBeenCalled();
    // A verificacao exclui a propria ficha.
    expect(verificar).toHaveBeenCalledWith({
      organizationId: "org-nike",
      nif: "123456789",
      niss: null,
      excluirPessoaId: "p1",
    });
  });

  it("um NIF valido e livre grava", async () => {
    const { onGuardarIdentificacao } = montar();
    escreverNif("123456789");
    gravarBloco();

    await waitFor(() => expect(onGuardarIdentificacao).toHaveBeenCalledTimes(1));
    expect(onGuardarIdentificacao.mock.calls[0][0]).toMatchObject({ nif: "123456789" });
    expect(toast.success).toHaveBeenCalled();
  });

  it("se nao se conseguir verificar duplicados (null), a gravacao segue", async () => {
    verificar.mockResolvedValue(null);
    const { onGuardarIdentificacao } = montar();
    escreverNif("123456789");
    gravarBloco();

    await waitFor(() => expect(onGuardarIdentificacao).toHaveBeenCalledTimes(1));
  });

  it("um sinal (nao travao) nao bloqueia", async () => {
    verificar.mockResolvedValue([
      {
        pessoaId: "p-outra",
        nomeCompleto: "Joana Pires",
        campoCoincidente: "nome",
        forca: "sinal",
        estado: "activa",
      },
    ]);
    const { onGuardarIdentificacao } = montar();
    escreverNif("123456789");
    gravarBloco();

    await waitFor(() => expect(onGuardarIdentificacao).toHaveBeenCalledTimes(1));
  });

  it("apagar o NIF nao se valida: e legitimo", async () => {
    const { onGuardarIdentificacao } = montar();
    // Muda para um valor e volta a vazio nao altera nada; escreve-se so um
    // campo diferente para o bloco ficar alterado sem tocar no NIF.
    fireEvent.change(document.getElementById("hr-numero-documento") as HTMLInputElement, {
      target: { value: "AB123" },
    });
    gravarBloco();

    await waitFor(() => expect(onGuardarIdentificacao).toHaveBeenCalledTimes(1));
    expect(verificar).not.toHaveBeenCalled();
    expect(onGuardarIdentificacao.mock.calls[0][0]).toMatchObject({ nif: null });
  });

  it("o erro do NIF e anunciado (role=alert) e o foco vai para o campo", async () => {
    montar();
    escreverNif("123456788");
    gravarBloco();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("O NIF não é válido. Verifique os números.");
    expect(alerta.id).toBe("hr-nif-erro");
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("hr-nif")));
  });

  it("um duplo clique em Gravar enquanto verifica nao dispara duas verificacoes nem duas gravacoes", async () => {
    let concluir: (candidatos: unknown[]) => void = () => undefined;
    verificar.mockImplementation(
      () =>
        new Promise((resolver) => {
          concluir = resolver;
        }),
    );
    const { onGuardarIdentificacao } = montar();
    escreverNif("123456789");

    gravarBloco();
    gravarBloco();

    expect(verificar).toHaveBeenCalledTimes(1);
    concluir([]);
    await waitFor(() => expect(onGuardarIdentificacao).toHaveBeenCalledTimes(1));
  });

  it("depois de terminar, Gravar volta a poder repetir-se", async () => {
    const { onGuardarIdentificacao } = montar();
    escreverNif("123456789");
    gravarBloco();
    await waitFor(() => expect(onGuardarIdentificacao).toHaveBeenCalledTimes(1));

    // Outro NIF com o digito de controlo certo (1*9 = 9; 11 - 9 = 2).
    escreverNif("100000002");
    gravarBloco();

    await waitFor(() => expect(onGuardarIdentificacao).toHaveBeenCalledTimes(2));
  });
});

describe("PessoaPessoaisTab: NISS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verificar.mockResolvedValue([]);
  });

  function escreverNiss(valor: string) {
    fireEvent.change(document.getElementById("hr-niss-novo") as HTMLInputElement, {
      target: { value: valor },
    });
  }

  function botaoNiss() {
    return screen.getAllByText("employees.form.update")[0].closest("button") as HTMLButtonElement;
  }

  it("o botao so fica desactivado com o campo vazio, nao com menos de onze algarismos", () => {
    montar();
    expect(botaoNiss()).toBeDisabled();
    escreverNiss("1234");
    expect(botaoNiss()).not.toBeDisabled();
  });

  it("um NISS com onze algarismos mas digito errado mostra o erro e nao grava", async () => {
    const { onDefinirNiss } = montar();
    escreverNiss("12345678901");
    fireEvent.click(botaoNiss());

    expect(
      await screen.findByText("O número da Segurança Social não é válido. Verifique os números."),
    ).toBeInTheDocument();
    expect(onDefinirNiss).not.toHaveBeenCalled();
  });

  it("um NISS que ja esta noutra ficha diz de quem e e nao grava", async () => {
    verificar.mockResolvedValue([
      {
        pessoaId: "p-outra",
        nomeCompleto: "Marta Reis",
        campoCoincidente: "niss",
        forca: "travao",
        estado: "activa",
      },
    ]);
    const { onDefinirNiss } = montar();
    escreverNiss("12345678902");
    fireEvent.click(botaoNiss());

    expect(await screen.findByText(/Este NISS já está na ficha de Marta Reis/)).toBeInTheDocument();
    expect(onDefinirNiss).not.toHaveBeenCalled();
  });

  it("um NISS valido e livre grava, sem espacos", async () => {
    const { onDefinirNiss } = montar();
    escreverNiss("123 4567 8902");
    fireEvent.click(botaoNiss());

    await waitFor(() => expect(onDefinirNiss).toHaveBeenCalledWith("12345678902"));
  });

  it("o erro do NISS e anunciado (role=alert) e o foco vai para o campo", async () => {
    montar();
    escreverNiss("12345678901");
    fireEvent.click(botaoNiss());

    const alerta = await screen.findByRole("alert");
    expect(alerta.id).toBe("hr-niss-erro");
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("hr-niss-novo")));
  });

  it("um duplo clique no botao do NISS enquanto verifica nao repete a verificacao", async () => {
    let concluir: (candidatos: unknown[]) => void = () => undefined;
    verificar.mockImplementation(
      () =>
        new Promise((resolver) => {
          concluir = resolver;
        }),
    );
    const { onDefinirNiss } = montar();
    escreverNiss("12345678902");

    fireEvent.click(botaoNiss());
    fireEvent.click(botaoNiss());

    expect(verificar).toHaveBeenCalledTimes(1);
    expect(botaoNiss()).toBeDisabled();
    concluir([]);
    await waitFor(() => expect(onDefinirNiss).toHaveBeenCalledTimes(1));
  });
});
