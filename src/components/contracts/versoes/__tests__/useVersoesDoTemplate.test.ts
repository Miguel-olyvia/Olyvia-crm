import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVersoesDoTemplate } from "../useVersoesDoTemplate";

interface Form {
  name: string;
  language?: string | null;
  body_html: string;
  doc_settings: Record<string, unknown> | null;
}

const CORPO_PT = "<h2>CONTRATO</h2><p>Texto em português.</p>";

function inicial(extra: Partial<Form> = {}): Form {
  return {
    name: "Minuta",
    language: "pt",
    body_html: CORPO_PT,
    doc_settings: { primary_color: "#112233", contract_block_title: "CONTRATO", footer_text: "Rodapé PT", extra: { a: 1 } },
    ...extra,
  };
}

function montar(f: Form = inicial()) {
  return renderHook(() => {
    const [formData, setFormData] = useState<Form>(f);
    return { formData, v: useVersoesDoTemplate(formData, setFormData) };
  });
}

describe("useVersoesDoTemplate sem versões", () => {
  it("o idioma ativo é o base, a barra está escondida e os dados passam intactos", () => {
    const { result } = montar();
    const { v, formData } = result.current;
    expect(v.base).toBe("pt");
    expect(v.ativo).toBe("pt");
    expect(v.ehBase).toBe(true);
    expect(v.versoes).toEqual([]);
    expect(v.mostrarBarra).toBe(false);
    expect(v.corpo).toBe(CORPO_PT);
    expect(v.settings).toBe(formData.doc_settings);
    expect(v.preview.body_html).toBe(CORPO_PT);
    expect(v.preview.doc_settings).toBe(formData.doc_settings);
    expect(v.linhas).toEqual([]);
  });

  it("editar corpo e settings escreve como sempre, sem criar a chave versions", () => {
    const { result } = montar();
    act(() => result.current.v.setCorpo("<p>novo</p>"));
    act(() => result.current.v.setSettings({ ...result.current.formData.doc_settings, primary_color: "#000000" }));
    expect(result.current.formData.body_html).toBe("<p>novo</p>");
    expect(result.current.formData.doc_settings).toEqual({ primary_color: "#000000", contract_block_title: "CONTRATO", footer_text: "Rodapé PT", extra: { a: 1 } });
    expect(result.current.formData.doc_settings).not.toHaveProperty("versions");
  });

  it("duas edições seguidas no mesmo ciclo não se perdem uma à outra", () => {
    const { result } = montar();
    act(() => {
      result.current.v.setCorpo("<p>a</p>");
      result.current.v.setSettings({ footer_text: "X" });
    });
    expect(result.current.formData.body_html).toBe("<p>a</p>");
    expect(result.current.formData.doc_settings).toEqual({ footer_text: "X" });
  });

  it("não mexe nos outros campos do formulário", () => {
    const { result } = montar();
    act(() => result.current.v.setCorpo("<p>a</p>"));
    expect(result.current.formData.name).toBe("Minuta");
    expect(result.current.formData.language).toBe("pt");
  });

  it("sem language no formulário o base é o português", () => {
    const { result } = montar(inicial({ language: undefined }));
    expect(result.current.v.base).toBe("pt");
  });
});

describe("adicionar idioma", () => {
  it("abrir e fechar o painel mostra e esconde a barra sem tocar nos dados", () => {
    const { result } = montar();
    const antes = result.current.formData;
    act(() => result.current.v.abrirAdicionar());
    expect(result.current.v.mostrarBarra).toBe(true);
    expect(result.current.v.adicionando).toBe(true);
    act(() => result.current.v.fecharAdicionar());
    expect(result.current.v.mostrarBarra).toBe(false);
    expect(result.current.formData).toBe(antes);
  });

  it("adicionar com cópia cria a versão, passa para ela e fecha o painel", () => {
    const { result } = montar();
    act(() => result.current.v.abrirAdicionar());
    act(() => result.current.v.adicionar("en", true));
    const { v, formData } = result.current;
    expect(formData.doc_settings).toHaveProperty("versions.en.body_html", CORPO_PT);
    expect(formData.doc_settings).toHaveProperty("extra", { a: 1 });
    expect(v.ativo).toBe("en");
    expect(v.ehBase).toBe(false);
    expect(v.adicionando).toBe(false);
    expect(v.mostrarBarra).toBe(true);
    expect(v.versoes).toEqual(["en"]);
    expect(v.faltamAdicionar).toEqual(["es", "fr"]);
  });

  it("um código inválido não cria nada nem troca de idioma", () => {
    const { result } = montar();
    const antes = result.current.formData;
    act(() => result.current.v.adicionar("xx", true));
    expect(result.current.formData).toBe(antes);
    expect(result.current.v.ativo).toBe("pt");
  });
});

describe("com uma versão ativa", () => {
  function comEn() {
    const r = montar();
    act(() => r.result.current.v.adicionar("en", true));
    return r;
  }

  it("o corpo e os textos editados vão para a versão; o base fica", () => {
    const { result } = comEn();
    act(() => result.current.v.setCorpo("<h2>CONTRACT</h2>"));
    act(() => result.current.v.setSettings({ ...(result.current.v.settings as object), footer_text: "Footer EN" }));
    expect(result.current.formData.body_html).toBe(CORPO_PT);
    expect(result.current.formData.doc_settings).toHaveProperty("footer_text", "Rodapé PT");
    expect(result.current.formData.doc_settings).toHaveProperty("versions.en.body_html", "<h2>CONTRACT</h2>");
    expect(result.current.formData.doc_settings).toHaveProperty("versions.en.footer_text", "Footer EN");
    expect(result.current.v.corpo).toBe("<h2>CONTRACT</h2>");
    expect((result.current.v.settings as Record<string, unknown>).footer_text).toBe("Footer EN");
  });

  it("a pré-visualização usa o texto e os rótulos da versão", () => {
    const { result } = comEn();
    act(() => result.current.v.setCorpo("<h2>CONTRACT</h2>"));
    act(() => result.current.v.setSettings({ ...(result.current.v.settings as object), contract_block_title: "CONTRACT" }));
    expect(result.current.v.preview.body_html).toBe("<h2>CONTRACT</h2>");
    expect(result.current.v.preview.doc_settings).toMatchObject({ contract_block_title: "CONTRACT", primary_color: "#112233" });
  });

  it("uma versão ainda sem texto pré-visualiza vazio (não o português)", () => {
    const r = montar();
    act(() => r.result.current.v.adicionar("en", false));
    expect(r.result.current.v.preview.body_html).toBe("");
  });

  it("passar para o base e voltar", () => {
    const { result } = comEn();
    act(() => result.current.v.definirAtivo("pt"));
    expect(result.current.v.ativo).toBe("pt");
    expect(result.current.v.corpo).toBe(CORPO_PT);
    act(() => result.current.v.definirAtivo("en"));
    expect(result.current.v.ativo).toBe("en");
  });

  it("um idioma sem versão não passa a ser o ativo", () => {
    const { result } = comEn();
    act(() => result.current.v.definirAtivo("fr"));
    expect(result.current.v.ativo).toBe("en");
  });

  it("remover a versão ativa volta ao base e apaga a chave versions", () => {
    const { result } = comEn();
    act(() => result.current.v.remover("en"));
    expect(result.current.v.ativo).toBe("pt");
    expect(result.current.v.mostrarBarra).toBe(false);
    expect(result.current.formData.doc_settings).not.toHaveProperty("versions");
    expect(result.current.formData.doc_settings).toHaveProperty("extra", { a: 1 });
  });

  it("completudes dizem quantos textos faltam e se o base mudou", () => {
    const { result } = comEn();
    expect(result.current.v.completudes.en).toMatchObject({ porTraduzir: 3, completo: false, desatualizado: false });
    act(() => result.current.v.definirAtivo("pt"));
    act(() => result.current.v.setCorpo(`${CORPO_PT}<p>nova cláusula</p>`));
    expect(result.current.v.completudes.en.desatualizado).toBe(true);
    act(() => result.current.v.marcarRevisto("en"));
    expect(result.current.v.completudes.en.desatualizado).toBe(false);
  });

  it("a lista de verificação é a do idioma ativo", () => {
    const { result } = comEn();
    expect(result.current.v.linhas.map((l) => l.chave)).toEqual(["corpo", "titulo_cabecalho", "rodape"]);
    act(() => result.current.v.definirAtivo("pt"));
    expect(result.current.v.linhas).toEqual([]);
  });

  it("reiniciar volta ao base e fecha o painel de adicionar", () => {
    const { result } = comEn();
    act(() => result.current.v.abrirAdicionar());
    act(() => result.current.v.reiniciar());
    expect(result.current.v.ativo).toBe("pt");
    expect(result.current.v.adicionando).toBe(false);
  });
});

describe("memos só dependem do que importa", () => {
  it("mudar um campo que não é corpo, doc_settings nem language não recalcula o que o hook devolve", () => {
    const r = renderHook(() => {
      const [formData, setFormData] = useState<Form>(inicial());
      return { setFormData, v: useVersoesDoTemplate(formData, setFormData) };
    });
    act(() => r.result.current.v.adicionar("en", true));
    const antes = r.result.current.v;
    act(() => r.result.current.setFormData((fd) => ({ ...fd, name: "Outro nome" })));
    const depois = r.result.current.v;
    expect(depois.completudes).toBe(antes.completudes);
    expect(depois.linhas).toBe(antes.linhas);
    expect(depois.preview).toBe(antes.preview);
    expect(depois.versoes).toBe(antes.versoes);
    expect(depois.faltamAdicionar).toBe(antes.faltamAdicionar);
  });
});

describe("texto base noutro idioma", () => {
  it("com language=en o base é o inglês e o português passa a ser uma versão possível", () => {
    const { result } = montar(inicial({ language: "en" }));
    expect(result.current.v.base).toBe("en");
    expect(result.current.v.faltamAdicionar).toEqual(["pt", "es", "fr"]);
  });
});
