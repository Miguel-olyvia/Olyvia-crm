// O separador «Negócios» com a bandeira CONSEQUENCIAS_ATIVO: desligada (a omissão) fica como estava, sem tabela e sem ler nada; ligada, mostra a tabela
// das consequências no lugar dos três grupos que ela já traz, e quem não tem pessoas.config vê tudo só para ler.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { CONSEQUENCIAS_ATIVO, ConsequenciasContext } from "@/hooks/pessoas/bandeirasNegocio";
import type { ConfigNegocios } from "@/hooks/pessoas/workflow/configNegocios";
import type { ConsequenciasHook } from "@/hooks/pessoas/workflow/useConsequencias";
import type { ConfigNegociosHook } from "@/hooks/pessoas/workflow/useConfigNegocios";
import { NegociosSeparador } from "./NegociosSeparador";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const estado = vi.hoisted(() => ({ permissoes: new Set<string>(["pessoas.config"]), aCarregar: false, usos: [] as boolean[] }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => estado.permissoes.has(p), hasAnyPermission: (ps: string[]) => ps.some((p) => estado.permissoes.has(p)),
    permissions: [...estado.permissoes], loading: estado.aCarregar,
  }),
}));
const consequencias = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock("@/hooks/pessoas/workflow/useConsequencias", () => ({
  useConsequencias: (habilitado: boolean) => {
    estado.usos.push(habilitado);
    return consequencias.valor;
  },
}));
beforeAll(prepararRadixNoJsdom);

const OMISSOES: ConfigNegocios = {
  conversaoAoGanhar: "automatica", recusaProposta: "perder", recusaContrato: "perder", cancelamentoNoPrazo: "perder", reflexaoDias: null,
};
const hookConfig = (): ConfigNegociosHook => ({
  estado: "pronto", dados: OMISSOES, aGuardar: false, recarregar: vi.fn(),
  guardar: vi.fn().mockResolvedValue({ mudou: true, depois: null, avisoConversaoContratos: false }),
});
const hookCons = (): ConsequenciasHook => ({
  estado: "pronto", dados: { recusaOrcamento: "perder_se_ultimo", orcamentoCriaProposta: true, propostaCriaContrato: false }, aGuardar: false,
  recarregar: vi.fn(), guardarCadeia: vi.fn().mockResolvedValue({ mudou: true, depois: null }),
  guardarRecusaOrcamento: vi.fn().mockResolvedValue({ mudou: true, depois: null }),
});
const desenhar = (ativo: boolean | null, config = hookConfig()) => {
  render(
    <ConsequenciasContext.Provider value={ativo}>
      <NegociosSeparador config={config} />
    </ConsequenciasContext.Provider>,
  );
  return config;
};

beforeEach(() => {
  estado.permissoes = new Set(["pessoas.config"]);
  estado.aCarregar = false;
  estado.usos = [];
  consequencias.valor = hookCons();
});

describe("a bandeira", () => {
  it("vem desligada: depende de migrations por aplicar", () => {
    expect(CONSEQUENCIAS_ATIVO).toBe(false);
  });

  it("desligada (omissão): sem tabela, os quatro grupos de sempre e nenhuma leitura", () => {
    desenhar(null);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(4);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(estado.usos).toEqual([]);
  });

  it("desligada pelo contexto, mesmo com o resto montado, fica igual", () => {
    desenhar(false);
    expect(screen.queryByRole("table")).toBeNull();
    expect(estado.usos).toEqual([]);
  });
});

describe("com a bandeira ligada", () => {
  it("mostra a tabela e lê as consequências (hook ligado)", () => {
    desenhar(true);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(estado.usos.every((u) => u === true)).toBe(true);
    expect(estado.usos.length).toBeGreaterThan(0);
  });

  it("os três grupos que já existiam passam a viver na tabela: continuam a ser quatro escolhas mais a nova, e a conversão fica fora dela", () => {
    desenhar(true);
    const tabela = within(screen.getByRole("table"));
    expect(tabela.getAllByRole("radiogroup")).toHaveLength(4);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(5);
    expect(screen.getByRole("radiogroup", { name: "Ao ganhar um negócio" })).not.toBeNull();
    expect(tabela.queryByRole("radiogroup", { name: "Ao ganhar um negócio" })).toBeNull();
  });

  it("o prazo de reflexão existe uma só vez, dentro da linha do contrato recusado", () => {
    desenhar(true);
    const prazos = screen.getAllByRole("textbox", { name: "Prazo de reflexão (dias)" });
    expect(prazos).toHaveLength(1);
    expect(within(screen.getByRole("table")).getByRole("textbox", { name: "Prazo de reflexão (dias)" })).toBe(prazos[0]);
  });

  it("«Guardar configuração» manda as escolhas feitas na tabela, como antes", async () => {
    const config = desenhar(true);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Quando a proposta é recusada" })).getByRole("radio", { name: "Manter o negócio aberto" }));
    fireEvent.click(screen.getByRole("button", { name: /guardar configuração/i }));
    await waitFor(() => expect(config.guardar).toHaveBeenCalledTimes(1));
    expect(config.guardar).toHaveBeenCalledWith({ ...OMISSOES, recusaProposta: "manter_aberto" });
  });

  it("um interruptor da tabela grava pelo hook das consequências, sem passar pelo «Guardar configuração»", async () => {
    const config = desenhar(true);
    const c = consequencias.valor as ConsequenciasHook;
    fireEvent.click(screen.getByRole("switch", { name: "Cria a proposta" }));
    await waitFor(() => expect(c.guardarCadeia).toHaveBeenCalledTimes(1));
    expect(config.guardar).not.toHaveBeenCalled();
  });

  it("sem pessoas.config: sem interruptores, sem escolhas, sem «Guardar»; o prazo só se lê", () => {
    estado.permissoes = new Set();
    desenhar(true);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(within(screen.getByRole("table")).queryByRole("radio")).toBeNull();
    // A conversão e o prazo também passam a texto, como o resto da tabela: nada que pareça editável.
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Passar a pessoa a cliente automaticamente")).toBeInTheDocument();
    expect(screen.getByText("Sem prazo definido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });

  it("com permissão, o prazo e a conversão continuam editáveis", () => {
    desenhar(true);
    expect(screen.getByRole("textbox", { name: "Prazo de reflexão (dias)" })).not.toHaveAttribute("readonly");
    expect(screen.getByRole("radiogroup", { name: "Ao ganhar um negócio" })).toBeInTheDocument();
  });

  it("enquanto um interruptor da tabela grava, o prazo, a conversão e o «Guardar configuração» ficam bloqueados", async () => {
    let acabar: (r: { mudou: boolean; depois: null }) => void = () => undefined;
    const c = consequencias.valor as ConsequenciasHook;
    c.guardarCadeia = vi.fn(() => new Promise((r) => { acabar = r as never; })) as never;
    const config = desenhar(true);
    fireEvent.click(screen.getByRole("switch", { name: "Cria a proposta" }));
    expect(screen.getByRole("textbox", { name: "Prazo de reflexão (dias)" })).toHaveAttribute("readonly");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Ao ganhar um negócio" })).getByRole("radio", { name: "Passar a cliente à mão (a ficha oferece «Converter em cliente»)" }));
    fireEvent.click(screen.getByRole("button", { name: /guardar configuração/i }));
    expect(config.guardar).not.toHaveBeenCalled();
    acabar({ mudou: true, depois: null });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Prazo de reflexão (dias)" })).not.toHaveAttribute("readonly"));
  });

  it("enquanto as permissões carregam, trata-se como sem permissão (esconde, não mostra e depois tira)", () => {
    estado.aCarregar = true;
    desenhar(true);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });
});
