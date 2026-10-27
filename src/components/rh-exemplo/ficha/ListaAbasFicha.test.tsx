import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs } from "@/components/ui/tabs";

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ language: "pt", t: (chave: string) => chave }) }));
vi.mock("./useRolagemAbas", () => ({ useRolagemAbas: () => ({ haAnteriores: false, haSeguintes: false, rolar: vi.fn() }) }));

import { ListaAbasFicha } from "./ListaAbasFicha";

describe("ListaAbasFicha com contadores reais", () => {
  it("só os contratos têm pastilha; documentos e ausências, sem fonte real, não mostram zero", () => {
    render(
      <Tabs value="visaoGeral">
        <ListaAbasFicha contadores={{ contratos: 3 }} abaAtiva="visaoGeral" />
      </Tabs>,
    );
    expect(screen.getAllByText("3")).toHaveLength(1);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
