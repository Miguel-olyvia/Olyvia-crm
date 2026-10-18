import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase } from "./fabricaTestes";
import type { ResumoPessoa } from "./pessoasTipos";
import { COLUNAS, TabelaPessoas } from "./TabelaPessoas";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

const escolhido: NegocioMes["orcamentos"] = [{ id: "o", valor: 5000, escolhido: true }];
const comNegocios = (id: string, nome: string, negocios: NegocioMes[]): ResumoPessoa =>
  resumoBase(pessoaBase(id, { nome }), negocios.map((n) => ({ ...n, pessoaId: id })), HOJE_EXEMPLO);

const ANA = comNegocios("ana", "Ana Lopes", [
  negocioBase("n1", { servico: "Cozinha", orcamentos: escolhido }),
  negocioBase("n2", { servico: "Sala", orcamentos: escolhido, proposta: { estado: "enviada" } }),
]);
// Uma pessoa em abordagem (sem registos): um só item, a chamada por registar.
const BRUNO = resumoBase(pessoaBase("bruno", { nome: "Bruno Reis" }), [], HOJE_EXEMPLO, "lead", registosBase());
const CLARA = resumoBase(pessoaBase("clara", { nome: "Clara Dias", perdida: { motivo: "preco", data: "2026-10-01" } }), [], HOJE_EXEMPLO);

function Arnes({ resumos = [ANA, BRUNO, CLARA], aoAbrir = vi.fn() }: { resumos?: ResumoPessoa[]; aoAbrir?: (id: string) => void }) {
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (id: string) => setAbertas((a) => (a.has(id) ? new Set([...a].filter((x) => x !== id)) : new Set([...a, id])));
  return (
    <TabelaPessoas
      resumos={resumos} pendentes={new Set()} hoje={HOJE_EXEMPLO} abertas={abertas} aoAlternar={alternar} aoAbrir={aoAbrir} aoLimpar={vi.fn()}
    />
  );
}

const linhaDe = (nome: string): HTMLElement => screen.getByRole("button", { name: nome }).closest("tr")!;
const botaoVer = (nome: string): HTMLElement => within(linhaDe(nome)).getByRole("button", { name: /negócios/ });

describe("COLUNAS", () => {
  it("as larguras somam 100 e a coluna dos negócios é a última", () => {
    expect(COLUNAS.reduce((soma, c) => soma + c.largura, 0)).toBe(100);
    expect(COLUNAS[COLUNAS.length - 1].id).toBe("deals");
  });

  it("a coluna dos negócios tem entre 13 e 14 % (o botão e a nota quebram em duas linhas, não em quatro)", () => {
    const largura = COLUNAS.find((c) => c.id === "deals")!.largura;
    expect(largura).toBeGreaterThanOrEqual(13);
    expect(largura).toBeLessThanOrEqual(14);
  });
});

describe("TabelaPessoas: coluna de negócios", () => {
  it("tem o cabeçalho 'Negócios' e uma célula de negócios em cada linha", () => {
    render(<Arnes />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(COLUNAS.length);
    expect(screen.getByRole("columnheader", { name: "Negócios" })).toBeInTheDocument();
    for (const linha of screen.getAllByRole("row").slice(1)) expect(within(linha).getAllByRole("cell")).toHaveLength(COLUNAS.length);
  });

  it("fechado: o botão diz 'Ver negócios (2)', aria-expanded=false, sem aria-controls, e o nome acessível é o texto visível mais a pessoa", () => {
    render(<Arnes />);
    const botao = botaoVer("Ana Lopes");
    expect(botao).toHaveTextContent("Ver negócios (2)");
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao).not.toHaveAttribute("aria-controls");
    expect(botao).toHaveAccessibleName("Ver negócios (2) de Ana Lopes");
    expect(botao.className).toContain("min-h-11");
    expect(screen.queryByRole("list", { name: "Negócios de Ana Lopes" })).not.toBeInTheDocument();
  });

  it("abrir mostra as sub-linhas, troca o texto para 'Esconder negócios' e liga o aria-controls ao painel", () => {
    render(<Arnes />);
    fireEvent.click(botaoVer("Ana Lopes"));
    const botao = botaoVer("Ana Lopes");
    expect(botao).toHaveTextContent("Esconder negócios");
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(botao).toHaveAccessibleName("Esconder negócios de Ana Lopes");
    const painel = document.getElementById(botao.getAttribute("aria-controls") ?? "");
    expect(painel).not.toBeNull();
    expect(within(painel!).getByRole("list", { name: "Negócios de Ana Lopes" })).toBeInTheDocument();
    expect(within(painel!).getAllByRole("listitem")).toHaveLength(2);
    expect(within(painel!).getByText("Cozinha")).toBeInTheDocument();
    expect(within(painel!).getByText("Sala")).toBeInTheDocument();
  });

  it("fechar volta a esconder as sub-linhas, e cada pessoa abre sem afetar as outras", () => {
    render(<Arnes />);
    fireEvent.click(botaoVer("Ana Lopes"));
    fireEvent.click(botaoVer("Bruno Reis"));
    expect(screen.getAllByRole("list", { name: /^Negócios de / })).toHaveLength(2);
    fireEvent.click(botaoVer("Ana Lopes"));
    expect(screen.queryByRole("list", { name: "Negócios de Ana Lopes" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Negócios de Bruno Reis" })).toBeInTheDocument();
    expect(botaoVer("Ana Lopes")).toHaveAttribute("aria-expanded", "false");
  });

  it("abrir as sub-linhas só acrescenta uma linha à tabela por pessoa aberta", () => {
    render(<Arnes />);
    const antes = screen.getAllByRole("row").length;
    fireEvent.click(botaoVer("Ana Lopes"));
    expect(screen.getAllByRole("row")).toHaveLength(antes + 1);
  });

  it("clicar no botão NÃO abre a ficha; clicar na linha abre", () => {
    const aoAbrir = vi.fn();
    render(<Arnes aoAbrir={aoAbrir} />);
    fireEvent.click(botaoVer("Ana Lopes"));
    expect(aoAbrir).not.toHaveBeenCalled();
    fireEvent.click(within(linhaDe("Ana Lopes")).getByText("Ana Lopes"));
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("ana");
  });

  it("o botão do passo numa sub-linha abre a ficha uma só vez (sem duplicar com o clique da linha)", () => {
    const aoAbrir = vi.fn();
    render(<Arnes aoAbrir={aoAbrir} />);
    fireEvent.click(botaoVer("Ana Lopes"));
    fireEvent.click(screen.getByRole("button", { name: /^Criar a proposta/ }));
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("ana");
  });

  it("teclado: é um botão nativo focável e a linha não cancela o keydown de Enter nem de Espaço (o clique nativo do navegador não é simulado)", () => {
    const aoAbrir = vi.fn();
    render(<Arnes aoAbrir={aoAbrir} />);
    const botao = botaoVer("Ana Lopes");
    expect(botao.tagName).toBe("BUTTON");
    expect(botao).toHaveAttribute("type", "button");
    expect(botao).not.toHaveAttribute("tabindex", "-1");
    botao.focus();
    expect(botao).toHaveFocus();
    // O navegador converte Enter e Espaço num clique do botão; o que a linha não pode fazer é cancelar a tecla ou abrir a ficha.
    expect(fireEvent.keyDown(botao, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(botao, { key: " " })).toBe(true);
    expect(fireEvent.keyUp(botao, { key: " " })).toBe(true);
    expect(aoAbrir).not.toHaveBeenCalled();
    fireEvent.click(botao);
    expect(botaoVer("Ana Lopes")).toHaveAttribute("aria-expanded", "true");
  });

  it("pessoa sem itens (perdida) não tem botão e diz 'Nada a fazer neste momento'", () => {
    render(<Arnes />);
    const linha = linhaDe("Clara Dias");
    expect(within(linha).queryByRole("button", { name: /negócios/ })).not.toBeInTheDocument();
    expect(within(linha).getByText("Nada a fazer neste momento")).toBeInTheDocument();
  });

  it("fechada, mostra o resumo: número de itens em curso e o passo mais urgente", () => {
    render(<Arnes />);
    expect(within(linhaDe("Ana Lopes")).getByText(/^2 em curso · A fazer: /)).toBeInTheDocument();
    expect(within(linhaDe("Bruno Reis")).getByText("1 em curso · A fazer: Registar a chamada")).toBeInTheDocument();
  });

  it("o resumo esconde-se quando a pessoa abre as sub-linhas", () => {
    render(<Arnes />);
    fireEvent.click(botaoVer("Ana Lopes"));
    expect(within(linhaDe("Ana Lopes")).queryByText(/em curso/)).not.toBeInTheDocument();
  });

  it("o resumo usa o passo do negócio mais avançado, o mesmo da coluna 'Próximo passo', mesmo com o prazo mais distante", () => {
    const dora = comNegocios("dora", "Dora Pinto", [
      negocioBase("a", { orcamentos: escolhido, proximoPrazo: "2026-10-05" }),
      negocioBase("b", { orcamentos: escolhido, proposta: { estado: "enviada" }, proximoPrazo: "2026-10-30" }),
    ]);
    render(<Arnes resumos={[dora]} />);
    const linha = linhaDe("Dora Pinto");
    expect(within(linha).getByText("2 em curso · A fazer: Registar a resposta do cliente")).toBeInTheDocument();
    expect(within(linha).getByText("À espera do cliente")).toBeInTheDocument();
  });

  it("uma pessoa com dois negócios abertos tem dois itens, cada um com o seu passo; os registos por ligar não fazem um terceiro (a pessoa já não está em abordagem)", () => {
    const eva = resumoBase(
      pessoaBase("eva", { nome: "Eva Costa" }),
      [negocioBase("n1", { pessoaId: "eva", servico: "Cozinha", orcamentos: escolhido }), negocioBase("n2", { pessoaId: "eva", servico: "Janelas", orcamentos: [] })],
      HOJE_EXEMPLO, "lead", registosBase({ contactos: [contactoBase("rc-1", { pessoaId: "eva" })] }),
    );
    render(<Arnes resumos={[eva]} />);
    expect(botaoVer("Eva Costa")).toHaveTextContent("Ver negócios (2)");
    expect(within(linhaDe("Eva Costa")).getByText("2 em curso · A fazer: Criar a proposta")).toBeInTheDocument();
    fireEvent.click(botaoVer("Eva Costa"));
    const lista = screen.getByRole("list", { name: "Negócios de Eva Costa" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista).getByRole("button", { name: /^Criar o orçamento: Janelas de Eva Costa/ })).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: /^Criar a proposta: Cozinha de Eva Costa/ })).toBeInTheDocument();
    expect(within(lista).queryByText("Abordagem")).not.toBeInTheDocument();
  });

  it("sem pessoas mostra o estado vazio com 'Limpar filtros'", () => {
    render(<Arnes resumos={[]} />);
    expect(screen.getByText("Nenhuma pessoa com estes filtros")).toBeInTheDocument();
  });
});
