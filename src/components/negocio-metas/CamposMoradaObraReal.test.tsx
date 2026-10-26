// A «Morada da obra» do negócio real: dois atalhos, «Preencher com os dados da entidade» (copia os quatro campos) e «Estou no local» (pede a
// localização do dispositivo e preenche a morada pela mesma via do protótipo). Nenhum guarda coordenadas. Sem as ações reais, o atalho antigo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasVisitaTranslations } = await import("@/translations/negocioMetasVisita");
  const textos = negocioMetasVisitaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});
const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info, error: vi.fn(), success: vi.fn() } }));

import { MoradaObra } from "./CamposMoradaObra";
import { ErroLocalizacao } from "@/hooks/pessoas/localizacaoMorada";
import type { MoradaObraForm } from "./moradaObra";

const VAZIA: MoradaObraForm = { rua: "", codigoPostal: "", localidade: "", andar: "" };
const ENTIDADE: MoradaObraForm = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "2.º Dto." };

interface Extra { moradaEntidade?: MoradaObraForm | null; obterLocal?: () => Promise<{ morada: Omit<MoradaObraForm, "andar">; precisaoMetros: number }>; origemObra?: "entidade" | "manual" | "localizacao" | null }

function montar(extra: Extra = {}, real = true) {
  const aoPreencherDe = vi.fn();
  const aoPreencher = vi.fn();
  render(
    <MoradaObra
      id="m" valores={VAZIA} erroCodigoPostal={false} moradaContacto="" aoMudar={vi.fn()} aoPreencher={aoPreencher}
      origemObra={extra.origemObra ?? null}
      real={real ? { moradaEntidade: extra.moradaEntidade === undefined ? ENTIDADE : extra.moradaEntidade, aoPreencherDe, obterLocal: extra.obterLocal } : undefined}
    />,
  );
  return { aoPreencherDe, aoPreencher };
}

beforeEach(() => info.mockReset());

describe("Morada da obra: preencher com os dados da entidade", () => {
  it("copia os quatro campos e marca a origem 'entidade'; o atalho antigo não aparece", () => {
    const { aoPreencherDe } = montar();
    expect(screen.queryByRole("button", { name: "Usar a morada do contacto" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preencher com os dados da entidade" }));
    expect(aoPreencherDe).toHaveBeenCalledExactlyOnceWith(ENTIDADE, "entidade");
  });

  it("a entidade sem morada só avisa e não preenche nada", () => {
    const { aoPreencherDe } = montar({ moradaEntidade: null });
    fireEvent.click(screen.getByRole("button", { name: "Preencher com os dados da entidade" }));
    expect(aoPreencherDe).not.toHaveBeenCalled();
    // Diz-se na região aria-live que já existe, e não num toast (que um leitor de ecrã pode não anunciar).
    expect(document.getElementById("m-local")).toHaveTextContent("A entidade ainda não tem morada.");
    expect(info).not.toHaveBeenCalled();
  });

  it("depois de copiar, a confirmação vai para a região aria-live (não para um toast)", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Preencher com os dados da entidade" }));
    const regiao = document.getElementById("m-local");
    expect(regiao).toHaveAttribute("aria-live", "polite");
    expect(regiao).toHaveTextContent("Morada da entidade copiada.");
    expect(info).not.toHaveBeenCalled();
  });
});

describe("Morada da obra: campos", () => {
  it("os quatro campos têm autoComplete off (é a morada da obra, não a de quem preenche)", () => {
    montar();
    for (const sufixo of ["rua", "cp", "localidade", "andar"]) {
      expect(document.getElementById(`m-${sufixo}`), sufixo).toHaveAttribute("autocomplete", "off");
    }
  });

  it("o formato do código postal está escrito à vista e ligado ao campo por aria-describedby", () => {
    montar();
    const campo = document.getElementById("m-cp") as HTMLElement;
    const ids = (campo.getAttribute("aria-describedby") ?? "").split(" ");
    const textos = ids.map((i) => document.getElementById(i)?.textContent ?? "");
    expect(textos.some((x) => /0000-000|4 dígitos/.test(x) && x.length > 9)).toBe(true);
  });
});

describe("Morada da obra: Estou no local", () => {
  it("preenche pela localização, marca 'localizacao' e diz a precisão; só traz rua, código postal e localidade", async () => {
    const obterLocal = vi.fn().mockResolvedValue({ morada: { rua: "Rua B 2", codigoPostal: "3000-003", localidade: "Coimbra" }, precisaoMetros: 15 });
    const { aoPreencherDe } = montar({ obterLocal });
    fireEvent.click(screen.getByRole("button", { name: "Estou no local" }));
    await waitFor(() => expect(aoPreencherDe).toHaveBeenCalledTimes(1));
    expect(aoPreencherDe).toHaveBeenCalledWith({ rua: "Rua B 2", codigoPostal: "3000-003", localidade: "Coimbra", andar: "" }, "localizacao");
    expect(await screen.findByText(/Morada preenchida pela localização \(± 15 m\)/)).toBeInTheDocument();
  });

  it("uma posição pouco precisa (mais de 100 m) preenche mas avisa para confirmar", async () => {
    const obterLocal = vi.fn().mockResolvedValue({ morada: { rua: "Rua B", codigoPostal: "", localidade: "Coimbra" }, precisaoMetros: 250 });
    const { aoPreencherDe } = montar({ obterLocal });
    fireEvent.click(screen.getByRole("button", { name: "Estou no local" }));
    expect(await screen.findByText(/pouco precisa \(± 250 m\)/)).toBeInTheDocument();
    expect(aoPreencherDe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["negada", /Sem autorização para usar a localização/],
    ["semSuporte", /não dá a localização/],
    ["posicao", /Não foi possível obter a localização/],
    ["servico", /serviço de moradas/],
    ["semMorada", /Não foi possível saber a morada deste ponto/],
  ] as const)("falha '%s': diz porquê, não preenche e o botão volta a estar livre", async (motivo, texto) => {
    const obterLocal = vi.fn().mockRejectedValue(new ErroLocalizacao(motivo));
    const { aoPreencherDe } = montar({ obterLocal });
    fireEvent.click(screen.getByRole("button", { name: "Estou no local" }));
    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(aoPreencherDe).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Estou no local" })).not.toHaveAttribute("aria-disabled");
  });

  it("enquanto procura, o botão fica ocupado e um segundo clique não repete o pedido", async () => {
    let resolver!: (v: unknown) => void;
    const obterLocal = vi.fn().mockReturnValue(new Promise((ok) => { resolver = ok; }));
    montar({ obterLocal });
    fireEvent.click(screen.getByRole("button", { name: "Estou no local" }));
    const ocupado = screen.getByRole("button", { name: "A procurar a morada…" });
    expect(ocupado).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(ocupado);
    expect(obterLocal).toHaveBeenCalledTimes(1);
    await act(async () => { resolver({ morada: { rua: "R", codigoPostal: "", localidade: "L" }, precisaoMetros: 5 }); });
  });

  it("um erro que não é de localização também se diz (nunca fica calado)", async () => {
    const obterLocal = vi.fn().mockRejectedValue(new Error("boom"));
    montar({ obterLocal });
    fireEvent.click(screen.getByRole("button", { name: "Estou no local" }));
    expect(await screen.findByText(/Não foi possível obter a localização/)).toBeInTheDocument();
  });
});

describe("Morada da obra: origem e modo antigo", () => {
  it.each([["entidade", /copiada da entidade/], ["manual", /escrita à mão/], ["localizacao", /localização do dispositivo/]] as const)("diz a origem '%s'", (origemObra, texto) => {
    montar({ origemObra });
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("sem ações reais (o exemplo) fica o atalho antigo e não há «Estou no local»", () => {
    montar({}, false);
    expect(screen.getByRole("button", { name: "Usar a morada do contacto" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Estou no local/ })).toBeNull();
  });
});
