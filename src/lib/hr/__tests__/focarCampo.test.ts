/**
 * `focarQuandoExistir`: o atalho do resumo de problemas tem de chegar a campos
 * que so existem depois de abrir um bloco recolhivel, e nunca falhar em silencio.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { focarQuandoExistir } from "@/lib/hr/focarCampo";

afterEach(() => {
  document.body.innerHTML = "";
});

function inserir(html: string) {
  document.body.insertAdjacentHTML("beforeend", html);
}

describe("focarQuandoExistir", () => {
  it("foca logo um campo que ja existe", () => {
    inserir('<input id="campo-a" />');
    focarQuandoExistir("campo-a");
    expect(document.activeElement?.id).toBe("campo-a");
  });

  it("espera por um campo que so aparece depois (bloco a abrir) e foca-o", async () => {
    focarQuandoExistir("campo-tardio");
    expect(document.activeElement).toBe(document.body);
    setTimeout(() => inserir('<input id="campo-tardio" />'), 20);
    await vi.waitFor(() => expect(document.activeElement?.id).toBe("campo-tardio"));
  });

  it("um campo desactivado nao recebe foco em silencio: avisa quem chamou", () => {
    inserir('<input id="campo-off" disabled />');
    const aoNaoFocar = vi.fn();
    focarQuandoExistir("campo-off", aoNaoFocar);
    expect(aoNaoFocar).toHaveBeenCalledWith("desactivado");
    expect(document.activeElement?.id).not.toBe("campo-off");
  });

  it("um campo que nunca aparece avisa, depois de esgotar as tentativas", async () => {
    const aoNaoFocar = vi.fn();
    focarQuandoExistir("campo-fantasma", aoNaoFocar, 2);
    await vi.waitFor(() => expect(aoNaoFocar).toHaveBeenCalledWith("ausente"));
  });
});
