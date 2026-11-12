import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { Fala } from "@/emylia/chamadaMotor";
import type { Projeto } from "./necessidadesEstudio";
import { PROJETO_EXEMPLO } from "./exemploEstudio";

// a gravação ao vivo, que o teste muda a meio (como as falas que chegam enquanto o cliente fala)
const vivo = vi.hoisted(() => ({ g: { negocio: 7, modo: "visita", estado: "a_ouvir", falas: [] as unknown[] }, ouvir: new Set<() => void>() }));
vi.mock("@/emylia/gravador", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useGravacao: () => useSyncExternalStore((f: () => void) => { vivo.ouvir.add(f); return () => vivo.ouvir.delete(f); }, () => vivo.g) };
});
const chega = (f: Fala) => act(() => { vivo.g = { ...vivo.g, falas: [...vivo.g.falas, f] }; vivo.ouvir.forEach((x) => x()); });

import { OuvidoDoCliente, useEstiloOuvido, Combinacoes } from "./EstiloOuvido";

let atual: Projeto;
function Ecra({ inicio }: { inicio: Projeto }) {
  const [p, setP] = useState(inicio);
  atual = p;
  const { ouvido, pedidos, aOuvir } = useEstiloOuvido(p);
  return <><OuvidoDoCliente p={p} setP={setP} ouvido={ouvido} pedidos={pedidos} aOuvir={aOuvir} /><Combinacoes p={p} setP={setP} cor={ouvido?.estilo.cores[0] ?? p.estilo.cores[0]} evitar={ouvido?.evitar ?? []} /></>;
}
const fala = (inicio: number, falante: Fala["falante"], texto: string): Fala => ({ inicio, fim: inicio + 3, texto, falante, confianca_falante: 0.6 });

describe("o Estúdio ouve a conversa e muda o estilo", () => {
  beforeEach(() => { vivo.g = { negocio: 7, modo: "visita", estado: "a_ouvir", falas: [] }; });

  it("quando o cliente diz «quero tudo preto», o estilo e as paredes passam a preto, com as combinações para o preto", () => {
    const inicio: Projeto = { ...PROJETO_EXEMPLO, negocio: 7, estilo: { cores: ["branco"], porCategoria: {} }, revestimento: undefined, pavimento: undefined };
    render(<Ecra inicio={inicio} />);
    expect(screen.getByText("A ouvir a conversa")).toBeInTheDocument();
    expect(atual.estilo.cores).toEqual(["branco"]);

    chega(fala(60, "comercial", "E de cores, o que gostava?"));
    chega(fala(64, "cliente", "Eu quero tudo preto."));
    expect(screen.getByText("Eu quero tudo preto.")).toBeInTheDocument();
    expect(atual.estilo.cores[0]).toBe("preto");
    expect(atual.revestimento).toBe("rev-tela-a");
    expect(screen.getByText("Aplicado às cores, às peças e aos serviços.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Combinações para o preto" })).toBeInTheDocument();

    // desfazer: volta ao de antes; o que se disser a seguir aplica-se por cima (só o novo)
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(atual.estilo.cores).toEqual(["branco"]);
    chega(fala(80, "cliente", "E o móvel quero em madeira."));
    expect(atual.estilo.porCategoria.movel).toEqual(["madeira"]);
    expect(atual.estilo.cores).toEqual(["branco"]);
    fireEvent.click(screen.getByRole("button", { name: "Usar o que se disse" }));
    expect(atual.estilo.cores[0]).toBe("preto");
    expect(atual.estilo.porCategoria.movel).toEqual(["madeira"]);
  });

  it("depois de mexer à mão, o que se diz a seguir muda na mesma (o comercial a falar também conta)", () => {
    render(<Ecra inicio={{ ...PROJETO_EXEMPLO, negocio: 7, estilo: { cores: ["branco"], porCategoria: {} }, estiloManual: true }} />);
    chega(fala(30, "comercial", "Quero uma sanita preta."));
    expect(atual.estilo.porCategoria.sanita).toEqual(["preto"]);
    // a frase revista da mesma fala não volta a aplicar (o que se mudou à mão a seguir fica)
    act(() => { vivo.g = { ...vivo.g, falas: [{ ...fala(30, "comercial", "Quero uma sanita preta."), revista: true }] }; vivo.ouvir.forEach((x) => x()); });
    expect(atual.estilo.porCategoria.sanita).toEqual(["preto"]);
  });

  it("uma combinação aplica-se com um toque", () => {
    render(<Ecra inicio={{ ...PROJETO_EXEMPLO, negocio: 7, estilo: { cores: ["preto"], porCategoria: {} } }} />);
    fireEvent.click(screen.getByRole("button", { name: /Preto e madeira/ }));
    expect(atual.estilo.porCategoria.movel).toEqual(["madeira"]);
    expect(atual.pavimento).toBe("pav-madeira");
    expect(screen.getByRole("button", { name: /Preto e madeira/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("a gravação de outro negócio não conta", () => {
    vivo.g = { ...vivo.g, negocio: 99, falas: [fala(5, "cliente", "Quero tudo preto.")] };
    render(<Ecra inicio={{ ...PROJETO_EXEMPLO, negocio: 7, estilo: { cores: ["branco"], porCategoria: {} } }} />);
    expect(screen.queryByText("Pelo que se disse na conversa")).not.toBeInTheDocument();
    expect(atual.estilo.cores).toEqual(["branco"]);
  });

  it("«quero tirar o bidé» tira o bidé; «quero uma sanita preta» troca-a pela preta; «um nicho no duche» junta o serviço", () => {
    render(<Ecra inicio={{ ...PROJETO_EXEMPLO, negocio: 7, estilo: { cores: [], porCategoria: {} }, servicos: [] }} />);
    const bide = PROJETO_EXEMPLO.antes.pecas.find((x) => x.tipo === "bide")!;
    const sanita = PROJETO_EXEMPLO.antes.pecas.find((x) => x.tipo === "sanita")!;
    chega(fala(20, "comercial", "O cliente quer tirar o bidé."));
    expect(atual.depois.pecas.some((x) => x.id === bide.id)).toBe(false);
    chega(fala(30, "cliente", "Quero uma sanita preta."));
    expect(atual.escolhas[sanita.id]).toBe("san-douro-p");
    chega(fala(40, "cliente", "E queria um nicho no duche."));
    expect((atual.servicos ?? []).map((x) => x.id)).toContain("sv-nicho");
    chega(fala(50, "cliente", "A limpeza não é precisa."));
    expect((atual.servicos ?? []).map((x) => x.id)).not.toContain("sv-limpeza");
    expect(atual.servicosRecusados).toContain("sv-limpeza");
    expect(screen.getByText("Bidé: tirar")).toBeInTheDocument();
    expect(screen.getByText("Nicho embutido no duche: juntar")).toBeInTheDocument();
    // dito outra vez (a frase revista), não volta a aplicar: o bidé que se pôs de volta à mão fica
  });
});
