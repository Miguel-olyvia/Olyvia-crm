/**
 * Passo "Detalhes pessoais" do formulario Nova pessoa, fase 1: tem TODOS os
 * campos do convite de admissao.
 *
 * O que se prova aqui, pelo que o utilizador ve e escreve:
 *  - os campos novos existem e escrevem no rascunho;
 *  - a situacao do conjuge so aparece com casado ou uniao de facto;
 *  - o detalhe de um tamanho so aparece com 'outro';
 *  - titular e banco so ficam activos com IBAN/conta preenchida, e dizem porque;
 *  - sem permissao de editar dados bancarios, a seccao do banco fica
 *    desactivada com a explicacao (nada se perde em silencio);
 *  - os obrigatorios da configuracao pintam o campo novo.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));

// O seletor de paises vai a base; aqui basta um campo que escreva o codigo.
vi.mock("@/components/CountrySelect", () => ({
  CountrySelect: ({
    id,
    value,
    disabled,
    onChange,
  }: {
    id: string;
    value: string;
    disabled?: boolean;
    onChange: (codigo: string) => void;
  }) => (
    <input
      id={id}
      data-testid={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { SeccaoDetalhesPessoais } from "@/components/hr/form/SeccaoDetalhesPessoais";
import { rascunhoInicial, type RascunhoPessoais } from "@/lib/hr/novaPessoa";

interface ExtraDaSeccao {
  obrigatorios?: ReadonlySet<string>;
  podeEditarBancarios?: boolean;
  podeEditarFardamento?: boolean;
  podeEditarIdentificacao?: boolean;
  erroDe?: (campoId: string) => string | null;
  focoPedido?: { campoId: string; n: number } | null;
}

function montar(patchDoValor: Partial<RascunhoPessoais> = {}, extra: ExtraDaSeccao = {}) {
  const onPatch = vi.fn();
  const valor: RascunhoPessoais = { ...rascunhoInicial().pessoais, ...patchDoValor };
  const ecra = (mais: ExtraDaSeccao) => (
    <SeccaoDetalhesPessoais
      valor={valor}
      onPatch={onPatch}
      erroDe={() => null}
      {...extra}
      {...mais}
    />
  );
  const { rerender } = render(ecra({}));
  return { onPatch, rerender: (mais: ExtraDaSeccao) => rerender(ecra(mais)) };
}

function abrirBanco() {
  fireEvent.click(screen.getByRole("button", { name: /hr\.pessoais\.bancarios/ }));
}

describe("SeccaoDetalhesPessoais: campos novos", () => {
  it("dependentes com deficiencia, naturalidade, habilitacao e carta escrevem no rascunho", () => {
    const { onPatch } = montar();

    fireEvent.change(screen.getByLabelText("hr.campos.dependentesDeficientes"), {
      target: { value: "2" },
    });
    expect(onPatch).toHaveBeenLastCalledWith({ dependentes_deficientes: "2" });

    fireEvent.change(screen.getByLabelText("hr.campos.naturalidadeFreguesia"), {
      target: { value: "Se" },
    });
    expect(onPatch).toHaveBeenLastCalledWith({ naturalidade_freguesia: "Se" });

    fireEvent.change(screen.getByLabelText("hr.campos.naturalidadeConcelho"), {
      target: { value: "Porto" },
    });
    expect(onPatch).toHaveBeenLastCalledWith({ naturalidade_concelho: "Porto" });

    fireEvent.change(screen.getByTestId("hr-novo-naturalidade-pais"), { target: { value: "PT" } });
    expect(onPatch).toHaveBeenLastCalledWith({ naturalidade_pais: "PT" });

    fireEvent.change(screen.getByLabelText("hr.campos.habilitacaoDataConclusao"), {
      target: { value: "2012-07-01" },
    });
    expect(onPatch).toHaveBeenLastCalledWith({ habilitacao_data_conclusao: "2012-07-01" });

    fireEvent.change(screen.getByLabelText("hr.campos.cartaConducaoNumero"), {
      target: { value: "P-1" },
    });
    expect(onPatch).toHaveBeenLastCalledWith({ carta_conducao_numero: "P-1" });
    fireEvent.change(screen.getByLabelText("hr.campos.cartaConducaoCategorias"), {
      target: { value: "B, B1" },
    });
    expect(onPatch).toHaveBeenLastCalledWith({ carta_conducao_categorias: "B, B1" });
    fireEvent.change(screen.getByLabelText("hr.campos.cartaConducaoValidade"), {
      target: { value: "2031-05-04" },
    });
    expect(onPatch).toHaveBeenLastCalledWith({ carta_conducao_validade: "2031-05-04" });
  });

  it("os dependentes com deficiencia aceitam so 0 a 30", () => {
    montar();
    const campo = screen.getByLabelText("hr.campos.dependentesDeficientes");
    expect(campo).toHaveAttribute("type", "number");
    expect(campo).toHaveAttribute("min", "0");
    expect(campo).toHaveAttribute("max", "30");
  });

  it("habilitacao e os tres tamanhos tem o seu seletor", () => {
    montar();
    expect(screen.getByLabelText("hr.campos.habilitacaoAcademica")).toBeInTheDocument();
    expect(screen.getByLabelText("hr.fardamento.tamanhoCima")).toBeInTheDocument();
    expect(screen.getByLabelText("hr.fardamento.tamanhoBaixo")).toBeInTheDocument();
    expect(screen.getByLabelText("hr.fardamento.tamanhoCalcado")).toBeInTheDocument();
  });

  it("o campo novo pedido pela configuracao leva o 'obrigatorio'", () => {
    montar({}, { obrigatorios: new Set(["naturalidade_concelho", "tamanho_calcado"]) });
    expect(screen.getByLabelText(/hr\.campos\.naturalidadeConcelho/)).toBeRequired();
    expect(screen.getByLabelText(/hr\.fardamento\.tamanhoCalcado/)).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText("hr.campos.naturalidadeFreguesia")).not.toBeRequired();
  });
});

describe("SeccaoDetalhesPessoais: situacao do conjuge", () => {
  it.each(["casado", "uniao_de_facto"] as const)("aparece com estado civil %s", (estado) => {
    montar({ estado_civil: estado });
    expect(screen.getByLabelText("hr.campos.conjugeSituacaoProfissional")).toBeInTheDocument();
  });

  it.each(["", "solteiro", "divorciado", "viuvo", "separado"] as const)(
    "nao aparece com estado civil '%s'",
    (estado) => {
      montar({ estado_civil: estado });
      expect(screen.queryByLabelText("hr.campos.conjugeSituacaoProfissional")).not.toBeInTheDocument();
    },
  );
});

describe("SeccaoDetalhesPessoais: detalhe do tamanho so com 'outro'", () => {
  it("com tamanhos normais nao ha detalhe nenhum", () => {
    montar({ tamanho_cima: "m", tamanho_baixo: "40", tamanho_calcado: "42" });
    expect(screen.queryByLabelText("hr.fardamento.detalhe")).not.toBeInTheDocument();
  });

  it("com 'outro' aparece o detalhe desse tamanho, e escreve no seu campo", () => {
    const { onPatch } = montar({ tamanho_baixo: "outro" });
    const detalhe = screen.getByLabelText("hr.fardamento.detalhe");
    expect(detalhe).toHaveAttribute("id", "hr-novo-tamanho-baixo-detalhe");
    fireEvent.change(detalhe, { target: { value: "62" } });
    expect(onPatch).toHaveBeenLastCalledWith({ tamanho_baixo_detalhe: "62" });
  });

  it("cada tamanho tem o seu detalhe independente", () => {
    montar({ tamanho_cima: "outro", tamanho_calcado: "outro", tamanho_baixo: "36" });
    expect(screen.getAllByLabelText("hr.fardamento.detalhe").map((e) => e.id)).toEqual([
      "hr-novo-tamanho-cima-detalhe",
      "hr-novo-tamanho-calcado-detalhe",
    ]);
  });
});

describe("SeccaoDetalhesPessoais: banco", () => {
  it("sem IBAN, titular e banco estao desactivados e dizem porque; o BIC e a conta nao", () => {
    montar();
    abrirBanco();

    expect(screen.getByLabelText("hr.campos.titularConta")).toBeDisabled();
    expect(screen.getByLabelText("hr.campos.banco")).toBeDisabled();
    expect(screen.getAllByText("hr.form.ajudaTitularBanco").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("hr.campos.iban")).toBeEnabled();
    expect(screen.getByLabelText("hr.campos.swift")).toBeEnabled();
  });

  it("com conta preenchida, titular e banco activam-se e escrevem no rascunho", () => {
    const { onPatch } = montar({ conta_numero: "PT50000201231234567890154" });
    abrirBanco();

    const titular = screen.getByLabelText("hr.campos.titularConta");
    const banco = screen.getByLabelText("hr.campos.banco");
    expect(titular).toBeEnabled();
    expect(banco).toBeEnabled();
    fireEvent.change(titular, { target: { value: "Ana Silva" } });
    expect(onPatch).toHaveBeenLastCalledWith({ conta_titular: "Ana Silva" });
    fireEvent.change(banco, { target: { value: "CGD" } });
    expect(onPatch).toHaveBeenLastCalledWith({ conta_banco: "CGD" });
  });

  it("uma conta so com espacos nao conta como conta", () => {
    montar({ conta_numero: "   " });
    abrirBanco();
    expect(screen.getByLabelText("hr.campos.titularConta")).toBeDisabled();
  });

  it("sem permissao de editar dados bancarios, a seccao toda fica desactivada, com a explicacao", () => {
    montar(
      { conta_numero: "PT50000201231234567890154" },
      { podeEditarBancarios: false },
    );
    abrirBanco();

    for (const rotulo of [
      "hr.campos.iban",
      "hr.campos.swift",
      "hr.campos.titularConta",
      "hr.campos.banco",
      "hr.campos.formatoConta",
    ]) {
      expect(screen.getByLabelText(rotulo)).toBeDisabled();
    }
    expect(screen.getByText("hr.form.semPermissaoBancarios")).toBeInTheDocument();
  });

  it("com permissao (por omissao) nao ha aviso de falta de permissao", () => {
    montar();
    abrirBanco();
    expect(screen.queryByText("hr.form.semPermissaoBancarios")).not.toBeInTheDocument();
  });
});

describe("SeccaoDetalhesPessoais: blocos recolhiveis abrem sozinhos quando ha o que preencher", () => {
  const ID_MORADA = "hr-novo-morada-linha1";
  const ID_CONTA = "hr-novo-conta-numero";

  it("por omissao morada e banco estao fechados (os campos nem existem no DOM)", () => {
    montar();
    expect(document.getElementById(ID_MORADA)).toBeNull();
    expect(document.getElementById(ID_CONTA)).toBeNull();
  });

  it("um obrigatorio da morada por preencher abre a morada, e so a morada", () => {
    montar({}, { obrigatorios: new Set(["linha1"]) });
    expect(document.getElementById(ID_MORADA)).not.toBeNull();
    expect(document.getElementById(ID_CONTA)).toBeNull();
  });

  it("o mesmo obrigatorio, ja preenchido, nao obriga a abrir", () => {
    montar({ morada_linha1: "Rua A" }, { obrigatorios: new Set(["linha1"]) });
    expect(document.getElementById(ID_MORADA)).toBeNull();
  });

  it("um erro num campo do banco abre o banco", () => {
    montar({ conta_numero: "123" }, { erroDe: (id) => (id === ID_CONTA ? "hr.form.erroIban" : null) });
    expect(document.getElementById(ID_CONTA)).not.toBeNull();
    expect(document.getElementById("hr-novo-morada-linha1")).toBeNull();
  });

  it("um obrigatorio do banco por preencher abre o banco", () => {
    montar({}, { obrigatorios: new Set(["conta_numero"]) });
    expect(document.getElementById(ID_CONTA)).not.toBeNull();
  });

  it("titular obrigatorio sem numero de conta nao abre o banco nem leva asterisco", () => {
    montar({}, { obrigatorios: new Set(["conta_titular"]) });
    expect(document.getElementById(ID_CONTA)).toBeNull();
    abrirBanco();
    expect(screen.getByLabelText("hr.campos.titularConta")).not.toBeRequired();
  });

  it("titular obrigatorio com numero de conta leva o 'obrigatorio'", () => {
    montar({ conta_numero: "PT50000201231234567890154" }, { obrigatorios: new Set(["conta_titular"]) });
    expect(screen.getByLabelText(/hr\.campos\.titularConta/)).toBeRequired();
  });

  it("um pedido de foco num campo de um bloco fechado abre o bloco", () => {
    const { rerender } = montar();
    expect(document.getElementById(ID_MORADA)).toBeNull();
    rerender({ focoPedido: { campoId: ID_MORADA, n: 1 } });
    expect(document.getElementById(ID_MORADA)).not.toBeNull();
  });

  it("um segundo pedido reabre o bloco que o utilizador fechou entretanto", () => {
    const { rerender } = montar({}, { focoPedido: { campoId: ID_MORADA, n: 1 } });
    expect(document.getElementById(ID_MORADA)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /hr\.pessoais\.endereco/ }));
    expect(document.getElementById(ID_MORADA)).toBeNull();
    rerender({ focoPedido: { campoId: ID_MORADA, n: 2 } });
    expect(document.getElementById(ID_MORADA)).not.toBeNull();
  });

  it("um pedido de foco fora dos blocos nao abre nada", () => {
    montar({}, { focoPedido: { campoId: "hr-novo-nif", n: 1 } });
    expect(document.getElementById(ID_MORADA)).toBeNull();
    expect(document.getElementById(ID_CONTA)).toBeNull();
  });
});

describe("SeccaoDetalhesPessoais: sem hr.pessoas.laborais.edit (fardamento)", () => {
  const TAMANHOS = ["hr.fardamento.tamanhoCima", "hr.fardamento.tamanhoBaixo", "hr.fardamento.tamanhoCalcado"];

  it("com permissao (por omissao) os tamanhos estao activos e nao ha aviso", () => {
    montar();
    for (const rotulo of TAMANHOS) expect(screen.getByLabelText(rotulo)).toBeEnabled();
    expect(screen.queryByText("hr.form.semPermissaoFardamento")).not.toBeInTheDocument();
  });

  it("sem permissao os tres tamanhos ficam desactivados, com a explicacao", () => {
    montar({}, { podeEditarFardamento: false });
    for (const rotulo of TAMANHOS) expect(screen.getByLabelText(rotulo)).toBeDisabled();
    expect(screen.getByText("hr.form.semPermissaoFardamento")).toBeInTheDocument();
  });

  it("sem permissao, um tamanho obrigatorio nao leva asterisco (nao se exige o que nao se pode escrever)", () => {
    montar({}, { podeEditarFardamento: false, obrigatorios: new Set(["tamanho_cima"]) });
    expect(screen.getByLabelText("hr.fardamento.tamanhoCima")).not.toHaveAttribute("aria-required");
  });
});

describe("SeccaoDetalhesPessoais: sem hr.pessoas.identificacao.edit (carta de conducao)", () => {
  const CARTA = [
    "hr.campos.cartaConducaoNumero",
    "hr.campos.cartaConducaoCategorias",
    "hr.campos.cartaConducaoValidade",
  ];

  it("com permissao (por omissao) a carta esta activa e nao ha aviso", () => {
    montar();
    for (const rotulo of CARTA) expect(screen.getByLabelText(rotulo)).toBeEnabled();
    expect(screen.queryByText("hr.form.semPermissaoIdentificacao")).not.toBeInTheDocument();
  });

  it("sem permissao os tres campos da carta ficam desactivados, com a explicacao", () => {
    montar({}, { podeEditarIdentificacao: false });
    for (const rotulo of CARTA) expect(screen.getByLabelText(rotulo)).toBeDisabled();
    expect(screen.getByText("hr.form.semPermissaoIdentificacao")).toBeInTheDocument();
  });
});
