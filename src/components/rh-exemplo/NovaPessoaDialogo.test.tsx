/**
 * O painel "Nova pessoa" do rh-exemplo diz ao utilizador o que correu mal: uma recusa total, as seccoes que nao ficaram
 * gravadas (da ficha e dos anexos) e o que o formulario recolheu mas nao tem onde gravar. Pergunta antes de descartar o que
 * se escreveu, ignora o fecho a meio de uma criacao, e «Criar e enviar convite» abre o envio do convite antes da ficha.
 * O Supabase e simulado: os hooks de dados (anexos) e o dialogo de envio sao trocados por dobles.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const anexos = vi.hoisted(() => ({ enviar: vi.fn(async (_id: string) => [] as Array<{ seccao: string }>), limpar: vi.fn() }));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: vi.fn(async () => "mensagem amigavel") }));
vi.mock("@/components/rh-exemplo/hooks/useAnexosNovaPessoa", () => ({ useAnexosNovaPessoa: () => anexos }));
vi.mock("@/components/rh-exemplo/novaPessoa/CabecalhoNova", () => ({ CabecalhoNova: () => null }));
vi.mock("@/components/rh-exemplo/EnviarConviteDialog", () => ({
  EnviarConviteDialog: ({ open, onOpenChange, pessoaId, emailSugerido }: {
    open: boolean; onOpenChange: (a: boolean) => void; pessoaId: string; emailSugerido: string | null;
  }) => (open ? (
    <div role="dialog" aria-label="convite">
      <span>{`convite:${pessoaId}:${emailSugerido}`}</span>
      <button type="button" onClick={() => onOpenChange(false)}>fechar-convite</button>
    </div>
  ) : null),
}));

type Dados = { dados: { payload: { nucleo: { email_pessoal: string | null } }; naoGravado: string[] }; comConvite: boolean };
const dados = (email: string | null, comConvite = false): Dados => ({
  dados: { payload: { nucleo: { email_pessoal: email } }, naoGravado: [] }, comConvite,
});

vi.mock("@/components/rh-exemplo/novaPessoa/FormularioNovaPessoa", () => ({
  FormularioNovaPessoa: (p: {
    aoCriar: (d: unknown) => void; aoCancelar: () => void; aoSujar: () => void; aoAbrirFichaExistente: (id: string) => void;
  }) => (
    <div>
      <button type="button" onClick={() => p.aoCriar(dados("a@x.pt"))}>criar</button>
      <button type="button" onClick={() => p.aoCriar(dados("a@x.pt", true))}>criar-convite</button>
      <button type="button" onClick={() => p.aoCriar(dados(null, true))}>criar-convite-sem-email</button>
      <button type="button" onClick={p.aoSujar}>sujar</button>
      <button type="button" onClick={p.aoCancelar}>cancelar</button>
      <button type="button" onClick={() => p.aoAbrirFichaExistente("existente")}>abrir-existente</button>
    </div>
  ),
}));

import { toast } from "@/lib/toast";
import { NovaPessoaDialogo } from "./NovaPessoaDialogo";

function montar(onCriar: (d: never) => Promise<unknown>, botao = "criar") {
  const onCriada = vi.fn();
  const onOpenChange = vi.fn();
  render(<NovaPessoaDialogo open onOpenChange={onOpenChange} colegas={[]} onCriar={onCriar as never} onCriada={onCriada} />);
  if (botao !== "") fireEvent.click(screen.getByRole("button", { name: botao }));
  return { onCriada, onOpenChange };
}

const SEM_FALHAS = async () => ({ id: "p1", falhas: [], naoGravado: [] });

beforeEach(() => {
  vi.clearAllMocks();
  anexos.enviar.mockImplementation(async () => []);
});

describe("NovaPessoaDialogo (rh-exemplo): a falha aparece ao utilizador", () => {
  it("sucesso limpo: aviso de sucesso, painel fecha e abre a ficha", async () => {
    const { onCriada, onOpenChange } = montar(SEM_FALHAS);
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith("hr.sucesso.criada");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("recusa total: erro visivel, o painel fica aberto e nao abre ficha nenhuma", async () => {
    const { onCriada, onOpenChange } = montar(async () => { throw new Error("recusado"); });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("mensagem amigavel"));
    expect(onCriada).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("falhas por seccao: a ficha abre, e o erro diz quais seccoes nao ficaram gravadas", async () => {
    const { onCriada } = montar(async () => ({
      id: "p1", falhas: [{ seccao: "niss", mensagem: "x" }, { seccao: "saude", mensagem: "y" }], naoGravado: [],
    }));
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(toast.error).toHaveBeenCalledWith("hr.form.criadaComFalhas hr.form.seccoes.niss, hr.form.seccoes.saude");
  });

  it("o que nao tem onde gravar e dito num aviso, mesmo sem falhas", async () => {
    const { onCriada } = montar(async () => ({ id: "p1", falhas: [], naoGravado: ["nome_tratamento"] }));
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(toast.warning).toHaveBeenCalledWith("rhNova.naoGravado rhNova.naoGravado.nome_tratamento");
  });

  it("o acesso pedido nao e falha: avisa que se conclui na ficha e conta como sucesso", async () => {
    const { onCriada } = montar(async () => ({ id: "p1", falhas: [{ seccao: "acesso", mensagem: "x" }], naoGravado: [] }));
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(toast.success).toHaveBeenCalledWith("hr.sucesso.criada");
    expect(toast.warning).toHaveBeenCalledWith("hr.acesso.convitePendente");
  });
});

describe("NovaPessoaDialogo (rh-exemplo): anexos reais", () => {
  it("os ficheiros seguem depois de a ficha existir, com o id da pessoa criada, e limpam-se", async () => {
    const { onCriada } = montar(SEM_FALHAS);
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(anexos.enviar).toHaveBeenCalledWith("p1");
    expect(anexos.limpar).toHaveBeenCalled();
  });

  it("uma falha de anexo nao desfaz a ficha: abre-se a ficha e o erro diz que seccao falhou", async () => {
    anexos.enviar.mockImplementation(async () => [{ seccao: "anexos" }]);
    const { onCriada } = montar(SEM_FALHAS);
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(toast.error).toHaveBeenCalledWith("hr.form.criadaComFalhas hr.form.seccoes.anexos");
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("NovaPessoaDialogo (rh-exemplo): fechar sem perder o que se escreveu", () => {
  it("sem alteracoes, Cancelar fecha logo", () => {
    const { onOpenChange } = montar(SEM_FALHAS, "cancelar");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText("rhNova.descartar.titulo")).toBeNull();
  });

  it("com alteracoes, Cancelar pergunta; continuar nao fecha, descartar fecha", async () => {
    const { onOpenChange } = montar(SEM_FALHAS, "sujar");
    fireEvent.click(screen.getByRole("button", { name: "cancelar" }));
    expect(await screen.findByText("rhNova.descartar.titulo")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "rhNova.descartar.continuar" }));
    await waitFor(() => expect(screen.queryByText("rhNova.descartar.titulo")).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "cancelar" }));
    fireEvent.click(await screen.findByRole("button", { name: "rhNova.descartar.confirmar" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(anexos.limpar).toHaveBeenCalled();
  });

  it("o Esc passa pela mesma regra: com alteracoes pergunta em vez de fechar", async () => {
    const { onOpenChange } = montar(SEM_FALHAS, "sujar");
    fireEvent.keyDown(screen.getByRole("button", { name: "cancelar" }), { key: "Escape" });
    expect(await screen.findByText("rhNova.descartar.titulo")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("a criar, Cancelar e ignorado: nada fecha ate a criacao acabar", async () => {
    let acabar: (v: { id: string; falhas: never[]; naoGravado: never[] }) => void = () => undefined;
    const { onOpenChange, onCriada } = montar(() => new Promise((resolve) => { acabar = resolve as typeof acabar; }));
    fireEvent.click(screen.getByRole("button", { name: "sujar" }));
    fireEvent.click(screen.getByRole("button", { name: "cancelar" }));
    expect(screen.queryByText("rhNova.descartar.titulo")).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await act(async () => { acabar({ id: "p1", falhas: [], naoGravado: [] }); });
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
  });

  it("um duplicado travado abre a ficha que ja existe, sem criar outra", () => {
    const onCriar = vi.fn();
    const { onCriada, onOpenChange } = montar(onCriar, "abrir-existente");
    expect(onCriar).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCriada).toHaveBeenCalledWith("existente");
  });
});

describe("NovaPessoaDialogo (rh-exemplo): criar e enviar convite", () => {
  it("cria e abre o envio do convite com o e-mail pessoal; so ao fechar segue para a ficha", async () => {
    const { onCriada, onOpenChange } = montar(SEM_FALHAS, "criar-convite");
    expect(await screen.findByText("convite:p1:a@x.pt")).toBeTruthy();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCriada).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "fechar-convite" }));
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(screen.queryByText("convite:p1:a@x.pt")).toBeNull();
  });

  it("sem e-mail pessoal nao ha para quem enviar: avisa e segue logo para a ficha", async () => {
    const { onCriada } = montar(SEM_FALHAS, "criar-convite-sem-email");
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p1"));
    expect(toast.warning).toHaveBeenCalledWith("hr.form.conviteNaoAberto.semEmail");
    expect(screen.queryByRole("dialog", { name: "convite" })).toBeNull();
  });
});
