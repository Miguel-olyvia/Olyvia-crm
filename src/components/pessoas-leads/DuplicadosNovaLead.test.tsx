// O diálogo de duplicados da «Nova lead»: só «Abrir existente», «Atualizar dados» e «Cancelar»; lado a lado em tabela com cabeçalhos; botões de
// 44 px; confirmação com o antigo e o novo e o foco em «Voltar»; erros em role=alert. Nunca «Criar mesmo assim» nem «Partilhar».
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PessoaBloqueio } from "@/hooks/pessoas/novaLead/tiposNovaLead";
import type { Bloqueio } from "@/hooks/pessoas/novaLead/useNovaLead";
import { DuplicadosNovaLead } from "./DuplicadosNovaLead";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const pessoa = (sobre: Partial<PessoaBloqueio> = {}): PessoaBloqueio => ({
  entityId: "p1", nome: "Ana Lopes", papel: "lead", jaECliente: false, estado: "new", encerrada: false, motivoEncerramento: null, atribuidoA: "Rui Costa",
  criadaEm: "2026-09-15T10:00:00Z", campos: ["email", "telefone"],
  ladoALado: [
    { campo: "nome", escrito: "Ana Lopes", existente: "Ana Lopes", estado: "igual" },
    { campo: "email", escrito: "ana@x.pt", existente: "ana@x.pt", estado: "igual" },
    { campo: "telefone", escrito: "+351 912 000 111", existente: "911 222 333", estado: "diferente" },
    { campo: "nif", escrito: null, existente: null, estado: "naoIndicado" },
  ],
  podeAbrir: true,
  atualizar: { leadId: "l1", reabrirLead: false, reabrirAbordagem: false, email: null, telefone: { antigo: "911 222 333", novo: "+351 912 000 111" } },
  ...sobre,
});
const bloqueio = (pessoas: PessoaBloqueio[], sobre: Partial<Bloqueio> = {}): Bloqueio => ({ tipo: "bloquear", pessoas, semAcesso: false, grupo: [], ...sobre });

function desenhar(sobre: Partial<Parameters<typeof DuplicadosNovaLead>[0]> = {}) {
  const f = { aoAbrir: vi.fn(), aoAtualizar: vi.fn(), aoConfirmar: vi.fn(), aoVoltar: vi.fn(), aoCancelar: vi.fn(), aoTentarDeNovo: vi.fn() };
  const props = { decisao: bloqueio([pessoa()]), confirmar: null, aGuardar: false, erro: null, parcial: null, ...f, ...sobre };
  render(<DuplicadosNovaLead {...props} />);
  return f;
}
const botoes = () => within(screen.getByRole("alertdialog")).getAllByRole("button").map((b) => b.textContent?.replace(/\s+/g, " ").trim());

describe("DuplicadosNovaLead: uma pessoa que já existe", () => {
  it("diz quem é: título, nome, papel, estado, atribuído a e criada em", () => {
    desenhar();
    expect(screen.getByRole("alertdialog", { name: "Esta pessoa já existe" })).toBeInTheDocument();
    expect(screen.getByText("Encontrámos uma pessoa nesta organização com os mesmos dados. Nada foi criado.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Ana Lopes/ })).toBeInTheDocument();
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Estado:")).toBeInTheDocument();
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.getByText("Rui Costa")).toBeInTheDocument();
    expect(screen.getByText("15/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Coincide: email, telefone")).toBeInTheDocument();
  });

  it("só tem «Abrir existente», «Atualizar dados» e «Cancelar»: nunca «Criar mesmo assim» nem «Partilhar»", () => {
    desenhar();
    expect(botoes()).toEqual(["Abrir existente Ana Lopes", "Atualizar dados Ana Lopes", "Cancelar"]);
    expect(screen.queryByText(/criar mesmo assim/i)).toBeNull();
    expect(screen.queryByText(/partilhar/i)).toBeNull();
    expect(screen.getByRole("button", { name: /^Abrir existente/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Atualizar dados/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("todos os botões têm 44 px de altura mínima", () => {
    desenhar();
    for (const b of within(screen.getByRole("alertdialog")).getAllByRole("button")) expect(b.className, b.textContent ?? "").toContain("min-h-11");
  });

  it("o lado a lado é uma tabela com cabeçalhos de coluna e de linha e diz «Igual» e «Diferente» em texto", () => {
    desenhar();
    const tabela = screen.getByRole("table", { name: "O que escreveu e o que está na ficha de Ana Lopes" });
    const colunas = within(tabela).getAllByRole("columnheader");
    expect(colunas.map((c) => c.textContent)).toEqual(["Campo", "O que escreveu", "Na ficha existente"]);
    colunas.forEach((c) => expect(c).toHaveAttribute("scope", "col"));
    const linhas = within(tabela).getAllByRole("rowheader");
    expect(linhas.map((c) => c.textContent)).toEqual(["Nome", "Email", "Telefone", "NIF"]);
    linhas.forEach((c) => expect(c).toHaveAttribute("scope", "row"));
    const telefone = screen.getByRole("rowheader", { name: "Telefone" }).closest("tr") as HTMLElement;
    expect(within(telefone).getByText("Diferente")).toBeInTheDocument();
    expect(within(telefone).getByText("+351 912 000 111")).toBeInTheDocument();
    expect(within(screen.getByRole("rowheader", { name: "Email" }).closest("tr") as HTMLElement).getByText("Igual")).toBeInTheDocument();
    // sem NIF escrito: «Não indicado» nas duas células
    expect(within(screen.getByRole("rowheader", { name: "NIF" }).closest("tr") as HTMLElement).getAllByText("Não indicado")).toHaveLength(2);
  });

  it("o NIF que coincide diz «Coincide» (o valor não se mostra: está cifrado)", () => {
    desenhar({ decisao: bloqueio([pessoa({ campos: ["nif"], ladoALado: [{ campo: "nif", escrito: "123456789", existente: null, estado: "coincide" }] })]) });
    const linha = screen.getByRole("rowheader", { name: "NIF" }).closest("tr") as HTMLElement;
    expect(within(linha).getByText("Coincide")).toBeInTheDocument();
  });

  it("cada botão chama o que lhe corresponde, com a pessoa certa", () => {
    const f = desenhar();
    fireEvent.click(screen.getByRole("button", { name: /^Abrir existente/ }));
    expect(f.aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ entityId: "p1" }));
    fireEvent.click(screen.getByRole("button", { name: /^Atualizar dados/ }));
    expect(f.aoAtualizar).toHaveBeenCalledWith(expect.objectContaining({ entityId: "p1" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(f.aoCancelar).toHaveBeenCalledTimes(1);
  });

  it("Escape cancela (sem escrever nada)", () => {
    const f = desenhar();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(f.aoCancelar).toHaveBeenCalled();
  });
});

describe("DuplicadosNovaLead: os outros casos", () => {
  it("cliente ativo diz «Já é cliente», abre mas não atualiza", () => {
    desenhar({ decisao: bloqueio([pessoa({ papel: "cliente", jaECliente: true, atualizar: null })]) });
    expect(screen.getByText("Já é cliente")).toBeInTheDocument();
    expect(screen.getByText("Cliente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Abrir existente/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar dados/ })).toBeNull();
  });

  it("uma abordagem encerrada mostra-o em texto, com o resultado", () => {
    desenhar({ decisao: bloqueio([pessoa({ encerrada: true, motivoEncerramento: "semInteresse" })]) });
    expect(screen.getByText("Encerrada · Sem interesse")).toBeInTheDocument();
  });

  it("um estado que não se conhece mostra-se tal como vem", () => {
    desenhar({ decisao: bloqueio([pessoa({ estado: "proposal_sent" })]) });
    expect(screen.getByText("proposal_sent")).toBeInTheDocument();
  });

  it("duas pessoas: intro própria, «Abrir <nome>» de cada uma, sem «Atualizar dados»", () => {
    desenhar({ decisao: bloqueio([pessoa({ atualizar: null }), pessoa({ entityId: "p2", nome: "Beatriz Reis", atualizar: null })]) });
    expect(screen.getByText("Os dados que escreveu pertencem a pessoas diferentes nesta organização. Nada foi criado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir Ana Lopes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir Beatriz Reis" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atualizar dados/ })).toBeNull();
    expect(screen.getAllByRole("table")).toHaveLength(2);
  });

  it("uma pessoa sem lead nem cliente não tem «Abrir» (a ficha daria NG003)", () => {
    desenhar({ decisao: bloqueio([pessoa({ papel: null, podeAbrir: false, atualizar: null, estado: null, atribuidoA: null })]) });
    expect(screen.queryByRole("button", { name: /Abrir/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByText("Sem lead nem cliente")).toBeInTheDocument();
  });

  it("pessoa que a RLS esconde: só a frase de «sem acesso» e «Cancelar», sem nome nem botões de abrir", () => {
    desenhar({ decisao: bloqueio([], { semAcesso: true }) });
    expect(screen.getByText("Já existe uma pessoa com estes dados a que não tem acesso.")).toBeInTheDocument();
    expect(botoes()).toEqual(["Cancelar"]);
  });

  it("outra empresa do grupo aparece só como informação, sem botões", () => {
    desenhar({ decisao: bloqueio([pessoa()], { grupo: [{ organizacaoId: "o2", nome: "Loja Norte", campos: ["email"] }] }) });
    expect(screen.getByText("Também existe noutra empresa do grupo: Loja Norte")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Loja Norte/ })).toBeNull();
  });

  it("fechado quando não há decisão", () => {
    desenhar({ decisao: null });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("DuplicadosNovaLead: confirmar a atualização", () => {
  const confirmar = (sobre: Partial<PessoaBloqueio> = {}) => pessoa(sobre);

  it("mostra o antigo e o novo, o que se junta à lead e o foco começa em «Voltar»", () => {
    desenhar({ confirmar: confirmar() });
    expect(screen.getByText("Confirmar a atualização de Ana Lopes")).toBeInTheDocument();
    expect(screen.getByText("O telefone passa de 911 222 333 para +351 912 000 111.")).toBeInTheDocument();
    expect(screen.getByText("Os campos do formulário juntam-se à lead.")).toBeInTheDocument();
    expect(screen.queryByText(/O email passa/)).toBeNull();
    expect(screen.getByRole("button", { name: "Voltar" })).toHaveFocus();
  });

  it("lead perdida e abordagem encerrada dizem o que se reabre; o email antigo em falta diz «Não indicado»", () => {
    desenhar({
      confirmar: confirmar({
        atualizar: {
          leadId: "l1", reabrirLead: true, reabrirAbordagem: true, email: { antigo: null, novo: "ana@x.pt" }, telefone: null,
        },
      }),
    });
    expect(screen.getByText("A lead volta ao estado Nova.")).toBeInTheDocument();
    expect(screen.getByText("A abordagem encerrada é reaberta.")).toBeInTheDocument();
    expect(screen.getByText("O email passa de Não indicado para ana@x.pt.")).toBeInTheDocument();
  });

  it("«Confirmar e atualizar» e «Voltar» chamam o que lhes corresponde; a guardar fica desativado com aria-busy", () => {
    const f = desenhar({ confirmar: confirmar() });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e atualizar" }));
    expect(f.aoConfirmar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(f.aoVoltar).toHaveBeenCalledTimes(1);
  });

  it("a guardar, os dois botões ficam desativados e o de confirmar tem aria-busy", () => {
    desenhar({ confirmar: confirmar(), aGuardar: true });
    const guardar = screen.getByRole("button", { name: "A atualizar..." });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Voltar" })).toBeDisabled();
  });

  it("Escape na confirmação volta atrás (não cancela tudo)", () => {
    const f = desenhar({ confirmar: confirmar() });
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(f.aoVoltar).toHaveBeenCalled();
    expect(f.aoCancelar).not.toHaveBeenCalled();
  });
});

describe("DuplicadosNovaLead: erros dentro do diálogo", () => {
  it("o erro está em role=alert com «Tentar de novo»", () => {
    const f = desenhar({ confirmar: pessoa(), erro: { tipo: "atualizar", chave: "pessoasPagina.real.newLead.dup.checkFailed" } });
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível confirmar que estes dados não pertencem a outra pessoa. Nada foi alterado. Tente de novo.");
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    expect(f.aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it("o aviso parcial diz o que ficou feito e o que falhou", () => {
    desenhar({ confirmar: pessoa(), parcial: { feito: ["contacto"], falhou: "lead", chave: "pessoasPagina.erroNeg.generico" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Parte da atualização ficou feita: o contacto. Falhou: os campos da lead.");
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir a ação. Tente novamente.");
  });
});
