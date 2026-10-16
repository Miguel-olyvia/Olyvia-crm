/**
 * O botao de topo "Enviar convite" da ficha. Com a V2 ha UM processo de
 * admissao aberto por pessoa e a Edge Function recusa um segundo convite
 * (`processo_aberto`): so se oferece enviar quando nao ha processo aberto.
 * Substituir o link de um processo aberto e a etapa E3, nao este botao.
 */
import { describe, it, expect } from "vitest";
import { podeEnviarNovoConvite } from "@/components/hr/modoEnvioConvite";

describe("podeEnviarNovoConvite", () => {
  it("sem convite nenhum, envia", () => {
    expect(podeEnviarNovoConvite(null)).toBe(true);
    expect(podeEnviarNovoConvite(undefined)).toBe(true);
  });

  it.each([
    "convidada",
    "em_preenchimento",
    "submetida",
    "devolvida",
    "aprovada",
    "a_aguardar_assinaturas",
    "assinaturas_concluidas",
    "a_aguardar_ativacao",
  ] as const)("com o processo %s aberto, nao se envia outro", (estado) => {
    expect(podeEnviarNovoConvite({ estado })).toBe(false);
  });

  it.each(["concluida", "rejeitada", "cancelada", "terminado"] as const)(
    "um processo %s ja nao esta aberto: envia",
    (estado) => {
      expect(podeEnviarNovoConvite({ estado })).toBe(true);
    },
  );

  it("estado desconhecido: nao se sabe se ha processo aberto, nao se oferece enviar", () => {
    expect(podeEnviarNovoConvite({ estado: "desconhecido" })).toBe(false);
  });
});
