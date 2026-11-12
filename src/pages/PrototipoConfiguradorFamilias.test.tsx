// A página do protótipo «Configurador de famílias» (/prototipo/configurador-familias): ecrã completo, só em memória, separada da planta 3D.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrototipoConfiguradorFamilias from "./PrototipoConfiguradorFamilias";
import PrototipoPlanta3D from "./PrototipoPlanta3D";
import { familiaPorId } from "@/emylia/planta3d/familias";
import { familiasConfiguradas, limparFamiliasConfiguradas } from "@/emylia/planta3d/familiasConfiguradas";

// a lista do protótipo esconde produtos sem modelo 3D do HTML; aqui só interessam as famílias configuradas, que aparecem sempre
vi.mock("@/emylia/planta3d/catalogo3d", async (original) => ({ ...(await original<typeof import("@/emylia/planta3d/catalogo3d")>()), SO_COM_MODELO_HTML: false }));

beforeEach(() => {
  const ident = { inverse: () => ident } as unknown as DOMMatrix;
  Object.assign(SVGSVGElement.prototype, {
    getScreenCTM: () => ident,
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y }; } }),
    setPointerCapture: () => undefined,
  });
});
afterEach(() => { cleanup(); limparFamiliasConfiguradas(); localStorage.clear(); });

const montar = (inicio = "/prototipo/configurador-familias") => render(
  <MemoryRouter initialEntries={[inicio]}>
    <Routes>
      <Route path="/prototipo/configurador-familias" element={<PrototipoConfiguradorFamilias />} />
      <Route path="/prototipo/planta-3d" element={<PrototipoPlanta3D />} />
    </Routes>
  </MemoryRouter>,
);
// um traço de parede com o dedo (jsdom mede 1 cm por píxel); quatro traços fecham um retângulo e abrem o passo dos produtos
const tracar = (de: [number, number], ate: [number, number]) => {
  const tela = screen.getByRole("img", { name: /^Planta/, hidden: true });
  fireEvent.pointerDown(tela.querySelector("[data-tela]")!, { clientX: de[0], clientY: de[1], pointerId: 1 });
  fireEvent.pointerMove(tela, { clientX: ate[0], clientY: ate[1], pointerId: 1 });
  fireEvent.pointerUp(tela, { clientX: ate[0], clientY: ate[1], pointerId: 1 });
};
const guardarExemplo = () => {
  fireEvent.click(screen.getByRole("button", { name: "Começar pelo exemplo" }));
  for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar na sessão" }));
};

describe("PrototipoConfiguradorFamilias", () => {
  it("mostra o título, o aviso de que nada se grava na base, o configurador completo e a ligação à planta", () => {
    montar();
    expect(screen.getByRole("heading", { level: 1, name: "Protótipo: configurador de famílias" })).toBeInTheDocument();
    expect(screen.getByText(/Nada se grava na base de dados/)).toBeInTheDocument();
    expect(screen.getByText(/recarregar a página perde as famílias/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Configurador de famílias (protótipo)" })).toBeInTheDocument();
    expect(screen.getByText("Ainda sem famílias configuradas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova família" })).toBeInTheDocument();
    const volta = screen.getByRole("link", { name: "Ver na planta 3D" });
    expect(volta).toHaveAttribute("href", "/prototipo/planta-3d");
    expect(volta.className).toContain("min-h-11");
  });

  it("«Nova família» abre o assistente de 3 passos", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Nova família" }));
    expect(screen.getByText("Passo 1 de 3 · Família")).toBeInTheDocument();
  });

  it("guardar na sessão põe a família na lista da página e no armazém (e em familias.ts)", () => {
    montar();
    guardarExemplo();
    const lista = screen.getByRole("list", { name: "Famílias configuradas" });
    expect(within(lista).getByText(/Lava-loiça Keran/)).toBeInTheDocument();
    expect(familiasConfiguradas().map((f) => f.id)).toEqual(["cfg:lava-loica-keran"]);
    expect(familiaPorId("cfg:lava-loica-keran")?.origem).toBe("configurada");
  });

  it("ao voltar à página (desmontar e montar) as famílias da sessão continuam na lista", () => {
    const { unmount } = montar();
    guardarExemplo();
    unmount();
    expect(familiaPorId("cfg:lava-loica-keran")).toBeDefined();
    montar();
    expect(within(screen.getByRole("list", { name: "Famílias configuradas" })).getByText(/Lava-loiça Keran/)).toBeInTheDocument();
  });

  it("navegando (sem recarregar) para a planta 3D, a família guardada aparece na barra de produtos do passo 4", () => {
    montar();
    guardarExemplo();
    fireEvent.click(screen.getByRole("link", { name: "Ver na planta 3D" }));
    expect(screen.getByRole("heading", { level: 1, name: "Protótipo: planta e visualizador 3D" })).toBeInTheDocument();
    // a planta abre na casa de banho: a cozinha é onde as famílias de lava-loiças aparecem
    fireEvent.change(screen.getByRole("combobox", { name: "Espaço" }), { target: { value: "cozinha" } });
    const seguinte = () => fireEvent.click(within(screen.getByRole("group", { name: "Navegação entre passos" })).getByRole("button", { name: "Seguinte" }));
    seguinte();
    tracar([50, 50], [250, 55]); tracar([0, 0], [250, 200]); tracar([0, 0], [50, 200]); tracar([0, 0], [50, 60]);
    seguinte(); seguinte();
    fireEvent.click(screen.getAllByRole("tab", { name: /^Lava-loiças \(/ })[0]);
    expect(within(screen.getByRole("list", { name: "Famílias de produtos" })).getByText("Lava-loiça Keran")).toBeInTheDocument();
  });
});
