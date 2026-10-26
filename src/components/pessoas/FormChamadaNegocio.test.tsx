// «Registar a chamada» de um cartão do Pipeline: o formulário recebe o negócio (opcional) e entrega-o a registarChamada nos dados, para o contacto
// ficar ligado a esse negócio. Sem negócio (a página de Pessoas) os dados são os de sempre, sem a chave.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
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

import { FormChamada } from "./FormChamada";
import { pessoaBase, resumoBase } from "./fabricaTestes";
import type { AcoesFicha } from "./PainelBase";

beforeAll(prepararRadixNoJsdom);

function montar(negocioId?: string) {
  const pessoa = pessoaBase("a", { nome: "Ana Lopes" });
  const registarChamada = vi.fn().mockResolvedValue(undefined);
  const acoes = { registarChamada, capacidades: { chamada: true, encerrar: true, adiar: true, nota: true, visita: false, negocios: true } } as unknown as AcoesFicha;
  render(
    <FormChamada
      id="c" pessoa={pessoa} resumo={resumoBase(pessoa, [], "2026-10-20", "lead")} hoje="2026-10-20" acoes={acoes}
      aoFechar={vi.fn()} aoConcluir={vi.fn()} negocioId={negocioId}
    />,
  );
  return { registarChamada };
}
const guardarNaoAtendeu = async () => {
  fireEvent.click(screen.getByRole("radio", { name: /Não atendeu/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Guardar/ }));
};

describe("FormChamada: o negócio do cartão", () => {
  it("com negocioId, registarChamada recebe-o nos dados", async () => {
    const { registarChamada } = montar("neg-1");
    await guardarNaoAtendeu();
    expect(registarChamada).toHaveBeenCalledTimes(1);
    expect(registarChamada.mock.calls[0][0]).toBe("a");
    expect(registarChamada.mock.calls[0][1]).toMatchObject({ resultado: "naoAtendeu", negocioId: "neg-1" });
  });

  it("sem negocioId os dados não levam a chave", async () => {
    const { registarChamada } = montar();
    await guardarNaoAtendeu();
    expect(registarChamada).toHaveBeenCalledTimes(1);
    expect(registarChamada.mock.calls[0][1]).not.toHaveProperty("negocioId");
  });
});
