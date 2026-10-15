// Funções puras da página «Organização»: construir a árvore, contar pessoas (legal e local), pessoas cujo centro difere da
// filial do vínculo, pesquisar, e ligar/alterar/desligar com as validações de empresa/filial e de centro.
import { beforeEach, describe, expect, it } from "vitest";
import * as K from "@/components/rh-exemplo/dados/constantes";
import { repor, lerEstado } from "@/components/rh-exemplo/dados/loja";
import { alterar, desligar, ligar, resolverDestino } from "@/components/rh-exemplo/organizacao/acoes";
import {
  centroDifere, construirArvore as construir, contarPessoas, ehNoOrg, filtrarArvore, idsExpansiveis, ligacoesDoCentro, ligacoesDoVinculo,
  listaVisivel, pessoasComCentroDiferente,
} from "@/components/rh-exemplo/organizacao/arvore";
import {
  criarEstadoOrganizacaoInicial, criarEstruturaExemplo, EMPRESA_CLIMATIZACAO, EMPRESA_REMODELACOES, pessoasDoExemplo,
} from "@/components/rh-exemplo/organizacao/dadosOrganizacao";
import type { EstadoOrganizacao, Ligacao, NoArvore, NoOrg, NoPessoa, PedidoLigacao } from "@/components/rh-exemplo/organizacao/tipos";

const est = criarEstruturaExemplo();
let estado: EstadoOrganizacao;

beforeEach(() => {
  repor();
  estado = criarEstadoOrganizacaoInicial(lerEstado());
});

const pedido = (extra: Partial<PedidoLigacao> = {}): PedidoLigacao => ({
  pessoaId: "p-nadia", empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_PORTO, centroId: null, desde: "2026-10-14", motivo: "", ...extra,
});

/** A árvore com as pessoas de exemplo dentro (o que a página mostra). */
const construirArvore = (ligs: readonly Ligacao[]): NoOrg => construir(est, ligs, pessoasDoExemplo(lerEstado()));

const achar = (no: NoArvore, id: string): NoArvore | null =>
  no.id === id ? no : no.filhos.reduce<NoArvore | null>((a, f) => a ?? achar(f, id), null);

const pessoa = (no: NoArvore, id: string): NoPessoa => {
  const achado = achar(no, `pessoa:${id}`);
  if (achado?.tipo !== "pessoa") throw new Error(`Sem a pessoa ${id}`);
  return achado;
};

describe("a estrutura de exemplo", () => {
  it("reutiliza as 5 filiais e os 7 centros do RH de exemplo, distribuídos pelas duas empresas", () => {
    expect(est.filiais.map((f) => f.id).sort()).toEqual([K.FILIAL_BRAGA, K.FILIAL_FARO, K.FILIAL_LISBOA, K.FILIAL_PORTO, K.FILIAL_SEDE].sort());
    expect(est.centros).toHaveLength(7);
    expect(est.empresas.map((e) => e.nome)).toEqual(["Aurora Remodelações, Lda.", "Aurora Climatização, Lda."]);
    expect(est.filiais.filter((f) => f.empresaId === EMPRESA_CLIMATIZACAO).map((f) => f.id)).toEqual([K.FILIAL_BRAGA, K.FILIAL_FARO]);
    expect(est.centros.every((c) => est.filiais.some((f) => f.id === c.filialId))).toBe(true);
  });

  it("liga as 18 pessoas de exemplo: 15 ligadas e 3 por ligar", () => {
    expect(pessoasDoExemplo(lerEstado())).toHaveLength(18);
    expect(estado.ligacoes).toHaveLength(15);
  });
});

describe("construirArvore e contarPessoas", () => {
  it("tem quatro níveis e os contadores batem com as ligações", () => {
    const arvore = construirArvore(estado.ligacoes);
    expect(arvore.tipo).toBe("grupo");
    expect(arvore.filhos.map((e) => e.tipo)).toEqual(["empresa", "empresa"]);
    expect(arvore.legais).toBe(15);
    const faro = achar(arvore, K.LOCAL_FARO);
    expect(faro?.tipo).toBe("centro");
    expect(faro && ehNoOrg(faro) ? faro.locais : null).toBe(ligacoesDoCentro(K.LOCAL_FARO, estado.ligacoes).length);
    const somaEmpresas = arvore.filhos.reduce((s, e) => s + (ehNoOrg(e) ? e.legais : 0), 0);
    expect(somaEmpresas).toBe(arvore.legais);
  });

  it("conta o vínculo legal por filial e quem trabalha por centro, de forma independente", () => {
    const n = contarPessoas(est, estado.ligacoes);
    // O Tiago é da Filial Lisboa mas trabalha em Faro.
    expect(ligacoesDoVinculo(est, K.FILIAL_LISBOA, estado.ligacoes).map((l) => l.pessoaId)).toContain("p-tiago");
    expect(ligacoesDoCentro(K.LOCAL_FARO, estado.ligacoes).map((l) => l.pessoaId)).toContain("p-tiago");
    expect(ligacoesDoCentro(K.LOCAL_COLOMBO, estado.ligacoes).map((l) => l.pessoaId)).not.toContain("p-tiago");
    // Em Faro trabalham a Lara (vínculo da própria Filial Faro) e o Tiago (vínculo da Filial Lisboa).
    expect(n.get(K.FILIAL_FARO)?.legais).toBe(1);
    expect(n.get(K.LOCAL_FARO)?.locais).toBe(2);
  });

  it("um centro não tem vínculo legal próprio", () => {
    expect(ligacoesDoVinculo(est, K.LOCAL_FARO, estado.ligacoes)).toEqual([]);
  });
});

describe("pessoasComCentroDiferente", () => {
  it("há pelo menos 3 pessoas cujo centro não é da filial do vínculo legal", () => {
    const ids = pessoasComCentroDiferente(est, estado.ligacoes).map((l) => l.pessoaId).sort();
    expect(ids).toEqual(["p-daniel", "p-hugo", "p-joana", "p-tiago"]);
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });

  it("o teletrabalho conta como centro da sede", () => {
    const lig = { pessoaId: "x", empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_SEDE, centroId: K.LOCAL_REMOTO, desde: "2026-01-01" };
    expect(centroDifere(est, lig)).toBe(false);
    expect(centroDifere(est, { ...lig, filialId: K.FILIAL_PORTO })).toBe(true);
  });
});

describe("filtrarArvore", () => {
  const arvore = () => construirArvore(estado.ligacoes);

  it("sem termo devolve tudo e com termo mantém o nó e os antepassados, sem acentos nem maiúsculas", () => {
    expect(filtrarArvore(arvore(), "  ")).toEqual(arvore());
    const f = filtrarArvore(arvore(), "armazem");
    expect(f?.filhos).toHaveLength(1);
    expect(f?.filhos[0]?.filhos[0]?.filhos.map((c) => c.nome)).toEqual(["Armazém Azambuja"]);
  });

  it("encontra uma pessoa e mantém só o caminho até ela (grupo, empresa, filial, centro, pessoa)", () => {
    const f = filtrarArvore(arvore(), "tiago");
    const ids: string[] = [];
    for (let no: NoArvore | undefined = f ?? undefined; no; no = no.filhos[0]) ids.push(no.id);
    expect(ids).toEqual([est.grupo.id, EMPRESA_CLIMATIZACAO, K.FILIAL_FARO, K.LOCAL_FARO, "pessoa:p-tiago"]);
    expect(f?.filhos).toHaveLength(1);
  });

  it("um nó que corresponde guarda tudo o que tem por baixo, pessoas incluídas", () => {
    const f = filtrarArvore(arvore(), "loja colombo");
    const colombo = f && achar(f, K.LOCAL_COLOMBO);
    expect(colombo?.filhos.length).toBeGreaterThan(0);
    expect(f && achar(f, "pessoa:p-carolina")).not.toBeNull();
  });

  it("devolve null quando nada corresponde", () => {
    expect(filtrarArvore(arvore(), "zzzz")).toBeNull();
  });

  it("idsExpansiveis só traz nós com filhos: um centro com pessoas, sim; uma pessoa sem equipa, não", () => {
    const ids = idsExpansiveis(arvore());
    expect(ids).toContain(K.FILIAL_LISBOA);
    expect(ids).toContain(K.LOCAL_FARO);
    expect(ids).toContain("pessoa:p-rui");
    expect(ids).not.toContain("pessoa:p-tiago");
    const semPessoas = construir(est, [], []);
    expect(idsExpansiveis(semPessoas)).not.toContain(K.LOCAL_FARO);
  });

  it("listaVisivel inclui as pessoas dos nós abertos e esconde as dos fechados", () => {
    const tudo = new Set(idsExpansiveis(arvore()));
    expect(listaVisivel(arvore(), tudo).map((v) => v.no.id)).toContain("pessoa:p-tiago");
    tudo.delete(K.LOCAL_FARO);
    const visiveis = listaVisivel(arvore(), tudo);
    expect(visiveis.map((v) => v.no.id)).not.toContain("pessoa:p-tiago");
    expect(visiveis.map((v) => v.no.id)).toContain(K.LOCAL_FARO);
  });
});

describe("as pessoas dentro da árvore", () => {
  it("cada pessoa ligada é uma folha debaixo do centro onde trabalha (e não da filial do vínculo)", () => {
    const arvore = construirArvore(estado.ligacoes);
    const folhas: string[] = [];
    const recolher = (no: NoArvore): void => { if (no.tipo === "pessoa") folhas.push(no.pessoaId); no.filhos.forEach(recolher); };
    recolher(arvore);
    expect(folhas.sort()).toEqual(estado.ligacoes.map((l) => l.pessoaId).sort());
    const faro = achar(arvore, K.LOCAL_FARO)!;
    expect(achar(faro, "pessoa:p-tiago")).not.toBeNull();
    expect(achar(achar(arvore, K.FILIAL_LISBOA)!, "pessoa:p-tiago")).toBeNull();
  });

  it("«Chefia» só em quem tem equipa; «Reporta a» com o nome de quem chefia; vínculo só quando difere do centro", () => {
    const arvore = construirArvore(estado.ligacoes);
    expect(pessoa(arvore, "p-rui")).toMatchObject({ chefia: true, reportaA: "Marta Figueiredo", vinculo: null });
    expect(pessoa(arvore, "p-marta")).toMatchObject({ chefia: true, reportaA: null });
    expect(pessoa(arvore, "p-tiago")).toMatchObject({ chefia: false, reportaA: "Rui Amaral", vinculo: "Filial Lisboa" });
    expect(pessoa(arvore, "p-tiago").filhos).toEqual([]);
  });

  it("no mesmo centro a chefia vem primeiro e os subordinados ficam por baixo; noutro centro ficam ao lado", () => {
    const arvore = construirArvore(estado.ligacoes);
    const colombo = achar(arvore, K.LOCAL_COLOMBO)!;
    expect(colombo.filhos.map((f) => f.id)).toEqual(["pessoa:p-rui"]);
    expect(colombo.filhos[0]!.filhos.map((f) => f.id)).toEqual(["pessoa:p-carolina", "pessoa:p-marco"]);
    // A Marta é chefia do Rui, mas trabalha na sede: não aparece por cima dele em Colombo.
    expect(achar(colombo, "pessoa:p-marta")).toBeNull();
  });

  it("dentro de um centro, as chefias vêm antes de quem não tem equipa, depois por nome", () => {
    const lig = (id: string): Ligacao => ({ pessoaId: id, empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_SEDE, centroId: K.LOCAL_SEDE, desde: "2026-01-01" });
    const pessoas = [
      { id: "a", nome: "Ana", cargo: null, reportaAId: null },
      { id: "b", nome: "Bruno", cargo: null, reportaAId: null },
      { id: "c", nome: "Carla", cargo: null, reportaAId: "b" },
    ];
    const sede = achar(construir(est, ["a", "b", "c"].map(lig), pessoas), K.LOCAL_SEDE)!;
    expect(sede.filhos.map((f) => f.id)).toEqual(["pessoa:b", "pessoa:a"]);
    expect(sede.filhos[0]!.filhos.map((f) => f.id)).toEqual(["pessoa:c"]);
  });

  it("uma cadeia de chefia circular não se perde nem entra em recursão", () => {
    const lig = (id: string): Ligacao => ({ pessoaId: id, empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_SEDE, centroId: K.LOCAL_SEDE, desde: "2026-01-01" });
    const pessoas = [
      { id: "a", nome: "Ana", cargo: null, reportaAId: "b" },
      { id: "b", nome: "Bruno", cargo: null, reportaAId: "a" },
      { id: "z", nome: "Zé", cargo: null, reportaAId: "z" },
    ];
    const sede = achar(construir(est, ["a", "b", "z"].map(lig), pessoas), K.LOCAL_SEDE)!;
    const ids: string[] = [];
    const recolher = (no: NoArvore): void => { ids.push(no.id); no.filhos.forEach(recolher); };
    sede.filhos.forEach(recolher);
    expect(ids.sort()).toEqual(["pessoa:a", "pessoa:b", "pessoa:z"]);
  });

  it("quem tem vínculo numa filial mas nenhum centro fica em «Sem centro atribuído», debaixo da filial", () => {
    const hugo = estado.ligacoes.find((l) => l.pessoaId === "p-hugo")!;
    const ligs = estado.ligacoes.map((l) => (l === hugo ? { ...l, centroId: "" } : l));
    const arvore = construirArvore(ligs);
    const semCentro = achar(arvore, `semcentro:${K.FILIAL_PORTO}`);
    expect(semCentro).toMatchObject({ tipo: "semCentro", total: 1 });
    expect(semCentro?.filhos.map((f) => f.id)).toEqual(["pessoa:p-hugo"]);
    expect(achar(achar(arvore, K.FILIAL_PORTO)!, `semcentro:${K.FILIAL_PORTO}`)).not.toBeNull();
    expect(achar(achar(arvore, K.LOCAL_PORTO)!, "pessoa:p-hugo")).toBeNull();
    expect(achar(arvore, `semcentro:${K.FILIAL_FARO}`)).toBeNull();
  });

  it("sem centro nem filial conhecida, a pessoa fica debaixo da empresa", () => {
    const lig: Ligacao = { pessoaId: "p-nadia", empresaId: EMPRESA_CLIMATIZACAO, filialId: "fil-nada", centroId: "", desde: "2026-01-01" };
    const arvore = construirArvore([lig]);
    expect(achar(achar(arvore, EMPRESA_CLIMATIZACAO)!, `semcentro:${EMPRESA_CLIMATIZACAO}`)?.filhos.map((f) => f.id)).toEqual(["pessoa:p-nadia"]);
  });
});

describe("resolverDestino", () => {
  it("«mesmo centro da filial» resolve para o primeiro centro da filial", () => {
    expect(resolverDestino(est, { empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_PORTO, centroId: null })).toEqual({
      destino: { empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_PORTO, centroId: K.LOCAL_PORTO },
    });
  });

  it("recusa empresa ou filial desconhecidas, filial de outra empresa e centro inexistente", () => {
    expect(resolverDestino(est, { empresaId: "x", filialId: K.FILIAL_PORTO, centroId: null })).toEqual({ erro: "empresaInvalida" });
    expect(resolverDestino(est, { empresaId: EMPRESA_REMODELACOES, filialId: "x", centroId: null })).toEqual({ erro: "filialInvalida" });
    expect(resolverDestino(est, { empresaId: EMPRESA_CLIMATIZACAO, filialId: K.FILIAL_PORTO, centroId: null })).toEqual({ erro: "filialForaDaEmpresa" });
    expect(resolverDestino(est, { empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_PORTO, centroId: "loc-nada" })).toEqual({ erro: "centroInexistente" });
  });

  it("aceita um centro de outra filial (e de outra empresa)", () => {
    expect(resolverDestino(est, { empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_LISBOA, centroId: K.LOCAL_FARO })).toEqual({
      destino: { empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_LISBOA, centroId: K.LOCAL_FARO },
    });
  });
});

describe("ligar, alterar e desligar", () => {
  it("ligar acrescenta a ligação sem alterar o estado anterior e regista o histórico", () => {
    const r = ligar(estado, est, pedido({ centroId: K.LOCAL_BRAGA, motivo: " Reforço " }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(estado.ligacoes.some((l) => l.pessoaId === "p-nadia")).toBe(false);
    const nova = r.estado.ligacoes.find((l) => l.pessoaId === "p-nadia");
    expect(nova).toMatchObject({ empresaId: EMPRESA_REMODELACOES, filialId: K.FILIAL_PORTO, centroId: K.LOCAL_BRAGA });
    expect(centroDifere(est, nova!)).toBe(true);
    const ev = r.estado.historico.at(-1);
    expect(ev).toMatchObject({ tipo: "ligar", de: null, motivo: "Reforço", data: "2026-10-14" });
    expect(new Set(r.estado.historico.map((e) => e.id)).size).toBe(r.estado.historico.length);
  });

  it("ligar recusa quem já está ligada, sem pessoa, com data inválida ou com destino incoerente", () => {
    expect(ligar(estado, est, pedido({ pessoaId: "p-tiago" }))).toEqual({ ok: false, erro: "jaLigada" });
    expect(ligar(estado, est, pedido({ pessoaId: "" }))).toEqual({ ok: false, erro: "pessoaEmFalta" });
    expect(ligar(estado, est, pedido({ desde: "14/10/2026" }))).toEqual({ ok: false, erro: "dataInvalida" });
    expect(ligar(estado, est, pedido({ empresaId: EMPRESA_CLIMATIZACAO }))).toEqual({ ok: false, erro: "filialForaDaEmpresa" });
    expect(ligar(estado, est, pedido({ centroId: "loc-nada" }))).toEqual({ ok: false, erro: "centroInexistente" });
  });

  it("alterar muda a ligação, guarda o de/para e não duplica a pessoa", () => {
    const antes = estado.ligacoes.length;
    const r = alterar(estado, est, pedido({ pessoaId: "p-tiago", filialId: K.FILIAL_LISBOA, centroId: K.LOCAL_COLOMBO, motivo: "Regresso" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.ligacoes).toHaveLength(antes);
    expect(r.estado.ligacoes.find((l) => l.pessoaId === "p-tiago")?.centroId).toBe(K.LOCAL_COLOMBO);
    expect(r.estado.historico.at(-1)).toMatchObject({ tipo: "alterar", de: { centroId: K.LOCAL_FARO }, para: { centroId: K.LOCAL_COLOMBO } });
  });

  it("alterar recusa quem não está ligada", () => {
    expect(alterar(estado, est, pedido())).toEqual({ ok: false, erro: "naoLigada" });
  });

  it("desligar exige motivo com pelo menos 3 caracteres (sem contar espaços nas pontas)", () => {
    expect(desligar(estado, "p-tiago", "  ab ", "2026-10-14")).toEqual({ ok: false, erro: "motivoCurto" });
    expect(desligar(estado, "p-tiago", "", "2026-10-14")).toEqual({ ok: false, erro: "motivoCurto" });
    const r = desligar(estado, "p-tiago", "Fim de contrato", "2026-10-14");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.ligacoes.some((l) => l.pessoaId === "p-tiago")).toBe(false);
    expect(r.estado.historico.at(-1)).toMatchObject({ tipo: "desligar", para: null, motivo: "Fim de contrato" });
    expect(contarPessoas(est, r.estado.ligacoes).get(est.grupo.id)?.legais).toBe(estado.ligacoes.length - 1);
  });

  it("desligar recusa quem não está ligada", () => {
    expect(desligar(estado, "p-nadia", "Motivo", "2026-10-14")).toEqual({ ok: false, erro: "naoLigada" });
  });
});
