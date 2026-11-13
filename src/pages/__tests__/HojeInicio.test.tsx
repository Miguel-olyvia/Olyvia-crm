// A primeira página (/home): o Hoje da V1 para quem vê Pessoas com organização ativa (13/11: em todas, sem interruptor); senão, o Hoje do CRM.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const estado = vi.hoisted(() => ({ ativo: true, pode: true, tecnico: false, papel: false }));
// 09/11: «Ser técnico de obra» (negocios.obra.tecnico) à parte das outras permissões
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (c: string) => (c === "negocios.obra.tecnico" ? estado.tecnico : estado.pode), loading: false }),
}));
vi.mock("@/hooks/pessoas/useTemPapelNegocio", () => ({
  useTemPapelNegocio: () => ({ loading: false, tem: estado.papel, pessoa: null, papeis: [] }),
}));
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({ useNegociosAtivos: () => ({ ativo: estado.ativo, isLoading: false }) }));
vi.mock("../Home", () => ({ default: () => <p>Hoje do CRM</p> }));
vi.mock("../NegociosEmylia", () => ({ default: ({ vistaInicial }: { vistaInicial?: string }) => <p>Emylia em {vistaInicial}</p> }));

import HojeInicio from "../HojeInicio";

describe("/home", () => {
  it("com organização ativa e pessoas.view: o Hoje da V1", async () => {
    estado.ativo = true; estado.pode = true;
    render(<HojeInicio />);
    expect(await screen.findByText("Emylia em hoje")).toBeTruthy();
  });
  it("sem organização ativa, ou sem ver Pessoas: o Hoje do CRM", async () => {
    estado.ativo = false;
    const a = render(<HojeInicio />);
    expect(await screen.findByText("Hoje do CRM")).toBeTruthy();
    a.unmount();
    estado.ativo = true; estado.pode = false;
    render(<HojeInicio />);
    expect(await screen.findByText("Hoje do CRM")).toBeTruthy();
  });
  it("09/11: com o perfil «Ser técnico de obra», o Hoje da V1, mesmo sem ver Pessoas nem papel no Negócio (o aviso fica no Hoje)", async () => {
    estado.ativo = true; estado.pode = false; estado.tecnico = true; estado.papel = false;
    render(<HojeInicio />);
    expect(await screen.findByText("Emylia em hoje")).toBeTruthy();
    estado.tecnico = false;
  });
});
