/**
 * «Outros dados» da ficha: a sindicalização lida do hook REAL `usePessoa` (só leitura). Sem resposta registada (ou sem
 * permissão para a ler: a base devolve `null`) o cartão não aparece, para não revelar que existe uma resposta. O nome de
 * tratamento não existe nesta etapa (ainda não há coluna).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ language: "pt", t: (chave: string) => chave }) }));

import { PessoaOutrosDadosCard } from "./PessoaOutrosDadosCard";

const sindical = (extra: Record<string, unknown>) => ({
  id: "s1", pessoa_id: "p1", organization_id: "org-1", sindicalizado: true, sindicato: "SINTAP", quota_percentagem: 1.5, ...extra,
});

describe("PessoaOutrosDadosCard", () => {
  it("sem resposta de sindicalização não mostra nada", () => {
    const { container } = render(<PessoaOutrosDadosCard sindicalizacao={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sindicalizado: mostra o estado, o sindicato e a quota", () => {
    render(<PessoaOutrosDadosCard sindicalizacao={sindical({}) as never} />);
    expect(screen.getByText("rhNova.simNao.sim")).toBeInTheDocument();
    expect(screen.getByText("SINTAP")).toBeInTheDocument();
    expect(screen.getByText("1.5 %")).toBeInTheDocument();
  });

  it("não sindicalizado: mostra «não» e não mostra sindicato nem quota", () => {
    render(<PessoaOutrosDadosCard sindicalizacao={sindical({ sindicalizado: false, sindicato: null, quota_percentagem: null }) as never} />);
    expect(screen.getByText("rhNova.simNao.nao")).toBeInTheDocument();
    expect(screen.queryByText("hr.pendencias.campo.sindicato")).not.toBeInTheDocument();
    expect(screen.queryByText("rhNova.f.quota")).not.toBeInTheDocument();
  });

  it("resposta por decidir (sindicalizado = null) não conta como resposta", () => {
    const { container } = render(<PessoaOutrosDadosCard sindicalizacao={sindical({ sindicalizado: null, sindicato: null, quota_percentagem: null }) as never} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sindicalizado sem quota mostra «sem valor» na quota", () => {
    render(<PessoaOutrosDadosCard sindicalizacao={sindical({ quota_percentagem: null }) as never} />);
    expect(screen.getAllByText("hr.campos.semValor").length).toBeGreaterThan(0);
  });

  it("não tem o nome de tratamento", () => {
    render(<PessoaOutrosDadosCard sindicalizacao={sindical({}) as never} />);
    expect(screen.queryByText("rhNova.f.nomeTratamento")).not.toBeInTheDocument();
  });
});
