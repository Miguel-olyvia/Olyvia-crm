// Depois de criar um contrato noutro ecrã, o utilizador volta à ficha com `?novoContrato=<id>`: a ficha liga o contrato ao negócio
// (neg_ligar_registo) e limpa o parâmetro. É idempotente (o mesmo contrato não se liga duas vezes) e nunca deixa o parâmetro a repetir.
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { useLigarAoVoltar } from "./useLigarAoVoltar";

function montar(endereco: string, mutacoes: MutacoesNegocio | null = mutacoesFalsas(), podeEditar = true) {
  const aoFalhar = vi.fn();
  const aoLigar = vi.fn();
  let localizacao = "";
  const Espiao = () => { localizacao = useLocation().search; return null; };
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[endereco]}><Espiao />{children}</MemoryRouter>;
  const r = renderHook(() => useLigarAoVoltar(mutacoes, podeEditar, aoFalhar, aoLigar), { wrapper });
  return { ...r, aoFalhar, aoLigar, busca: () => localizacao };
}

describe("useLigarAoVoltar", () => {
  it("com ?novoContrato e ?negocio liga o contrato ao negócio e limpa só o novoContrato do endereço", async () => {
    const mutacoes = mutacoesFalsas();
    const { busca, aoLigar } = montar("/pessoas?open=p1&negocio=n1&novoContrato=k1", mutacoes);
    await waitFor(() => expect(mutacoes.ligar).toHaveBeenCalledWith("n1", { tipo: "contrato", id: "k1" }));
    await waitFor(() => expect(busca()).toBe("?open=p1&negocio=n1"));
    // O sucesso também se diz (o contrato foi criado noutro ecrã e o utilizador quer saber que ficou ligado).
    expect(aoLigar).toHaveBeenCalledTimes(1);
  });

  it("não liga duas vezes o mesmo contrato (re-renderizar não repete)", async () => {
    const mutacoes = mutacoesFalsas();
    const { rerender } = montar("/pessoas?open=p1&negocio=n1&novoContrato=k1", mutacoes);
    rerender();
    rerender();
    await waitFor(() => expect(mutacoes.ligar).toHaveBeenCalledTimes(1));
  });

  it("sem o parâmetro não faz nada", () => {
    const mutacoes = mutacoesFalsas();
    montar("/pessoas?open=p1&negocio=n1", mutacoes);
    expect(mutacoes.ligar).not.toHaveBeenCalled();
  });

  it("sem negócio no endereço não liga a nada, mas limpa o parâmetro (para não ficar preso)", async () => {
    const mutacoes = mutacoesFalsas();
    const { busca } = montar("/pessoas?open=p1&novoContrato=k1", mutacoes);
    await waitFor(() => expect(busca()).toBe("?open=p1"));
    expect(mutacoes.ligar).not.toHaveBeenCalled();
  });

  it("sem as mutações da ficha real (o exemplo) ou sem permissão de editar não liga, e deixa o parâmetro", () => {
    const sem = montar("/pessoas?open=p1&negocio=n1&novoContrato=k1", null);
    expect(sem.busca()).toContain("novoContrato=k1");
    const semPermissao = mutacoesFalsas();
    const b = montar("/pessoas?open=p1&negocio=n1&novoContrato=k1", semPermissao, false);
    expect(semPermissao.ligar).not.toHaveBeenCalled();
    expect(b.busca()).toContain("novoContrato=k1");
  });

  it("se a ligação falha avisa (o contrato fica por ligar na ficha) e limpa o parâmetro", async () => {
    const erro = Object.assign(new Error("x"), { chave: "pessoasPagina.erroNeg.ng004" });
    const mutacoes = mutacoesFalsas({ ligar: vi.fn(async () => { throw erro; }) });
    const { aoFalhar, aoLigar, busca } = montar("/pessoas?open=p1&negocio=n1&novoContrato=k1", mutacoes);
    await waitFor(() => expect(aoFalhar).toHaveBeenCalledWith("pessoasPagina.erroNeg.ng004"));
    await waitFor(() => expect(busca()).toBe("?open=p1&negocio=n1"));
    expect(aoLigar).not.toHaveBeenCalled();
  });

  it("um erro sem chave conhecida avisa com a mensagem genérica", async () => {
    const mutacoes = mutacoesFalsas({ ligar: vi.fn(async () => { throw new Error("boom"); }) });
    const { aoFalhar } = montar("/pessoas?open=p1&negocio=n1&novoContrato=k1", mutacoes);
    await waitFor(() => expect(aoFalhar).toHaveBeenCalledWith("pessoasPagina.erroNeg.generico"));
  });
});

describe("useLigarAoVoltar: o parâmetro não fica preso", () => {
  it("com a ficha já carregada e sem permissão de editar não liga, mas limpa o parâmetro", async () => {
    const mutacoes = mutacoesFalsas();
    const aoFalhar = vi.fn();
    let localizacao = "";
    const Espiao = () => { localizacao = useLocation().search; return null; };
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={["/pessoas?open=p1&negocio=n1&novoContrato=k1"]}><Espiao />{children}</MemoryRouter>;
    renderHook(() => useLigarAoVoltar(mutacoes, false, aoFalhar, undefined, true), { wrapper });
    await waitFor(() => expect(localizacao).toBe("?open=p1&negocio=n1"));
    expect(mutacoes.ligar).not.toHaveBeenCalled();
  });
});
