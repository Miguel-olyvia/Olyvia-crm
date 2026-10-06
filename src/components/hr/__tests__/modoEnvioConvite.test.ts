/**
 * O botao de topo "Enviar convite" da ficha: com um convite ainda pendente para
 * OUTRO e-mail, abrir em modo "enviar" com o e-mail pessoal sugerido substituia
 * o convite antigo sem o rascunho (o servidor so o herda com o mesmo e-mail) e a
 * pessoa perdia o que tinha escrito, sem aviso. Com convite pendente, abre-se
 * em "reenviar", com o e-mail do convite actual.
 */
import { describe, it, expect } from "vitest";
import { modoDeEnvioDoConvite } from "@/components/hr/modoEnvioConvite";

describe("modoDeEnvioDoConvite", () => {
  it("sem convite, e o primeiro envio", () => {
    expect(modoDeEnvioDoConvite(null)).toBe("enviar");
  });

  it("com um convite pendente com e-mail, reenvia (para nao perder o rascunho)", () => {
    expect(modoDeEnvioDoConvite({ estado: "pendente", emailDestino: "outro@x.pt" })).toBe("reenviar");
  });

  it("pendente sem e-mail de destino gravado nao tem para onde reenviar: envia", () => {
    expect(modoDeEnvioDoConvite({ estado: "pendente", emailDestino: null })).toBe("enviar");
  });

  it.each(["usado", "expirado", "substituido", "bloqueado"] as const)(
    "um convite %s nao conta como pendente: envia",
    (estado) => {
      expect(modoDeEnvioDoConvite({ estado, emailDestino: "a@b.pt" })).toBe("enviar");
    },
  );
});
