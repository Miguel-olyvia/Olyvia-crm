// O conteúdo dos passos da fase Contacto (só apresentação): Chamada (telefone, email e preferências da pessoa), Qualificação (as perguntas do questionário e
// «o que o cliente pediu» à parte), Morada da obra (vazia ao início), Preparar a visita (nada escolhido ao início) e Marcar a visita.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CorpoChamada, CorpoMarcar, CorpoMorada, CorpoPreparar, CorpoQualificacao, SemNegocio } from "./PassosContacto";
import type { BlocoDef } from "@/components/negocio-metas/perguntasTipos";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

describe("SemNegocio", () => {
  it("diz a razão em texto e oferece «Criar o negócio»", () => {
    const aoCriar = vi.fn();
    render(<SemNegocio aoCriar={aoCriar} />);
    expect(screen.getByText(/ainda não tem um negócio/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar o negócio" }));
    expect(aoCriar).toHaveBeenCalledTimes(1);
  });

  it("sem permissão para criar só diz a razão", () => {
    render(<SemNegocio />);
    expect(screen.getByText(/ainda não tem um negócio/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("CorpoChamada", () => {
  const form = { telefone: "927 118 300", email: "ana@exemplo.pt", contacto: "" as const, hora: "" as const, lingua: "pt" };
  const props = { chamadas: 0, form, aoMudar: vi.fn(), podeEditar: true, erroCampo: null, aoRegistar: vi.fn(), podeRegistar: true };

  it("mostra telefone e email editáveis, e o que prefere, a melhor hora e o idioma da PESSOA", () => {
    render(<CorpoChamada {...props} />);
    expect(screen.getByLabelText("Telefone")).toHaveValue("927 118 300");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@exemplo.pt");
    expect(screen.getByLabelText("Prefere ser contactado")).toBeInTheDocument();
    expect(screen.getByLabelText("Melhor hora")).toBeInTheDocument();
    expect(screen.getByLabelText("Idioma")).toHaveValue("pt");
  });

  it("escrever no telefone avisa o assistente", () => {
    const aoMudar = vi.fn();
    render(<CorpoChamada {...props} aoMudar={aoMudar} />);
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "910 000 000" } });
    expect(aoMudar).toHaveBeenCalledWith({ telefone: "910 000 000" });
  });

  it("sem permissão de editar os campos só se leem", () => {
    render(<CorpoChamada {...props} podeEditar={false} />);
    expect(screen.getByLabelText("Telefone")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Melhor hora")).toBeDisabled();
  });

  it("o erro de um campo liga-se a ele por aria-invalid", () => {
    render(<CorpoChamada {...props} erroCampo="email" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Telefone")).not.toHaveAttribute("aria-invalid");
  });

  it("diz quantas chamadas há e «Registar a chamada» abre o registo", () => {
    const aoRegistar = vi.fn();
    const { rerender } = render(<CorpoChamada {...props} aoRegistar={aoRegistar} />);
    expect(screen.getByText("Ainda não há chamadas registadas.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registar a chamada" }));
    expect(aoRegistar).toHaveBeenCalledTimes(1);
    rerender(<CorpoChamada {...props} chamadas={1} />);
    expect(screen.getByText("1 chamada registada.")).toBeInTheDocument();
    rerender(<CorpoChamada {...props} chamadas={3} />);
    expect(screen.getByText("3 chamadas registadas.")).toBeInTheDocument();
  });

  it("sem poder registar não há botão", () => {
    render(<CorpoChamada {...props} podeRegistar={false} />);
    expect(screen.queryByRole("button", { name: "Registar a chamada" })).not.toBeInTheDocument();
  });
});

describe("CorpoQualificacao", () => {
  const pergunta = (id: string, rotulo: string) => ({ id, rotulo: [rotulo, rotulo] as const, literal: true, opcoes: [["a", "Sim", "Sim"], ["b", "Não", "Não"]] as const });
  const blocos: BlocoDef[] = [{ id: "q-0", literal: true, perguntas: [pergunta("tipo", "Tipo de imóvel"), pergunta("decide", "Quem decide")] }];
  const props = { blocos, respostas: {}, aoEscolher: vi.fn(), aoEscrever: vi.fn(), erros: {}, pedido: "", aoMudarPedido: vi.fn(), estado: "pronto" as const, aoRepetir: vi.fn() };

  it("mostra as perguntas do questionário (as configuráveis) e «o que o cliente pediu» num campo próprio", () => {
    render(<CorpoQualificacao {...props} />);
    expect(screen.getByText("Tipo de imóvel")).toBeInTheDocument();
    expect(screen.getByText("Quem decide")).toBeInTheDocument();
    expect(screen.getByLabelText("O que o cliente pediu")).toBeInTheDocument();
  });

  it("escolher uma opção avisa com a pergunta e a opção", () => {
    const aoEscolher = vi.fn();
    render(<CorpoQualificacao {...props} aoEscolher={aoEscolher} />);
    fireEvent.click(screen.getAllByText("Sim")[0]);
    expect(aoEscolher).toHaveBeenCalledWith("tipo", "a");
  });

  it("escrever o pedido não mexe nas respostas", () => {
    const aoMudarPedido = vi.fn();
    render(<CorpoQualificacao {...props} aoMudarPedido={aoMudarPedido} />);
    fireEvent.change(screen.getByLabelText("O que o cliente pediu"), { target: { value: "Casa de banho nova" } });
    expect(aoMudarPedido).toHaveBeenCalledWith("Casa de banho nova");
    expect(props.aoEscolher).not.toHaveBeenCalled();
  });

  it("enquanto as perguntas carregam diz-se, no lugar delas", () => {
    render(<CorpoQualificacao {...props} estado="a-carregar" blocos={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent(/A carregar as perguntas/);
  });

  it("sem perguntas configuradas diz-se, e o pedido continua a poder escrever-se", () => {
    render(<CorpoQualificacao {...props} blocos={[]} />);
    expect(screen.getByLabelText("O que o cliente pediu")).toBeInTheDocument();
  });
});

describe("CorpoMorada", () => {
  const vazia = { rua: "", codigoPostal: "", localidade: "", andar: "" };
  const props = { morada: vazia, origem: null, aoMudar: vi.fn(), aoPreencherDe: vi.fn(), moradaEntidade: { rua: "Rua da Pessoa 1", codigoPostal: "4000-001", localidade: "Porto", andar: "" }, erroCodigoPostal: false };

  it("começa vazia e tem os dois atalhos", () => {
    render(<CorpoMorada {...props} />);
    for (const rotulo of ["Rua e número", "Código postal", "Localidade"]) expect(screen.getByLabelText(rotulo)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Preencher com os dados da entidade" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estou no local" })).toBeInTheDocument();
  });

  it("«Preencher com os dados da entidade» copia a morada da pessoa, dizendo a origem", () => {
    const aoPreencherDe = vi.fn();
    render(<CorpoMorada {...props} aoPreencherDe={aoPreencherDe} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher com os dados da entidade" }));
    expect(aoPreencherDe).toHaveBeenCalledWith(props.moradaEntidade, "entidade");
  });

  it("escrever num campo avisa com a chave do campo", () => {
    const aoMudar = vi.fn();
    render(<CorpoMorada {...props} aoMudar={aoMudar} />);
    fireEvent.change(screen.getByLabelText("Localidade"), { target: { value: "Gaia" } });
    expect(aoMudar).toHaveBeenCalledWith("localidade", "Gaia");
  });
});

describe("CorpoPreparar", () => {
  const props = { valor: { duracao: "", quem: "", nota: "" }, aoMudar: vi.fn() };

  it("oferece 1 h, 1 h 30 e 2 h, e o cliente, o casal, a família e outra pessoa, sem nada escolhido", () => {
    render(<CorpoPreparar {...props} />);
    const duracoes = screen.getByRole("group", { name: "Duração prevista" });
    expect(duracoes.querySelectorAll("button")).toHaveLength(3);
    for (const texto of ["1 h", "1 h 30", "2 h"]) expect(screen.getByRole("button", { name: texto })).toHaveAttribute("aria-pressed", "false");
    const quem = screen.getByRole("group", { name: "Quem vai estar" });
    expect(quem.querySelectorAll("button")).toHaveLength(4);
    for (const texto of ["O cliente", "O casal", "A família", "Outra pessoa"]) expect(screen.getByRole("button", { name: texto })).toHaveAttribute("aria-pressed", "false");
  });

  it("escolher uma duração e quem vai estar avisa o assistente", () => {
    const aoMudar = vi.fn();
    render(<CorpoPreparar {...props} aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole("button", { name: "1 h 30" }));
    expect(aoMudar).toHaveBeenCalledWith({ duracao: "h1m30" });
    fireEvent.click(screen.getByRole("button", { name: "O casal" }));
    expect(aoMudar).toHaveBeenCalledWith({ quem: "casal" });
  });

  it("a escolha feita vê-se em aria-pressed e clicar outra vez desfaz", () => {
    const aoMudar = vi.fn();
    render(<CorpoPreparar {...props} valor={{ duracao: "h2", quem: "", nota: "" }} aoMudar={aoMudar} />);
    const dois = screen.getByRole("button", { name: "2 h" });
    expect(dois).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(dois);
    expect(aoMudar).toHaveBeenCalledWith({ duracao: "" });
  });

  it("a nota é opcional e escreve-se", () => {
    const aoMudar = vi.fn();
    render(<CorpoPreparar {...props} aoMudar={aoMudar} />);
    fireEvent.change(screen.getByLabelText("Nota para a visita (opcional)"), { target: { value: "Levar escada" } });
    expect(aoMudar).toHaveBeenCalledWith({ nota: "Levar escada" });
  });
});

describe("CorpoMarcar", () => {
  it("«Marcar a visita» abre a agenda e mostra o que se preparou", () => {
    const aoMarcar = vi.fn();
    render(<CorpoMarcar preparar={{ duracao: "h1m30", quem: "casal", nota: "" }} marcada={false} aoMarcar={aoMarcar} podeMarcar />);
    expect(screen.getByText(/1 h 30/)).toBeInTheDocument();
    expect(screen.getByText(/O casal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar a visita" }));
    expect(aoMarcar).toHaveBeenCalledTimes(1);
  });

  it("sem nada preparado não inventa valores", () => {
    render(<CorpoMarcar preparar={{ duracao: "", quem: "", nota: "" }} marcada={false} aoMarcar={vi.fn()} podeMarcar />);
    expect(screen.getByText("Ainda não preparou a visita.")).toBeInTheDocument();
  });

  it("com visita marcada diz-o em texto e oferece marcar outra", () => {
    render(<CorpoMarcar preparar={{ duracao: "", quem: "", nota: "" }} marcada aoMarcar={vi.fn()} podeMarcar />);
    expect(screen.getByText("Já há uma visita marcada.")).toBeInTheDocument();
  });

  it("uma razão que bloqueia (sem interesse, número errado) desativa o botão, diz-se em texto e não abre a agenda", () => {
    const aoMarcar = vi.fn();
    render(<CorpoMarcar preparar={{ duracao: "", quem: "", nota: "" }} marcada={false} aoMarcar={aoMarcar} podeMarcar razaoBloqueio="A última chamada foi «Sem interesse»." />);
    const botao = screen.getByRole("button", { name: "Marcar a visita" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAccessibleDescription("A última chamada foi «Sem interesse».");
    fireEvent.click(botao);
    expect(aoMarcar).not.toHaveBeenCalled();
  });

  it("sem poder marcar não há botão", () => {
    render(<CorpoMarcar preparar={{ duracao: "", quem: "", nota: "" }} marcada={false} aoMarcar={vi.fn()} podeMarcar={false} />);
    expect(screen.queryByRole("button", { name: "Marcar a visita" })).not.toBeInTheDocument();
  });
});
