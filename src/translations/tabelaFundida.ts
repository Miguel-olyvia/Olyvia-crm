/**
 * A tabela de traducoes JA FUNDIDA: a tabela base de `index.ts` mais todos os modulos proprios (`rhSubs.*`, `rhHeReal.*`, ...).
 * Modulo puro, sem hook nem contexto, para servir tanto o `useTranslation` como o `friendlyError` (que corre fora do React).
 * A ORDEM das juncoes importa: um modulo mais abaixo reescreve a chave de um mais acima. Para juntar um modulo novo, acrescenta-o aqui.
 */
import { translations } from "@/translations/index";
import { bundleTranslations } from "@/translations/bundles";
import { priceContextsTranslations } from "@/translations/priceContexts";
import { directSalesTranslations } from "@/translations/directSales";
import { todayTranslations } from "@/translations/today";
import { inventoryNavTranslations } from "@/translations/inventoryNav";
import { frotaNavTranslations } from "@/translations/frotaNav";
import { negocioMetasTranslations } from "@/translations/negocioMetas";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { utilizadoresPerfisTranslations } from "@/translations/utilizadoresPerfis";
import { rhExemploTranslations } from "@/translations/rhExemplo";
import { rhExemploFormTranslations } from "@/translations/rhExemploForm";
import { rhExemploNovaPessoaTranslations } from "@/translations/rhExemploNovaPessoa";
import { rhExemploMenuTranslations } from "@/translations/rhExemploMenu";
import { rhExemploFluxosCTranslations } from "@/translations/rhExemploFluxosC";
import { rhExemploFluxosATranslations } from "@/translations/rhExemploFluxosA";
import { rhExemploFluxosBTranslations } from "@/translations/rhExemploFluxosB";
import { rhExemploHorarioRealTranslations } from "@/translations/rhExemploHorarioReal";
import { rhExemploFluxosDTranslations } from "@/translations/rhExemploFluxosD";
import { rhExemploFilaTranslations } from "@/translations/rhExemploFila";
import { rhExemploDesviosTranslations } from "@/translations/rhExemploDesvios";
import { hrRegrasSalariaisTranslations } from "@/translations/hrRegrasSalariais";
import { rhExemploHorasExtraRealTranslations } from "@/translations/rhExemploHorasExtraReal";
import { rhExemploCalendarioTranslations } from "@/translations/rhExemploCalendario";
import { rhExemploAbasTranslations } from "@/translations/rhExemploAbas";
import { rhExemploCustosTranslations } from "@/translations/rhExemploCustos";
import { rhExemploCustoFechoTranslations } from "@/translations/rhExemploCustoFecho";
import { rhExemploProcessamentoRealTranslations } from "@/translations/rhExemploProcessamentoReal";
import { rhExemploSubsidiosTranslations } from "@/translations/rhExemploSubsidios";
import { rhExemploPeriodoFolhaTranslations } from "@/translations/rhExemploPeriodoFolha";
import { rhExemploAdmissaoTranslations } from "@/translations/rhExemploAdmissao";
import { rhExemploAdmissaoMenuTranslations } from "@/translations/rhExemploAdmissaoMenu";
import { rhExemploPortalTranslations } from "@/translations/rhExemploPortal";
import { rhPortalRealTranslations } from "@/translations/rhPortalReal";
import { rhExemploOrganizacaoTranslations } from "@/translations/rhExemploOrganizacao";
import { rhExemploJustificacoesTranslations } from "@/translations/rhExemploJustificacoes";
import { canalDenunciasTranslations } from "@/translations/canalDenuncias";
import { canalDenunciasMinhaAreaTranslations } from "@/translations/canalDenunciasMinhaArea";
import { rhOficiosObraTranslations } from "@/translations/rhOficiosObra";
import { rhExemploCargoSeguroTranslations } from "@/translations/rhExemploCargoSeguro";

// Merge bundle and priceContexts translations
export const tabelaFundida: Record<string, Record<string, string>> = { ...translations } as any;
Object.keys(bundleTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...bundleTranslations[lang as keyof typeof bundleTranslations] };
});
Object.keys(priceContextsTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...priceContextsTranslations[lang as keyof typeof priceContextsTranslations] };
});
// Venda Direta (Fase 2) — módulo próprio, mesmo padrão dos dois acima.
Object.keys(directSalesTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...directSalesTranslations[lang as keyof typeof directSalesTranslations] };
});
// Ecrã "Hoje" (/home) — módulo próprio, mesmo padrão.
Object.keys(todayTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...todayTranslations[lang as keyof typeof todayTranslations] };
});
// Menu do Inventário (Hoje · Compras · Armazém) — módulo próprio, mesmo padrão.
Object.keys(inventoryNavTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...inventoryNavTranslations[lang as keyof typeof inventoryNavTranslations] };
});
// Menu da Frota de exemplo (/frota) e o selo "Dados de exemplo" — módulo próprio, mesmo padrão.
Object.keys(frotaNavTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...frotaNavTranslations[lang as keyof typeof frotaNavTranslations] };
});
// Página "Negócio e metas" — módulo próprio, mesmo padrão.
Object.keys(negocioMetasTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...negocioMetasTranslations[lang as keyof typeof negocioMetasTranslations] };
});
// Página "Pessoas" — módulo próprio, mesmo padrão.
Object.keys(pessoasPaginaTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...pessoasPaginaTranslations[lang as keyof typeof pessoasPaginaTranslations] };
});

// Página "Utilizadores e perfis" — módulo próprio, mesmo padrão.
Object.keys(utilizadoresPerfisTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...utilizadoresPerfisTranslations[lang as keyof typeof utilizadoresPerfisTranslations] };
});

// Ecrãs de Recursos Humanos de exemplo (/rh-exemplo) — módulo próprio, mesmo padrão.
Object.keys(rhExemploTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploTranslations[lang as keyof typeof rhExemploTranslations] };
});

// Painel "Nova pessoa", ficha em painel lateral e lista compacta de RH de exemplo (`rhForm.*`).
Object.keys(rhExemploFormTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploFormTranslations[lang as keyof typeof rhExemploFormTranslations] };
});

// Painel "Nova pessoa" com todos os campos, em seis abas (`rhNova.*`).
Object.keys(rhExemploNovaPessoaTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploNovaPessoaTranslations[lang as keyof typeof rhExemploNovaPessoaTranslations] };
});

// Menu e ecrãs de gestão de RH de exemplo (assiduidade, ausências, centros, modelos, processamento salarial, convite).
Object.keys(rhExemploMenuTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploMenuTranslations[lang as keyof typeof rhExemploMenuTranslations] };
});

// Frente A dos fluxos de RH de exemplo: botões de configuração, Cargos, janela do responsável e separador Custo.
Object.keys(rhExemploFluxosATranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploFluxosATranslations[lang as keyof typeof rhExemploFluxosATranslations] };
});

// Frente C: horas extra, banco de horas e cálculo do processamento salarial de exemplo (`rhFluxosC.*`).
Object.keys(rhExemploFluxosCTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploFluxosCTranslations[lang as keyof typeof rhExemploFluxosCTranslations] };
});

// Frente B: horário por tipo e versões, picagem com localização, alertas do fim do dia e faltas (`rhExemplo.hor/pic/fal.*`).
Object.keys(rhExemploFluxosBTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploFluxosBTranslations[lang as keyof typeof rhExemploFluxosBTranslations] };
});

// Horário da ficha ligado à base: o que o painel de versões diz sobre o que a base não guarda (`rhExemplo.hor.real.*`).
Object.keys(rhExemploHorarioRealTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploHorarioRealTranslations[lang as keyof typeof rhExemploHorarioRealTranslations] };
});

// Fluxo de admissão: convite como login temporário de 7 dias, aprovação, contrato para assinar e credenciais (`rhAdm.*`).
Object.keys(rhExemploAdmissaoTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploAdmissaoTranslations[lang as keyof typeof rhExemploAdmissaoTranslations] };
});

// Entradas «Admissões» e «Ver como a pessoa vê» do menu de RH de exemplo, e o índice dos estados do convite (`rhAdmIdx.*`).
Object.keys(rhExemploAdmissaoMenuTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploAdmissaoMenuTranslations[lang as keyof typeof rhExemploAdmissaoMenuTranslations] };
});

// Portal do colaborador de exemplo: a página pública do link, a troca de documentos e o lado do RH (`rhPortal.*`).
Object.keys(rhExemploPortalTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploPortalTranslations[lang as keyof typeof rhExemploPortalTranslations] };
});

// Portal do colaborador ligado à base: assinatura por SMS, abas reais, enviar contrato, aprovar e rejeitar (`rhPortalReal.*`).
Object.keys(rhPortalRealTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhPortalRealTranslations[lang as keyof typeof rhPortalRealTranslations] };
});

// Página «Organização» do RH de exemplo: grupo, empresas, filiais, centros e a ligação das pessoas (`rhOrg.*`).
Object.keys(rhExemploOrganizacaoTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploOrganizacaoTranslations[lang as keyof typeof rhExemploOrganizacaoTranslations] };
});

// Justificar um dia com falta sugerida ou atraso: a pessoa envia, o RH decide (`rhJust.*`).
Object.keys(rhExemploJustificacoesTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploJustificacoesTranslations[lang as keyof typeof rhExemploJustificacoesTranslations] };
});

// Frente D: banco de horas na ficha e horas extra pendentes na fila de trabalho (`rhFluxosD.*`).
Object.keys(rhExemploFluxosDTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploFluxosDTranslations[lang as keyof typeof rhExemploFluxosDTranslations] };
});

// Fila de trabalho do mapa de assiduidade: pessoas com pendências e painel da pessoa (`rhFila.*`).
Object.keys(rhExemploFilaTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploFilaTranslations[lang as keyof typeof rhExemploFilaTranslations] };
});
Object.keys(rhExemploDesviosTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploDesviosTranslations[lang as keyof typeof rhExemploDesviosTranslations] };
});

// Regras salariais da organizacao e direitos salariais da pessoa (`hr.regrasSalariais.*`, `hr.direitosSalariais.*`).
Object.keys(hrRegrasSalariaisTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...hrRegrasSalariaisTranslations[lang as keyof typeof hrRegrasSalariaisTranslations] };
});

// Horas extra ligadas à base: coeficientes de pagamento = códigos de processamento (`rhHeReal.*`).
Object.keys(rhExemploHorasExtraRealTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploHorasExtraRealTranslations[lang as keyof typeof rhExemploHorasExtraRealTranslations] };
});

// Calendário do mês da pessoa, na aba Assiduidade da ficha de RH de exemplo (`rhCal.*`).
Object.keys(rhExemploCalendarioTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploCalendarioTranslations[lang as keyof typeof rhExemploCalendarioTranslations] };
});

// Abas da assiduidade e barra de abas da ficha (`rhAbas.*`).
Object.keys(rhExemploAbasTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploAbasTranslations[lang as keyof typeof rhExemploAbasTranslations] };
});

// Módulo «Custos» do RH de exemplo e secção «Equipamentos» da aba Custo (`rhCustos.*`).
Object.keys(rhExemploCustosTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploCustosTranslations[lang as keyof typeof rhExemploCustosTranslations] };
});

// Custo de um mês fechado: horas e retribuição gravadas no fecho (`rhCustoFecho.*`).
Object.keys(rhExemploCustoFechoTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploCustoFechoTranslations[lang as keyof typeof rhExemploCustoFechoTranslations] };
});

// Cálculo do mês, Custos e desconto da falta ligados ao processamento salarial real (`rhProcReal.*`). Vem DEPOIS de
// Custos e das fluxos A/B de propósito: reescreve três textos que falavam do «Cálculo do mês» de exemplo.
Object.keys(rhExemploProcessamentoRealTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploProcessamentoRealTranslations[lang as keyof typeof rhExemploProcessamentoRealTranslations] };
});

// Subsídios de férias e de Natal (`rhSubs.*`, as linhas novas de `rhContas.*` e o bloqueio do fecho).
Object.keys(rhExemploSubsidiosTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploSubsidiosTranslations[lang as keyof typeof rhExemploSubsidiosTranslations] };
});

// Período da folha (`rhPeriodo.cfg.*`): o separador de configuração do processamento salarial.
Object.keys(rhExemploPeriodoFolhaTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploPeriodoFolhaTranslations[lang as keyof typeof rhExemploPeriodoFolhaTranslations] };
});

// Canal de denúncias de exemplo (`cd.*`) — módulo próprio, mesmo padrão.
Object.keys(canalDenunciasTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...canalDenunciasTranslations[lang as keyof typeof canalDenunciasTranslations] };
});

// Canal de denúncias dentro da app (`cdm.*`, `sidebar.rhExemploDenunc*`, `sidebar.rhExemploMinhasDenuncias`) — A minha área e RH.
Object.keys(canalDenunciasMinhaAreaTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...canalDenunciasMinhaAreaTranslations[lang as keyof typeof canalDenunciasMinhaAreaTranslations] };
});

// Ficha de RH › "Ofícios de obra" (`hr.oficiosObra.*`) — módulo próprio, mesmo padrão.
Object.keys(rhOficiosObraTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhOficiosObraTranslations[lang as keyof typeof rhOficiosObraTranslations] };
});

// rh-exemplo › Cargos › seguro de acidentes de trabalho por cargo (`hr.cargos.seguro.*`) — módulo próprio, mesmo padrão.
Object.keys(rhExemploCargoSeguroTranslations).forEach((lang) => {
  tabelaFundida[lang] = { ...tabelaFundida[lang], ...rhExemploCargoSeguroTranslations[lang as keyof typeof rhExemploCargoSeguroTranslations] };
});
