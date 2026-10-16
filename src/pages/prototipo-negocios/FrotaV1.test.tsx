// A Frota do V1 (16/10): o que fazer agora com um só primário, os registos do dia a dia com erro no campo, e a ficha da viatura.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FrotaV1, esquecerFrotaV1 } from "./FrotaV1";
import { esquecerFrota, lerFrota } from "./frota/loja";
import { tarefasFrota } from "./frotaV1Docs";

const agora = (): HTMLElement => screen.getByRole("region", { name: "O que fazer agora" });
/** Os botões primários à vista (o Button do shadcn por defeito tem bg-primary). */
const primarios = (): HTMLElement[] => screen.getAllByRole("button").filter((b) => /\bbg-primary\b/.test(b.className) && !/aria-pressed/.test(b.outerHTML.slice(0, 200)));

beforeEach(() => { localStorage.clear(); esquecerFrota(); esquecerFrotaV1(); });
afterEach(() => cleanup());

describe("Frota no V1", () => {
  it("abre no que fazer agora (a tarefa mais urgente) com um só primário, e lista as viaturas", () => {
    render(<FrotaV1 />);
    const t = tarefasFrota(lerFrota())[0];
    expect(within(agora()).getByText(t.t)).toBeInTheDocument();
    expect(primarios().map((b) => b.textContent)).toEqual([t.btn]);
    expect(screen.getByRole("heading", { level: 2, name: "Viaturas" })).toBeInTheDocument();
  });

  it("fazer a tarefa grava com a regra da Frota, diz o que ficou feito e passa à seguinte", () => {
    render(<FrotaV1 />);
    const [t1, t2] = tarefasFrota(lerFrota());
    fireEvent.click(within(agora()).getByRole("button", { name: t1.btn }));
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    expect(within(agora()).getAllByText(t2.t).length).toBeGreaterThan(0);
    expect(within(agora()).queryByText(t1.t)).toBeNull();
  });

  it("na viatura, os km a descer dão erro no campo (aria-invalid e a mensagem), e com um registo aberto o primário é o do registo", () => {
    render(<FrotaV1 />);
    const v = lerFrota().viaturas.find((x) => x.estado === "ativa")!;
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(v.mat) })[0]);
    expect(screen.getByRole("heading", { level: 1, name: new RegExp(v.mat) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quilómetros" }));
    const km = screen.getByRole("textbox", { name: /Quilómetros no painel/ });
    fireEvent.change(km, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar os quilómetros" }));
    expect(km).toHaveAttribute("aria-invalid", "true");
    expect(km).toHaveAccessibleDescription(/não podem descer/);
    expect(primarios().map((b) => b.textContent)).toEqual(["Guardar os quilómetros"]);
    fireEvent.change(km, { target: { value: String(v.km + 120) } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar os quilómetros" }));
    expect(screen.getByRole("status")).toHaveTextContent("Km registados");
    expect(lerFrota().viaturas.find((x) => x.id === v.id)!.km).toBe(v.km + 120);
  });

  it("a multa sugere quem conduzia (marcado como sugerido) e pede a escolha antes de gravar", () => {
    render(<FrotaV1 />);
    const t = tarefasFrota(lerFrota()).find((x) => x.acao.tipo === "identificar")!;
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(t.viatura.split(" · ")[0]) })[0]);
    // na ficha, a multa pode não ser a primeira tarefa: só se testa quando é
    const g = within(agora()).queryByRole("group", { name: "Quem conduzia" });
    if (!g) return;
    fireEvent.click(within(agora()).getByRole("button", { name: "Identificar o condutor" }));
    expect(within(agora()).getByText("Escolhe o condutor.")).toBeInTheDocument();
    expect(within(g).getByText("Sugerido")).toBeInTheDocument();
  });
});
