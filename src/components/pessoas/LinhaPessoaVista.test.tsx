// A linha partilhada entre o protótipo e a Lista real: só mostra o que a vista diz que sabe (nada de «exemplo», «Sem contacto»,
// «Manual» ou passos inventados), e as colunas preparadas para campos que ainda não existem tratam a falta com elegância.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { LinhaPessoaVista } from "./LinhaPessoaVista";
import { COLUNAS_PROTOTIPO, type IdColuna, type VistaLinhaPessoa } from "./vistaLinhaPessoa";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const vista = (sobre: Partial<VistaLinhaPessoa> = {}): VistaLinhaPessoa => ({
  id: "p1", nome: "Ana Lopes", papel: "lead", empresa: false, perdidaMotivo: null, encerrada: null, etapa: "nova", faseEtapa: null,
  diasSemContacto: 3, passo: "registarChamada", valorEmJogo: 0, exemplo: false, ...sobre,
});

interface Extra {
  colunas?: readonly IdColuna[];
  aoAbrir?: (origem: HTMLElement | null) => void;
  extras?: Partial<Record<IdColuna, ReactNode>>;
  cabecalho?: boolean;
}
function desenhar(v: VistaLinhaPessoa, { colunas = COLUNAS_PROTOTIPO, aoAbrir, extras, cabecalho }: Extra = {}) {
  render(
    <table><tbody>
      <LinhaPessoaVista vista={v} colunas={colunas} aoAbrir={aoAbrir} celulas={extras} cabecalhoDeLinha={cabecalho} />
    </tbody></table>,
  );
  return screen.getByRole("row");
}
const celulasDe = (linha: HTMLElement): HTMLElement[] => Array.from(linha.children) as HTMLElement[];

describe("LinhaPessoaVista: nada de falso com dados reais", () => {
  it("só escreve «exemplo» quando a vista é de exemplo", () => {
    desenhar(vista({ exemplo: false }));
    expect(screen.queryByText("exemplo")).toBeNull();
  });
  it("a vista de exemplo escreve «exemplo» (o protótipo fica como estava)", () => {
    desenhar(vista({ exemplo: true }));
    expect(screen.getByText("exemplo")).toBeInTheDocument();
  });
  it("com contacto e sem resultado conhecido não há selo de resultado nem «Sem contacto»", () => {
    desenhar(vista({ diasSemContacto: 3, resultado: undefined }));
    expect(screen.getByText("há 3 dias")).toBeInTheDocument();
    expect(screen.queryByText("Sem contacto")).toBeNull();
    expect(screen.queryByText(/Atendeu|Não atendeu|Número errado/)).toBeNull();
  });
  it("com o resultado conhecido mostra o selo desse resultado", () => {
    desenhar(vista({ resultado: "atendeuInteressado" }));
    expect(screen.getByText("Atendeu · interessado")).toBeInTheDocument();
  });
  it("«Sem contacto» como selo só quando a vista o afirma (nunca houve contacto)", () => {
    desenhar(vista({ diasSemContacto: null, resultado: "semContacto" }));
    expect(screen.getAllByText("Sem contacto").length).toBe(2); // o texto do último contacto e o selo
  });
  it("formulário desconhecido não é «Registada à mão»: mostra o travessão", () => {
    const linha = desenhar(vista({ formulario: undefined }));
    expect(within(linha).queryByText("Registada à mão")).toBeNull();
    const form = celulasDe(linha)[COLUNAS_PROTOTIPO.indexOf("form")];
    expect(within(form).getByText("—")).toBeInTheDocument();
  });
  it("formulário null é «Registada à mão» e um nome aparece tal como está", () => {
    desenhar(vista({ formulario: null }), { colunas: ["person", "form"] });
    expect(screen.getByText("Registada à mão")).toBeInTheDocument();
  });
  it("o nome do formulário aparece", () => {
    desenhar(vista({ formulario: "Pedido de orçamento" }), { colunas: ["person", "form"] });
    expect(screen.getByText("Pedido de orçamento")).toBeInTheDocument();
  });
  it("passo desconhecido (null): travessão com texto para leitores de ecrã a remeter para a ficha", () => {
    const linha = desenhar(vista({ passo: null }), { colunas: ["person", "next"] });
    const celula = celulasDe(linha)[1];
    expect(within(celula).getByText("—")).toBeInTheDocument();
    expect(within(celula).getByText("Ver na ficha")).toHaveClass("sr-only");
  });
  it("passo «nenhum»: travessão e «Sem próximo passo» só para leitores de ecrã", () => {
    const linha = desenhar(vista({ passo: "nenhum" }), { colunas: ["person", "next"] });
    expect(within(celulasDe(linha)[1]).getByText("Sem próximo passo")).toHaveClass("sr-only");
  });
  it("um passo conhecido aparece escrito", () => {
    desenhar(vista({ passo: "marcarVisita" }), { colunas: ["person", "next"] });
    expect(screen.getByText("Marcar a visita")).toBeInTheDocument();
  });
});

describe("LinhaPessoaVista: o que está por baixo do nome", () => {
  it("papel de lead em texto; MQL/SQL, Atrasada e Voltou só quando a vista os afirma", () => {
    desenhar(vista({ qualificacao: "MQL", atrasada: true, voltou: true }), { colunas: ["person"] });
    expect(screen.getByText("Lead · MQL")).toBeInTheDocument();
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
    expect(screen.getByText("Voltou a contactar")).toBeInTheDocument();
  });
  it.each([[null], [undefined], [false]])("atrasada e voltou %s não aparecem", (valor) => {
    desenhar(vista({ atrasada: valor, voltou: valor }), { colunas: ["person"] });
    expect(screen.queryByText("Atrasada")).toBeNull();
    expect(screen.queryByText("Voltou a contactar")).toBeNull();
  });
  it("uma cliente leva o papel como selo junto ao nome, sem repetir «Cliente» por baixo, e o nome do botão fica só o nome", () => {
    const aoAbrir = vi.fn();
    desenhar(vista({ papel: "cliente", etapa: null }), { colunas: ["person", "stage"], aoAbrir });
    expect(screen.getAllByText("Cliente")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Ana Lopes" })).toBeInTheDocument();
  });
  it("na linha de uma cliente a coluna Etapa mostra travessão", () => {
    const linha = desenhar(vista({ papel: "cliente", etapa: null }), { colunas: ["person", "stage"] });
    expect(within(celulasDe(linha)[1]).getByText("—")).toBeInTheDocument();
  });
  it("nome vazio mostra «Sem nome»", () => {
    desenhar(vista({ nome: "" }), { colunas: ["person"], aoAbrir: vi.fn() });
    expect(screen.getByRole("button", { name: "Sem nome" })).toBeInTheDocument();
  });
});

describe("LinhaPessoaVista: a coluna Etapa", () => {
  it.each([
    [{ etapa: "nova" as const }, "Por contactar"],
    [{ etapa: "emContacto" as const }, "Contactada"],
    [{ etapa: "visitaMarcada" as const }, "Com visita"],
    [{ etapa: "qualificada" as const, faseEtapa: "proposta" as const }, "Negócio · Proposta"],
    [{ etapa: "qualificada" as const, faseEtapa: null }, "Negócio"],
    [{ etapa: "nova" as const, encerrada: "semInteresse" as const }, "Encerrada · Sem interesse"],
    [{ etapa: "nova" as const, perdidaMotivo: "preco" as const }, "Perdida · Preço"],
  ])("%j diz «%s»", (sobre, texto) => {
    desenhar(vista(sobre), { colunas: ["person", "stage"] });
    expect(screen.getByText(texto)).toBeInTheDocument();
  });
});

describe("LinhaPessoaVista: colunas escolhidas", () => {
  it("desenha só as colunas pedidas, pela ordem pedida (o nome é sempre a primeira)", () => {
    const linha = desenhar(vista({ valorEmJogo: 5000 }), { colunas: ["person", "value", "stage"] });
    const celulas = celulasDe(linha);
    expect(celulas).toHaveLength(3);
    expect(celulas[1]).toHaveTextContent(formatarMeta("euro", 5000));
    expect(celulas[2]).toHaveTextContent("Por contactar");
  });
  it("com cabecalhoDeLinha a primeira célula é um rowheader com scope=row", () => {
    const linha = desenhar(vista(), { colunas: ["person", "stage"], cabecalho: true });
    expect(within(linha).getByRole("rowheader")).toHaveAttribute("scope", "row");
    expect(within(linha).getAllByRole("cell")).toHaveLength(1);
  });
  it("as colunas preparadas sem dados mostram travessão e dizem «Sem dado», sem rebentar", () => {
    const linha = desenhar(vista(), { colunas: ["person", "place", "form", "created", "origin", "campaign"] });
    for (const celula of celulasDe(linha).slice(1)) {
      expect(within(celula).getByText("—")).toBeInTheDocument();
      expect(within(celula).getByText("Sem dado")).toHaveClass("sr-only");
    }
  });
  it("as colunas preparadas mostram os valores quando a vista os recebe", () => {
    desenhar(
      vista({ localidade: "Sintra", criadoEm: "2026-03-05T10:00:00Z", origem: "web", campanha: "Cozinhas" }),
      { colunas: ["person", "place", "created", "origin", "campaign"] },
    );
    expect(screen.getByText("Sintra")).toBeInTheDocument();
    expect(screen.getByText("05/03/2026")).toBeInTheDocument();
    expect(screen.getByText("Web")).toBeInTheDocument();
    expect(screen.getByText("Cozinhas")).toBeInTheDocument();
  });
  it("a origem conhecida (web, api, import) tem nome legível; as outras aparecem tal como a base as guarda", () => {
    desenhar(vista({ origem: "import" }), { colunas: ["person", "origin"] });
    expect(screen.getByText("Importação")).toBeInTheDocument();
  });
  it("uma origem desconhecida não se traduz nem se esconde", () => {
    desenhar(vista({ origem: "facebook_ads" }), { colunas: ["person", "origin"] });
    expect(screen.getByText("facebook_ads")).toBeInTheDocument();
  });
  it("uma data de criação inválida não rebenta: travessão", () => {
    const linha = desenhar(vista({ criadoEm: "lixo" }), { colunas: ["person", "created"] });
    expect(within(celulasDe(linha)[1]).getByText("—")).toBeInTheDocument();
  });
  it("as colunas que o chamador desenha (negócios, próxima visita) entram onde a ordem as põe", () => {
    const linha = desenhar(vista(), {
      colunas: ["person", "deals", "nextVisit"], extras: { deals: <span>NEG</span>, nextVisit: <span>VIS</span> },
    });
    const celulas = celulasDe(linha);
    expect(celulas[1]).toHaveTextContent("NEG");
    expect(celulas[2]).toHaveTextContent("VIS");
  });
});

describe("LinhaPessoaVista: comercial, telefone, email e WhatsApp", () => {
  it("o nome do comercial aparece; sem comercial (null) diz «Sem comercial»; por saber (undefined) é travessão", () => {
    desenhar(vista({ comercial: "Rui Dias" }), { colunas: ["person", "assigned"] });
    expect(screen.getByText("Rui Dias")).toBeInTheDocument();
  });
  it("sem comercial: texto «Sem comercial»", () => {
    desenhar(vista({ comercial: null }), { colunas: ["person", "assigned"] });
    expect(screen.getByText("Sem comercial")).toBeInTheDocument();
  });
  it("comercial ainda por saber: travessão, nunca «Sem comercial»", () => {
    desenhar(vista({ comercial: undefined }), { colunas: ["person", "assigned"] });
    expect(screen.queryByText("Sem comercial")).toBeNull();
    expect(screen.getByText("Sem dado")).toHaveClass("sr-only");
  });
  it("telefone e email aparecem; sem eles, «Sem telefone» e «Sem email»; por saber, «Sem dado»", () => {
    desenhar(vista({ telefone: "912 345 678", email: "ana@exemplo.pt" }), { colunas: ["person", "phone", "email"] });
    expect(screen.getByText("912 345 678")).toBeInTheDocument();
    expect(screen.getByText("ana@exemplo.pt")).toBeInTheDocument();
  });
  it("sem telefone nem email lidos (null)", () => {
    desenhar(vista({ telefone: null, email: null }), { colunas: ["person", "phone", "email"] });
    expect(screen.getByText("Sem telefone")).toHaveClass("sr-only");
    expect(screen.getByText("Sem email")).toHaveClass("sr-only");
  });
  it("telefone e email por ler (undefined): «Sem dado»", () => {
    desenhar(vista(), { colunas: ["person", "phone", "email"] });
    expect(screen.getAllByText("Sem dado")).toHaveLength(2);
  });
  it("WhatsApp: ligação com indicativo, nome acessível com a pessoa, noutro separador e com área de 44 px", () => {
    desenhar(vista({ telefone: "912345678" }), { colunas: ["person", "whatsapp"] });
    const ligacao = screen.getByRole("link", { name: /WhatsApp.*Ana Lopes/ });
    expect(ligacao).toHaveAttribute("href", "https://wa.me/351912345678");
    expect(ligacao).toHaveAttribute("target", "_blank");
    expect(ligacao).toHaveAttribute("rel", "noopener noreferrer");
    expect(ligacao.className).toContain("min-h-11");
    expect(ligacao.className).toContain("min-w-11");
  });
  it("WhatsApp sem telefone (ou com um que não é número): sem ligação", () => {
    desenhar(vista({ telefone: "sem número" }), { colunas: ["person", "whatsapp"] });
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("clicar no WhatsApp não abre a ficha da pessoa", () => {
    const aoAbrir = vi.fn();
    desenhar(vista({ telefone: "912345678" }), { colunas: ["person", "whatsapp"], aoAbrir });
    fireEvent.click(screen.getByRole("link"));
    expect(aoAbrir).not.toHaveBeenCalled();
  });
});

describe("LinhaPessoaVista: abrir a ficha", () => {
  it("clicar na linha, em qualquer célula, abre a ficha com o botão do nome como origem do foco", () => {
    const aoAbrir = vi.fn();
    const linha = desenhar(vista({ valorEmJogo: 100 }), { colunas: ["person", "value"], aoAbrir });
    fireEvent.click(celulasDe(linha)[1]);
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith(screen.getByRole("button", { name: "Ana Lopes" }));
  });
  it("clicar no botão do nome abre uma só vez", () => {
    const aoAbrir = vi.fn();
    desenhar(vista(), { colunas: ["person"], aoAbrir });
    fireEvent.click(screen.getByRole("button", { name: "Ana Lopes" }));
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });
  it("o botão anuncia o diálogo e leva o id da pessoa; a linha leva o data-pessoa-id e o botão não", () => {
    desenhar(vista(), { colunas: ["person"], aoAbrir: vi.fn() });
    const botao = screen.getByRole("button", { name: "Ana Lopes" });
    expect(botao).toHaveAttribute("aria-haspopup", "dialog");
    expect(botao).toHaveAttribute("data-abrir-pessoa", "p1");
    expect(botao).not.toHaveAttribute("data-pessoa-id");
    expect(screen.getByRole("row")).toHaveAttribute("data-pessoa-id", "p1");
  });
  it("sem aoAbrir o nome é texto e a linha não é clicável", () => {
    const linha = desenhar(vista(), { colunas: ["person"] });
    expect(screen.queryByRole("button")).toBeNull();
    expect(linha.className).not.toContain("cursor-pointer");
  });
});
