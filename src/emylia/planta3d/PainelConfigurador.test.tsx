// O painel «Configurador de famílias» (protótipo, só em memória): assistente de 6 passos, validação visível, pré-visualização e guardar na sessão.
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PainelConfigurador } from "./PainelConfigurador";
import type { FamiliaCfg } from "./configurador";

afterEach(cleanup);

let ultima: FamiliaCfg[] = [];
function Casa({ inicial = [] }: { inicial?: FamiliaCfg[] }) {
  const [lista, setLista] = useState<FamiliaCfg[]>(inicial);
  ultima = lista;
  return <PainelConfigurador familias={lista} onFamilias={setLista} />;
}
const estado = () => screen.getByText(/^Passo \d de 6 · /).textContent;
const seguinte = () => screen.getByRole("button", { name: "Seguinte" });
const abrirExemplo = () => { render(<Casa />); fireEvent.click(screen.getByRole("button", { name: "Começar pelo exemplo" })); };
const ir = (n: number) => { for (let i = 0; i < n; i++) fireEvent.click(seguinte()); };

describe("PainelConfigurador", () => {
  it("mostra o aviso do protótipo e a lista vazia", () => {
    render(<Casa />);
    expect(screen.getByText(/Protótipo: só dura nesta sessão; nada é guardado\. Uma peça posta na planta com uma família configurada perde-se ao recarregar/)).toBeInTheDocument();
    expect(screen.getByText("Ainda sem famílias configuradas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova família" })).toBeInTheDocument();
  });

  it("um passo visível de cada vez, com «Passo n de 6», Anterior e um só Seguinte; o foco vai para o título", () => {
    abrirExemplo();
    expect(estado()).toBe("Passo 1 de 6 · Família");
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Seguinte" })).toHaveLength(1);
    expect(screen.getByLabelText("Nome da família")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Preço base/)).not.toBeInTheDocument();
    fireEvent.click(seguinte());
    expect(estado()).toBe("Passo 2 de 6 · Acabamentos");
    expect(screen.getByRole("heading", { name: "Acabamentos" })).toHaveFocus();
    expect(screen.queryByLabelText("Nome da família")).not.toBeInTheDocument();
    ir(1); expect(estado()).toBe("Passo 3 de 6 · Medidas");
    ir(1); expect(estado()).toBe("Passo 4 de 6 · Combinações (cor × medida)");
    ir(1); expect(estado()).toBe("Passo 5 de 6 · Modelo 3D");
    ir(1); expect(estado()).toBe("Passo 6 de 6 · Pré-visualização");
    expect(screen.queryByRole("button", { name: "Seguinte" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(estado()).toBe("Passo 5 de 6 · Modelo 3D");
  });

  it("sem nome o Seguinte fica desligado e diz porquê por escrito", () => {
    abrirExemplo();
    fireEvent.change(screen.getByLabelText("Nome da família"), { target: { value: "  " } });
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/Escreva o nome da família/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome da família"), { target: { value: "Lava-loiça Nova" } });
    expect(seguinte()).toBeEnabled();
  });

  it("acabamentos e medidas: adicionar e remover; a matriz acompanha", () => {
    abrirExemplo();
    ir(1);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar acabamento" }));
    expect(screen.getAllByLabelText(/^Nome do acabamento/)).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: /^Remover o acabamento/ })[2]);
    expect(screen.getAllByLabelText(/^Nome do acabamento/)).toHaveLength(2);
    ir(1);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar medida" }));
    expect(screen.getAllByLabelText(/^Rótulo da medida/)).toHaveLength(3);
    // a nova medida sem preço bloqueia o Seguinte
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/preço/i, { selector: "#motivo-seguinte" })).toBeInTheDocument();
  });

  it("matriz: desligar tudo mostra o erro e bloqueia; um preço por célula e um SKU manual passam à pré-visualização", () => {
    abrirExemplo();
    ir(3);
    expect(estado()).toBe("Passo 4 de 6 · Combinações (cor × medida)");
    const ativos = screen.getAllByRole("checkbox", { name: /^Ativo:/ });
    for (const c of ativos) if ((c as HTMLInputElement).checked) fireEvent.click(c);
    expect(screen.getByRole("alert")).toHaveTextContent(/nenhuma combinação/i);
    expect(seguinte()).toBeDisabled();
    for (const c of ativos) if (!(c as HTMLInputElement).checked) fireEvent.click(c);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const preco = screen.getAllByLabelText(/^Preço de /)[0];
    fireEvent.change(preco, { target: { value: "175" } });
    fireEvent.click(screen.getByRole("radio", { name: "SKU escrito à mão" }));
    fireEvent.change(screen.getAllByLabelText(/^SKU de /)[0], { target: { value: "KER-ESPECIAL" } });
    ir(2);
    const cartao = screen.getByRole("list", { name: "Pré-visualização da família" });
    expect(within(cartao).getByText(/SKU KER-ESPECIAL/)).toBeInTheDocument();
    expect(within(cartao).getByText(/175/)).toBeInTheDocument();
  });

  it("SKU repetido aparece como erro e bloqueia", () => {
    abrirExemplo();
    ir(3);
    fireEvent.click(screen.getByRole("radio", { name: "SKU escrito à mão" }));
    const skus = screen.getAllByLabelText(/^SKU de /);
    fireEvent.change(skus[0], { target: { value: "IGUAL" } });
    fireEvent.change(skus[2], { target: { value: "IGUAL" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/SKU «IGUAL»/);
    expect(seguinte()).toBeDisabled();
  });

  it("modelo 3D: escolher um GLB dá o selo «3D do fabricante»; sem escolha fica «modelo genérico»", () => {
    abrirExemplo();
    ir(4);
    expect(estado()).toBe("Passo 5 de 6 · Modelo 3D");
    const selects = screen.getAllByLabelText(/^Modelo 3D de /);
    const sem = screen.getAllByText("Modelo genérico", { selector: "option" });
    expect(sem.length).toBeGreaterThan(0);
    const alvo = selects.find((s) => (s as HTMLSelectElement).value === "") as HTMLSelectElement;
    const opcao = Array.from(alvo.options).find((o) => o.value.startsWith("lava_loica|"))!;
    fireEvent.change(alvo, { target: { value: opcao.value } });
    expect(screen.getAllByText("3D do fabricante").length).toBeGreaterThan(0);
  });

  it("Guardar na sessão entrega a família a quem usa o painel (onFamilias) e fica na lista com Editar e Remover", () => {
    abrirExemplo();
    ir(5);
    expect(estado()).toBe("Passo 6 de 6 · Pré-visualização");
    expect(screen.getByRole("list", { name: "Pré-visualização da família" })).toBeInTheDocument();
    expect(ultima).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar na sessão" }));
    expect(ultima.map((f) => f.id)).toEqual(["cfg:lava-loica-keran"]);
    const lista = screen.getByRole("list", { name: "Famílias configuradas" });
    expect(within(lista).getByText(/Lava-loiça Keran/)).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: /^Editar/ })).toBeInTheDocument();
    fireEvent.click(within(lista).getByRole("button", { name: /^Remover/ }));
    expect(ultima).toEqual([]);
  });

  it("editar e guardar substitui a família (não duplica); guardar uma segunda com o mesmo nome é recusado", () => {
    abrirExemplo(); ir(5);
    fireEvent.click(screen.getByRole("button", { name: "Guardar na sessão" }));
    fireEvent.click(screen.getByRole("button", { name: /^Editar/ }));
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "OUTRA" } });
    ir(5); fireEvent.click(screen.getByRole("button", { name: "Guardar na sessão" }));
    expect(ultima).toHaveLength(1);
    expect(ultima[0].marca).toBe("OUTRA");
    fireEvent.click(screen.getByRole("button", { name: "Começar pelo exemplo" }));
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/identificador/i, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome da família"), { target: { value: "Lava-loiça Keran 2" } });
    expect(seguinte()).toBeEnabled();
  });
});
