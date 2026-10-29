// A primeira página (/home): o Hoje da V1 quando a organização tem o Negócio da Emylia ligado; senão, o Hoje do CRM.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const estado = vi.hoisted(() => ({ ativo: true, pode: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => estado.pode, loading: false }) }));
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({ useNegociosAtivos: () => ({ ativo: estado.ativo, isLoading: false }) }));
vi.mock("../Home", () => ({ default: () => <p>Hoje do CRM</p> }));
vi.mock("../NegociosEmylia", () => ({ default: ({ vistaInicial }: { vistaInicial?: string }) => <p>Emylia em {vistaInicial}</p> }));

import HojeInicio from "../HojeInicio";

describe("/home", () => {
  it("com o Negócio ligado: o Hoje da V1", async () => {
    estado.ativo = true; estado.pode = true;
    render(<HojeInicio />);
    expect(await screen.findByText("Emylia em hoje")).toBeTruthy();
  });
  it("sem o Negócio ligado, ou sem ver Pessoas: o Hoje do CRM", async () => {
    estado.ativo = false;
    const a = render(<HojeInicio />);
    expect(await screen.findByText("Hoje do CRM")).toBeTruthy();
    a.unmount();
    estado.ativo = true; estado.pode = false;
    render(<HojeInicio />);
    expect(await screen.findByText("Hoje do CRM")).toBeTruthy();
  });
});
