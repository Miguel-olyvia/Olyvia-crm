/**
 * `PessoaConviteAdmissaoEstado`: o cartao persistente da admissao, na ficha (V2).
 *
 * O que fecha:
 *  - DOIS selos lado a lado: o estado da admissao e o do portal, mais a validade;
 *  - com processo aberto, as accoes contextuais Prolongar e Cancelar (so a quem
 *    pode enviar; cancelar desde `aprovada` exige tambem aprovar); sem processo
 *    aberto, nenhuma;
 *  - `terminado` (mascara de cancelada/rejeitada) nao mostra nem oferece nada;
 *  - um estado que a V2 nao conhece nao inventa nada nem oferece accoes;
 *  - a recusa por NIF/NISS ja registado diz QUE ficha o tem e abre-a;
 *  - a forma que a RPC devolve e normalizada para a do ecra.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const TEXTOS: Record<string, string> = {
  "hr.convite.estado.titulo": "Convite de admissão",
  "hr.convite.selo.admissao": "Admissão",
  "hr.convite.selo.portal": "Portal",
  "hr.convite.estadoAdmissao.convidada": "Convidada",
  "hr.convite.estadoAdmissao.em_preenchimento": "Em preenchimento",
  "hr.convite.estadoAdmissao.submetida": "Submetida",
  "hr.convite.estadoAdmissao.devolvida": "Devolvida",
  "hr.convite.estadoAdmissao.aprovada": "Aprovada",
  "hr.convite.estadoAdmissao.a_aguardar_assinaturas": "A aguardar assinaturas",
  "hr.convite.estadoAdmissao.assinaturas_concluidas": "Assinaturas concluídas",
  "hr.convite.estadoAdmissao.a_aguardar_ativacao": "A aguardar ativação",
  "hr.convite.estadoAdmissao.concluida": "Concluída",
  "hr.convite.estadoAdmissao.rejeitada": "Rejeitada",
  "hr.convite.estadoAdmissao.cancelada": "Cancelada",
  "hr.convite.estadoAdmissao.terminado": "Terminada",
  "hr.convite.estadoAdmissao.desconhecido": "Desconhecido",
  "hr.convite.estadoPortal.ativo": "Ativo",
  "hr.convite.estadoPortal.expirado": "Expirado",
  "hr.convite.estadoPortal.revogado": "Revogado",
  "hr.convite.estadoPortal.encerrado": "Encerrado",
  "hr.convite.estadoPortal.desconhecido": "Desconhecido",
  "hr.convite.validade.ativo": "Link válido até {{data}}",
  "hr.convite.validade.expirado": "O link expirou em {{data}}",
  "hr.convite.validade.revogado": "O link já não funciona",
  "hr.convite.validade.encerrado": "O portal foi encerrado",
  "hr.convite.estado.enviadoPara": "Enviado para {{email}}",
  "hr.convite.estado.bloqueado": "Bloqueado por demasiadas tentativas falhadas",
  "hr.convite.estado.desconhecido": "Nao foi possivel determinar o estado do convite.",
  "hr.convite.estado.recusaDuplicado":
    "A pessoa tentou submeter com um {{campo}} que já está na ficha de {{nome}}.",
  "hr.convite.estado.ultimaRecusa": "Última tentativa recusada: {{mensagem}}",
  "hr.convite.estado.abrirFicha": "Abrir ficha",
  "hr.convite.prolongar.botao": "Prolongar",
  "hr.convite.prolongar.titulo": "Prolongar o acesso",
  "hr.convite.cancelar.botao": "Cancelar admissão",
  "hr.convite.cancelar.titulo": "Cancelar a admissão",
  "hr.convite.cancelar.exigeAprovar":
    "Cancelar depois da aprovação exige a permissão de aprovar admissões.",
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
  "hr.convite.reenviar.botao": "Reenviar convite",
  "hr.convite.reenviar.expirado": "O link expirou: prolongue o acesso para o poder reenviar.",
  "hr.convite.reenviar.sucesso": "Convite reenviado para {{email}}. O link e a validade são os mesmos.",
  "hr.convite.reenviar.sucessoSemEmail": "Convite reenviado. O link e a validade são os mesmos.",
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
const { reenviar, toast } = vi.hoisted(() => ({
  reenviar: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/hooks/useAcoesConviteAdmissao", () => ({
  useAcoesConviteAdmissao: () => ({ prolongar: vi.fn(), cancelar: vi.fn(), reenviar, aExecutar: false }),
}));
vi.mock("@/lib/toast", () => ({ toast }));

import { PessoaConviteAdmissaoEstado } from "@/components/hr/PessoaConviteAdmissaoEstado";
import {
  resumoDaRpc,
  type EstadoConviteResumo,
  type ResumoConvite,
} from "@/hooks/useConviteAdmissaoResumo";

const BASE: ResumoConvite = {
  conviteId: "c1",
  estado: "convidada",
  estadoPortal: "ativo",
  emailDestino: "ana@exemplo.pt",
  criadoEm: "2026-11-01T09:00:00Z",
  validUntil: "2026-11-08T12:30:00Z",
  portalEncerradoEm: null,
  emailEnviado: true,
  emailErro: null,
  bloqueado: false,
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

function montar(e: EstadoConviteResumo, opcoes: { podeEnviar?: boolean; podeAprovar?: boolean } = {}) {
  const { podeEnviar = true, podeAprovar = false } = opcoes;
  return render(
    <MemoryRouter>
      <PessoaConviteAdmissaoEstado pessoaId="p1" podeEnviar={podeEnviar} podeAprovar={podeAprovar} estado={e} />
    </MemoryRouter>,
  );
}

describe("PessoaConviteAdmissaoEstado -- os dois selos e a validade", () => {
  it("mostra o estado da admissao e o do portal, lado a lado, com a validade", () => {
    montar(estado({ estado: "em_preenchimento", estadoPortal: "ativo" }));
    const admissao = screen.getByText("Admissão").closest("li") as HTMLElement;
    const portal = screen.getByText("Portal").closest("li") as HTMLElement;
    expect(within(admissao).getByText("Em preenchimento")).toBeInTheDocument();
    expect(within(portal).getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Link válido até \d\d\/\d\d\/\d{4} \d\d:\d\d/);
    expect(screen.getByText("Enviado para ana@exemplo.pt")).toBeInTheDocument();
  });

  it.each([
    ["convidada", "Convidada"],
    ["em_preenchimento", "Em preenchimento"],
    ["submetida", "Submetida"],
    ["devolvida", "Devolvida"],
    ["aprovada", "Aprovada"],
    ["a_aguardar_assinaturas", "A aguardar assinaturas"],
    ["assinaturas_concluidas", "Assinaturas concluídas"],
    ["a_aguardar_ativacao", "A aguardar ativação"],
    ["concluida", "Concluída"],
    ["rejeitada", "Rejeitada"],
    ["cancelada", "Cancelada"],
  ] as const)("o estado %s tem o seu proprio texto (nunca a chave nem 'desconhecido')", (estadoAdmissao, texto) => {
    montar(estado({ estado: estadoAdmissao }));
    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(screen.queryByText(/hr\.convite\./)).not.toBeInTheDocument();
  });

  it.each([
    ["expirado", "Expirado", /O link expirou em \d\d\/\d\d\/\d{4}/],
    ["revogado", "Revogado", /O link já não funciona/],
    ["encerrado", "Encerrado", /O portal foi encerrado/],
  ] as const)("o portal %s diz o que isso quer dizer", (portal, selo, frase) => {
    montar(estado({ estadoPortal: portal }));
    expect(screen.getByText(selo)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(frase);
  });

  it("e-mail nao enviado: selo de aviso com variante escura e detalhe tecnico atras de um rotulo", () => {
    montar(estado({ emailEnviado: false, emailErro: "SMTP em baixo" }));
    expect(screen.getByText("Email não enviado", { selector: "div" }).className).toContain("dark:text-amber-400");
    expect(screen.getByText("Detalhe técnico")).toBeInTheDocument();
    expect(screen.getByText("SMTP em baixo")).toBeInTheDocument();
    expect(screen.queryByText(/Enviado para/)).not.toBeInTheDocument();
  });

  it("e-mail por registar (null) nao se trata como falhado", () => {
    montar(estado({ emailEnviado: null }));
    expect(screen.queryByText("Email não enviado")).not.toBeInTheDocument();
    expect(screen.getByText(/Enviado para/)).toBeInTheDocument();
  });

  it("abertura bloqueada por tentativas falhadas diz-se", () => {
    montar(estado({ bloqueado: true }));
    expect(screen.getByText("Bloqueado por demasiadas tentativas falhadas")).toBeInTheDocument();
  });
});

describe("PessoaConviteAdmissaoEstado -- accoes contextuais", () => {
  it.each(["convidada", "em_preenchimento", "devolvida"] as const)(
    "%s: Prolongar e Cancelar admissao",
    (estadoAdmissao) => {
      montar(estado({ estado: estadoAdmissao }));
      expect(screen.getByRole("button", { name: "Prolongar" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancelar admissão" })).toBeInTheDocument();
    },
  );

  it("um portal so expirado (convidada) ainda se pode prolongar", () => {
    montar(estado({ estado: "convidada", estadoPortal: "expirado" }));
    expect(screen.getByRole("button", { name: "Prolongar" })).toBeInTheDocument();
  });

  it("submetida: so Cancelar (a V2 nao deixa prolongar)", () => {
    montar(estado({ estado: "submetida" }));
    expect(screen.queryByRole("button", { name: "Prolongar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar admissão" })).toBeInTheDocument();
  });

  it.each(["concluida", "rejeitada", "cancelada", "terminado"] as const)(
    "%s: sem processo aberto nao ha accoes",
    (estadoAdmissao) => {
      montar(estado({ estado: estadoAdmissao, estadoPortal: "revogado" }));
      expect(screen.queryByRole("button", { name: "Prolongar" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancelar admissão" })).not.toBeInTheDocument();
    },
  );

  it("sem hr.pessoas.convite.enviar nao ha botao nenhum", () => {
    montar(estado({}), { podeEnviar: false });
    expect(screen.queryByRole("button", { name: "Prolongar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar admissão" })).not.toBeInTheDocument();
  });

  it("estado desconhecido: nao oferece nada (nao se sabe o que ha a meio)", () => {
    montar(estado({ estado: "desconhecido", estadoPortal: "desconhecido" }));
    expect(screen.getByText("Nao foi possivel determinar o estado do convite.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prolongar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar admissão" })).not.toBeInTheDocument();
  });

  it("aprovada sem hr.onboarding.approve: Cancelar fica aria-disabled, com o motivo, e o clique e ignorado", () => {
    montar(estado({ estado: "aprovada" }), { podeAprovar: false });
    const botao = screen.getByRole("button", { name: "Cancelar admissão" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).not.toBeDisabled();
    const razao = screen.getByText("Cancelar depois da aprovação exige a permissão de aprovar admissões.");
    expect(botao.getAttribute("aria-describedby")).toBe(razao.id);
    fireEvent.click(botao);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("aprovada com hr.onboarding.approve: Cancelar abre o modal", () => {
    montar(estado({ estado: "aprovada" }), { podeAprovar: true });
    const botao = screen.getByRole("button", { name: "Cancelar admissão" });
    expect(botao).not.toHaveAttribute("aria-disabled");
    fireEvent.click(botao);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Prolongar abre o modal de prolongar", () => {
    montar(estado({}));
    fireEvent.click(screen.getByRole("button", { name: "Prolongar" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Prolongar o acesso");
  });

  it("os botoes tem alvo de 44 px", () => {
    montar(estado({}));
    expect(screen.getByRole("button", { name: "Prolongar" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Cancelar admissão" }).className).toContain("min-h-11");
  });
});

describe("PessoaConviteAdmissaoEstado -- terminado (mascara)", () => {
  it("diz so que terminou e que o link ja nao funciona, sem datas nem e-mail", () => {
    montar(
      estado({
        estado: "terminado",
        estadoPortal: "revogado",
        emailDestino: null,
        validUntil: null,
        emailEnviado: null,
      }),
    );
    expect(screen.getByText("Terminada")).toBeInTheDocument();
    expect(screen.getByText("Revogado")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("O link já não funciona");
    expect(screen.queryByText(/Enviado para/)).not.toBeInTheDocument();
  });
});

describe("PessoaConviteAdmissaoEstado -- carregamento e erros", () => {
  it("a recarregar com dados anteriores, o cartao fica (nao pisca a cada gravacao)", () => {
    montar(estado({}, { carregando: true }));
    expect(screen.getByText("Convidada")).toBeInTheDocument();
  });

  it("uma falha a ler o estado NAO faz o cartao desaparecer: diz o que falhou e deixa tentar de novo", () => {
    const recarregar = vi.fn();
    montar(estado(null, { erro: true, recarregar }));

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o estado do convite.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("sem permissao a falha de leitura nao aparece (esconde-se so o que nao se pode ver)", () => {
    const { container } = montar(estado(null, { semAcesso: true, erro: true }));
    expect(container).toBeEmptyDOMElement();
  });

  it("sem convite, sem acesso ou a carregar pela primeira vez: nao desenha nada", () => {
    for (const e of [estado(null), estado({}, { semAcesso: true }), estado(null, { carregando: true })]) {
      const { container, unmount } = montar(e);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe("PessoaConviteAdmissaoEstado -- recusas", () => {
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

  it("recusa por NIF ja registado diz que ficha e abre-a", () => {
    montar(
      estado(
        { ultimaRecusa: { codigo: "nif_ja_existe", em: "2026-11-03T08:00:00Z", campos: [] } },
        { conflitos: [{ pessoaId: "p-outra", nome: "Joana Pires", campo: "nif", estado: "activa" }] },
      ),
    );
    expect(screen.getByText(/tentou submeter com um NIF que já está na ficha de Joana Pires/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir ficha" })).toHaveAttribute("href", "/rh/pessoas/p-outra");
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
    expect(screen.getByRole("link", { name: "Abrir ficha" })).toHaveAttribute("href", "/rh/pessoas/p-niss");
  });

  it("outras recusas aparecem como texto traduzido, nunca como codigo", () => {
    montar(
      estado({ ultimaRecusa: { codigo: "admissao_incompleta", em: null, campos: ["telefone_pessoal"] } }),
    );
    expect(screen.getByText("Última tentativa recusada: Falta preencher: Telefone pessoal.")).toBeInTheDocument();
    expect(screen.queryByText(/admissao_incompleta/)).not.toBeInTheDocument();
  });

  it("um processo concluido nao mostra a ultima recusa", () => {
    montar(
      estado({
        estado: "concluida",
        estadoPortal: "encerrado",
        ultimaRecusa: { codigo: "nif_invalido", em: null, campos: [] },
      }),
    );
    expect(screen.queryByText(/Última tentativa recusada/)).not.toBeInTheDocument();
  });
});

describe("resumoDaRpc (a forma da V2)", () => {
  it("traduz o jsonb completo para a forma do ecra", () => {
    const resumo = resumoDaRpc({
      existe: true,
      convite_id: "c9",
      estado: "devolvida",
      estado_portal: "expirado",
      email_destino: "x@y.pt",
      criado_em: "2026-11-01T00:00:00Z",
      valid_until: "2026-11-08T00:00:00Z",
      portal_encerrado_em: null,
      cancelada_em: null,
      rejeitada_em: null,
      email_enviado: false,
      email_erro: "caixa cheia",
      aberturas_falhadas: 10,
      bloqueado: true,
      usado_em: null,
      assinatura_nome: "Ana",
      tem_rascunho: true,
      ultima_recusa: { codigo: "iban_invalido", em: "2026-11-02T00:00:00Z", campos: ["conta_numero"] },
      tem_conflitos: false,
    });
    expect(resumo).toEqual({
      conviteId: "c9",
      estado: "devolvida",
      estadoPortal: "expirado",
      emailDestino: "x@y.pt",
      criadoEm: "2026-11-01T00:00:00Z",
      validUntil: "2026-11-08T00:00:00Z",
      portalEncerradoEm: null,
      emailEnviado: false,
      emailErro: "caixa cheia",
      bloqueado: true,
      ultimaRecusa: { codigo: "iban_invalido", em: "2026-11-02T00:00:00Z", campos: ["conta_numero"] },
    });
    // So metadados: o rascunho nem chega ao ecra.
    expect(JSON.stringify(resumo)).not.toContain("rascunho");
  });

  it("a mascara terminado (so existe, convite_id, estado e estado_portal) le-se sem inventar campos", () => {
    expect(
      resumoDaRpc({ existe: true, convite_id: "c1", estado: "terminado", estado_portal: "revogado" }),
    ).toMatchObject({
      conviteId: "c1",
      estado: "terminado",
      estadoPortal: "revogado",
      emailDestino: null,
      validUntil: null,
      emailEnviado: null,
      bloqueado: false,
      ultimaRecusa: null,
    });
  });

  it("sem convite, devolve null", () => {
    expect(resumoDaRpc({ existe: false })).toBeNull();
    expect(resumoDaRpc(null)).toBeNull();
  });

  it("os estados da V1 (pendente, usado, revogado...) e os desconhecidos valem desconhecido, nunca um estado aberto", () => {
    for (const valor of ["pendente", "usado", "expirado", "revogado", "algo_novo"]) {
      expect(resumoDaRpc({ existe: true, convite_id: "c", estado: valor })?.estado).toBe("desconhecido");
    }
    expect(resumoDaRpc({ existe: true, convite_id: "c" })?.estado).toBe("desconhecido");
    expect(resumoDaRpc({ existe: true, convite_id: "c", estado: "convidada" })?.estadoPortal).toBe("desconhecido");
  });
});

describe("PessoaConviteAdmissaoEstado -- Reenviar convite (V3a: o mesmo link, a mesma validade)", () => {
  beforeEach(() => {
    reenviar.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it.each(["convidada", "em_preenchimento", "submetida", "devolvida", "aprovada"] as const)(
    "%s com o portal ativo: oferece Reenviar convite (alvo de 44 px)",
    (estadoAdmissao) => {
      montar(estado({ estado: estadoAdmissao }), { podeAprovar: true });
      const botao = screen.getByRole("button", { name: "Reenviar convite" });
      expect(botao.className).toContain("min-h-11");
      expect(botao).not.toHaveAttribute("aria-disabled");
    },
  );

  it("sem hr.pessoas.convite.enviar nao ha Reenviar convite", () => {
    montar(estado({}), { podeEnviar: false });
    expect(screen.queryByRole("button", { name: "Reenviar convite" })).not.toBeInTheDocument();
  });

  it.each(["concluida", "rejeitada", "cancelada", "terminado", "desconhecido"] as const)(
    "%s: sem processo aberto conhecido nao ha Reenviar convite",
    (estadoAdmissao) => {
      montar(estado({ estado: estadoAdmissao, estadoPortal: estadoAdmissao === "desconhecido" ? "desconhecido" : "revogado" }));
      expect(screen.queryByRole("button", { name: "Reenviar convite" })).not.toBeInTheDocument();
    },
  );

  it.each(["revogado", "encerrado"] as const)("portal %s: nao ha link a reenviar, e nao se oferece", (portal) => {
    montar(estado({ estado: "convidada", estadoPortal: portal }));
    expect(screen.queryByRole("button", { name: "Reenviar convite" })).not.toBeInTheDocument();
  });

  it("portal expirado: o botao fica aria-disabled, com a razao (prolongar primeiro), e o clique e ignorado", () => {
    montar(estado({ estado: "convidada", estadoPortal: "expirado" }));
    const botao = screen.getByRole("button", { name: "Reenviar convite" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).not.toBeDisabled();
    const razao = screen.getByText("O link expirou: prolongue o acesso para o poder reenviar.");
    expect(botao.getAttribute("aria-describedby")).toBe(razao.id);
    fireEvent.click(botao);
    expect(reenviar).not.toHaveBeenCalled();
  });

  it("clicar chama reenviar com o convite, avisa com o e-mail de destino e relê o estado", async () => {
    reenviar.mockResolvedValue({ ok: true, validUntil: null, codigo: null, erro: null });
    const recarregar = vi.fn();
    montar(estado({}, { recarregar }));
    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(reenviar).toHaveBeenCalledWith("c1");
    expect(toast.success).toHaveBeenCalledWith("Convite reenviado para ana@exemplo.pt. O link e a validade são os mesmos.");
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("sem e-mail de destino conhecido a mensagem nao o inventa", async () => {
    reenviar.mockResolvedValue({ ok: true, validUntil: null, codigo: null, erro: null });
    montar(estado({ emailDestino: null }));
    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Convite reenviado. O link e a validade são os mesmos."));
  });

  it("uma recusa mostra o texto traduzido em role=alert no cartao, sem toast de sucesso", async () => {
    reenviar.mockResolvedValue({ ok: false, validUntil: null, codigo: "link_indisponivel", erro: "Texto traduzido da recusa." });
    const recarregar = vi.fn();
    montar(estado({}, { recarregar }));
    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Texto traduzido da recusa.");
    expect(toast.success).not.toHaveBeenCalled();
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("enquanto reenvia o botao fica aria-disabled e um segundo clique nao repete o pedido", async () => {
    let resolver!: (v: unknown) => void;
    reenviar.mockImplementation(() => new Promise((r) => { resolver = r; }));
    montar(estado({}));
    const botao = screen.getByRole("button", { name: "Reenviar convite" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(reenviar).toHaveBeenCalledTimes(1);
    expect(botao).toHaveAttribute("aria-disabled", "true");
    resolver({ ok: true, validUntil: null, codigo: null, erro: null });
    await waitFor(() => expect(botao).not.toHaveAttribute("aria-disabled"));
  });

  it("nao mostra token nem link na mensagem (so o e-mail)", async () => {
    reenviar.mockResolvedValue({ ok: true, validUntil: null, codigo: null, erro: null, token: "SEGREDO123" });
    montar(estado({}));
    fireEvent.click(screen.getByRole("button", { name: "Reenviar convite" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(JSON.stringify(toast.success.mock.calls)).not.toContain("SEGREDO123");
    expect(document.body.textContent).not.toContain("SEGREDO123");
  });
});
