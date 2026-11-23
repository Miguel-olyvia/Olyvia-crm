// 23/11 (testarh, 1015 da Mudelar): no passo «Quem pede», o Telefone é sempre o campo com o indicativo. Um negócio antigo com um email
// no contacto mostra o telefone vazio (antes mostrava o email no campo Telefone); gravado o telefone, o email passa para o email.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TelefoneComRascunho } from "./TelefoneIndicativo";

const escrever = (valor: string) => {
  const campo = screen.getByLabelText("Telefone") as HTMLInputElement;
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.blur(campo, { target: { value: valor } });
  return campo;
};

describe("TelefoneComRascunho («Quem pede»)", () => {
  it("um email no contacto não aparece no Telefone; ao gravar o telefone, o email passa para o email do negócio", () => {
    const d: { tel: string; f: Record<string, string | undefined> } = { tel: "ana@gmail.com", f: {} };
    render(<TelefoneComRascunho d={d} run={(fn) => fn()} />);
    expect((screen.getByLabelText("Telefone") as HTMLInputElement).value).toBe("");
    escrever("912 345 678");
    expect(d.tel).toBe("+351912345678");
    expect(d.f.email).toBe("ana@gmail.com");
  });

  it("não troca o email que o negócio já tem", () => {
    const d: { tel: string; f: Record<string, string | undefined> } = { tel: "velho@x.pt", f: { email: "novo@x.pt" } };
    render(<TelefoneComRascunho d={d} run={(fn) => fn()} />);
    escrever("912 345 678");
    expect(d.f.email).toBe("novo@x.pt");
    expect(d.tel).toBe("+351912345678");
  });

  it("sem número escrito, nada muda", () => {
    const d: { tel: string; f: Record<string, string | undefined> } = { tel: "ana@gmail.com", f: {} };
    render(<TelefoneComRascunho d={d} run={(fn) => fn()} />);
    escrever("");
    expect(d).toEqual({ tel: "ana@gmail.com", f: {} });
  });
});
