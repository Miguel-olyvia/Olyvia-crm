import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));

import { VariaveisDoTemplate } from "../VariaveisDoTemplate";
import { trocarPagamentoPelaVariavel } from "@/lib/textoDaProposta";

const DONO = "Termos e condições\n1. Esta proposta é válida pelo período indicado.\n2. Os valores apresentados incluem IVA à taxa legal em vigor.\n3. Condições de Pagamento: 50% - Adjudicação / 25% - Início da Obra / 25% - Fim da Obra";

describe("VariaveisDoTemplate", () => {
  it("lista as variáveis e insere a escolhida no fim dos termos", () => {
    const mudar = vi.fn();
    render(<VariaveisDoTemplate termos="1. a" aoMudarTermos={mudar} />);
    expect(screen.getByText("Variáveis do negócio")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Inserir {{condicoes_pagamento}} nos termos" }));
    expect(mudar).toHaveBeenCalledWith("1. a {{condicoes_pagamento}}");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("avisa que o pagamento está escrito à mão e troca-o pela variável (só no editor)", () => {
    const mudar = vi.fn();
    render(<VariaveisDoTemplate termos={DONO} aoMudarTermos={mudar} />);
    expect(screen.getByRole("status").textContent).toContain("escritas à mão");
    fireEvent.click(screen.getByRole("button", { name: "Trocar por {{condicoes_pagamento}}" }));
    expect(mudar).toHaveBeenCalledWith(DONO.replace("50% - Adjudicação / 25% - Início da Obra / 25% - Fim da Obra", "{{condicoes_pagamento}}"));
  });

  it("com a variável já posta, não avisa", () => {
    render(<VariaveisDoTemplate termos="3. Condições de Pagamento: {{condicoes_pagamento}}" aoMudarTermos={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("trocarPagamentoPelaVariavel", () => {
  it("só troca a linha «Condições de pagamento: …» com percentagens", () => {
    expect(trocarPagamentoPelaVariavel("<p>Condições de pagamento: 100% na adjudicação</p>")).toBe("<p>Condições de pagamento: {{condicoes_pagamento}}</p>");
    expect(trocarPagamentoPelaVariavel("Pagamento a 30 dias")).toBeNull();
  });
});
