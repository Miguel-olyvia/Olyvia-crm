// 16/11: o campo «Modelo» do produto (CampoModelo.tsx): vem a seguir à Subcategoria, só mostra os modelos da subcategoria escolhida, fica desativado com a
// razão escrita sem subcategoria (ou sem a função na base), e «Novo modelo…» escolhe um nome novo que só se cria quando o produto é gravado.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampoModelo, MODELO_VAZIO, type ModeloEscolhido } from "./CampoModelo";
import type { ModeloK } from "./v2/catalogoModelo";

afterEach(cleanup);

const MODELOS: ModeloK[] = [
  { id: "m1", n: "SORTY", numero: 1, sub: "s1", ativo: true },
  { id: "m2", n: "STONE PLUS", numero: 2, sub: "s1", ativo: true },
  { id: "m3", n: "ZEUS", numero: 7, sub: "s1", ativo: false },
  { id: "m4", n: "OUTRO", numero: 1, sub: "s2", ativo: true },
];

function Caixa({ inicial = MODELO_VAZIO, aoMudar, ...p }: { inicial?: ModeloEscolhido; aoMudar?: (v: ModeloEscolhido) => void } & Partial<Parameters<typeof CampoModelo>[0]>) {
  const [v, setV] = useState(inicial);
  return <CampoModelo modelos={MODELOS} sub="s1" subNova={false} podeCriar valor={v} onChange={(x) => { setV(x); aoMudar?.(x); }} {...p} />;
}
const campo = () => screen.getByRole("combobox", { name: "Modelo" }) as HTMLInputElement;
const opcoes = () => screen.getAllByRole("option").map((o) => o.textContent?.replace(/\s*\(escolhida\)$/, ""));

describe("CampoModelo", () => {
  it("lista só os modelos ativos da subcategoria escolhida, com o número («0001 · SORTY»), «Sem modelo» primeiro e «Novo modelo…» no fim", () => {
    render(<Caixa />);
    fireEvent.click(campo());
    expect(opcoes()).toEqual(["Sem modelo", "0001 · SORTY", "0002 · STONE PLUS", "Novo modelo…"]);
  });
  it("outra subcategoria mostra os modelos dela", () => {
    render(<Caixa sub="s2" />);
    fireEvent.click(campo());
    expect(opcoes()).toEqual(["Sem modelo", "0001 · OUTRO", "Novo modelo…"]);
  });
  it("sem subcategoria fica desativado e diz porquê, por escrito", () => {
    render(<Caixa sub="" />);
    expect(campo()).toBeDisabled();
    expect(screen.getByText("Escolha primeiro a subcategoria (o modelo é da subcategoria).")).toBeInTheDocument();
  });
  it("sem a lista de modelos (função por criar, sem permissão) fica desativado: «Ainda não disponível nesta base»", () => {
    render(<Caixa modelos={undefined} />);
    expect(campo()).toBeDisabled();
    expect(screen.getByText("Ainda não disponível nesta base")).toBeInTheDocument();
  });
  it("escolher um modelo devolve o id (e nada de nome novo); «Sem modelo» limpa", () => {
    const aoMudar = vi.fn();
    render(<Caixa aoMudar={aoMudar} />);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("option", { name: "0002 · STONE PLUS" }));
    expect(aoMudar).toHaveBeenLastCalledWith({ id: "m2", novo: null });
    expect(campo().value).toBe("0002 · STONE PLUS");
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("option", { name: "Sem modelo" }));
    expect(aoMudar).toHaveBeenLastCalledWith(MODELO_VAZIO);
    expect(campo().value).toBe("");
  });
  it("a pesquisa acha por nome sem acentos nem maiúsculas, e por número", () => {
    render(<Caixa />);
    fireEvent.change(campo(), { target: { value: "stone" } });
    expect(opcoes()).toEqual(["0002 · STONE PLUS", "Novo modelo…"]);
    fireEvent.change(campo(), { target: { value: "0001" } });
    expect(opcoes()).toEqual(["0001 · SORTY", "Novo modelo…"]);
  });
  it("«Novo modelo…» abre um nome; fica pendente («é novo: cria-se quando o produto for gravado») e não chama a base", () => {
    const aoMudar = vi.fn();
    render(<Caixa aoMudar={aoMudar} />);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("option", { name: "Novo modelo…" }));
    fireEvent.change(screen.getByLabelText("Nome do novo modelo"), { target: { value: "  Rio   Alto " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(aoMudar).toHaveBeenLastCalledWith({ id: "", novo: "Rio Alto" });
    expect(campo().value).toBe("Rio Alto");
    expect(screen.getByText(/É novo: cria-se quando o produto for gravado/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Novo modelo" })).toBeNull();
  });
  it("um nome que já existe na subcategoria (sem acentos nem maiúsculas) escolhe o que existe, em vez de duplicar", () => {
    const aoMudar = vi.fn();
    render(<Caixa aoMudar={aoMudar} />);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("option", { name: "Novo modelo…" }));
    fireEvent.change(screen.getByLabelText("Nome do novo modelo"), { target: { value: "sorty" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(aoMudar).toHaveBeenLastCalledWith({ id: "m1", novo: null });
  });
  it("um nome que existe mas está desativado avisa («reative-o na Gestão») e não escolhe nem cria", () => {
    const aoMudar = vi.fn();
    render(<Caixa aoMudar={aoMudar} />);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("option", { name: "Novo modelo…" }));
    fireEvent.change(screen.getByLabelText("Nome do novo modelo"), { target: { value: "Zeus" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe e está desativado: reative-o na Gestão.");
    expect(aoMudar).not.toHaveBeenCalled();
  });
  it("com uma subcategoria nova (por criar) não há modelos para escolher, mas pode criar-se um novo", () => {
    render(<Caixa sub="" subNova />);
    expect(campo()).toBeEnabled();
    fireEvent.click(campo());
    expect(opcoes()).toEqual(["Sem modelo", "Novo modelo…"]);
  });
  it("sem permissão de editar produtos não oferece «Novo modelo…»", () => {
    render(<Caixa podeCriar={false} />);
    fireEvent.click(campo());
    expect(opcoes()).toEqual(["Sem modelo", "0001 · SORTY", "0002 · STONE PLUS"]);
  });
  it("o modelo atual desativado (já era o do produto) continua à vista, «(desativada)», e não se escolhe de novo", () => {
    render(<Caixa inicial={{ id: "m3", novo: null }} original="m3" />);
    expect(campo().value).toBe("0007 · ZEUS (desativada)");
    fireEvent.click(campo());
    expect(opcoes()).not.toContain("0007 · ZEUS");
  });
});
