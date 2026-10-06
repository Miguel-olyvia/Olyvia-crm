/**
 * `PessoaConviteAdmissaoEstado`: o cartao persistente do convite, na ficha.
 *
 * O que fecha:
 *  - cada estado diz o que o RH precisa de saber (enviado, sem e-mail,
 *    preenchido, expirado, bloqueado);
 *  - "Reenviar" so aparece quando serve: e-mail falhado, expirado ou
 *    bloqueado, e so a quem pode enviar;
 *  - um convite substituido, a falta de convite e a falta de permissao nao
 *    desenham cartao nenhum;
 *  - uma recusa por NIF/NISS ja registado diz QUE ficha o tem e abre-a;
 *  - a forma que a RPC devolve (`revogado`, `usado_em`, `existe: false`) e
 *    normalizada para a do ecra.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const TEXTOS: Record<string, string> = {
  "hr.convite.estado.titulo": "Convite de admissão",
  "hr.convite.estado.pendente": "Enviado para {{email}} - válido até {{data}}",
  "hr.convite.estado.pendenteSemEmail": "Email não enviado - o link é válido até {{data}}",
  "hr.convite.estado.usado": "Preenchido e assinado em {{data}}",
  "hr.convite.estado.expirado": "Expirou em {{data}}",
  "hr.convite.estado.bloqueado": "Bloqueado por demasiadas tentativas falhadas",
  "hr.convite.estado.desconhecido": "Nao foi possivel determinar o estado do convite.",
  "hr.convite.estado.recusaDuplicado":
    "A pessoa tentou submeter com um {{campo}} que já está na ficha de {{nome}}.",
  "hr.convite.estado.ultimaRecusa": "Última tentativa recusada: {{mensagem}}",
  "hr.convite.estado.abrirFicha": "Abrir ficha",
  "hr.convite.reenviar": "Reenviar",
  "hr.convite.emailNaoEnviadoBadge": "Email não enviado",
  "hr.convite.erro.nifInvalido": "O NIF não é válido. Verifique os números.",
  "hr.convite.erro.faltaPreencher": "Falta preencher: {{campos}}.",
  "hr.pendencias.campo.telefone_pessoal": "Telefone pessoal",
  "hr.campos.nif": "NIF",
  "hr.campos.niss": "NISS",
  "hr.convite.estado.erroCarregar": "Não foi possível carregar o estado do convite.",
  "hr.convite.estado.recusaOutraFicha": "outra ficha",
  "hr.convite.estado.conflitoIndisponivel": "Não foi possível identificar a ficha em conflito.",
  "hr.convite.detalheTecnico": "Detalhe técnico",
  "common.retry": "Tentar novamente",
};

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (chave: string, params?: Record<string, string | number>) => {
      let texto = TEXTOS[chave] ?? chave;
      Object.entries(params ?? {}).forEach(([k, v]) => {
        texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      });
      return texto;
    },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { PessoaConviteAdmissaoEstado } from "@/components/hr/PessoaConviteAdmissaoEstado";
import {
  resumoDaRpc,
  type EstadoConviteResumo,
  type ResumoConvite,
} from "@/hooks/useConviteAdmissaoResumo";

const BASE: ResumoConvite = {
  conviteId: "c1",
  estado: "pendente",
  emailDestino: "ana@exemplo.pt",
  criadoEm: "2026-11-01T09:00:00Z",
  validUntil: "2026-11-08T12:30:00Z",
  usadoEm: null,
  emailEnviado: true,
  emailErro: null,
  ultimaRecusa: null,
};

function estado(resumo: Partial<ResumoConvite> | null, extra?: Partial<EstadoConviteResumo>) {
  const completo: EstadoConviteResumo = {
    carregando: false,
    recarregando: false,
    conflitosIndisponiveis: false,
    semAcesso: false,
    erro: false,
    resumo: resumo === null ? null : { ...BASE, ...resumo },
    conflitos: [],
    recarregar: vi.fn(),
    ...extra,
  };
  return completo;
}

function montar(e: EstadoConviteResumo, podeEnviar = true) {
  const onReenviar = vi.fn();
  render(
    <MemoryRouter>
      <PessoaConviteAdmissaoEstado
        pessoaId="p1"
        podeEnviar={podeEnviar}
        onReenviar={onReenviar}
        estado={e}
      />
    </MemoryRouter>,
  );
  return { onReenviar };
}

describe("PessoaConviteAdmissaoEstado -- estado desconhecido", () => {
  it("diz que nao sabe o estado, sem inventar 'enviado' e sem oferecer reenviar", () => {
    montar(estado({ estado: "desconhecido" }));
    expect(screen.getByText("Nao foi possivel determinar o estado do convite.")).toBeInTheDocument();
    expect(screen.queryByText(/Enviado para/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reenviar" })).not.toBeInTheDocument();
  });

  it("mesmo com e-mail falhado, desconhecido nao oferece reenviar (reenviar revoga o convite que pode estar a meio)", () => {
    montar(estado({ estado: "desconhecido", emailEnviado: false }));
    expect(screen.queryByRole("button", { name: "Reenviar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Detalhe técnico")).not.toBeInTheDocument();
  });
});

describe("PessoaConviteAdmissaoEstado", () => {
  it("pendente com e-mail enviado diz a quem e ate quando, sem botao", () => {
    montar(estado({}));
    expect(screen.getByText(/Enviado para ana@exemplo.pt - válido até \d\d\/\d\d\/\d{4} \d\d:\d\d/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reenviar" })).not.toBeInTheDocument();
  });

  it("pendente com e-mail falhado avisa e oferece reenviar", () => {
    const { onReenviar } = montar(estado({ emailEnviado: false, emailErro: "SMTP em baixo" }));
    expect(screen.getByText(/Email não enviado - o link é válido até/)).toBeInTheDocument();
    expect(screen.getByText("SMTP em baixo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    expect(onReenviar).toHaveBeenCalledTimes(1);
  });

  it("e-mail por registar (null) nao se trata como falhado", () => {
    montar(estado({ emailEnviado: null }));
    expect(screen.queryByRole("button", { name: "Reenviar" })).not.toBeInTheDocument();
    expect(screen.getByText(/Enviado para/)).toBeInTheDocument();
  });

  it("usado diz quando foi preenchido e nao oferece reenviar", () => {
    montar(estado({ estado: "usado", usadoEm: "2026-11-02T10:15:00Z" }));
    expect(screen.getByText(/Preenchido e assinado em \d\d\/\d\d\/\d{4}/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reenviar" })).not.toBeInTheDocument();
  });

  it("expirado e bloqueado oferecem reenviar", () => {
    const expirado = render(
      <MemoryRouter>
        <PessoaConviteAdmissaoEstado
          pessoaId="p1"
          podeEnviar
          onReenviar={vi.fn()}
          estado={estado({ estado: "expirado" })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Expirou em/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeInTheDocument();
    expirado.unmount();

    montar(estado({ estado: "bloqueado" }));
    expect(screen.getByText("Bloqueado por demasiadas tentativas falhadas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeInTheDocument();
  });

  it("sem permissao para enviar nao ha botao, mesmo com e-mail falhado", () => {
    montar(estado({ emailEnviado: false }), false);
    expect(screen.queryByRole("button", { name: "Reenviar" })).not.toBeInTheDocument();
  });

  it("a recarregar com dados anteriores, o cartao fica (nao pisca a cada gravacao)", () => {
    montar(estado({}, { carregando: true }));
    expect(screen.getByText(/Enviado para ana@exemplo.pt/)).toBeInTheDocument();
  });

  it("uma falha a ler o estado NAO faz o cartao desaparecer: diz o que falhou e deixa tentar de novo", () => {
    const recarregar = vi.fn();
    montar(estado(null, { erro: true, recarregar }));

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o estado do convite.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("sem permissao a falha de leitura nao aparece (esconde-se so o que nao se pode ver)", () => {
    const { container } = render(
      <MemoryRouter>
        <PessoaConviteAdmissaoEstado
          pessoaId="p1"
          podeEnviar
          onReenviar={vi.fn()}
          estado={estado(null, { semAcesso: true, erro: true })}
        />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("a linha de estado e uma regiao anunciada (reenviar muda-a)", () => {
    montar(estado({}));
    expect(screen.getByRole("status")).toHaveTextContent(/Enviado para ana@exemplo.pt/);
  });

  it("o detalhe tecnico do e-mail falhado fica atras de um rotulo traduzido", () => {
    montar(estado({ emailEnviado: false, emailErro: "SMTP em baixo" }));
    expect(screen.getByText("Detalhe técnico")).toBeInTheDocument();
  });

  it("a recusa sem ficha identificada (nome vazio) nao deixa a frase partida", () => {
    montar(
      estado(
        { ultimaRecusa: { codigo: "nif_ja_existe", em: null, campos: [] } },
        { conflitos: [{ pessoaId: "p-outra", nome: "", campo: "nif", estado: "activa" }] },
      ),
    );
    expect(screen.getByText(/ficha de outra ficha\./)).toBeInTheDocument();
  });

  it("se a leitura da ficha em conflito falhou, di-lo em vez de ficar calado", () => {
    montar(
      estado(
        { ultimaRecusa: { codigo: "nif_ja_existe", em: null, campos: [] } },
        { conflitosIndisponiveis: true } as Partial<EstadoConviteResumo>,
      ),
    );
    expect(screen.getByText(/Não foi possível identificar a ficha em conflito\./)).toBeInTheDocument();
  });

  it("o selo de e-mail nao enviado tem variante escura", () => {
    montar(estado({ emailEnviado: false }));
    expect(screen.getByText("Email não enviado", { selector: "div" }).className).toContain("dark:text-amber-400");
  });

  it("convite substituido, sem convite, sem acesso ou a carregar pela primeira vez: nao desenha nada", () => {
    for (const e of [
      estado({ estado: "substituido" }),
      estado(null),
      estado({}, { semAcesso: true }),
      estado(null, { carregando: true }),
    ]) {
      const { container, unmount } = render(
        <MemoryRouter>
          <PessoaConviteAdmissaoEstado pessoaId="p1" podeEnviar onReenviar={vi.fn()} estado={e} />
        </MemoryRouter>,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("recusa por NIF ja registado diz que ficha e abre-a", () => {
    montar(
      estado(
        { ultimaRecusa: { codigo: "nif_ja_existe", em: "2026-11-03T08:00:00Z", campos: [] } },
        {
          conflitos: [{ pessoaId: "p-outra", nome: "Joana Pires", campo: "nif", estado: "activa" }],
        },
      ),
    );

    expect(
      screen.getByText(/tentou submeter com um NIF que já está na ficha de Joana Pires/),
    ).toBeInTheDocument();
    const ligacao = screen.getByRole("link", { name: "Abrir ficha" });
    expect(ligacao).toHaveAttribute("href", "/rh/pessoas/p-outra");
  });

  it("recusa por NISS escolhe a ficha do NISS, nao a do NIF", () => {
    montar(
      estado(
        { ultimaRecusa: { codigo: "niss_ja_existe", em: null, campos: [] } },
        {
          conflitos: [
            { pessoaId: "p-nif", nome: "Rui", campo: "nif", estado: "activa" },
            { pessoaId: "p-niss", nome: "Marta", campo: "niss", estado: "activa" },
          ],
        },
      ),
    );
    expect(screen.getByText(/NISS que já está na ficha de Marta/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir ficha" })).toHaveAttribute(
      "href",
      "/rh/pessoas/p-niss",
    );
  });

  it("outras recusas aparecem como texto traduzido, nunca como codigo", () => {
    montar(
      estado({
        ultimaRecusa: { codigo: "admissao_incompleta", em: null, campos: ["telefone_pessoal"] },
      }),
    );
    expect(
      screen.getByText("Última tentativa recusada: Falta preencher: Telefone pessoal."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/admissao_incompleta/)).not.toBeInTheDocument();
  });

  it("um convite ja usado nao mostra a ultima recusa", () => {
    montar(
      estado({
        estado: "usado",
        usadoEm: "2026-11-02T10:15:00Z",
        ultimaRecusa: { codigo: "nif_invalido", em: null, campos: [] },
      }),
    );
    expect(screen.queryByText(/Última tentativa recusada/)).not.toBeInTheDocument();
  });
});

describe("resumoDaRpc", () => {
  it("traduz a forma da base para a do ecra", () => {
    const resumo = resumoDaRpc({
      existe: true,
      convite_id: "c9",
      estado: "revogado",
      email_destino: "x@y.pt",
      criado_em: "2026-11-01T00:00:00Z",
      valid_until: "2026-11-08T00:00:00Z",
      email_enviado: false,
      email_erro: "caixa cheia",
      usado_em: null,
      ultima_recusa: { codigo: "iban_invalido", em: "2026-11-02T00:00:00Z", campos: ["conta_numero"] },
      tem_rascunho: true,
    });
    expect(resumo).toMatchObject({
      conviteId: "c9",
      estado: "substituido",
      emailDestino: "x@y.pt",
      emailEnviado: false,
      emailErro: "caixa cheia",
      ultimaRecusa: { codigo: "iban_invalido", campos: ["conta_numero"] },
    });
    // Nunca se tira nada alem de metadados: o rascunho nem chega ao ecra.
    expect(JSON.stringify(resumo)).not.toContain("rascunho");
  });

  it("sem convite, devolve null", () => {
    expect(resumoDaRpc({ existe: false })).toBeNull();
    expect(resumoDaRpc(null)).toBeNull();
  });

  it("pendente sem e-mail registado vale null; um estado novo ou ausente vale desconhecido (nunca pendente)", () => {
    expect(resumoDaRpc({ existe: true, convite_id: "c", estado: "pendente" })).toMatchObject({
      estado: "pendente",
      emailEnviado: null,
    });
    expect(resumoDaRpc({ existe: true, convite_id: "c", estado: "algo_novo" })?.estado).toBe("desconhecido");
    expect(resumoDaRpc({ existe: true, convite_id: "c" })?.estado).toBe("desconhecido");
  });
});
