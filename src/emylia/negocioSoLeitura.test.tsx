// 12/11: sem a permissão da fase, o negócio em /negocios fica só de leitura: os corpos dos passos e os botões que mudam o negócio ficam
// desativados (antes pareciam mudar e nada gravava); a navegação entre passos continua. Sem `soLeitura`, tudo como sempre.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })), from: vi.fn(), auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
// o node_modules deste ambiente não tem o onnxruntime-web (a transcrição da chamada): a gravação fica de fora, não é o que se testa aqui
vi.mock("./ChamadaDireto", () => ({ ChamadaDireto: () => null }));
vi.mock("./chamadaNuvem", () => ({ TAXA: 16000, VAD_ASSETS: "", ONNX_BASE: "", GRUPO_VISITA: { titulo: "Da chamada", campos: [] } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false, loading: false }) }));

import { acoes, seed, type Estado } from "./motor";
import type { Ctx } from "./pecas";
import { NegocioSimples } from "./NegocioSimples";
import { passosSoLeitura, SoLeitura } from "./passosSoLeitura";
import type { Passo } from "./CamposFase";

afterEach(cleanup);
Element.prototype.scrollIntoView = function () {};
// desativado de facto: o próprio botão, ou dentro de um <fieldset disabled> (o jsdom não passa isto para a propriedade `disabled`)
const desativado = (el: Element) => (el as HTMLButtonElement).disabled || !!el.closest("fieldset[disabled]");

/** O negócio 1027 com o orçamento verificado e a proposta por enviar (o comercial vê «Enviar proposta»). */
function montar() {
  const S: Estado = seed();
  const d = S.deals.find((x) => x.id === 1027)!;
  d.fase = 3;
  Object.assign(d.orc!, { verif: true, enviada: null, aceite: null, contrato: null, pedidoCliente: null });
  S.role = "comercial"; S.view = "negocio"; S.deal = d.id;
  const A = acoes(S, vi.fn(), (f) => f());
  const ctx = { S, A, run: (f: () => void) => f(), go: (f: () => void) => () => f(), q: "" } as unknown as Ctx;
  return { S, ctx };
}

describe("passosSoLeitura / SoLeitura", () => {
  it("envolve o corpo de cada passo num fieldset desativado; sem `ativo`, não envolve", () => {
    const passos = [{ id: "a", titulo: "A", icone: () => null, corpo: <button type="button">Mudar</button> }] as unknown as Passo[];
    const [p] = passosSoLeitura(passos);
    render(<>{p!.corpo}</>);
    expect(desativado(screen.getByRole("button", { name: "Mudar" }))).toBe(true);
    cleanup();
    render(<SoLeitura ativo={false}><button type="button">Mudar</button></SoLeitura>);
    expect(desativado(screen.getByRole("button", { name: "Mudar" }))).toBe(false);
  });
});

describe("NegocioSimples só de leitura", () => {
  const botoesEnviar = () => screen.getAllByRole("button", { name: /Enviar/ }) as HTMLButtonElement[];

  it("sem soLeitura: o botão do passo e os controlos do corpo funcionam (como sempre)", () => {
    const { ctx } = montar();
    render(<NegocioSimples {...ctx} />);
    expect(botoesEnviar().length).toBeGreaterThan(0);
    expect(botoesEnviar().every((b) => !desativado(b))).toBe(true);
    expect(document.querySelector("#passo-corpo fieldset[disabled]")).toBeNull();
  });

  it("com soLeitura: o botão do passo e o corpo ficam desativados; a lista dos passos e o Anterior/Continuar não", () => {
    const { ctx } = montar();
    render(<NegocioSimples {...ctx} soLeitura ajustarPassos={(passos) => passosSoLeitura(passos)} />);
    expect(botoesEnviar().length).toBeGreaterThan(0);
    expect(botoesEnviar().every(desativado)).toBe(true);
    // o corpo do passo aberto está dentro de um fieldset desativado
    expect(document.querySelector("#passo-corpo fieldset[disabled]")).not.toBeNull();
    // a navegação entre passos continua: os botões da lista estão ativos e mudam o passo aberto
    const lista = screen.getAllByRole("navigation", { name: "Passos desta fase" })[0]!;
    const passos = [...lista.querySelectorAll("button")] as HTMLButtonElement[];
    expect(passos.length).toBeGreaterThan(1);
    expect(passos.every((b) => !desativado(b))).toBe(true);
    const titulo = () => document.getElementById("passo-titulo")?.textContent;
    const antes = titulo();
    fireEvent.click(passos.find((b) => b.getAttribute("aria-current") !== "step")!);
    expect(titulo()).not.toBe(antes);
    // o Anterior/Continuar do rodapé também não ficam desativados
    for (const nome of [/^Anterior$/, /^Continuar$/]) for (const b of screen.queryAllByRole("button", { name: nome })) expect(desativado(b)).toBe(false);
  });
});
