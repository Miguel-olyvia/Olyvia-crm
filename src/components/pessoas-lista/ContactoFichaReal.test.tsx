// O contacto da pessoa na ficha real: telefone e email visíveis e editáveis, contacto preferido, melhor hora e idioma. Um erro da base aparece
// traduzido e não fecha o formulário.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { ContactoFichaReal } from "./ContactoFichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

type Props = Parameters<typeof ContactoFichaReal>[0];
function desenhar(sobre: Partial<Props> = {}) {
  const aoGuardar = vi.fn<Props["aoGuardar"]>().mockResolvedValue(undefined);
  const props: Props = { telefone: "912345678", email: "ana@x.pt", lingua: "pt", podeEditar: true, aoGuardar, ...sobre };
  return { aoGuardar, ...render(<ContactoFichaReal {...props} />) };
}
const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Editar contacto" }));
const escrever = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const escolher = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const guardar = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

describe("ContactoFichaReal: o que mostra", () => {
  it("telefone, email e preferências, com os valores traduzidos", () => {
    desenhar({ contactoPreferido: "whatsapp", horaPreferida: "fim_do_dia" });
    expect(screen.getByRole("heading", { name: "Contacto e preferências" })).toBeInTheDocument();
    expect(screen.getByText("912345678")).toBeInTheDocument();
    expect(screen.getByText("ana@x.pt")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Fim do dia")).toBeInTheDocument();
    expect(screen.getByText("Português")).toBeInTheDocument();
  });

  it("o que falta diz «Sem indicação»", () => {
    desenhar({ telefone: null, email: null });
    expect(screen.getAllByText("Sem indicação").length).toBeGreaterThanOrEqual(4);
  });

  it("uma língua desconhecida mostra-se pelo nome (Intl.DisplayNames), não pelo código", () => {
    desenhar({ lingua: "es" });
    expect(screen.getByText(/espanhol/i)).toBeInTheDocument();
    expect(screen.queryByText("es")).toBeNull();
  });

  it("sem permissão para editar não há botão", () => {
    desenhar({ podeEditar: false });
    expect(screen.queryByRole("button", { name: "Editar contacto" })).toBeNull();
  });
});

describe("ContactoFichaReal: editar", () => {
  it("abre com os valores atuais e as três preferências", () => {
    desenhar({ contactoPreferido: "sms", horaPreferida: "manha" });
    abrir();
    expect(screen.getByLabelText("Telefone")).toHaveValue("912345678");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@x.pt");
    expect(screen.getByLabelText("Prefere ser contactado")).toHaveValue("sms");
    expect(screen.getByLabelText("Melhor hora")).toHaveValue("manha");
    expect(screen.getByLabelText("Idioma")).toHaveValue("pt");
  });

  it("guarda só o que mudou e fecha em sucesso", async () => {
    const { aoGuardar } = desenhar();
    abrir();
    escrever("Email", " nova@x.pt ");
    escolher("Prefere ser contactado", "whatsapp");
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ email: "nova@x.pt", contacto: "whatsapp" }));
    await waitFor(() => expect(screen.queryByLabelText("Email")).toBeNull());
  });

  it("limpar uma preferência manda vazio", async () => {
    const { aoGuardar } = desenhar({ horaPreferida: "tarde" });
    abrir();
    escolher("Melhor hora", "");
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ hora: "" }));
  });

  it("o seletor do idioma tem pt, en, fr e o valor atual fora da lista (es), que não se reenvia", async () => {
    const { aoGuardar } = desenhar({ lingua: "es", contactoPreferido: "sms" });
    abrir();
    const opcoes = Array.from(screen.getByLabelText("Idioma").querySelectorAll("option")).map((o) => o.value);
    expect(opcoes).toEqual(["pt", "en", "fr", "es"]);
    expect(screen.getByLabelText("Idioma")).toHaveValue("es");
    escolher("Prefere ser contactado", "email");
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ contacto: "email" }));
  });

  it("sem língua na base o seletor tem a opção vazia «Sem indicação» escolhida, e depois pt, en, fr", () => {
    desenhar({ lingua: undefined });
    abrir();
    const opcoes = Array.from(screen.getByLabelText("Idioma").querySelectorAll("option"));
    expect(opcoes.map((o) => o.value)).toEqual(["", "pt", "en", "fr"]);
    expect(opcoes[0]).toHaveTextContent("Sem indicação");
    expect(screen.getByLabelText("Idioma")).toHaveValue("");
  });

  it("com língua na base não há opção vazia", () => {
    desenhar({ lingua: "pt" });
    abrir();
    expect(Array.from(screen.getByLabelText("Idioma").querySelectorAll("option")).map((o) => o.value)).toEqual(["pt", "en", "fr"]);
  });

  it("Enter num campo (submeter o formulário) guarda", async () => {
    const { aoGuardar } = desenhar();
    abrir();
    escrever("Email", "nova@x.pt");
    const form = screen.getByLabelText("Email").closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledExactlyOnceWith({ email: "nova@x.pt" }));
  });

  it("sem alterações fecha sem chamar a base", () => {
    const { aoGuardar } = desenhar();
    abrir();
    guardar();
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("um email inválido é recusado, marcado e com o foco", () => {
    const { aoGuardar } = desenhar();
    abrir();
    escrever("Email", "sem-arroba");
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique um email válido.");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("um telefone inválido é recusado", () => {
    const { aoGuardar } = desenhar();
    abrir();
    escrever("Telefone", "123");
    guardar();
    expect(screen.getByRole("alert")).toHaveTextContent("Indique um telefone válido, com 7 a 15 dígitos.");
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("um email que já existe nesta organização aparece traduzido e o formulário fica aberto", async () => {
    const aoGuardar = vi.fn().mockRejectedValue(new ErroNeg(null, "23505", "pessoasPagina.erroNeg.emailDuplicado"));
    desenhar({ aoGuardar });
    abrir();
    escrever("Email", "outra@x.pt");
    guardar();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Este email já existe nesta organização"));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it.each([
    ["email repetido (23505)", "pessoasPagina.erroNeg.emailDuplicado", "23505", { email: "outra@x.pt" }, "Email"],
    ["telefone repetido (23505)", "pessoasPagina.erroNeg.telefoneDuplicado", "23505", { telefone: "913333333" }, "Telefone"],
    ["NG019 só com o telefone enviado", "pessoasPagina.erroNeg.ng019", "NG019", { telefone: "913333333" }, "Telefone"],
    ["NG019 só com o email enviado", "pessoasPagina.erroNeg.ng019", "NG019", { email: "outra@x.pt" }, "Email"],
  ])("%s marca o campo (aria-invalid), liga-o ao erro e dá-lhe o foco", async (_nome, chave, codigo, escrito, rotulo) => {
    const aoGuardar = vi.fn().mockRejectedValue(new ErroNeg(null, codigo, chave));
    desenhar({ aoGuardar });
    abrir();
    if ("email" in escrito) escrever("Email", escrito.email as string);
    if ("telefone" in escrito) escrever("Telefone", escrito.telefone as string);
    guardar();
    const alerta = await screen.findByRole("alert");
    const campo = screen.getByLabelText(rotulo);
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveFocus();
    expect((campo.getAttribute("aria-describedby") ?? "").split(" ")).toContain(alerta.id);
    const outro = screen.getByLabelText(rotulo === "Email" ? "Telefone" : "Email");
    expect(outro).not.toHaveAttribute("aria-invalid");
  });

  it("escrever no campo marcado tira a marca", async () => {
    desenhar({ aoGuardar: vi.fn().mockRejectedValue(new ErroNeg(null, "23505", "pessoasPagina.erroNeg.emailDuplicado")) });
    abrir();
    escrever("Email", "outra@x.pt");
    guardar();
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true"));
    escrever("Email", "outra2@x.pt");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("cancelar fecha sem guardar", () => {
    const { aoGuardar } = desenhar();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("diz que o telefone e o email não se apagam", () => {
    desenhar();
    abrir();
    expect(screen.getByText("O telefone e o email substituem-se, não se apagam.")).toBeInTheDocument();
  });
});
