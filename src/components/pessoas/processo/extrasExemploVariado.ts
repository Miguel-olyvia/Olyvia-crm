// Os orçamentos detalhados de exemplo dos negócios variados (ver `../pessoasExemploVariado.ts`), com o mesmo formato que os testes da
// Fase 4 gravam: um verificado (pronto a enviar a proposta), um com um bloqueio de margem por resolver e um com a aprovação da Direção
// pedida. Só em memória: o store (`processoNegocios.ts`) arranca com eles e perdem-se ao recarregar. Valores inventados.
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { totaisDoOrcamento, type LinhaTrabalho } from "./orcamentoCalculo";
import type { ExtrasPorNegocio, OrcamentoDetalhado } from "./orcamentoDetalhado";

/** Os ids dos três negócios em Orçamento com o orçamento detalhado (o do orçamento `<id>-o1`, o escolhido). */
export const ID_ORCAMENTO_VERIFICADO = "vn-sara-orc";
export const ID_ORCAMENTO_BLOQUEADO = "vn-tomas-orc";
export const ID_ORCAMENTO_DIRECAO = "vn-ursula-orc";

const linha = (id: string, trabalho: LinhaTrabalho["trabalho"], quantidade: number, precoUnitario?: number): LinhaTrabalho => ({
  ...novaLinhaDoCatalogo(trabalho, id), quantidade, ...(precoUnitario === undefined ? {} : { precoUnitario }),
});

const orcamento = (negocioId: string, linhas: LinhaTrabalho[], desconto: number, extra: Partial<OrcamentoDetalhado>): OrcamentoDetalhado => ({
  orcamentoId: `${negocioId}-o1`, linhas, desconto, vendaDireta: false, verificado: false, direcao: null, versao: 1, ...extra,
});

/** Cozinha: margem de 39 %, sem desconto. Está verificado, por isso o próximo passo é enviar a proposta. */
const VERIFICADO = orcamento(ID_ORCAMENTO_VERIFICADO, [linha("l1", "pavimento", 18), linha("l2", "bancada", 3.5), linha("l3", "azulejos", 12)], 0, { verificado: true });

/** Casa de banho: sem desconto a margem é de 35 %, mas 18 % de desconto leva-a a 21 % (abaixo do mínimo de 28 %): bloqueia a verificação. */
const BLOQUEADO = orcamento(ID_ORCAMENTO_BLOQUEADO, [linha("l1", "bancaPorDuche", 1), linha("l2", "canalizacao", 2)], 18, {});

/** Janelas: o desconto de 15 % leva a margem a 22 %; o comercial já pediu a aprovação da Direção (não é um bloqueio duro). */
const DIRECAO = orcamento(ID_ORCAMENTO_DIRECAO, [linha("l1", "caixilharia", 4), linha("l2", "estores", 4)], 15, { direcao: "pedida" });

/** O total com IVA de um orçamento detalhado, a duas casas: o valor do orçamento escolhido do negócio. */
export const valorDoDetalhado = (o: OrcamentoDetalhado): number =>
  Math.round(totaisDoOrcamento({ linhas: o.linhas, desconto: o.desconto }).total * 100) / 100;

export const ORCAMENTOS_DETALHADOS: Readonly<Record<string, OrcamentoDetalhado>> = {
  [ID_ORCAMENTO_VERIFICADO]: VERIFICADO, [ID_ORCAMENTO_BLOQUEADO]: BLOQUEADO, [ID_ORCAMENTO_DIRECAO]: DIRECAO,
};

/** Os extras com que o store arranca: um orçamento detalhado por negócio acima. */
export const EXTRAS_VARIADO: ExtrasPorNegocio = Object.fromEntries(
  Object.entries(ORCAMENTOS_DETALHADOS).map(([id, o]) => [id, { orcamento: o }]),
);
