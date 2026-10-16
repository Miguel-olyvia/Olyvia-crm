/**
 * A linha da lista de pessoas de RH: assinala a ficha aberta para leitores de ecrã (`aria-current`) e não volta a
 * desenhar-se quando nada do que a toca mudou (a lista pode ter centenas de linhas e a página muda de estado a cada tecla
 * da pesquisa).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string, p?: Record<string, unknown>) => (p ? `${chave}|${JSON.stringify(p)}` : chave) }),
}));

const { iniciais } = vi.hoisted(() => ({ iniciais: vi.fn((nome: string) => nome.slice(0, 2)) }));
vi.mock("@/lib/hr/anexosAdmissao", () => ({ iniciaisDoNome: iniciais }));

import { Table, TableBody } from "@/components/ui/table";
import type { PessoaListItem } from "@/types/hr";
import { LinhaPessoaRh } from "./LinhaPessoaRh";

const PESSOA = {
  id: "p1", nome_completo: "Marta Figueiredo", cargo: "RH", email_trabalho: null, local_id: null, local_trabalho: null,
  data_admissao: null, estadoAcesso: "semConta", estado_contrato_derivado: null,
} as unknown as PessoaListItem;

function tabela(aberta: boolean, aoAbrir: (id: string) => void, pessoa: PessoaListItem = PESSOA) {
  return (
    <Table>
      <TableBody>
        <LinhaPessoaRh pessoa={pessoa} local={null} comContrato={false} aberta={aberta} aoAbrir={aoAbrir} />
      </TableBody>
    </Table>
  );
}

beforeEach(() => {
  iniciais.mockClear();
});

describe("LinhaPessoaRh", () => {
  it("a linha da ficha aberta tem aria-current; as outras não", () => {
    const { rerender } = render(tabela(false, vi.fn()));
    expect(screen.getByRole("button", { name: /rhForm\.lista\.abrir/ })).not.toHaveAttribute("aria-current");
    rerender(tabela(true, vi.fn()));
    expect(screen.getByRole("button", { name: /rhForm\.lista\.abrir/ })).toHaveAttribute("aria-current", "true");
  });

  it("com as mesmas propriedades não se volta a desenhar", () => {
    const aoAbrir = vi.fn();
    const { rerender } = render(tabela(false, aoAbrir));
    const chamadas = iniciais.mock.calls.length;
    expect(chamadas).toBeGreaterThan(0);
    rerender(tabela(false, aoAbrir));
    expect(iniciais.mock.calls.length).toBe(chamadas);
  });

  it("muda quando muda o que a toca (abrir a ficha)", () => {
    const aoAbrir = vi.fn();
    const { rerender } = render(tabela(false, aoAbrir));
    const chamadas = iniciais.mock.calls.length;
    rerender(tabela(true, aoAbrir));
    expect(iniciais.mock.calls.length).toBeGreaterThan(chamadas);
  });
});
