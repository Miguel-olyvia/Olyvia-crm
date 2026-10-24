// O RH dentro da moldura do protótipo (PrototipoNegocios): o grupo do menu, a exclusividade com o Inventário e a Frota e "Repor a demonstração".
// Fica à parte de RhPagina.test.tsx porque a moldura tem a sua sincronização entre aparelhos (sincronizacao.ts, que importa o cliente da base e já
// existia), e aquele teste proíbe esse cliente no caminho do RH.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A sincronização da moldura (já existente) importa o cliente da base: aqui fica um oco que nunca faz pedidos e responde sempre "sem base".
vi.mock("@/integrations/supabase/client", () => {
  const oco: unknown = new Proxy(function () {}, {
    get: (_t, p) => (p === "then" ? (resolver: (v: unknown) => void) => resolver({ data: null, error: { message: "sem base (teste)" } }) : oco),
    apply: () => oco,
  });
  return { supabase: { from: () => oco, channel: () => oco, removeChannel: () => undefined } };
});

import PrototipoNegocios from "../PrototipoNegocios";
import { esquecerFrota } from "../frota/loja";
import { esquecerInventario } from "../inventario/loja";
import { esquecerPerfil } from "../inventario/perfil";
import { esquecerPessoas } from "../PessoasSimples";
import { esquecerPessoasFunc } from "../PessoasFunc";
import { esquecerNegociosFunc } from "../NegociosFunc";
import { esquecerDiaADia } from "../diaADia";
import { definirEstado, lerEstado } from "@/components/rh-exemplo/dados/loja";
import { criarEstadoInicial } from "@/components/rh-exemplo/dados/exemplo";
import { esquecerRh } from "./loja";

// Deixa simular um falhanço ao repor os dados de RH (por exemplo o chunk que não carrega) sem mexer no resto do módulo.
const falha = vi.hoisted(() => ({ ligada: false }));
vi.mock("./loja", async (original) => {
  const m = await original<typeof import("./loja")>();
  return { ...m, esquecerRh: () => { if (falha.ligada) throw new Error("falhou (teste)"); m.esquecerRh(); } };
});

const h1 = (): string => document.querySelector("#rh-painel h1")?.textContent ?? "";

beforeEach(() => {
  localStorage.clear(); localStorage.setItem("language", "pt");
  esquecerRh(); esquecerFrota(); esquecerInventario(); esquecerPerfil(); esquecerPessoas(); esquecerPessoasFunc(); esquecerNegociosFunc(); esquecerDiaADia();
});
afterEach(() => { cleanup(); localStorage.clear(); falha.ligada = false; });

describe("RH no protótipo: dentro da moldura do protótipo", () => {
  it("o grupo aparece na Atual e na V2, não na V2 funcional; abre Pessoas; abrir a Frota fecha o RH", async () => {
    localStorage.setItem("olyvia-prototipo-v2", "funcional");
    render(<PrototipoNegocios />);
    expect(screen.queryByTestId("menu-rh")).toBeNull();
    cleanup();
    localStorage.removeItem("olyvia-prototipo-v2");
    render(<PrototipoNegocios />);
    const grupo = (await screen.findAllByTestId("menu-rh"))[0];
    fireEvent.click(within(grupo).getByRole("button", { name: "Recursos Humanos" }));
    fireEvent.click(within(grupo).getByRole("button", { name: /^Pessoas/ }));
    await waitFor(() => expect(document.getElementById("rh-painel")).not.toBeNull(), { timeout: 15000 });
    await waitFor(() => expect(h1()).not.toBe(""), { timeout: 15000 });
    const frota = screen.getAllByTestId("menu-frota")[0];
    fireEvent.click(within(frota).getByRole("button", { name: "Frota" }));
    fireEvent.click(within(frota).getByRole("button", { name: /^Hoje/ }));
    await waitFor(() => expect(document.getElementById("frota-painel")).not.toBeNull(), { timeout: 15000 });
    expect(document.getElementById("rh-painel")).toBeNull();
  }, 60000);

  it("Repor a demonstração volta a pôr os dados de teste de RH ao início", async () => {
    render(<PrototipoNegocios />);
    definirEstado((e) => ({ ...e, fichas: {} }));
    expect(Object.keys(lerEstado().fichas)).toHaveLength(0);
    const defs = (await screen.findAllByRole("button", { name: /^Definições/ }))[0];
    fireEvent.click(defs);
    fireEvent.click(await screen.findByRole("button", { name: "Repor a demonstração" }));
    await waitFor(() => expect(Object.keys(lerEstado().fichas)).toEqual(Object.keys(criarEstadoInicial().fichas)), { timeout: 10000 });
  }, 60000);

  it("se repor os dados de RH falhar, o utilizador e avisado (nao fica so o aviso de sucesso)", async () => {
    render(<PrototipoNegocios />);
    falha.ligada = true;
    const defs = (await screen.findAllByRole("button", { name: /^Definições/ }))[0];
    fireEvent.click(defs);
    fireEvent.click(await screen.findByRole("button", { name: "Repor a demonstração" }));
    expect(await screen.findByText(/Recursos Humanos não foram repostos/, undefined, { timeout: 10000 })).toBeInTheDocument();
  }, 60000);
});
