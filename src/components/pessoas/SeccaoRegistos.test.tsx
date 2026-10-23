// Os registos da pessoa que não são visitas (as chamadas e os levantamentos) no Resumo da ficha: cada um diz se está ligado a um negócio ou
// por ligar. As visitas têm a sua secção (`SeccaoVisitas`).
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { contactoBase, levantamentoBase } from "./fabricaTestes";
import { SeccaoRegistos } from "./SeccaoRegistos";
import { novaLinha } from "@/components/negocio-metas/levantamento";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

const NEGOCIOS = new Map([["n1", "Cozinha"]]);
const comLinhas = (n: number) => ({ linhas: Array.from({ length: n }, (_, i) => novaLinha(`l${i + 1}`)), observacoes: "", respostas: {} });

describe("SeccaoRegistos", () => {
  it("sem chamadas nem levantamentos não desenha nada", () => {
    const { container } = render(<SeccaoRegistos contactos={[]} levantamentos={[]} negocios={NEGOCIOS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("com registos por ligar, o título diz «Registos por ligar» e explica como se ligam", () => {
    render(<SeccaoRegistos contactos={[contactoBase()]} levantamentos={[]} negocios={NEGOCIOS} />);
    expect(screen.getByRole("heading", { name: "Registos por ligar" })).toBeInTheDocument();
    expect(screen.getByText(/Ligam-se ao criar um negócio/)).toBeInTheDocument();
  });

  it("uma chamada diz o dia e o resultado em texto, e que está por ligar", () => {
    render(<SeccaoRegistos contactos={[contactoBase("rc-1", { data: "2026-10-10", resultado: "naoAtendeu" })]} levantamentos={[]} negocios={NEGOCIOS} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Chamada");
    expect(item).toHaveTextContent(/10\/10\/2026/);
    expect(item).toHaveTextContent("Não atendeu");
    expect(item).toHaveTextContent("Por ligar a um negócio");
  });

  it("um levantamento diz quem o fez e quantas linhas de medidas tem; sem linhas di-lo", () => {
    render(
      <SeccaoRegistos
        contactos={[]} negocios={NEGOCIOS}
        levantamentos={[levantamentoBase("rl-1", { rascunho: comLinhas(3) }), levantamentoBase("rl-2", { rascunho: comLinhas(1) }), levantamentoBase("rl-3")]}
      />,
    );
    const itens = screen.getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("3 linhas de medidas");
    expect(itens[1]).toHaveTextContent("1 linha de medidas");
    expect(itens[2]).toHaveTextContent("Sem linhas de medidas");
    expect(itens[0]).toHaveTextContent("feito por Ana Ribeiro");
  });

  it("um registo ligado diz a que negócio; se já não há nenhum por ligar, o título é só «Registos»", () => {
    render(<SeccaoRegistos contactos={[contactoBase("rc-1", { negocioId: "n1" })]} levantamentos={[]} negocios={NEGOCIOS} />);
    expect(screen.getByRole("heading", { name: "Registos" })).toBeInTheDocument();
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Ligada ao negócio Cozinha")).toBeInTheDocument();
    expect(screen.queryByText(/Ligam-se ao criar um negócio/)).not.toBeInTheDocument();
  });

  it("os registos aparecem do mais recente para o mais antigo", () => {
    render(
      <SeccaoRegistos
        contactos={[contactoBase("rc-1", { data: "2026-10-01" }), contactoBase("rc-2", { data: "2026-10-09" })]}
        levantamentos={[levantamentoBase("rl-1", { data: "2026-10-05" })]} negocios={NEGOCIOS}
      />,
    );
    const textos = screen.getAllByRole("listitem").map((i) => i.textContent ?? "");
    expect(textos[0]).toMatch(/09\/10\/2026/);
    expect(textos[1]).toMatch(/05\/10\/2026/);
    expect(textos[2]).toMatch(/01\/10\/2026/);
  });
});
