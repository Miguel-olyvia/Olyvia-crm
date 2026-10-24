// A fonte real da página leva se quem está na sessão pode apagar negócios (pessoas.delete): o lixo de negócios só se mostra a quem pode.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useFontePessoas, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { NegociosAtivos } from "@/hooks/pessoas/useNegociosAtivos";
import { PessoasRota } from "./PessoasRota";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
const ativosMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({ useNegociosAtivos: () => ativosMock(), useRepetirNegociosAtivos: () => vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }) }));
const escopo = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => escopo() }));

const vistas: FontePessoas[] = [];
function Sonda() {
  vistas.push(useFontePessoas());
  return <p>PAGINA</p>;
}
const desenhar = () => {
  ativosMock.mockReturnValue({ ativo: true, momentoGanho: "manual", isLoading: false, isError: false, erroSemResposta: false, aRepetir: false } satisfies NegociosAtivos);
  render(
    <MemoryRouter initialEntries={["/pessoas"]}>
      <Routes><Route path="/pessoas" element={<PessoasRota><Sonda /></PessoasRota>} /></Routes>
    </MemoryRouter>,
  );
  return vistas[vistas.length - 1];
};

beforeEach(() => { vistas.length = 0; escopo.mockReset(); });

describe("PessoasRota: pessoas.delete na fonte", () => {
  it("com âmbito sobre pessoas.delete a fonte real diz que pode apagar negócios", () => {
    escopo.mockReturnValue({ anewUserId: "u1", getPermissionScope: (c: string) => (c === "pessoas.delete" ? "ORG" : "NONE") });
    const fonte = desenhar();
    expect(fonte.modo === "real" && fonte.podeApagarNegocios).toBe(true);
  });

  it("sem a permissão diz que não pode", () => {
    escopo.mockReturnValue({ anewUserId: "u1", getPermissionScope: () => "NONE" });
    const fonte = desenhar();
    expect(fonte.modo === "real" && fonte.podeApagarNegocios).toBe(false);
  });
});
