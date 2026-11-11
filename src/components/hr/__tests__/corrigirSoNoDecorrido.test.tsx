/**
 * E6-2 (ecrã): «Corrigir» só aparece numa afectação/colocação que a base deixa corrigir.
 *
 * A RLS de UPDATE (`pessoas_afectacoes_update`, `pessoas_colocacao_organograma_update`) escolhe a permissão pelo
 * `valido_ate` da linha antiga com `hr_periodo_decorrido` (`valido_ate IS NOT NULL AND valido_ate < CURRENT_DATE`):
 * ainda não decorrida → `.edit`; decorrida → `.corrigir`. Só com `.corrigir`, uma linha fechada hoje ou no futuro
 * ficava em 0 linhas e o ecrã dizia «Alterações guardadas». Com `.edit` o comportamento não muda.
 *
 * Corre sobre as duas cópias (`components/hr` e `components/rh-exemplo`). Hooks simulados: nada toca na base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { dataDeHojeBase } from "@/lib/hr/dataBase";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));

const estado = vi.hoisted(() => ({
  afectacoes: [] as unknown[],
  colocacoes: [] as unknown[],
  corrigirResposta: null as string | null,
  corrigir: vi.fn(),
}));

const { hookAfectacoes, hookColocacao, filiais } = vi.hoisted(() => ({
  hookAfectacoes: () => ({
    afectacoes: estado.afectacoes,
    loading: false,
    saving: false,
    recusado: false,
    recarregar: vi.fn(),
    criar: vi.fn(),
    corrigir: estado.corrigir,
    fechar: vi.fn(),
    apararEFechar: vi.fn(),
    confirmar: vi.fn(),
  }),
  hookColocacao: () => ({
    colocacoes: estado.colocacoes,
    loading: false,
    saving: false,
    recusado: false,
    recarregar: vi.fn(),
    criar: vi.fn(),
    corrigir: estado.corrigir,
    fechar: vi.fn(),
  }),
  filiais: () => ({ filiais: [{ id: "n1", name: "Lisboa" }], loading: false }),
}));

vi.mock("@/hooks/usePessoaAfectacoes", () => ({ usePessoaAfectacoes: hookAfectacoes }));
vi.mock("@/components/rh-exemplo/hooks/usePessoaAfectacoes", () => ({ usePessoaAfectacoes: hookAfectacoes }));
vi.mock("@/hooks/usePessoaColocacaoOrganograma", () => ({ usePessoaColocacaoOrganograma: hookColocacao }));
vi.mock("@/components/rh-exemplo/hooks/usePessoaColocacaoOrganograma", () => ({
  usePessoaColocacaoOrganograma: hookColocacao,
}));
vi.mock("@/hooks/useFiliaisDaArvore", () => ({ useFiliaisDaArvore: filiais }));
vi.mock("@/components/rh-exemplo/hooks/useFiliaisDaArvore", () => ({ useFiliaisDaArvore: filiais }));

import { PessoaAfectacoesSeccao as AfectacoesHr } from "@/components/hr/PessoaAfectacoesSeccao";
import { PessoaAfectacoesSeccao as AfectacoesExemplo } from "@/components/rh-exemplo/PessoaAfectacoesSeccao";
import { PessoaColocacaoOrganogramaSeccao as ColocacaoHr } from "@/components/hr/PessoaColocacaoOrganogramaSeccao";
import { PessoaColocacaoOrganogramaSeccao as ColocacaoExemplo } from "@/components/rh-exemplo/PessoaColocacaoOrganogramaSeccao";

const HOJE = dataDeHojeBase();
const PASSADO = "2001-03-31";
const FUTURO = "2999-12-31";

type Permissoes = { podeEditar: boolean; podeCorrigir: boolean };

const afectacao = (id: string, validoAte: string | null) => ({
  id,
  pessoa_id: "p1",
  organization_id: "org",
  vinculo_id: null,
  local_id: "loc1",
  valido_de: "2000-01-01",
  valido_ate: validoAte,
  motivo: null,
  origem: "declarada",
  confirmada_por: null,
  confirmada_em: null,
  created_at: "2000-01-01T00:00:00Z",
  updated_at: "2000-01-01T00:00:00Z",
});
const colocacao = (id: string, validoAte: string | null) => ({
  id,
  pessoa_id: "p1",
  organization_id: "org",
  organograma_node_id: "n1",
  valido_de: "2000-01-01",
  valido_ate: validoAte,
  motivo: null,
  created_at: "2000-01-01T00:00:00Z",
  updated_at: "2000-01-01T00:00:00Z",
});

type Caso = {
  nome: string;
  chaveCorrigir: string;
  definir: (validoAte: string | null) => void;
  montar: (p: Permissoes) => void;
};

const montarAfectacoes = (Comp: ComponentType<any>) => (p: Permissoes) =>
  render(
    <Comp
      pessoaId="p1"
      organizationId="org"
      vinculoActivoId={null}
      locais={[{ id: "loc1", nome: "Centro A", activo: true }]}
      locaisALoad={false}
      podeVer
      {...p}
    />,
  );
const montarColocacao = (Comp: ComponentType<any>) => (p: Permissoes) =>
  render(<Comp pessoaId="p1" organizationId="org" podeVer {...p} />);

const CASOS: Caso[] = [
  {
    nome: "hr › Afectações",
    chaveCorrigir: "hr.afectacoes.corrigir",
    definir: (v) => (estado.afectacoes = [afectacao("a1", v)]),
    montar: montarAfectacoes(AfectacoesHr),
  },
  {
    nome: "rh-exemplo › Afectações",
    chaveCorrigir: "hr.afectacoes.corrigir",
    definir: (v) => (estado.afectacoes = [afectacao("a1", v)]),
    montar: montarAfectacoes(AfectacoesExemplo),
  },
  {
    nome: "hr › Colocação no organograma",
    chaveCorrigir: "hr.colocacao.corrigir",
    definir: (v) => (estado.colocacoes = [colocacao("c1", v)]),
    montar: montarColocacao(ColocacaoHr),
  },
  {
    nome: "rh-exemplo › Colocação no organograma",
    chaveCorrigir: "hr.colocacao.corrigir",
    definir: (v) => (estado.colocacoes = [colocacao("c1", v)]),
    montar: montarColocacao(ColocacaoExemplo),
  },
];

const SO_CORRIGIR: Permissoes = { podeEditar: false, podeCorrigir: true };
const AS_DUAS: Permissoes = { podeEditar: true, podeCorrigir: true };

const botaoCorrigir = (chave: string) => screen.queryByRole("button", { name: chave });

beforeEach(() => {
  estado.afectacoes = [];
  estado.colocacoes = [];
  estado.corrigirResposta = null;
  estado.corrigir.mockReset();
  estado.corrigir.mockImplementation(async () => estado.corrigirResposta);
  toast.success.mockReset();
  toast.error.mockReset();
});

describe.each(CASOS)("E6-2 — $nome", ({ chaveCorrigir, definir, montar }) => {
  it("só com corrigir: sem «Corrigir» numa linha fechada no futuro (ainda em vigor)", () => {
    definir(FUTURO);
    montar(SO_CORRIGIR);
    expect(botaoCorrigir(chaveCorrigir)).toBeNull();
  });

  it("só com corrigir: sem «Corrigir» numa linha que termina hoje (a base só a dá por decorrida amanhã)", () => {
    definir(HOJE);
    montar(SO_CORRIGIR);
    expect(botaoCorrigir(chaveCorrigir)).toBeNull();
  });

  it("só com corrigir: «Corrigir» aparece numa linha que já decorreu", () => {
    definir(PASSADO);
    montar(SO_CORRIGIR);
    expect(botaoCorrigir(chaveCorrigir)).not.toBeNull();
  });

  it("com edit e corrigir nada muda: «Corrigir» continua na linha fechada no futuro e na decorrida", () => {
    definir(FUTURO);
    montar(AS_DUAS);
    expect(botaoCorrigir(chaveCorrigir)).not.toBeNull();
  });

  it("0 linhas gravadas: mostra a recusa do hook, nunca «Alterações guardadas»", async () => {
    definir(PASSADO);
    estado.corrigirResposta = "Não foi gravado: não tem permissão para esta alteração (exige x).";
    montar(SO_CORRIGIR);
    fireEvent.click(botaoCorrigir(chaveCorrigir)!);
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "employees.form.update" }));
    await waitFor(() => expect(estado.corrigir).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(estado.corrigirResposta));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
