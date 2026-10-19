// «Registos ligados» na ficha REAL: os registos vêm da ficha (por contexto), ligar e desligar vão para a base (neg_ligar_registo e
// neg_desligar_registo) e esperam por ela, um levantamento ligado não se desliga, um contrato sem base não se liga, e os erros traduzem-se
// pelo código em role="alert". O exemplo (stores em memória) está em RegistosLigadosNegocio.test.tsx e não muda.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { ComCostura, dadosFalsos, erroNegFalso, mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { registosAtuais, repor } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, levantamentoBase, negocioBase, registosBase, visitaPessoaBase } from "./fabricaTestes";
import { textoDiaCompleto } from "./formatoPessoas";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); });

const negocio = negocioBase("n1", { pessoaId: "a", pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" });
const registos = registosBase({
  contactos: [contactoBase("c1", { negocioId: "n1", data: "2026-10-10" }), contactoBase("c2", { negocioId: null, data: "2026-10-12" })],
  visitas: [visitaPessoaBase("v1", { negocioId: "n1", data: "2026-10-11" })],
  levantamentos: [levantamentoBase("l1", { negocioId: "n1", data: "2026-10-11" })],
});
const data = (d: string) => textoDiaCompleto(d);

function mostrar(mutacoes: MutacoesNegocio = mutacoesFalsas(), dados: Partial<DadosNegocio> = {}, aberto = true) {
  const anunciar = vi.fn();
  render(
    <AnuncioFichaContext.Provider value={anunciar}>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos({ registos, ...dados })}>
        <RegistosLigadosNegocio negocio={negocio} aberto={aberto} />
      </ComCostura>
    </AnuncioFichaContext.Provider>,
  );
  return { anunciar, mutacoes };
}

describe("RegistosLigadosNegocio na ficha real: ler", () => {
  it("lista o que está ligado e o que está por ligar, vindo da ficha (não do store)", () => {
    mostrar();
    expect(screen.getByText(`Contacto de ${data("2026-10-10")}`)).toBeInTheDocument();
    expect(screen.getByText(`Visita de ${data("2026-10-11")}`)).toBeInTheDocument();
    expect(screen.getByText(`Levantamento de ${data("2026-10-11")}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Ligar a este negócio: Contacto de ${data("2026-10-12")}` })).toBeInTheDocument();
    expect(registosAtuais().contactos).toHaveLength(0);
  });

  it("um levantamento ligado não se desliga (a base não deixa): sem botão e com a explicação em texto", () => {
    mostrar();
    expect(screen.queryByRole("button", { name: `Desligar do negócio: Levantamento de ${data("2026-10-11")}` })).toBeNull();
    expect(screen.getByRole("button", { name: `Desligar do negócio: Contacto de ${data("2026-10-10")}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Desligar do negócio: Visita de ${data("2026-10-11")}` })).toBeInTheDocument();
    expect(screen.getByText("Um levantamento ligado fica no negócio e não se desliga.")).toBeInTheDocument();
  });

  it("um negócio terminado mostra os registos sem botões", () => {
    mostrar(mutacoesFalsas(), {}, false);
    expect(screen.getByText(`Contacto de ${data("2026-10-10")}`)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("sem permissão para editar vê-se tudo, mas sem botões", () => {
    mostrar(mutacoesFalsas(), { podeEditar: false });
    expect(screen.getByText(`Contacto de ${data("2026-10-10")}`)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("RegistosLigadosNegocio na ficha real: ligar e desligar", () => {
  it("ligar chama a base, espera por ela (só esta linha fica aria-busy), anuncia no fim e não toca no store", async () => {
    const acao = pendente();
    const { anunciar, mutacoes } = mostrar(mutacoesFalsas({ ligar: vi.fn(() => acao.promessa) }));
    const botao = screen.getByRole("button", { name: `Ligar a este negócio: Contacto de ${data("2026-10-12")}` });
    fireEvent.click(botao);
    expect(mutacoes.ligar).toHaveBeenCalledWith("n1", { tipo: "contacto", id: "c2" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("A guardar…");
    expect(screen.getByRole("button", { name: `Desligar do negócio: Visita de ${data("2026-10-11")}` })).not.toHaveAttribute("aria-busy");
    fireEvent.click(botao);
    expect(mutacoes.ligar).toHaveBeenCalledTimes(1);
    expect(anunciar).not.toHaveBeenCalled();
    await acao.terminar(undefined);
    expect(anunciar).toHaveBeenCalledWith(`Contacto de ${data("2026-10-12")} ligado ao negócio.`);
    expect(botao).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(registosAtuais().contactos).toHaveLength(0);
  });

  it("desligar chama a base com o tipo e o id, e anuncia no fim", async () => {
    const { anunciar, mutacoes } = mostrar();
    fireEvent.click(screen.getByRole("button", { name: `Desligar do negócio: Visita de ${data("2026-10-11")}` }));
    expect(mutacoes.desligar).toHaveBeenCalledWith("n1", { tipo: "visita", id: "v1" });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith(`Visita de ${data("2026-10-11")} desligado do negócio.`));
  });

  it("um erro traduz-se pelo código em role=alert, a linha volta a poder repetir e nada se anuncia como feito", async () => {
    const acao = pendente();
    const ligar = vi.fn().mockReturnValueOnce(acao.promessa).mockResolvedValueOnce(undefined);
    const { anunciar } = mostrar(mutacoesFalsas({ ligar }));
    const botao = screen.getByRole("button", { name: `Ligar a este negócio: Contacto de ${data("2026-10-12")}` });
    fireEvent.click(botao);
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.ng004", "NG004"));
    expect(screen.getByRole("alert")).toHaveTextContent("Este registo não pode ser ligado a este negócio.");
    expect(anunciar).not.toHaveBeenCalled();
    expect(botao).not.toHaveAttribute("aria-busy");
    fireEvent.click(botao);
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(anunciar).toHaveBeenCalledTimes(1));
    expect(ligar).toHaveBeenCalledTimes(2);
  });

  it("um erro sem chave conhecida mostra a mensagem genérica", async () => {
    const acao = pendente();
    mostrar(mutacoesFalsas({ ligar: vi.fn(() => acao.promessa) }));
    fireEvent.click(screen.getByRole("button", { name: `Ligar a este negócio: Contacto de ${data("2026-10-12")}` }));
    await acao.falhar(new Error("relation does not exist"));
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir a ação. Tente novamente.");
  });
});

describe("RegistosLigadosNegocio na ficha real: documentos por ligar", () => {
  const documentosPorLigar: DadosNegocio["documentosPorLigar"] = [
    { tipo: "orcamento", id: "o1", numero: "O-1", temBase: true },
    { tipo: "proposta", id: "p1", numero: "P-3", temBase: true },
    { tipo: "contrato", id: "k1", numero: "C-9", temBase: true },
    { tipo: "contrato", id: "k2", numero: "C-10", temBase: false },
  ];

  it("lista os documentos antigos sem negócio, com «Ligar»", () => {
    mostrar(mutacoesFalsas(), { documentosPorLigar });
    const secao = screen.getByRole("group", { name: "Documentos por ligar" });
    expect(within(secao).getAllByRole("listitem")).toHaveLength(4);
    expect(within(secao).getByRole("button", { name: "Ligar a este negócio: Orçamento O-1" })).toBeInTheDocument();
    expect(within(secao).getByRole("button", { name: "Ligar a este negócio: Proposta P-3" })).toBeInTheDocument();
  });

  it("ligar um documento chama a base com o tipo certo", async () => {
    const { mutacoes, anunciar } = mostrar(mutacoesFalsas(), { documentosPorLigar });
    fireEvent.click(screen.getByRole("button", { name: "Ligar a este negócio: Proposta P-3" }));
    expect(mutacoes.ligar).toHaveBeenCalledWith("n1", { tipo: "proposta", id: "p1" });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Proposta P-3 ligado ao negócio."));
  });

  it("um contrato sem orçamento nem proposta (sem base) fica aria-disabled com a explicação visível e nunca chega à base", () => {
    const { mutacoes } = mostrar(mutacoesFalsas(), { documentosPorLigar });
    const botao = screen.getByRole("button", { name: "Ligar a este negócio: Contrato C-10" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    const explicacao = document.getElementById(botao.getAttribute("aria-describedby") ?? "");
    expect(explicacao).toHaveTextContent("Este contrato não tem orçamento nem proposta: não se pode ligar.");
    fireEvent.click(botao);
    expect(mutacoes.ligar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ligar a este negócio: Contrato C-9" })).not.toHaveAttribute("aria-disabled");
  });

  it("sem documentos por ligar (ou num negócio terminado) a secção não existe", () => {
    mostrar();
    expect(screen.queryByRole("group", { name: "Documentos por ligar" })).toBeNull();
    cleanup();
    mostrar(mutacoesFalsas(), { documentosPorLigar }, false);
    expect(screen.queryByRole("group", { name: "Documentos por ligar" })).toBeNull();
  });
});

describe("RegistosLigadosNegocio na ficha real: o foco depois de ligar ou desligar", () => {
  // A linha clicada sai do sítio (muda de lista quando a ficha se refaz): o foco vai para um sítio estável, o título de «por ligar».
  const noTitulo = () => expect(document.activeElement).toHaveTextContent("Por ligar a este negócio");

  it("depois de ligar um registo o foco fica no título «Por ligar a este negócio»", async () => {
    const { mutacoes } = mostrar();
    const botao = screen.getByRole("button", { name: `Ligar a este negócio: Contacto de ${data("2026-10-12")}` });
    botao.focus();
    fireEvent.click(botao);
    await waitFor(() => expect(mutacoes.ligar).toHaveBeenCalledTimes(1));
    await waitFor(noTitulo);
  });

  it("depois de desligar um registo o foco também fica nesse título", async () => {
    const { mutacoes } = mostrar();
    const botao = screen.getByRole("button", { name: `Desligar do negócio: Contacto de ${data("2026-10-10")}` });
    botao.focus();
    fireEvent.click(botao);
    await waitFor(() => expect(mutacoes.desligar).toHaveBeenCalledTimes(1));
    await waitFor(noTitulo);
  });

  it("depois de ligar um documento por ligar o foco fica nesse título", async () => {
    const { mutacoes } = mostrar(mutacoesFalsas(), { documentosPorLigar: [{ tipo: "proposta", id: "p1", numero: "P-3", temBase: true }] });
    const botao = screen.getByRole("button", { name: "Ligar a este negócio: Proposta P-3" });
    botao.focus();
    fireEvent.click(botao);
    await waitFor(() => expect(mutacoes.ligar).toHaveBeenCalledTimes(1));
    await waitFor(noTitulo);
  });

  it("se a ligação falha o foco não se mexe: fica no botão, com o erro à vista", async () => {
    const acao = pendente();
    mostrar(mutacoesFalsas({ ligar: vi.fn(() => acao.promessa) }));
    const botao = screen.getByRole("button", { name: `Ligar a este negócio: Contacto de ${data("2026-10-12")}` });
    botao.focus();
    fireEvent.click(botao);
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.ng004", "NG004"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(document.activeElement).toBe(botao);
  });

  it("o título de «por ligar» pode receber foco por código mas não entra na ordem do Tab", () => {
    mostrar();
    expect(screen.getByText("Por ligar a este negócio")).toHaveAttribute("tabindex", "-1");
  });
});
