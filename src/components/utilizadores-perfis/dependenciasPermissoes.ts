// 06/11/2026: as dependências entre permissões do editor de papéis, DECLARADAS (antes eram automáticas: tudo o que não era «ver»
// dependia de `<módulo>.view`, com exceções à mão). Só o editor as usa (matriz.ts): uma permissão só se marca com a de que depende,
// e tirar uma tira em cascata as que dependem dela. A app e o servidor não mudam — isto não dá nem tira acesso a ninguém.
//
// Formato: DEPENDE_DE[código] = a lista de códigos de que depende, lida como «QUALQUER DE» (basta uma estar marcada). Um código
// que não está no mapa não depende de nada. 10/11: EXIGE_TAMBEM[código] = as que exige além disso, lidas como «TODAS DE».
//
// Como se constrói (para cada código em PERMISSOES_EM_USO, isto é, no editor):
//  1. SEM_DEPENDENCIA → nada (as que se usam sozinhas: ver a lista e a razão de cada uma).
//  2. EXPLICITAS → a dependência escrita à mão (o RH: a ficha e as partes da ficha).
//  3. por omissão, o que já era: uma permissão que não é de «ver» depende do `<módulo>.view`, se esse código estiver no editor.
//  4. senão, a edição depende do ver da mesma parte, se o par estiver no editor (scheduling.boards.edit → scheduling.boards.view,
//     hr.locais.edit → hr.locais.view).
// garantiaPermissoes.test.ts falha se uma dependência apontar para um código fora do editor, se houver ciclos, ou se uma rota
// aceitar A OU B e A depender de B (a alternativa seria inútil).
import { CODIGOS_EM_USO } from "./permissoesEmUso";

/** O módulo de uma permissão: o que vem antes do primeiro ponto (leads.edit → leads). */
const moduloDe = (codigo: string): string => codigo.split(".")[0] ?? codigo;

/**
 * Permissões que se usam SOZINHAS (sem a de «ver» do módulo), cada uma com a razão:
 * - quotes.view_costs: no Negócio os custos vêm por fn_cat_pode(org, 'quotes.view_costs'), sem quotes.view (06/11);
 * - client_contracts.cancel: anular o contrato no Negócio pergunta só client_contracts.cancel (06/11);
 * - client_contracts.manage_templates: a rota /contract-templates e o menu aceitam client_contracts.view OU esta (App.tsx, menuConfig.ts);
 * - fleet.self: a alternativa a fleet.view em todas as rotas /frota/* (o condutor vê a sua viatura), não um acréscimo.
 */
export const SEM_DEPENDENCIA: ReadonlySet<string> = new Set([
  "quotes.view_costs", "client_contracts.cancel", "client_contracts.manage_templates", "fleet.self",
]);

/** A ficha de RH de outra pessoa (lista e ficha), ou a própria: a rota /rh-exemplo/pessoas aceita qualquer das duas. */
const FICHA = "hr.pessoas.view";
const FICHA_OU_PROPRIA = [FICHA, "hr.pessoas.view.own"] as const;

/**
 * As partes da ficha de RH. Cada separador/bloco (useContextoFicha.ts) pergunta a SUA permissão (hr.pessoas.pessoais.view…), tanto
 * na ficha de outra pessoa como na própria: sem hr.pessoas.view nem hr.pessoas.view.own a ficha não abre e a parte não serve de nada.
 * Por isso a parte depende de «Ficha › Ver» OU «Ver a própria ficha».
 */
const PARTES_DA_FICHA = [
  "pessoais", "identificacao", "morada", "emergencia", "bancarios", "saude", "sindicalizacao", "laborais", "afectacoes", "colocacao",
  "vinculos", "retribuicao", "horario", "horario_realizado", "documentos",
] as const;

const parteVer = (parte: string): string => `hr.pessoas.${parte}.view`;

/** As dependências escritas à mão. Ganham à regra por omissão. */
export const EXPLICITAS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(PARTES_DA_FICHA.map((parte) => [parteVer(parte), FICHA_OU_PROPRIA])),
  // O núcleo da ficha (nome, estado…): é a mesma ficha, de outra pessoa ou a própria.
  "hr.pessoas.edit": FICHA_OU_PROPRIA,
  // Emitir um documento a partir de um modelo também se faz no separador do contrato («Anexar contrato assinado»), sem a lista de
  // documentos; ler o conteúdo serve também os documentos da própria pessoa. Dependem só da ficha.
  "hr.pessoas.documentos.emitir": FICHA_OU_PROPRIA,
  "hr.pessoas.documentos.conteudo.view": FICHA_OU_PROPRIA,
  // Editar/corrigir/revelar/validar uma parte depende de ver essa parte (que, por sua vez, depende da ficha).
  ...Object.fromEntries(
    ["pessoais", "identificacao", "morada", "emergencia", "bancarios", "saude", "sindicalizacao", "laborais", "afectacoes", "colocacao",
      "vinculos", "retribuicao", "horario", "documentos"].map((parte) => [`hr.pessoas.${parte}.edit`, [parteVer(parte)]]),
  ),
  ...Object.fromEntries(["afectacoes", "colocacao", "retribuicao", "horario"].map((parte) => [`hr.pessoas.${parte}.corrigir`, [parteVer(parte)]])),
  "hr.pessoas.identificacao.reveal": [parteVer("identificacao")],
  "hr.pessoas.horario_realizado.validar": [parteVer("horario_realizado")],
  "hr.pessoas.vinculos.horas.corrigir": [parteVer("vinculos")],
  "hr.pessoas.documentos.anular": [parteVer("documentos")],
  // Ocultar e repor documentos (20270111810000): só se veem os documentos com a parte Documentos da ficha.
  "hr.pessoas.documentos.ocultar": [parteVer("documentos")],
  "hr.pessoas.documentos.repor": [parteVer("documentos")],
  // Ações sobre a ficha de OUTRA pessoa, a partir da lista: só fazem sentido com a lista (hr.pessoas.view). Criar já o exige no
  // ecrã (PessoasRh: create E view, porque a policy de leitura de `pessoas` pede view para devolver a pessoa criada).
  "hr.pessoas.create": [FICHA],
  "hr.pessoas.conta.criar": [FICHA],
  "hr.pessoas.conta.link": [FICHA],
  "hr.pessoas.convite.enviar": [FICHA],
  // 10/11: configurar o canal de denúncias (ligar, designar responsáveis) só faz sentido com a gestão do canal.
  "hr.denuncias.configurar": ["hr.denuncias.gerir"],
};

/**
 * 10/11: as que exigem TAMBÉM outras permissões, lidas como «TODAS DE» (ao contrário de DEPENDE_DE, que é «qualquer de»). Somam-se
 * à dependência normal: a permissão só se marca com a dependência satisfeita E todas estas marcadas; tirar uma destas tira-a em
 * cascata. Podem estar noutro grupo do editor.
 * - hr.pessoas.conta.criar: criar a conta a partir da ficha de RH cria um utilizador, por isso exige também Criar utilizadores.
 */
export const EXIGE_TAMBEM: Readonly<Record<string, readonly string[]>> = {
  "hr.pessoas.conta.criar": ["users.create"],
};

/** O que `codigo` exige também (todas); vazio = nada. */
export const exigidasDe = (codigo: string): readonly string[] => EXIGE_TAMBEM[codigo] ?? [];

const ehVer = (codigo: string): boolean => codigo.endsWith(".view");

function dependenciaDe(codigo: string, noEditor: ReadonlySet<string>): readonly string[] | null {
  if (SEM_DEPENDENCIA.has(codigo)) return null;
  const explicita = EXPLICITAS[codigo];
  if (explicita) return explicita;
  if (ehVer(codigo)) return null;
  const verDoModulo = `${moduloDe(codigo)}.view`;
  if (verDoModulo !== codigo && noEditor.has(verDoModulo)) return [verDoModulo];
  if (codigo.endsWith(".edit")) {
    const par = `${codigo.slice(0, -".edit".length)}.view`;
    if (noEditor.has(par)) return [par];
  }
  return null;
}

/** Constrói o mapa para um conjunto de códigos (o do editor; exportado para os testes). */
export function construirDependencias(noEditor: ReadonlySet<string>): Record<string, readonly string[]> {
  const mapa: Record<string, readonly string[]> = {};
  noEditor.forEach((codigo) => {
    const dep = dependenciaDe(codigo, noEditor);
    if (dep) mapa[codigo] = dep;
  });
  return mapa;
}

/** A dependência de cada permissão do editor («qualquer de»). */
export const DEPENDE_DE: Readonly<Record<string, readonly string[]>> = construirDependencias(CODIGOS_EM_USO);

/** De que depende `codigo` (qualquer de); vazio = de nada. */
export const dependenciasDe = (codigo: string): readonly string[] => DEPENDE_DE[codigo] ?? [];
