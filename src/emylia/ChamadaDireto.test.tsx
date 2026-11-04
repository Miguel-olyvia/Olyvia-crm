// 4/11: o painel «Chamada em direto» de ponta a ponta, com o motor simulado: liga, recebe as falas, no fim mostra as propostas
// e «Preencher» escreve nos campos do negócio por A.campo. Em modo de teste (?teste=1) não há microfone.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grupo } from "./campos";
import { ChamadaDireto } from "./ChamadaDireto";
import type { Ctx } from "./pecas";
import type { Negocio } from "./motor";

class WsFalso {
  static ultimo: WsFalso | null = null;
  static OPEN = 1;
  readyState = 1;
  binaryType = "blob";
  enviados: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) { WsFalso.ultimo = this; }
  send(x: string | ArrayBuffer) { if (typeof x === "string") this.enviados.push(x); }
  close() { this.onclose?.(); }
  /** o motor «fala» */
  recebe(m: object) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const GRUPOS: Grupo[] = [{ titulo: "Qualificação", campos: [
  { k: "imovel", l: "Tipo de imóvel", t: "escolha", op: ["Apartamento", "Moradia"] },
  { k: "posse", l: "O cliente é", t: "escolha", op: ["Proprietário", "Inquilino"] },
  { k: "orc_cliente", l: "Orçamento", t: "escolha", op: ["Até 3.000 €", "Mais"] },
] }];

beforeEach(() => {
  vi.stubGlobal("WebSocket", WsFalso);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ["tiago"] })));
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState({}, "", "/negocios?teste=1");
  WsFalso.ultimo = null;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const campo = vi.fn();
const ctx = { A: { campo }, run: (fn: () => void) => fn(), S: {} } as unknown as Ctx;
const d = { id: 7, f: { imovel: "Moradia" } } as unknown as Negocio;

describe("ChamadaDireto (4/11)", () => {
  it("liga ao motor em modo de teste, mostra as falas, propõe os campos e preenche os vazios", async () => {
    render(<ChamadaDireto ctx={ctx} d={d} grupos={GRUPOS} />);
    expect(await screen.findByText("Chamada em direto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Testar com a chamada de exemplo" }));
    const ws = WsFalso.ultimo!;
    expect(ws.url).toBe("ws://127.0.0.1:8765/ws");
    await act(async () => { ws.onopen?.(); });
    const inicio = JSON.parse(ws.enviados[0]);
    expect(inicio.teste).toBe(true);
    expect(inicio.campos.map((c: { k: string }) => c.k)).toEqual(["imovel", "posse", "orc_cliente"]);

    await act(async () => { ws.recebe({ tipo: "pronto", nome: "x", comercial: null, teste: true }); });
    expect(screen.getByText("A ouvir a chamada de exemplo.")).toBeInTheDocument();
    await act(async () => {
      ws.recebe({ tipo: "fala", inicio: 3, fim: 5, texto: "É um apartamento no terceiro andar.", falante: "cliente", confianca_falante: 0.9 });
      ws.recebe({ tipo: "nivel", som: 0.1, a_falar: true, segundos: 5 });
    });
    expect(screen.getByText("É um apartamento no terceiro andar.")).toBeInTheDocument();
    expect(screen.getByText("Cliente:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Terminar e preencher/ }));
    expect(ws.enviados.at(-1)).toBe("terminar");
    await act(async () => {
      ws.recebe({ tipo: "a_terminar", falas: 1 });
      ws.recebe({
        tipo: "fim", nome: "x", minutos: 0.1, falas: 1, latencia_media: 0.5, ficha: null, segmentos: [],
        extracao: { resumo: "Apartamento, proprietária.", motor: "ollama", fichas: [{ campos: [
          { chave: "imovel", rotulo: "Tipo de imóvel", tipo: "escolha", valor: "apartamento", valor_rotulo: "Apartamento", confianca: 1, excerto: "Cliente: É um apartamento", estado: "preenchido" },
          { chave: "posse", rotulo: "O cliente é", tipo: "escolha", valor: "Proprietário", valor_rotulo: "Proprietário", confianca: 0.5, excerto: "Cliente: sim", estado: "rever" },
          { chave: "orc_cliente", rotulo: "Orçamento", tipo: "escolha", valor: null, valor_rotulo: null, confianca: 0, excerto: "", estado: "em_falta" },
        ] }] },
      });
    });
    expect(screen.getByText(/Apartamento, proprietária\./)).toBeInTheDocument();
    // o imóvel já tinha «Moradia»: fica de fora por defeito; a posse entra (a rever)
    expect(screen.getByText("já tinha «Moradia» · fica")).toBeInTheDocument();
    expect(screen.getByText(/a rever · 50%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Preencher 1 campo$/ }));
    expect(campo).toHaveBeenCalledTimes(1);
    expect(campo).toHaveBeenCalledWith(7, "posse", "Proprietário");
    expect(screen.getByText(/Preenchidos: O cliente é\./)).toBeInTheDocument();
  });
});
