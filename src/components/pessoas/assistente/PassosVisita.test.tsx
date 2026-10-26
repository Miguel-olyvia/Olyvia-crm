// O conteúdo dos passos da fase Visita (só apresentação): a lista de TODAS as visitas do negócio em cartões expansíveis, uma secção do levantamento por
// passo (as perguntas vêm do questionário da base, no próprio ecrã) e «Fechar levantamento», que só guarda.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CorpoFechar, CorpoSeccao, CorpoVisitas } from "./PassosVisita";
import type { SeccaoDef } from "@/components/negocio-metas/perguntasTipos";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

const visita = (id: string, extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  id, data: "2026-10-20", hora: "10:30", feitoPor: "Rita Gomes", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "casal", duracao: "h1m30",
  morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: null, nota: "Levar escada", pessoaId: "p1", negocioId: "n1", ...extra,
});

describe("CorpoVisitas", () => {
  it("explica que um negócio pode ter várias visitas", () => {
    render(<CorpoVisitas visitas={[]} aoMarcarOutra={vi.fn()} podeMarcar />);
    expect(screen.getByText(/Um negócio pode ter várias visitas/)).toBeInTheDocument();
    expect(screen.getByText("Ainda não há visitas neste negócio.")).toBeInTheDocument();
  });

  it("lista todas as visitas em cartões «Visita N · tipo», com dia, hora, quem vai e a etiqueta do estado em texto", () => {
    render(
      <CorpoVisitas
        visitas={[visita("v1", { estado: "feita" }), visita("v2", { tipo: "medicao", data: "2026-10-27", hora: "09:00" }), visita("v3", { estado: "cancelada", tipo: "revisita" })]}
        aoMarcarOutra={vi.fn()} podeMarcar
      />,
    );
    const cartoes = screen.getAllByRole("button", { expanded: undefined }).filter((b) => b.hasAttribute("aria-expanded"));
    expect(cartoes).toHaveLength(3);
    expect(cartoes[0]).toHaveTextContent("Visita 1 · Levantamento");
    expect(cartoes[0]).toHaveTextContent("20/10/2026");
    expect(cartoes[0]).toHaveTextContent("10:30");
    expect(cartoes[0]).toHaveTextContent("Rita Gomes");
    expect(cartoes[0]).toHaveTextContent("Feita");
    expect(cartoes[1]).toHaveTextContent("Visita 2 · Medição técnica");
    expect(cartoes[1]).toHaveTextContent("Marcada");
    expect(cartoes[2]).toHaveTextContent("Visita 3 · Revisita");
    expect(cartoes[2]).toHaveTextContent("Cancelada");
  });

  it("abre por omissão a última visita que ainda não está feita, e as outras ficam fechadas", () => {
    render(<CorpoVisitas visitas={[visita("v1", { estado: "feita" }), visita("v2"), visita("v3", { estado: "cancelada" })]} aoMarcarOutra={vi.fn()} podeMarcar />);
    const cartoes = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
    expect(cartoes.map((b) => b.getAttribute("aria-expanded"))).toEqual(["false", "true", "false"]);
  });

  it("abrir um cartão mostra a duração, quem vai estar e a nota", () => {
    render(<CorpoVisitas visitas={[visita("v1", { estado: "feita" })]} aoMarcarOutra={vi.fn()} podeMarcar />);
    const cartao = screen.getAllByRole("button").find((b) => b.hasAttribute("aria-expanded")) as HTMLElement;
    expect(screen.queryByText("Levar escada")).not.toBeInTheDocument();
    fireEvent.click(cartao);
    expect(cartao).toHaveAttribute("aria-expanded", "true");
    const detalhe = screen.getByRole("region", { name: /Visita 1/ });
    expect(within(detalhe).getByText("1 h 30")).toBeInTheDocument();
    expect(within(detalhe).getByText("O casal")).toBeInTheDocument();
    expect(within(detalhe).getByText("Levar escada")).toBeInTheDocument();
  });

  it("«Marcar como feita» é manual: só nas visitas marcadas, dentro do cartão aberto, e grava a visita certa", async () => {
    const aoMarcarFeita = vi.fn().mockResolvedValue(null);
    render(<CorpoVisitas visitas={[visita("v1", { estado: "feita" }), visita("v2")]} aoMarcarOutra={vi.fn()} podeMarcar aoMarcarFeita={aoMarcarFeita} />);
    // A visita 2 abre por omissão e tem o botão; a visita 1 (feita) está fechada e, aberta, não tem.
    fireEvent.click(screen.getByRole("button", { name: "Marcar como feita" }));
    await waitFor(() => expect(aoMarcarFeita).toHaveBeenCalledWith(expect.objectContaining({ id: "v2" })));
    const cartao1 = screen.getAllByRole("button").find((b) => b.hasAttribute("aria-expanded")) as HTMLElement;
    fireEvent.click(cartao1);
    expect(screen.getAllByRole("button", { name: "Marcar como feita" })).toHaveLength(1);
  });

  it("se marcar como feita falha, o erro diz-se dentro do cartão", async () => {
    render(<CorpoVisitas visitas={[visita("v2")]} aoMarcarOutra={vi.fn()} podeMarcar aoMarcarFeita={vi.fn().mockResolvedValue("Não foi possível.")} />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como feita" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível.");
  });

  it("sem a ação (sem permissão) não há «Marcar como feita»", () => {
    render(<CorpoVisitas visitas={[visita("v2")]} aoMarcarOutra={vi.fn()} podeMarcar />);
    expect(screen.queryByRole("button", { name: "Marcar como feita" })).not.toBeInTheDocument();
  });

  it("«Marcar outra visita» está no fim e abre a agenda", () => {
    const aoMarcarOutra = vi.fn();
    render(<CorpoVisitas visitas={[visita("v1")]} aoMarcarOutra={aoMarcarOutra} podeMarcar />);
    const botao = screen.getByRole("button", { name: "Marcar outra visita" });
    fireEvent.click(botao);
    expect(aoMarcarOutra).toHaveBeenCalledTimes(1);
  });

  it("sem poder marcar não há botão; «Marcar como feita» continua manual (nada a fecha sozinho)", () => {
    render(<CorpoVisitas visitas={[visita("v1")]} aoMarcarOutra={vi.fn()} podeMarcar={false} />);
    expect(screen.queryByRole("button", { name: "Marcar outra visita" })).not.toBeInTheDocument();
    expect(screen.getByText(/continua a marcar-se à mão/)).toBeInTheDocument();
  });
});

describe("CorpoSeccao", () => {
  const pergunta = (id: string, rotulo: string) => ({ id, rotulo: [rotulo, rotulo] as const, literal: true, opcoes: [["a", "Sim", "Sim"], ["b", "Não", "Não"]] as const });
  const exterior: SeccaoDef = {
    id: "exterior", titulo: ["Exterior do edifício", "Exterior"], literal: true,
    blocos: [{ id: "exterior-0", literal: true, titulo: ["Acesso e estacionamento", "Access"], perguntas: [pergunta("elevador", "Há elevador?"), pergunta("estac", "Há estacionamento?")] }],
  };
  const props = { seccao: exterior, respostas: {}, erros: {}, aoEscolher: vi.fn(), aoEscrever: vi.fn(), estado: "pronto" as const, aoRepetir: vi.fn(), medidas: undefined };

  it("mostra as perguntas desta secção no próprio ecrã, com os blocos da base", () => {
    render(<CorpoSeccao {...props} />);
    expect(screen.getByText("Acesso e estacionamento")).toBeInTheDocument();
    expect(screen.getByText("Há elevador?")).toBeInTheDocument();
    expect(screen.getByText("Há estacionamento?")).toBeInTheDocument();
  });

  it("conta as respondidas desta secção", () => {
    render(<CorpoSeccao {...props} respostas={{ elevador: "a" }} />);
    expect(screen.getByText("1 de 2 respondidas")).toBeInTheDocument();
  });

  it("escolher uma opção avisa com a pergunta e a opção", () => {
    const aoEscolher = vi.fn();
    render(<CorpoSeccao {...props} aoEscolher={aoEscolher} />);
    fireEvent.click(screen.getAllByText("Não")[1]);
    expect(aoEscolher).toHaveBeenCalledWith("estac", "b");
  });

  it("uma secção sem perguntas diz-o", () => {
    render(<CorpoSeccao {...props} seccao={{ ...exterior, blocos: [] }} />);
    expect(screen.getByText("Esta secção não tem perguntas.")).toBeInTheDocument();
  });

  it("enquanto as perguntas carregam diz-se", () => {
    render(<CorpoSeccao {...props} estado="a-carregar" />);
    expect(screen.getByRole("status")).toHaveTextContent(/A carregar as perguntas/);
  });

  it("Medidas da área mostra as linhas e deixa adicionar uma", () => {
    const adicionarLinha = vi.fn();
    render(
      <CorpoSeccao
        {...props} seccao={{ id: "medidas", titulo: ["Medidas da área", "Measures"], literal: true, blocos: [], especial: "medidas" }}
        medidas={{ linhas: [], observacoes: "", erros: {}, acoes: { adicionarLinha, mudarLinha: vi.fn(), removerLinha: vi.fn(), mudarObservacoes: vi.fn() } }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Adicionar linha" }));
    expect(adicionarLinha).toHaveBeenCalledTimes(1);
  });
});

describe("CorpoFechar", () => {
  it("só guarda: o botão grava o levantamento e diz o que faz", () => {
    const aoGuardar = vi.fn();
    render(<CorpoFechar guardado={false} aGuardar={false} podeGuardar aoGuardar={aoGuardar} />);
    expect(screen.getByText(/continua a marcar-se à mão/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar o levantamento" }));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });

  it("enquanto grava o botão fica ocupado e não repete", () => {
    const aoGuardar = vi.fn();
    render(<CorpoFechar guardado={false} aGuardar podeGuardar aoGuardar={aoGuardar} />);
    const botao = screen.getByRole("button", { name: /Guardar o levantamento/ });
    expect(botao).toHaveAttribute("aria-busy", "true");
    fireEvent.click(botao);
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("depois de guardado diz-o em texto e já não oferece guardar", () => {
    render(<CorpoFechar guardado aGuardar={false} podeGuardar aoGuardar={vi.fn()} />);
    expect(screen.getByText("O levantamento está guardado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar o levantamento" })).not.toBeInTheDocument();
  });

  it("um erro ao guardar diz-se num alerta, e o botão continua para repetir", () => {
    render(<CorpoFechar guardado={false} aGuardar={false} podeGuardar aoGuardar={vi.fn()} erro="Não foi possível guardar." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível guardar.");
    expect(screen.getByRole("button", { name: "Guardar o levantamento" })).not.toHaveAttribute("aria-disabled");
  });

  it("sem poder guardar diz a razão", () => {
    render(<CorpoFechar guardado={false} aGuardar={false} podeGuardar={false} aoGuardar={vi.fn()} razao="As perguntas ainda estão a carregar." />);
    expect(screen.getByText("As perguntas ainda estão a carregar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar o levantamento" })).toHaveAttribute("aria-disabled", "true");
  });
});
