// As visitas da PESSOA no Resumo da ficha: uma só secção com as visitas dela (e não uma por pedido), cada uma com o seu estado, a morada, o
// resultado, e os botões «Alterar visita» e «Registar o resultado». Uma visita ligada a um negócio diz a que negócio e já não se altera.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import { SeccaoVisitas } from "./SeccaoVisitas";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";

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
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);

const HOJE = "2026-10-13";
const ANA = pessoaBase("a", { nome: "Ana", morada: { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" } });
const NEGOCIOS = new Map([["n1", "Cozinha"]]);

function montar(visitas: VisitaPessoa[], extra: Partial<Parameters<typeof SeccaoVisitas>[0]> = {}) {
  const alterarVisita = vi.fn();
  const aoRegistarResultado = vi.fn();
  render(
    <SeccaoVisitas
      pessoa={ANA} visitas={visitas} item={undefined} hoje={HOJE} negocios={NEGOCIOS} alterarVisita={alterarVisita}
      aoRegistarResultado={aoRegistarResultado} {...extra}
    />,
  );
  return { alterarVisita, aoRegistarResultado };
}

describe("SeccaoVisitas", () => {
  it("sem visitas, ou só com visitas canceladas, não desenha nada", () => {
    const { container } = render(
      <SeccaoVisitas pessoa={ANA} visitas={[]} item={undefined} hoje={HOJE} negocios={NEGOCIOS} alterarVisita={vi.fn()} aoRegistarResultado={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    montar([visitaPessoaBase("rv-1", { estado: "cancelada" })]);
    expect(screen.queryByRole("heading", { name: /Visitas/ })).not.toBeInTheDocument();
  });

  it("uma visita cancelada, ao lado de outras, aparece marcada «Cancelada»: sem «Alterar visita» nem «Registar o resultado»", () => {
    montar([visitaPessoaBase("rv-1", { data: "2026-10-20" }), visitaPessoaBase("rv-c", { data: "2026-10-12", estado: "cancelada" })]);
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(within(itens[0]).getByText("Cancelada")).toBeInTheDocument();
    expect(within(itens[0]).queryByRole("button")).toBeNull();
    expect(within(itens[0]).queryByText(/ainda não foi concluída/)).toBeNull();
    expect(within(itens[1]).queryByText("Cancelada")).toBeNull();
  });

  it("uma só secção «Visitas» com todas as visitas da pessoa, por ordem cronológica, sem falar de pedidos", () => {
    montar([visitaPessoaBase("rv-2", { data: "2026-10-25" }), visitaPessoaBase("rv-1", { data: "2026-10-20" })]);
    expect(screen.getAllByRole("heading", { name: /Visitas/ })).toHaveLength(1);
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent(/20\/10\/2026/);
    expect(itens[1]).toHaveTextContent(/25\/10\/2026/);
    expect(screen.queryByText(/pedido/i)).not.toBeInTheDocument();
  });

  it("cada visita diz o estado em texto, a morada com a origem, o acesso e o comercial", () => {
    montar([visitaPessoaBase("rv-1", { nota: "Portão azul", igualALead: true })]);
    expect(screen.getByText("Por fazer")).toBeInTheDocument();
    expect(screen.getByText(/Rua A 1, 1000-001 Lisboa/)).toBeInTheDocument();
    expect(screen.getByText("Igual à da lead")).toBeInTheDocument();
    expect(screen.getByText("Portão azul")).toBeInTheDocument();
    expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
  });

  it("uma visita por fazer cujo dia já passou avisa que está por concluir", () => {
    montar([visitaPessoaBase("rv-1", { data: "2026-10-10" })]);
    expect(screen.getByText(/ainda não foi concluída/)).toBeInTheDocument();
  });

  it("«Alterar visita» tem um nome único por visita e guarda o novo dia e hora pela visita certa", () => {
    const { alterarVisita } = montar([visitaPessoaBase("rv-1", { data: "2026-10-20" }), visitaPessoaBase("rv-2", { data: "2026-10-25", hora: "15:00" })]);
    const botoes = screen.getAllByRole("button", { name: /^Alterar visita/ });
    expect(botoes).toHaveLength(2);
    expect(new Set(botoes.map((b) => b.getAttribute("aria-label"))).size).toBe(2);
    fireEvent.click(botoes[1]);
    const dialogo = screen.getByRole("dialog", { name: "Alterar visita" });
    fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-10-28" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar visita" }));
    expect(alterarVisita).toHaveBeenCalledExactlyOnceWith("rv-2", expect.objectContaining({ data: "2026-10-28", hora: "15:00" }));
  });

  it("uma visita feita já não se altera; «Registar o resultado» abre o diálogo pela visita certa", () => {
    const { aoRegistarResultado } = montar([visitaPessoaBase("rv-1", { estado: "feita", data: "2026-10-10" })]);
    expect(screen.queryByRole("button", { name: /^Alterar visita/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Registar o resultado da visita/ }));
    expect(aoRegistarResultado).toHaveBeenCalledExactlyOnceWith("rv-1");
  });

  it("uma visita futura por fazer ainda não tem resultado a registar", () => {
    montar([visitaPessoaBase("rv-1", { data: "2026-10-30" })]);
    expect(screen.queryByRole("button", { name: /Registar o resultado/ })).not.toBeInTheDocument();
  });

  it("com resultado, diz-o em texto e já não pede para o registar", () => {
    montar([visitaPessoaBase("rv-1", { estado: "feita", resultado: "obraInviavel" })]);
    expect(screen.getByText("Resultado: Obra inviável")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registar o resultado/ })).not.toBeInTheDocument();
  });

  it("uma visita ligada a um negócio diz a que negócio e não se altera nem pede resultado", () => {
    montar([visitaPessoaBase("rv-1", { negocioId: "n1", data: "2026-10-10" })]);
    expect(screen.getByText("Ligada ao negócio Cozinha")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alterar visita/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registar o resultado/ })).not.toBeInTheDocument();
  });

  it("uma visita por ligar di-lo em texto", () => {
    montar([visitaPessoaBase("rv-1")]);
    expect(screen.getByText("Por ligar a um negócio")).toBeInTheDocument();
  });
});
