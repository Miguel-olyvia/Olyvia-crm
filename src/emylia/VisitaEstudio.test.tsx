// 6/11: a Visita de uma casa de banho segue o Estúdio. O projeto vive no negócio; a volta traz a planta, as medidas, as respostas das
// peças e as necessidades (com revisão); o fecho mostra o plano de obra estimado.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACaminho, EstudioNaVisita, PlanoEstimado } from "./VisitaEstudio";
import { PLANTA_VAZIA, retangulo, type Planta } from "./planta";
import type { Ctx } from "./pecas";
import type { Negocio } from "./motor";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const depois: Planta = {
  ...PLANTA_VAZIA, paredes: retangulo(200, 250),
  pecas: [{ id: "b", tipo: "base", x: 0, y: 0, w: 120, h: 70 }, { id: "s", tipo: "sanita", x: 150, y: 150, w: 36, h: 52 }],
};
const projeto = (extra: Partial<Projeto> = {}): Projeto => ({
  negocio: 3, antes: { ...PLANTA_VAZIA, paredes: retangulo(200, 250) }, depois, escolhas: { b: "bas-ard-p", s: "san-nexo-s" }, acompanha: {},
  revestimento: "rev-tela-c", alturas: { peDireito: 250, tetoFalso: null }, estilo: { cores: [], porCategoria: {} }, ajustes: {},
  servicos: [{ id: "sv-imperm", q: 4.6 }], gravadoEm: 1000, ...extra,
});
const negocio = (f: Record<string, string> = {}) =>
  ({ id: 3, nome: "Casa de banho", linha: "wc", tel: "912345678", local: "", f: { morada: "Rua A 1", localidade: "Lisboa", ...f }, visita: { med: { pav: 0, par: 0, pts: 0, pcs: 0 }, extra: {} } } as unknown as Negocio);
const contexto = (d: Negocio) => {
  const campo = vi.fn((_id: number, k: string, v: string) => { d.f[k] = v; }), extra = vi.fn();
  // o run grava no negócio e redesenha: sem ele, a mudança fica só em memória
  const run = vi.fn((fn: () => void) => fn());
  const ctx = { A: { campo, extra, produto: vi.fn() }, run, S: { svc: { imp: { n: "Impermeabilização de base de duche", un: "m²" }, demol: { n: "Demolição e entulho" } } } } as unknown as Ctx;
  return { ctx, campo, extra, run };
};

describe("a caminho", () => {
  it("a morada abre no Waze e no Google Maps; o telefone avisa o cliente", () => {
    render(<ACaminho d={negocio()} />);
    expect(screen.getByRole("link", { name: /Waze/ })).toHaveAttribute("href", expect.stringContaining("waze.com/ul?q=Rua%20A%201%2C%20Lisboa"));
    expect(screen.getByRole("link", { name: /Google Maps/ })).toHaveAttribute("href", expect.stringContaining("maps/dir/?api=1&destination=Rua%20A%201"));
    expect(screen.getByRole("link", { name: /Avisar o cliente/ })).toHaveAttribute("href", "tel:912345678");
  });
});

describe("o Estúdio na Visita", () => {
  it("o projeto do Estúdio deste browser grava-se no negócio quando é mais recente", () => {
    // mudou de verdade no Estúdio (a base passou a ser outra), e mais recente
    localStorage.setItem("olyvia.estudio.v1", JSON.stringify(projeto({ gravadoEm: 5000, escolhas: { b: "bas-ard-c", s: "san-nexo-s" } })));
    const d = negocio({ estudio: JSON.stringify(projeto({ gravadoEm: 1000 })) });
    const { ctx, campo, run } = contexto(d);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    fireEvent.focus(window);
    expect(campo).toHaveBeenCalledWith(3, "estudio", expect.stringContaining('"gravadoEm":5000'));
    expect(run).toHaveBeenCalled();
  });

  it("a volta traz a planta, as medidas, as respostas das peças e as necessidades para rever", () => {
    localStorage.setItem("olyvia.estudio.v1", JSON.stringify(projeto()));
    localStorage.setItem("olyvia.estudio.volta", JSON.stringify({ negocio: 3, em: Date.now(), antes: projeto().antes }));
    const d = negocio();
    const { ctx, campo, extra } = contexto(d);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    expect(campo).toHaveBeenCalledWith(3, "planta", expect.any(String));
    expect(d.visita.med.pav).toBe(5);
    expect(d.visita.med.pcs).toBe(1);
    expect(campo).toHaveBeenCalledWith(3, "pc_base_cor", "Preto");
    expect(screen.getByText(/As medidas da área saíram da planta/)).toBeInTheDocument();
    // as necessidades: a impermeabilização tem par no Catálogo
    expect(screen.getByRole("heading", { name: "Do Estúdio para as necessidades" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Juntar às necessidades/ }));
    expect(extra).toHaveBeenCalledWith(3, "imp", 4.6);
    expect(localStorage.getItem("olyvia.estudio.pendentes.3")).toBeNull();
  });

  it("sem projeto, convida a abrir o Estúdio", () => {
    const d = negocio();
    render(<EstudioNaVisita ctx={contexto(d).ctx} d={d} />);
    expect(screen.getByRole("button", { name: /Abrir o Estúdio/ })).toBeInTheDocument();
  });
});

describe("o plano de obra estimado", () => {
  it("as etapas com os dias e as datas; guardar põe a duração e o plano no negócio", () => {
    const d = negocio({ estudio: JSON.stringify(projeto()), plano_inicio: "2026-11-16" });
    const { ctx, campo } = contexto(d);
    render(<PlanoEstimado ctx={ctx} d={d} />);
    expect(screen.getByText(/1\. Proteções e retirar|1\. Canalização/)).toBeInTheDocument();
    expect(screen.getByText(/Revestimento/, { selector: "b" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Guardar no negócio/ }));
    expect(campo).toHaveBeenCalledWith(3, "duracao_obra", expect.stringMatching(/dias? úte?is|dia útil/));
    expect(campo).toHaveBeenCalledWith(3, "plano_estimado", expect.stringContaining('"inicio":"2026-11-16"'));
  });
  it("sem Estúdio, diz o que falta", () => {
    const d = negocio();
    render(<PlanoEstimado ctx={contexto(d).ctx} d={d} />);
    expect(screen.getByText(/Decida as peças no Estúdio/)).toBeInTheDocument();
  });
});

describe("o mesmo projeto não se grava duas vezes (9/11)", () => {
  it("o projeto deste browser igual ao do negócio, só com outra hora, não se grava de novo", () => {
    localStorage.setItem("olyvia.estudio.v1", JSON.stringify(projeto({ gravadoEm: 9000 })));
    const d = negocio({ estudio: JSON.stringify(projeto({ gravadoEm: 1000 })) });
    const { ctx, campo } = contexto(d);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    fireEvent.focus(window);
    expect(campo).not.toHaveBeenCalledWith(3, "estudio", expect.anything());
  });
});
