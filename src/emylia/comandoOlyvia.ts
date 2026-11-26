// 17/11 (Rúben, ideia WOW): a Olyvia por comando — um botão flutuante que ouve (ou lê) uma frase e faz o que se pede:
//  · navegar: «Olyvia, vai aos negócios», «vai ao catálogo», «mostra o inventário», «hoje»;
//  · abrir um negócio pelo nome, numa fase: «abre o Ruben Branco», «abre o Ruben Branco na fase de negócio»;
//  · andar dentro do negócio: «vai para o fim», «próximo passo», «passo anterior», «vai para a proposta», «vai para a fase de visita»;
//  · procurar: «procura o Nuno Pereira» (põe o nome na pesquisa dos Negócios).
// Protótipo: só navegação e pesquisa — nada que mude dados (uma ação irreversível por voz pede sempre confirmação, fica para depois).
// A compreensão é determinística (palavras-chave), sem modelo nem custo: fiável e instantânea. Só lógica, sem React, para testar à parte.

export interface Destino { url: string; nome: string; palavras: string[] }

/** Os sítios para onde a Olyvia salta. A palavra mais específica ganha (ex.: «catálogo e custos» ganha a «custos»). */
export const DESTINOS: Destino[] = [
  { url: "/negocios", nome: "Negócios", palavras: ["negocios", "negocio", "pipeline", "funil", "o quadro", "quadro dos negocios"] },
  { url: "/negocios?vista=hoje", nome: "Hoje", palavras: ["hoje", "o meu dia", "meu dia", "tarefas de hoje"] },
  { url: "/negocios?vista=operacoes", nome: "Operações", palavras: ["operacoes", "obras em curso", "gestao de obra", "as obras"] },
  { url: "/pessoas", nome: "Pessoas", palavras: ["pessoas", "clientes", "contactos", "contatos", "os leads", "lista de clientes"] },
  { url: "/client-orders", nome: "Inventário", palavras: ["inventario", "stock", "armazem", "encomendas de cliente"] },
  { url: "/equipas-obra", nome: "Equipas de obra", palavras: ["equipas de obra", "equipa de obra", "as equipas", "equipas"] },
  { url: "/catalogo/servicos", nome: "Catálogo e custos", palavras: ["catalogo e custos", "catalogo", "custos", "produtos e servicos", "precos"] },
  { url: "/prototipo/estudio", nome: "Estúdio", palavras: ["estudio", "a planta", "o projeto 3d"] },
  // 26/11: os relatórios da Olyvia (negócios, obras, orçamento; PDF e Excel)
  { url: "/relatorios/olyvia", nome: "Relatórios", palavras: ["relatorios", "relatorio", "os relatorios", "relatorio dos negocios"] },
];

/** As fases do negócio, pela ordem do motor (motor.ts FASES): 0 Por contactar … 5 Obra. */
export const FASES_NOMES = ["Por contactar", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"] as const;

export type Comando =
  | { acao: "navegar"; url: string; nome: string }
  | { acao: "pesquisar"; termo: string }
  | { acao: "abrir-negocio"; nome: string; fase: number | null }
  | { acao: "ir-fase"; fase: number }
  /** passo: «fim», «proximo», «anterior», «inicio», ou o nome do passo («proposta», «morada da obra»). */
  | { acao: "ir-passo"; passo: string }
  /** 17/11: andar na página — «desce», «vai lá para baixo», «sobe», «vai ao topo», «vai ao fundo da página». */
  | { acao: "scroll"; para: "baixo" | "cima" | "topo" | "fundo" }
  /** 17/11: «limpa a pesquisa», «tira o filtro». */
  | { acao: "limpar-pesquisa" }
  /** 17/11 (Rúben: «isto vai substituir a gravação da chamada»): «começa a gravar», «grava a visita», «termina a gravação». */
  | { acao: "gravar"; ligar: boolean }
  /** 17/11 (Rúben): «volta para trás» = a página anterior (como o «recuar» do browser). */
  | { acao: "voltar" }
  /** 17/11 (Rúben: «se eu disser "mais" ele deve fazer mais scroll»): repetir a última ordem de andar na página. */
  | { acao: "mais" }
  /** 17/11: o que sobra pode ser preencher campos («acesso fácil, estacionamento pago») ou um passo pelo nome — a página decide. */
  | { acao: "nada" };

/** Os eventos entre o botão (OlyviaComando.tsx) e as páginas que sabem fazer (NegociosEmylia.tsx, NegocioSimples.tsx). */
export const EV_PESQUISA = "olyvia-pesquisa";
export const EV_ABRIR = "olyvia-abrir-negocio";
export const EV_FASE = "olyvia-fase";
export const EV_PASSO = "olyvia-passo";
export const EV_RESPOSTA = "olyvia-resposta";
/** 17/11: a frase vai ao Estúdio (estudioPorVoz.ts); o detalhe { frase, ok, msg } volta preenchido se o Estúdio fez alguma coisa. */
export const EV_ESTUDIO = "olyvia-estudio";
/** A página que fez (ou não conseguiu) responde ao botão, que mostra a frase. */
export const responderOlyvia = (msg: string, ok = true): void => { window.dispatchEvent(new CustomEvent(EV_RESPOSTA, { detail: { msg, ok } })); };

/** Minúsculas, sem acentos nem pontuação, espaços colapsados. */
export const normal = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** `p` (já normalizado) aparece em `s` como palavra/expressão inteira. */
const temExpressao = (s: string, p: string): boolean => ` ${s} `.includes(` ${p} `);

/** O destino cuja palavra-chave aparece na frase; empate, ganha a mais longa (mais específica). */
export function melhorDestino(s: string): Destino | null {
  let melhor: Destino | null = null, tamanho = 0;
  for (const d of DESTINOS) for (const p of d.palavras) {
    const pn = normal(p);
    if (temExpressao(s, pn) && pn.length > tamanho) { melhor = d; tamanho = pn.length; }
  }
  return melhor;
}

// ------------------------------------------------------------------ a fase dita («na fase de negócio», «no financeiro»)
const NOME_FASE = "(por contactar|contacto|contato|visita|levantamento|negocio|proposta|orcamento|financeiro|fatura|faturacao|pagamento|obra)";
const FASE_COM_PALAVRA = new RegExp(`\\s*\\b(?:(?:na|no|em|para a|pra a|pra|a|ir a|ir para a)\\s+)?fase\\s+(?:(?:de|do|da|dos|das)\\s+)?${NOME_FASE}\\b`);
const FASE_NO_FIM = new RegExp(`\\s+(?:na|no)\\s+${NOME_FASE}$`);
const indiceFase = (n: string): number =>
  /^por contactar$/.test(n) ? 0 : /^conta(c)?to$/.test(n) ? 1 : /^(visita|levantamento)$/.test(n) ? 2
    : /^(negocio|proposta|orcamento)$/.test(n) ? 3 : /^(financeiro|fatura|faturacao|pagamento)$/.test(n) ? 4 : 5;

/** Tira a fase da frase e devolve-a (índice) com o resto. */
export function extrairFase(s: string): { fase: number | null; resto: string } {
  const m = s.match(FASE_COM_PALAVRA) ?? s.match(FASE_NO_FIM);
  if (!m) return { fase: null, resto: s };
  return { fase: indiceFase(m[1]), resto: (s.slice(0, m.index) + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " ").trim() };
}

// ------------------------------------------------------------------ o passo («vai para o fim», «próximo passo», «vai para a proposta»)
const VERBO_MOVER = /^(vai|vamos|ir|passa|passar|salta|saltar|anda|avanca|avancar|volta|voltar|segue|seguir)\b\s*(.*)$/;
const PREP_INICIO = /^(?:(?:para|pra|pro|ao|aos|a|as|o|os|no|na|nos|nas|em|ate)\s+)+/;
/** Os passos especiais (sem nome): fim, próximo, anterior, início. */
function passoEspecial(alvo: string): string | null {
  if (/^(?:o )?(?:fim|final|ultimo passo|ultimo|fim do negocio)$/.test(alvo)) return "fim";
  if (/^(?:o )?(?:proximo|seguinte)(?: passo)?$|^passo seguinte$/.test(alvo)) return "proximo";
  if (/^(?:o )?(?:anterior|passo anterior)$/.test(alvo)) return "anterior";
  if (/^(?:o )?(?:inicio|primeiro passo|primeiro|comeco)$/.test(alvo)) return "inicio";
  return null;
}

// ------------------------------------------------------------------ a pesquisa e o nome do negócio
const VERBO_BUSCA = /\b(?:procura[r]?|pesquisa[r]?|encontra[r]?|busca[r]?|localiza[r]?)\b\s+(.+)$/;
const VERBO_ABRIR = /^(?:abre|abrir|abra|mostra|mostrar|mostre|ve|ver|entra|entrar)\s+(?:me\s+)?(?:(?:no|na|em)\s+)?(.*)$/;
const COISA_COM_NOME = /\b(?:o |a |os |as )?(?:negocio|cliente|ficha|pessoa)\s+(?:d[oa]s?\s+|do\s+|da\s+|de\s+)?(.+)$/;
// artigos, preposições e os substantivos «negócio/cliente/ficha/pessoa» no início do termo (ex.: «a cliente Ana» → «Ana»)
// 17/11 (gravação do Rúben: «procura por Ruben Carvalho» procurava «por ruben carvalho»): também «por», «pelo», «pela»
const LIXO_INICIO = /^(?:o |a |os |as |um |uma |por\s+|pel[oa]\s+|d[oa]s?\s+|do\s+|da\s+|de\s+|negocio\s+|cliente\s+|ficha\s+|pessoa\s+)+/;
const limparNome = (t: string): string => t.replace(LIXO_INICIO, "").trim();
const eNome = (nome: string): boolean => nome.length >= 2 && !melhorDestino(nome);

/** O termo a procurar, se a frase for uma pesquisa («procura o Nuno»). Senão, null. */
export function extrairBusca(s: string): string | null {
  const m = s.match(VERBO_BUSCA);
  if (!m) return null;
  const termo = limparNome(m[1]);
  return eNome(termo) ? termo : null;
}

/** 17/11: letras soltas ditas uma a uma juntam-se («teste c p» → «teste cp»): o reconhecimento escreve assim as siglas. */
export const juntarLetras = (s: string): string => s.replace(/\b[a-z0-9]\b(?: [a-z0-9]\b)+/g, (m) => m.replace(/ /g, ""));

/** A palavra de ativação, como o reconhecimento a escreve: «Olyvia», «Olívia», «Olivia», «ó Lívia». */
const GATILHO = /\bo ?l[iy]via\b/g;
/** A frase tem a palavra de ativação «Olyvia»? */
export const temGatilho = (texto: string): boolean => new RegExp(GATILHO.source).test(normal(texto));

/** Em modo «sempre à escuta»: o que vem a seguir à palavra de ativação «Olyvia» (a última vez que aparece na frase corrida).
 *  Sem «Olyvia», devolve null (não se faz nada). Apanha «Olyvia», «Olívia», «Olivia» (o reconhecimento escreve-a de várias formas). */
export function extrairAposGatilho(texto: string): string | null {
  const t = normal(texto);
  const re = new RegExp(GATILHO.source, "g");
  let m: RegExpExecArray | null, fim = -1;
  while ((m = re.exec(t)) !== null) fim = m.index + m[0].length;
  if (fim === -1) return null;
  const depois = t.slice(fim).replace(/^[\s,:.]+/, "").trim();
  return depois || null;
}

// 17/11 (Rúben: «é chato estar sempre a dizer Olyvia, a primeira vez chega»): depois de «Olyvia», a conversa segue sem o nome.
/** Pedir à Olyvia para parar de ouvir (volta a precisar de «Olyvia»): «obrigado», «chega», «para», «dorme», «adeus». */
export const pedeParaParar = (texto: string): boolean =>
  /^(?:(?:muito )?obrigad[oa]|chega|ja chega|para|parar|para de ouvir|dorme|adeus|tchau|ate ja|silencio|stop)$/.test(normal(texto).replace(new RegExp("^" + GATILHO.source + "\\s*"), "").trim());
/** 17/11: as ordens de preencher («põe acesso fácil, estacionamento pago, contentor na via pública») são compridas e valem. */
export const VERBO_PREENCHER = /^(?:poe|por|pois|poem|mete|meter|marca|marcar|preenche|preencher|escolhe|escolher|coloca|colocar|seleciona|selecionar|define|definir|muda|mudar|altera|alterar|responde|responder)\b(?:\s+(?:me|la|lo|ai|ali|la))?\s*/;
/** Um comando é curto; uma frase comprida, com a Olyvia acordada, é conversa à volta (não se trata como ordem) — salvo se manda preencher. */
export const pareceComando = (texto: string): boolean => {
  const n = limparFrase(normal(texto));
  return !!n && (n.split(" ").length <= 9 || (VERBO_PREENCHER.test(n) && n.split(" ").length <= 30));
};

// 17/11 (gravação do Rúben: «ok abre o Ruben Carvalho novamente», «não, limpa o campo de pesquisa»): palavras de conversa à volta da ordem
// «não» só cai antes de uma ordem («não, limpa a pesquisa»); «não tem elevador» é uma resposta e fica
const ENCHIMENTO_INICIO = /^(?:(?:ok|okay|pronto|entao|agora|olha|ora|bem|sim|e|ja|bora|vamos la|por favor|se faz favor|faz favor|nao(?= (?:abre|abrir|vai|limpa|procura|pesquisa|mostra|desce|sobe|volta|passa|entra)\b))\s+)+/;
const ENCHIMENTO_FIM = /(?:\s+(?:novamente|outra vez|de novo|por favor|se faz favor|faz favor|agora|ja|ai|obrigad[oa]))+$/;
/** Tira o enchimento do início e do fim da frase (já normalizada); se ficar vazia, devolve-a como estava. */
export const limparFrase = (s: string): string => s.replace(ENCHIMENTO_INICIO, "").replace(ENCHIMENTO_FIM, "").trim() || s;

// 17/11 (gravação: «faz-te lá para baixo» não fazia nada): andar na página
const SCROLL_FUNDO = /\b(?:fundo(?: da pagina)?|fim da pagina|final da pagina|ate (?:ao )?(?:fundo|fim da pagina)|la (?:para|pra) baixo de tudo)\b/;
const SCROLL_TOPO = /\b(?:topo(?: da pagina)?|cimo da pagina|inicio da pagina|la (?:para|pra) cima de tudo)\b/;
const SCROLL_BAIXO = /\b(?:desce|descer|desca|desces|desliza|scroll|rola|rolar|(?:para|pra) baixo|mais abaixo|mais para baixo|abaixo)\b/;
const SCROLL_CIMA = /\b(?:sobe|subir|suba|(?:para|pra) cima|mais acima|mais para cima|acima)\b/;
function scrollPedido(s: string): "baixo" | "cima" | "topo" | "fundo" | null {
  if (SCROLL_FUNDO.test(s)) return "fundo";
  if (SCROLL_TOPO.test(s)) return "topo";
  if (SCROLL_BAIXO.test(s)) return "baixo";
  if (SCROLL_CIMA.test(s)) return "cima";
  return null;
}
const LIMPAR = /\b(?:limpa|limpar|apaga|apagar|tira|tirar|esvazia|remove|retira)\b.*\b(?:pesquisa|procura|busca|filtro|filtros)\b|^(?:sem pesquisa|mostra (?:todos|tudo)|ver (?:todos|tudo))$/;

// 17/11: a Olyvia liga e desliga a gravação da chamada / da visita (carrega nos botões do painel, ChamadaDireto.tsx)
const PARAR_GRAVAR = /\b(?:para|parar|pára|termina|terminar|acaba|acabar|fecha|fechar|desliga|desligar)\b(?:\s+\S+){0,3}\s+(?:gravar|gravacao|chamada)\b|\b(?:para|parar|termina|acaba) (?:de )?gravar\b/;
const LIGAR_GRAVAR = /^(?:(?:comeca|começa|inicia|iniciar|liga|ligar|vamos|podes)\s+(?:a\s+)?)?(?:gravar|grava)\b|\b(?:comeca|inicia|liga) (?:a )?(?:gravacao|chamada)\b|\b(?:ouve|regista|anota|grava) (?:a |esta )?(?:conversa|visita|chamada)\b/;

/** A frase dita ou escrita vira um comando. Tira a palavra de ativação «Olyvia» do início, se vier. */
export function interpretarComando(texto: string): Comando {
  const t = juntarLetras(normal(texto));
  if (!t) return { acao: "nada" };
  const semGatilho = limparFrase(t.replace(new RegExp("^(?:ok |o |a )?" + GATILHO.source + "\\s*"), "").trim() || t);
  if (/^(?:volta|voltar|vai|anda|regressa)\s+(?:para|pra|a)?\s*(?:tras|atras)$|^(?:pagina anterior|volta a pagina anterior|vai a pagina anterior|recua|recuar|para tras)$/.test(semGatilho)) return { acao: "voltar" };
  if (/^(?:mais|mais um bocado|mais um pouco|ainda mais|outra vez|de novo|novamente|continua|continuar)$/.test(semGatilho) || /^(?:mais|outra vez|de novo|novamente|continua)$/.test(t.replace(new RegExp("^(?:ok |o |a )?" + GATILHO.source + "\\s*"), "").trim())) return { acao: "mais" };
  if (LIMPAR.test(semGatilho)) return { acao: "limpar-pesquisa" };
  if (PARAR_GRAVAR.test(semGatilho)) return { acao: "gravar", ligar: false };
  if (LIGAR_GRAVAR.test(semGatilho)) return { acao: "gravar", ligar: true };
  // a página antes dos passos: «vai lá para baixo» não é o passo «lá para baixo»; mas «vai para o fim» continua a ser o passo Fim
  const sc = scrollPedido(semGatilho);
  if (sc) return { acao: "scroll", para: sc };
  const { fase, resto: s } = extrairFase(semGatilho);

  // 1) um passo sozinho: «fim», «próximo passo», «anterior»
  const so = passoEspecial(s);
  if (so) return { acao: "ir-passo", passo: so };

  // 2) mexer-se: «vai para o fim», «vai para a proposta», «vai para a fase de visita», «vai aos negócios»
  const mov = s.match(VERBO_MOVER);
  if (mov) {
    const alvo = mov[2].replace(PREP_INICIO, "").trim();
    if (!alvo && fase != null) return { acao: "ir-fase", fase };
    if (!alvo) return /^(avanca|avancar|segue|seguir)$/.test(mov[1]) ? { acao: "ir-passo", passo: "proximo" }
      : /^(volta|voltar)$/.test(mov[1]) ? { acao: "ir-passo", passo: "anterior" } : { acao: "nada" };
    const esp = passoEspecial(alvo);
    if (esp) return { acao: "ir-passo", passo: esp };
    const dest = melhorDestino(alvo) ?? melhorDestino(mov[2]);
    if (dest) return { acao: "navegar", url: dest.url, nome: dest.nome };
    const passo = alvo.replace(/^passo\s+/, "").trim();
    if (passo) return { acao: "ir-passo", passo };
  }

  // 3) procurar: «procura o Nuno Pereira»
  const busca = extrairBusca(s);
  if (busca) return { acao: "pesquisar", termo: busca };

  // 4) abrir um negócio pelo nome: «abre o Ruben Branco (na fase de negócio)», «mostra o negócio da Maria»
  const ab = s.match(VERBO_ABRIR);
  if (ab) {
    const nome = limparNome(ab[1]);
    if (eNome(nome) && !melhorDestino(ab[1])) return { acao: "abrir-negocio", nome, fase };
  }
  const coisa = s.match(COISA_COM_NOME);
  if (coisa) {
    const nome = limparNome(coisa[1]);
    if (eNome(nome)) return { acao: "abrir-negocio", nome, fase };
  }

  // 5) navegar para uma página
  const dest = melhorDestino(s);
  if (dest) return { acao: "navegar", url: dest.url, nome: dest.nome };

  // 6) só a fase: «fase de financeiro»
  if (fase != null) return { acao: "ir-fase", fase };
  return { acao: "nada" };
}

// ------------------------------------------------------------------ 18/11: quando agir (não cortar a meio de uma frase)
// Rúben: «que não corte; se a pessoa fizer uma pequena pausa, ele não quebra». O browser dá a frase por acabada ao fim de ~0,7 s de
// silêncio, e antes agia-se logo aí: quem parava para pensar («abre o negócio do… Carlos») ficava cortado. Agora espera-se pelo fim do
// PENSAMENTO, pelo silêncio desde a última palavra ouvida: curto nas ordens feitas («desce»), mais longo numa frase natural, e bem mais
// longo quando a frase acaba a meio («… e», «… do», «… para», «hum»).

/** «desce», «sobe», «mais», «volta para trás»: quase instantâneo. */
export const PAUSA_CURTA = 450;
/** Uma ordem conhecida e curta que o browser já deu por acabada («vai ao catálogo», «procura o Nuno»). */
export const PAUSA_ORDEM = 800;
/** Uma frase natural: o silêncio que diz que a pessoa acabou de falar. */
export const PAUSA_FRASE = 1600;
/** A frase acaba a meio (num «e», «do», «para», num «hum»): a pessoa ainda está a pensar. */
export const PAUSA_A_MEIO = 3200;

const ACABA_A_MEIO = /\b(?:e|ou|mas|que|de|do|da|dos|das|no|na|nos|nas|ao|aos|a|o|os|as|um|uma|uns|umas|para|pra|pro|com|sem|em|por|pelo|pela|se|depois|tambem|entao|tipo|hum|hmm|humm|eh|ah|er|portanto|porque|quando|onde|como|qual|quais|meu|minha|seu|sua|esse|essa|este|esta|isto|aquele|aquela|tipo assim|ou seja|quer dizer|sobre|ate|entre|mais|muito|bem)$/;
/** A frase dita acaba a meio (uma palavra que pede continuação)? */
export const acabaAMeio = (texto: string): boolean => ACABA_A_MEIO.test(normal(texto));

/** Quanto silêncio (ms) esperar, desde a última palavra ouvida, antes de agir. */
export function esperaAteAgir(cmd: string, c: Comando, final: boolean): number {
  if (acabaAMeio(cmd)) return PAUSA_A_MEIO;
  if (c.acao === "scroll" || c.acao === "mais" || c.acao === "voltar") return PAUSA_CURTA;
  if (c.acao !== "nada" && final && normal(cmd).split(" ").length <= 6) return PAUSA_ORDEM;
  return PAUSA_FRASE;
}

/** 18/11: a resposta a «Confirmas?» (ações que não se desfazem pedem sempre confirmação). */
export const eConfirmacao = (texto: string): boolean => {
  const s = limparFrase(normal(texto).replace(new RegExp("^(?:ok |o |a )?" + GATILHO.source + "\\s*"), ""));
  // a frase INTEIRA tem de ser um «sim» («sim, pode», «confirmo»): «vai aos negócios» é outra ordem, não confirma nada
  const SIM = "(?:sim|confirmo|confirma|confirmado|pode|podes|pode ser|avanca|avancar|faz|faz isso|faz la|isso|isso mesmo|claro|claro que sim|ok|okay|esta bem|ta bem|vai em frente|com certeza|exato|exatamente|certo|siga|bora|carrega|carrega ai|envia|manda)";
  return new RegExp(`^${SIM}(?: ${SIM})*$`).test(s);
};
export const eRecusa = (texto: string): boolean => {
  const s = normal(texto).replace(new RegExp("^(?:ok |o |a )?" + GATILHO.source + "\\s*"), "");
  return /^(?:nao|cancela|cancelar|espera|deixa|deixa estar|esquece|nem pensar|para|alto|negativo)\b/.test(s);
};

// ------------------------------------------------------------------ o que as páginas usam para cumprir o comando

/** O negócio cujo nome mais se parece com o dito: igual > começa por > tem todas as palavras. Null se nenhum serve. */
export function negocioPorNome<T extends { nome: string }>(deals: readonly T[], nome: string): T | null {
  const alvo = juntarLetras(normal(nome));
  if (!alvo) return null;
  const toks = alvo.split(" ");
  let melhor: T | null = null, pontos = 0;
  for (const d of deals) {
    const n = juntarLetras(normal(d.nome));
    let p = n === alvo ? 4 : n.startsWith(alvo) ? 3 : toks.every((x) => temExpressao(n, x)) ? 2 : toks.every((x) => n.includes(x)) ? 1 : 0;
    // 17/11 (Rúben: «disse "abre o teste cp" e nem isso regista»): um nome mal ouvido («teste sp», «nuno pereiro») ainda serve, se cada
    // palavra dita for parecida com uma do nome (média ≥ 0,7); fica abaixo das correspondências certas
    if (!p) {
      const ns = n.split(" ");
      const media = toks.reduce((s, x) => s + Math.max(...ns.map((y) => parecido(x, y))), 0) / toks.length;
      if (media >= 0.7) p = media;
    }
    if (p > pontos) { melhor = d; pontos = p; }
  }
  return melhor;
}

/** Distância de edição (Levenshtein) e a parecença 0–1 entre duas palavras. */
function distancia(a: string, b: string): number {
  const v = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let ant = v[0]; v[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = v[j]; v[j] = Math.min(v[j] + 1, v[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = t; }
  }
  return v[b.length];
}
export const parecido = (a: string, b: string): number => { const m = Math.max(a.length, b.length); return m ? 1 - distancia(a, b) / m : 1; };

/** O índice do passo pedido (passos.length = «Fim»), a partir do passo aberto. Null se não há passo com esse nome. */
export function indicePasso(passos: readonly { id: string; titulo: string }[], alvo: string, ativo: number): number | null {
  const a = normal(alvo);
  if (a === "fim") return passos.length;
  if (a === "proximo") return Math.min(passos.length, ativo + 1);
  if (a === "anterior") return Math.max(0, ativo - 1);
  if (a === "inicio") return 0;
  if (!a) return null;
  const i = passos.findIndex((p) => { const t = normal(p.titulo), id = normal(p.id); return t === a || id === a || (a.length >= 4 && t.includes(a)) || (t.length > 3 && temExpressao(a, t)); });
  if (i !== -1) return i;
  // 17/11: um nome de passo mal ouvido («exterior do edificio» → «exterior de edifício») ainda serve, palavra a palavra (≥ 0,8)
  const toks = a.split(" ").filter((x) => x.length > 2);
  if (!toks.length) return null;
  let melhor = -1, pontos = 0;
  passos.forEach((p, j) => {
    const ns = normal(p.titulo).split(" ").filter((x) => x.length > 2);
    if (!ns.length) return;
    const media = ns.reduce((s, y) => s + Math.max(...toks.map((x) => parecido(x, y))), 0) / ns.length;
    if (media >= 0.8 && media > pontos) { melhor = j; pontos = media; }
  });
  return melhor === -1 ? null : melhor;
}
