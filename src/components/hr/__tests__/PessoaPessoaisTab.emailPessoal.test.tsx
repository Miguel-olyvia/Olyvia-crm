/**
 * O e-mail pessoal, depois de mudar de dono: passou de
 * `pessoas_dados_pessoais.email_comunicacoes` para `pessoas.email_pessoal`.
 *
 * O que este teste fecha e a parte que a migracao nao pode provar sozinha --
 * que o bloco 1 escreve APENAS a tabela cujos campos mudaram, na ordem
 * dados pessoais -> nucleo, e para na primeira falha. Ver o cabecalho de
 * `PessoaPessoaisTab.tsx`.
 *
 * Usa `fireEvent` e nao `user-event`: `@testing-library/user-event` nao e
 * dependencia deste projecto.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from "@/lib/toast";
import { PessoaPessoaisTab, type PessoaPessoaisPermissoes } from "@/components/hr/PessoaPessoaisTab";

const PERMISSOES_TUDO: PessoaPessoaisPermissoes = {
  pessoaisView: true,
  pessoaisEdit: true,
  identificacaoView: false,
  identificacaoEdit: false,
  identificacaoReveal: false,
  moradaView: false,
  moradaEdit: false,
  emergenciaView: false,
  emergenciaEdit: false,
  bancariosView: false,
  bancariosEdit: false,
  saudeView: false,
  saudeEdit: false,
  nucleoEdit: true,
};

function montar(props?: {
  emailPessoal?: string | null;
  permissoes?: Partial<PessoaPessoaisPermissoes>;
  onGuardarDadosPessoais?: Mock;
  onGuardarPessoa?: Mock;
}) {
  const onGuardarDadosPessoais =
    props?.onGuardarDadosPessoais ?? vi.fn().mockResolvedValue(null);
  const onGuardarPessoa = props?.onGuardarPessoa ?? vi.fn().mockResolvedValue(null);

  render(
    <PessoaPessoaisTab
      dadosPessoais={{
        id: "dp1",
        pessoa_id: "p1",
        organization_id: "org",
        data_nascimento: null,
        ocultar_aniversario: false,
        genero: null,
        nacionalidade: null,
        telefone_pessoal: "",
        estado_civil: null,
        dependentes: null,
        irs_retencao_percentagem: null,
      }}
      identificacao={null}
      morada={null}
      emergencia={null}
      bancarios={null}
      saude={null}
      emailPessoal={props?.emailPessoal ?? "ana@exemplo.pt"}
      permissoes={{ ...PERMISSOES_TUDO, ...props?.permissoes }}
      saving={false}
      onGuardarDadosPessoais={onGuardarDadosPessoais}
      onGuardarPessoa={onGuardarPessoa}
      onGuardarIdentificacao={vi.fn().mockResolvedValue(null)}
      onGuardarMorada={vi.fn().mockResolvedValue(null)}
      onGuardarEmergencia={vi.fn().mockResolvedValue(null)}
      onGuardarSaude={vi.fn().mockResolvedValue(null)}
      onRevelarNiss={vi.fn().mockResolvedValue(null)}
      onDefinirNiss={vi.fn().mockResolvedValue(null)}
      onDefinirConta={vi.fn().mockResolvedValue(null)}
    />,
  );

  return { onGuardarDadosPessoais, onGuardarPessoa };
}

function gravarPrimeiro() {
  fireEvent.click(screen.getAllByText("employees.form.update")[0]);
}

describe("PessoaPessoaisTab -- e-mail pessoal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra o e-mail pessoal vindo do nucleo, e nao ha campo de email_comunicacoes", () => {
    montar({ emailPessoal: "ana@exemplo.pt" });

    expect(screen.getByLabelText("hr.campos.emailPessoal")).toHaveValue("ana@exemplo.pt");
    expect(document.getElementById("hr-email-comunicacoes")).toBeNull();
  });

  it("mudar so o e-mail grava so no nucleo", async () => {
    const { onGuardarDadosPessoais, onGuardarPessoa } = montar({ emailPessoal: "ana@exemplo.pt" });

    fireEvent.change(screen.getByLabelText("hr.campos.emailPessoal"), {
      target: { value: "nova@exemplo.pt" },
    });
    gravarPrimeiro();

    expect(onGuardarPessoa).toHaveBeenCalledTimes(1);
    expect(onGuardarPessoa).toHaveBeenCalledWith({ email_pessoal: "nova@exemplo.pt" });
    expect(onGuardarDadosPessoais).not.toHaveBeenCalled();
  });

  it("mudar so o telefone pessoal grava so em dadosPessoais, sem email_comunicacoes", async () => {
    const { onGuardarDadosPessoais, onGuardarPessoa } = montar({ emailPessoal: "ana@exemplo.pt" });

    fireEvent.change(screen.getByLabelText("hr.campos.telefonePessoal"), {
      target: { value: "912345678" },
    });
    gravarPrimeiro();

    expect(onGuardarDadosPessoais).toHaveBeenCalledTimes(1);
    const patch = onGuardarDadosPessoais.mock.calls[0][0];
    expect(patch).not.toHaveProperty("email_comunicacoes");
    expect(patch).toMatchObject({ telefone_pessoal: "912345678" });
    expect(onGuardarPessoa).not.toHaveBeenCalled();
  });

  it("se dadosPessoais falhar, nao chega a gravar o nucleo", async () => {
    const onGuardarDadosPessoais = vi.fn().mockResolvedValue("erro qualquer");
    const onGuardarPessoa = vi.fn().mockResolvedValue(null);
    montar({
      emailPessoal: "ana@exemplo.pt",
      onGuardarDadosPessoais,
      onGuardarPessoa,
    });

    fireEvent.change(screen.getByLabelText("hr.campos.telefonePessoal"), {
      target: { value: "912345678" },
    });
    fireEvent.change(screen.getByLabelText("hr.campos.emailPessoal"), {
      target: { value: "nova@exemplo.pt" },
    });
    gravarPrimeiro();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("erro qualquer"));
    expect(onGuardarPessoa).not.toHaveBeenCalled();
  });

  it("sem nucleoEdit o e-mail pessoal fica desactivado, o telefone nao", () => {
    montar({ permissoes: { nucleoEdit: false, pessoaisEdit: true } });

    expect(screen.getByLabelText("hr.campos.emailPessoal")).toBeDisabled();
    expect(screen.getByLabelText("hr.campos.telefonePessoal")).not.toBeDisabled();
  });

  // O caso inverso, que a revisao apanhou: quem pode editar o nucleo mas nao
  // os dados pessoais escrevia no e-mail e nunca via o botao de gravar. A
  // alteracao ficava orfa no ecra, sem erro nenhum a dizer porque.
  it("com nucleoEdit e sem pessoaisEdit, escrever o e-mail faz aparecer o botao de gravar", async () => {
    montar({ permissoes: { nucleoEdit: true, pessoaisEdit: false } });

    const email = screen.getByLabelText("hr.campos.emailPessoal");
    expect(email).not.toBeDisabled();
    expect(screen.getByLabelText("hr.campos.telefonePessoal")).toBeDisabled();

    fireEvent.change(email, { target: { value: "pessoal@exemplo.pt" } });

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "employees.form.update" }).length,
        "escreveu no e-mail e o botao de gravar nao apareceu",
      ).toBeGreaterThan(0),
    );
  });
});
