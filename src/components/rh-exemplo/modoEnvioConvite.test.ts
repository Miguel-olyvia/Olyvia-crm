/**
 * Quando o botao de topo "Enviar convite" da ficha serve: so sem processo de admissao aberto (a Edge Function recusa um
 * segundo). Um estado desconhecido conta como aberto: nao se oferece enviar por cima de um processo que nao se sabe como esta.
 */
import { describe, expect, it } from "vitest";
import { podeEnviarNovoConvite } from "./modoEnvioConvite";

const com = (estado: string) => ({ estado: estado as never });

describe("podeEnviarNovoConvite", () => {
  it("sem convite nenhum (ou sem resumo lido) pode enviar", () => {
    expect(podeEnviarNovoConvite(null)).toBe(true);
    expect(podeEnviarNovoConvite(undefined)).toBe(true);
  });

  it.each(["concluida", "rejeitada", "cancelada", "terminado"])("com o processo fechado (%s) pode enviar outro", (estado) => {
    expect(podeEnviarNovoConvite(com(estado))).toBe(true);
  });

  it.each(["convidada", "em_preenchimento", "submetida", "devolvida", "aprovada", "a_aguardar_assinaturas", "assinaturas_concluidas", "a_aguardar_ativacao"])(
    "com o processo aberto (%s) o botao esconde-se",
    (estado) => {
      expect(podeEnviarNovoConvite(com(estado))).toBe(false);
    },
  );

  it("estado desconhecido conta como aberto: nao se oferece enviar", () => {
    expect(podeEnviarNovoConvite(com("desconhecido"))).toBe(false);
  });

  it("os estados antigos da V1 (pendente, usado) nunca contam como fechados por engano: pendente esta aberto", () => {
    expect(podeEnviarNovoConvite(com("pendente"))).toBe(false);
  });
});
