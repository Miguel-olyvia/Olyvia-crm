import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { SeparadorPessoas } from "../SeparadorPessoas";
import { usePessoasEstado } from "../usePessoasEstado";

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

function Arnes({ aoAbrir = vi.fn() }: { aoAbrir?: (id: string) => void }) {
  const e = usePessoasEstado(false);
  return (
    <SeparadorPessoas
      resumos={e.resumos} pendentes={e.pendentes} tipo={e.prefs.tipo} chip={e.prefs.chip} ordem={e.prefs.ordem} vista={e.prefs.vista}
      hoje={HOJE_EXEMPLO} comVoltou={false} aoMudarTipo={e.mudarTipo} aoMudarChip={e.mudarChip} aoMudarOrdem={e.mudarOrdem} aoMudarVista={e.mudarVista}
      aoAbrir={aoAbrir} aoMudarVisiveis={vi.fn()}
    />
  );
}

const procurar = (texto: string) =>
  fireEvent.change(screen.getByLabelText("Procurar pessoas por nome, telefone ou localidade"), { target: { value: texto } });
const botoesVer = () => screen.queryAllByRole("button", { name: /^(Ver|Esconder) negócios/ });
const listas = () => screen.queryAllByRole("list", { name: /^Negócios de / });

beforeEach(() => window.localStorage.clear());

describe("SeparadorPessoas: negócios de cada pessoa na Lista", () => {
  it("por defeito todas as linhas estão fechadas e há botões para quem tem itens em curso", () => {
    render(<Arnes />);
    expect(listas()).toHaveLength(0);
    expect(botoesVer().length).toBeGreaterThan(0);
    for (const b of botoesVer()) expect(b).toHaveAttribute("aria-expanded", "false");
  });

  it("quem não tem itens em curso não tem botão e diz que não há nada a fazer", () => {
    render(<Arnes />);
    const linhas = screen.getAllByRole("row").slice(1);
    const semBotao = linhas.filter((l) => within(l).queryByRole("button", { name: /^(Ver|Esconder) negócios/ }) === null);
    expect(semBotao.length + botoesVer().length).toBe(34);
    for (const l of semBotao) expect(within(l).getByText("Nada a fazer neste momento")).toBeInTheDocument();
  });

  it("abrir uma pessoa mostra as suas sub-linhas e o estado aguenta uma pesquisa", () => {
    render(<Arnes />);
    fireEvent.click(botoesVer()[0]);
    expect(listas()).toHaveLength(1);
    procurar("zzzz-ninguem");
    expect(listas()).toHaveLength(0);
    procurar("");
    expect(listas()).toHaveLength(1);
  });

  it("não persiste: ao voltar a montar a página, tudo fecha", () => {
    const { unmount } = render(<Arnes />);
    fireEvent.click(botoesVer()[0]);
    expect(listas()).toHaveLength(1);
    unmount();
    render(<Arnes />);
    expect(listas()).toHaveLength(0);
  });

  it("o botão não abre a ficha, mas o botão do passo numa sub-linha abre a da pessoa", () => {
    const aoAbrir = vi.fn();
    render(<Arnes aoAbrir={aoAbrir} />);
    const botao = botoesVer()[0];
    const linha = botao.closest("tr")!;
    fireEvent.click(botao);
    expect(aoAbrir).not.toHaveBeenCalled();
    const id = linha.getAttribute("data-pessoa-id");
    fireEvent.click(within(listas()[0]).getAllByRole("button")[0]);
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith(id);
  });

  it("os atalhos da lista não cancelam o keydown de Enter nem de Espaço no botão (o clique nativo não é simulado)", () => {
    render(<Arnes />);
    const botao = botoesVer()[0];
    botao.focus();
    expect(fireEvent.keyDown(botao, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(botao, { key: " " })).toBe(true);
  });

  it("em Quadro não há botões de negócios", () => {
    render(<Arnes />);
    fireEvent.click(screen.getByRole("button", { name: "Quadro" }));
    expect(botoesVer()).toHaveLength(0);
  });
});
