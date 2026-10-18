// Encerrar a abordagem de uma pessoa (sem interesse, ou obra inviável): fica o resultado e o motivo na pessoa, NÃO se cria negócio, e
// reativa-se. Substitui "perder a pessoa". Lista fixa de motivos mais "Outro" com texto livre (decisão por defeito).
import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { encerrarAbordagem, MAX_MOTIVO_OUTRO, MOTIVOS_ENCERRAMENTO, reativarAbordagem, type DadosEncerramento } from "./acoesEncerrar";
import { ATIVIDADE_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { EstadoPessoas, Pessoa } from "./pessoasTipos";

const HOJE = HOJE_EXEMPLO;
const estado = (pessoas: Pessoa[] = PESSOAS_EXEMPLO): EstadoPessoas => ({
  submissoes: [], notas: [], pessoas, atividade: [...ATIVIDADE_EXEMPLO], contactadas: [],
});
const alvo = PESSOAS_EXEMPLO.find((p) => p.id === "pv-duarte")!;
const dados = (parcial: Partial<DadosEncerramento> = {}): DadosEncerramento => ({ resultado: "semInteresse", motivo: "preco", hoje: HOJE, ...parcial });
const de = (e: EstadoPessoas, id = alvo.id) => e.pessoas.find((p) => p.id === id)!;

describe("encerrarAbordagem", () => {
  it("guarda resultado, motivo e dia na pessoa e tira o próximo contacto", () => {
    const novo = encerrarAbordagem(estado(), alvo.id, dados({ resultado: "obraInviavel", motivo: "adiou" }));
    expect(de(novo).encerrada).toEqual({ resultado: "obraInviavel", motivo: "adiou", data: HOJE });
    expect(de(novo).proximoContacto).toBeNull();
  });

  it("NÃO cria negócio nem pedido e não mexe nas outras pessoas", () => {
    const antes = estado();
    const novo = encerrarAbordagem(antes, alvo.id, dados());
    expect(novo.pessoas.filter((p) => p.id !== alvo.id)).toEqual(antes.pessoas.filter((p) => p.id !== alvo.id));
    expect(Object.keys(novo).sort()).toEqual(Object.keys(antes).sort());
  });

  it("não marca a pessoa como perdida (é outro estado)", () => {
    expect(de(encerrarAbordagem(estado(), alvo.id, dados())).perdida).toBeUndefined();
  });

  it("acrescenta uma linha à atividade, com o resultado e o motivo como chaves de tradução", () => {
    const antes = estado();
    const novo = encerrarAbordagem(antes, alvo.id, dados({ motivo: "semResposta" }));
    expect(novo.atividade).toHaveLength(antes.atividade.length + 1);
    expect(novo.atividade[0]).toMatchObject({
      pessoaId: alvo.id, tipo: "historico", chaveTitulo: "pessoasPagina.close.activity.closed", chaveDetalhe: "pessoasPagina.lost.semResposta",
      quando: HOJE, exemplo: false,
    });
  });

  it("'Outro' pede texto livre: guarda-o aparado e mostra-o na atividade", () => {
    const novo = encerrarAbordagem(estado(), alvo.id, dados({ motivo: "outro", motivoOutro: "  Mudou-se para o estrangeiro  " }));
    expect(de(novo).encerrada).toEqual({ resultado: "semInteresse", motivo: "outro", motivoOutro: "Mudou-se para o estrangeiro", data: HOJE });
    expect(novo.atividade[0]).toMatchObject({ detalhe: "Mudou-se para o estrangeiro", chaveDetalhe: undefined });
  });

  it.each([["vazio", ""], ["só espaços", "   "], ["em falta", undefined], ["demasiado comprido", "x".repeat(MAX_MOTIVO_OUTRO + 1)]])(
    "'Outro' com o texto %s não se aplica", (_nome, texto) => {
      const antes = estado();
      expect(encerrarAbordagem(antes, alvo.id, dados({ motivo: "outro", motivoOutro: texto }))).toBe(antes);
    },
  );

  it("com um motivo da lista, o texto livre é ignorado (não fica guardado)", () => {
    const novo = encerrarAbordagem(estado(), alvo.id, dados({ motivo: "preco", motivoOutro: "lixo" }));
    expect(de(novo).encerrada).not.toHaveProperty("motivoOutro");
  });

  it("um motivo que não está na lista não se aplica", () => {
    const antes = estado();
    expect(encerrarAbordagem(antes, alvo.id, dados({ motivo: "inventado" as never }))).toBe(antes);
    expect(encerrarAbordagem(antes, alvo.id, dados({ resultado: "outro" as never }))).toBe(antes);
  });

  it("uma pessoa que não existe, já encerrada, perdida, ou com negócio aberto fica como está", () => {
    const antes = estado();
    expect(encerrarAbordagem(antes, "nao-existe", dados())).toBe(antes);
    const encerrada = encerrarAbordagem(antes, alvo.id, dados());
    expect(encerrarAbordagem(encerrada, alvo.id, dados({ motivo: "adiou" }))).toBe(encerrada);
    const perdida = estado([{ ...alvo, perdida: { motivo: "preco", data: HOJE } }]);
    expect(encerrarAbordagem(perdida, alvo.id, dados())).toBe(perdida);
    expect(encerrarAbordagem(antes, alvo.id, dados({ temNegocioAberto: true }))).toBe(antes);
  });

  it("os 6 motivos (os 5 da lista de perda e 'outro') têm texto em português", () => {
    expect(MOTIVOS_ENCERRAMENTO).toEqual(["preco", "adiou", "outraEmpresa", "semResposta", "naoProcurava", "outro"]);
    for (const m of MOTIVOS_ENCERRAMENTO) {
      const chave = m === "outro" ? "pessoasPagina.close.reason.other" : `pessoasPagina.lost.${m}`;
      expect(pessoasPaginaTranslations.pt[chave], chave).toBeTruthy();
    }
  });
});

describe("reativarAbordagem", () => {
  const encerrada = () => encerrarAbordagem(estado(), alvo.id, dados());

  it("limpa o encerramento, marca o próximo contacto para amanhã e regista na atividade", () => {
    const antes = encerrada();
    const novo = reativarAbordagem(antes, alvo.id, HOJE);
    expect(de(novo)).not.toHaveProperty("encerrada");
    expect(de(novo).proximoContacto).toBe("2026-10-14");
    expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.close.activity.reopened", chaveDetalhe: "pessoasPagina.lost.preco", quando: HOJE });
    expect(novo.atividade).toHaveLength(antes.atividade.length + 1);
  });

  it("uma pessoa que não está encerrada, ou não existe, fica como está", () => {
    const e = estado();
    expect(reativarAbordagem(e, alvo.id, HOJE)).toBe(e);
    expect(reativarAbordagem(e, "nao-existe", HOJE)).toBe(e);
  });

  it("depois de reativada pode voltar a encerrar-se", () => {
    const outra = encerrarAbordagem(reativarAbordagem(encerrada(), alvo.id, HOJE), alvo.id, dados({ resultado: "obraInviavel", motivo: "naoProcurava" }));
    expect(de(outra).encerrada).toMatchObject({ resultado: "obraInviavel", motivo: "naoProcurava" });
  });

  it("reativar uma encerrada por 'Outro' escreve o texto livre na atividade", () => {
    const e = encerrarAbordagem(estado(), alvo.id, dados({ motivo: "outro", motivoOutro: "Sem orçamento" }));
    expect(reativarAbordagem(e, alvo.id, HOJE).atividade[0]).toMatchObject({ detalhe: "Sem orçamento" });
  });
});
