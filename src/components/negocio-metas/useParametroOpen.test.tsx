// O ?open= do endereço: abrir, fechar e limpar. Limpar tira também o que só vale com uma ficha aberta (o negócio e o contrato que voltou
// de outro ecrã), para nenhum deles ficar preso no endereço.
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useParametroOpen } from "./useParametroOpen";

function montar(endereco: string) {
  let busca = "";
  const Espiao = () => { busca = useLocation().search; return null; };
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[endereco]}><Espiao />{children}</MemoryRouter>;
  const r = renderHook(() => useParametroOpen(), { wrapper });
  return { ...r, busca: () => busca };
}

describe("useParametroOpen: limpar", () => {
  it("tira o open, o negócio e o contrato por ligar, e deixa o resto", () => {
    const { result, busca } = montar("/pessoas?papel=lead&open=p1&negocio=n1&novoContrato=k1");
    act(() => result.current.limpar());
    expect(busca()).toBe("?papel=lead");
  });

  it("fechar sem entrada criada por esta página também limpa tudo isso", () => {
    const { result, busca } = montar("/pessoas?open=p1&negocio=n1&novoContrato=k1");
    act(() => result.current.fechar());
    expect(busca()).toBe("");
  });
});
