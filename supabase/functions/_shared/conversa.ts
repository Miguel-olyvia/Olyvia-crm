// 11/11 (Rúben: «a transcrição falha muito e precisamos de retirar muitos mais insights»). As instruções, os esquemas e as regras puras da
// transcrição em blocos e da análise da conversa (chamada de qualificação e visita). Sem imports: usa-se nas funções Supabase e corre
// também no Node, para os testes com gravações reais (scripts fora do git).
//
// Porquê blocos: cada fala curta, sozinha, dava ao modelo 1 a 3 s de áudio sem contexto. Com o cliente abafado pelo altifalante, ele
// inventava frases plausíveis («Ingressos e bilhetes para o jogo» em vez de «em princípio é para nivelar tudo») e quem fala decidia-se
// fala a fala por comparação de vozes. Um bloco contínuo de ~50 s, com o fim da conversa anterior, dá ao modelo as duas vozes lado a
// lado e o assunto: na chamada real da Catarina (11/11) o texto saiu quase sem erros e com quem fala certo em todas as linhas.

export type Tipo = "chamada" | "visita";
export type Falante = "comercial" | "cliente" | "outro";

export const INSTRUCAO_BLOCO: Record<Tipo, string> = {
  chamada: `Transcreve este áudio palavra a palavra, em português de Portugal. É um troço de uma chamada telefónica entre um comercial de uma empresa de remodelações e um cliente. O microfone está na sala do comercial: a voz do comercial ouve-se perto e nítida; a voz do cliente vem do altifalante de um telemóvel, mais baixa, abafada e metálica. A voz do cliente é a mais importante: ouve-a com toda a atenção e não a deixes de fora, mesmo quando é baixa.

Divide a conversa em frases, pela ordem em que são ditas, e em cada uma dá:
- inicio e fim, em segundos desde o início deste áudio;
- falante: "comercial" ou "cliente" (ou "outro" para uma terceira pessoa ou uma gravação da operadora). Decide pela acústica (perto e nítido é o comercial; pelo altifalante é o cliente) e pelo papel na conversa (o comercial apresenta-se, faz as perguntas, explica e marca; o cliente fala da casa dele, do que quer e responde);
- texto: exatamente o que foi dito, com os "sim", "pois", "exato" que são respostas, e os números em algarismos ("2 casas de banho", "dia 10 às 11", "6.º direito", "5 mil euros");
- confianca: de 0 a 1, de que o texto é mesmo o que se disse.

Regras: nunca inventes nem completes uma frase plausível; se uma parte não se percebe, escreve "(impercetível)" nesse sítio e baixa a confiança. Toques, música de espera e ruído ficam de fora; se não houver fala nenhuma, a lista vem vazia. Não resumas, não traduzas, não corrijas a gramática.`,
  visita: `Transcreve este áudio palavra a palavra, em português de Portugal. É um troço de uma visita a casa de um cliente, para uma obra de remodelação (casa de banho, cozinha ou outra divisão). O comercial e o cliente (às vezes mais alguém da família) falam na mesma divisão, perto de um telemóvel que grava; pode haver eco, passos, água, a fita métrica.

Divide a conversa em frases, pela ordem em que são ditas, e em cada uma dá:
- inicio e fim, em segundos desde o início deste áudio;
- falante: "comercial" (o profissional da empresa: mede, explica as opções, mostra amostras, fala de preços, prazos e da obra), "cliente" (o dono da casa: diz o que quer, o que gosta, as dúvidas, responde) ou "outro" (outra pessoa da casa). Usa o timbre e o papel na conversa, e mantém a mesma pessoa coerente ao longo do áudio;
- texto: exatamente o que foi dito. Medidas e números em algarismos ("80 por 60", "2,10 metros", "1 metro e 70", "8.900 euros", "dia 15"). Termos de obra comuns: base de duche, banheira, sanita suspensa, autoclismo, móvel, coluna, resguardo, torneira, misturadora, revestimento, pavimento, azulejo, tijoleira, teto falso, canalização, esgoto, impermeabilização;
- confianca: de 0 a 1, de que o texto é mesmo o que se disse.

Regras: nunca inventes nem completes uma frase plausível; se uma parte não se percebe, escreve "(impercetível)" nesse sítio e baixa a confiança. Ruído fica de fora; se não houver fala nenhuma, a lista vem vazia. Não resumas, não traduzas, não corrijas a gramática.`,
};

/** O fim do que já se transcreveu vai com o bloco, só para o assunto e para manter as mesmas pessoas. */
export const comContexto = (instrucao: string, contexto?: string) => contexto?.trim()
  ? `${instrucao}\n\nO que se disse imediatamente antes deste áudio (só para perceberes o assunto e quem é quem; NÃO o transcrevas nem o repitas):\n${contexto.trim()}`
  : instrucao;

export const ESQUEMA_BLOCO = {
  type: "OBJECT",
  properties: {
    frases: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          inicio: { type: "NUMBER" }, fim: { type: "NUMBER" },
          falante: { type: "STRING", enum: ["comercial", "cliente", "outro"] },
          texto: { type: "STRING" }, confianca: { type: "NUMBER" },
        },
        required: ["inicio", "fim", "falante", "texto", "confianca"],
      },
    },
  },
  required: ["frases"],
};

// O nome da empresa sai de muitas maneiras ao ouvido do modelo; corrige-se depois (no texto que se pede, decalcava-o em troços de ruído).
const CORRECOES: [RegExp, string][] = [
  [/\bMudoar\b|\bModular\b|\bModolar\b|\bModulari\b|\bMudolar\b|\bModelar\b|\bMudular\b/g, "Mudelar"],
  [/\bwalking shower\b|\bwalk in shower\b/gi, "walk-in shower"],
  [/\bS\.P\.C\.?/g, "SPC"],
];
export const corrigir = (t: string) => CORRECOES.reduce((s, [rx, r]) => s.replace(rx, r), t);

export interface FraseBloco { inicio: number; fim: number; texto: string; confianca: number; falante: Falante }

/** As frases de um bloco, limpas e com os tempos da gravação inteira. Num bloco «obrigado» é fala a sério (não se filtra como na fala solta). */
export function frasesDoBloco(brutas: unknown, deslocamentoS: number, duracaoS: number): FraseBloco[] {
  const lista = Array.isArray((brutas as { frases?: unknown })?.frases) ? (brutas as { frases: Record<string, unknown>[] }).frases : [];
  const out: FraseBloco[] = [];
  for (const f of lista) {
    const texto = corrigir(String(f.texto ?? "").replace(/\s+/g, " ").trim());
    const confianca = Number(f.confianca ?? 0);
    if (!texto || !(confianca >= 0.3) || /^\(?imperce[pt]+[íi]vel\)?[.!…]*$/i.test(texto)) continue;
    let ini = Math.max(0, Number(f.inicio) || 0), fim = Math.max(ini, Number(f.fim) || ini);
    if (duracaoS > 0) { ini = Math.min(ini, duracaoS); fim = Math.min(Math.max(fim, ini), duracaoS + 1); }
    const falante: Falante = f.falante === "comercial" || f.falante === "outro" ? f.falante : "cliente";
    out.push({ inicio: r2(deslocamentoS + ini), fim: r2(deslocamentoS + fim), texto, confianca: r2(confianca), falante });
  }
  // o modelo às vezes devolve a mesma frase duas vezes seguidas
  return out.filter((f, i) => i === 0 || !(f.texto === out[i - 1].texto && f.falante === out[i - 1].falante))
    .sort((a, b) => a.inicio - b.inicio);
}
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---- a análise da conversa (os insights) ----------------------------------------------------------------------------------------------

const SOBRE: Record<Tipo, string> = {
  chamada: `É a CHAMADA DE QUALIFICAÇÃO: o primeiro contacto por telefone com um potencial cliente que pediu um orçamento. O objetivo do comercial
é perceber o que o cliente quer, qualificá-lo (tipo de imóvel, se é proprietário, quem decide, orçamento, prazo) e marcar a visita.
As perguntas-chave de uma boa chamada: o que quer fazer e porquê agora, o tipo de imóvel e a morada, se é proprietário e quem mais decide,
o orçamento que tem em mente, para quando quer a obra, se já pediu outros orçamentos, e um dia e hora para a visita.`,
  visita: `É a VISITA a casa do cliente: o comercial vê o espaço, mede, mostra amostras e o cliente escolhe; às vezes apresenta logo o valor.
O objetivo é sair com tudo o que é preciso para o orçamento e com a decisão encaminhada. As perguntas-chave de uma boa visita: as medidas e o
estado do espaço (canalização, humidade, paredes), as escolhas peça a peça, o estilo e as cores, o orçamento do cliente, quando quer a obra e
quando decide, quem mais decide, se tem outros orçamentos, e o próximo passo concreto (quando se envia a proposta, quando se volta a falar).`,
};

export const INSTRUCAO_INSIGHTS = (tipo: Tipo) => `És o melhor diretor comercial de uma empresa de remodelações em Portugal. Lês a transcrição de uma conversa entre um comercial
da empresa e um cliente e tiras dela TUDO o que ajuda a vender, a preparar o passo seguinte e a fazer bem a obra. Escreves em português de
Portugal, frases curtas e concretas, com os factos e os números ditos (nunca genéricos como «o cliente está interessado»).

${SOBRE[tipo]}

Cada linha da transcrição tem um número entre parênteses retos e quem fala («Comercial», «Cliente» ou «Outra pessoa»). Quando um ponto
vem de uma linha concreta, põe esse número em 'linha' (é por ele que a app mostra o momento e o tempo). Se vem de várias, a mais clara.

Regras:
- Só o que foi dito ou o que se deduz com segurança do que foi dito. Nunca inventes. Se um tema não foi falado, a lista vem vazia ou o
  valor é null; o que não se sabe vai para 'por_perguntar'.
- Uma pergunta do comercial não é uma resposta do cliente.
- temperatura e pontuacao: quão perto o cliente está de comprar connosco (quente 70 a 100: necessidade clara, urgência, orçamento
  compatível, decisor presente, aceitou o passo seguinte; morno 40 a 69; frio abaixo de 40: só a pedir preços, sem prazo, sem decisão,
  resistência). Em 'porque_temperatura' os 2 ou 3 factos que pesam.
- necessidades: o que o cliente quer fazer e o problema que quer resolver, uma por linha.
- motivacao: porquê agora (avaria, humidade, venda da casa, filhos, idade, conforto, estética), nas palavras do cliente.
- orcamento: o valor ou intervalo dito (texto, ex. «até 5 mil euros»), a sensibilidade ao preço e notas (financiamento, pagamento faseado,
  «está caro»). prazo: quando quer a obra, a urgência, a data em que decide (AAAA-MM-DD se for uma data) e notas (férias, mudanças).
- decisores: quem decide ou influencia (marido, mulher, filhos, senhorio, condomínio), com o papel.
- concorrencia: se já pediu ou vai pedir outros orçamentos, a quem, e o que comparou.
- objecoes: dúvidas, receios e resistências do cliente (preço, prazo, sujidade da obra, confiança, ter de sair de casa), com a resposta
  que o comercial deu (ou null se não respondeu) e se ficou resolvida.
- sinais_compra: frases que mostram vontade de avançar (perguntas sobre prazos, pagamento, «quando podem começar», escolhas firmes).
- preferencias: estilo, cores, materiais, marcas, o que gosta e o que não quer; tema curto + texto.
- riscos: o que pode correr mal na obra ou no negócio (prédio antigo, humidade, canalização, acesso, estacionamento, elevador,
  condomínio, pessoa idosa ou com mobilidade reduzida a viver na casa, animais, prazos apertados, expectativa de preço irrealista).
- compromissos: o que cada um prometeu (o comercial: enviar o orçamento, mandar fotos, ligar; o cliente: mandar fotos, falar com o
  marido, decidir até X), com quando.
- proximos_passos: as ações concretas que daqui saem, por ordem, com o responsável («Comercial», «Cliente», «Técnico», «Escritório») e
  quando. Inclui os passos óbvios que a conversa pede mesmo que ninguém os tenha dito (ex.: confirmar a visita na véspera).
- por_perguntar: o que falta saber para o passo seguinte e não foi perguntado ou ficou sem resposta (perguntas prontas a fazer).
- oportunidades: outras obras ou serviços que o cliente mencionou ou que fazem sentido (outra casa de banho, a cozinha, o chão da casa,
  janelas, pintura), com o que foi dito.
- momentos: 4 a 10 momentos-chave da conversa, por ordem, cada um com a linha e um título curto («Diz o orçamento: até 5 mil euros»).
- coaching: para o comercial melhorar. 'correu_bem': o que fez bem, concreto. 'a_melhorar': o que faltou ou podia ter feito melhor
  (perguntas-chave que não fez, interrupções, não marcou o passo seguinte, não respondeu a uma objeção), cada ponto acionável.
- sentimento do cliente no início e no fim da conversa, e notas (o que o fez mudar).
- resumo: 3 a 5 frases para quem pega no negócio a seguir: quem é o cliente, o que quer, onde estamos e o que se segue.${tipo === "visita" ? LEVANTAMENTO : ""}`;

// 11/11 (Rúben: «aprende e melhora»): na visita, o que mais conta para o orçamento e para a obra é o levantamento: o que ficou escolhido
// peça a peça, as medidas ditas e os valores falados. Ficava espalhado por «preferências» e pelo resumo; agora vem à parte, com a linha.
const LEVANTAMENTO = `
- escolhas: o que ficou escolhido (ou ainda em dúvida) peça a peça: base de duche, sanita, móvel, lavatório, torneiras, resguardo,
  revestimento, pavimento, teto, iluminação, etc. Em 'peca' o nome curto da peça; em 'escolha' o que foi escolhido com os pormenores
  ditos (cor, acabamento, medida, marca, modelo); 'decidida' é false quando o cliente ficou de pensar ou hesitou entre opções (diz as
  opções em 'escolha'). Se mudou de ideias, vale a última escolha. Uma linha por peça.
- medidas: todas as medidas ditas (paredes, pé-direito, base de duche, móvel, janela, porta, altura do azulejo), com 'o_que' e 'valor'
  tal como foram ditos («2,10 m», «80 por 60», «até ao teto»).
- valores: os preços, totais, descontos, condições de pagamento e prazos de obra falados («2 semanas de obra», «sinal de 30%»).`;

const item = { type: "OBJECT", properties: { texto: { type: "STRING" }, linha: { type: "INTEGER", nullable: true } }, required: ["texto"] };
const lista = (items: Record<string, unknown>) => ({ type: "ARRAY", items });
const ESCALA = ["alta", "media", "baixa", "desconhecida"];
const HUMOR = ["positivo", "neutro", "negativo", "misto"];

const ESQUEMA_INSIGHTS_BASE = {
  type: "OBJECT",
  properties: {
    resumo: { type: "STRING" },
    temperatura: { type: "STRING", enum: ["quente", "morno", "frio"] },
    pontuacao: { type: "INTEGER" },
    porque_temperatura: { type: "STRING" },
    motivacao: { type: "STRING", nullable: true },
    necessidades: lista(item),
    orcamento: { type: "OBJECT", properties: { valor: { type: "STRING", nullable: true }, sensibilidade: { type: "STRING", enum: ESCALA },
      notas: { type: "STRING", nullable: true } }, required: ["valor", "sensibilidade"] },
    prazo: { type: "OBJECT", properties: { quando: { type: "STRING", nullable: true }, urgencia: { type: "STRING", enum: ESCALA },
      data_decisao: { type: "STRING", nullable: true }, notas: { type: "STRING", nullable: true } }, required: ["quando", "urgencia"] },
    decisores: lista({ type: "OBJECT", properties: { quem: { type: "STRING" }, papel: { type: "STRING" } }, required: ["quem", "papel"] }),
    concorrencia: { type: "OBJECT", properties: { outros_orcamentos: { type: "STRING", enum: ["sim", "nao", "desconhecido"] },
      notas: { type: "STRING", nullable: true } }, required: ["outros_orcamentos"] },
    objecoes: lista({ type: "OBJECT", properties: { texto: { type: "STRING" }, resposta: { type: "STRING", nullable: true },
      resolvida: { type: "BOOLEAN" }, linha: { type: "INTEGER", nullable: true } }, required: ["texto", "resolvida"] }),
    sinais_compra: lista(item),
    preferencias: lista({ type: "OBJECT", properties: { tema: { type: "STRING" }, texto: { type: "STRING" }, linha: { type: "INTEGER", nullable: true } },
      required: ["tema", "texto"] }),
    riscos: lista({ type: "OBJECT", properties: { texto: { type: "STRING" }, gravidade: { type: "STRING", enum: ["alta", "media", "baixa"] },
      linha: { type: "INTEGER", nullable: true } }, required: ["texto", "gravidade"] }),
    compromissos: lista({ type: "OBJECT", properties: { quem: { type: "STRING", enum: ["comercial", "cliente"] }, texto: { type: "STRING" },
      quando: { type: "STRING", nullable: true } }, required: ["quem", "texto"] }),
    proximos_passos: lista({ type: "OBJECT", properties: { texto: { type: "STRING" }, responsavel: { type: "STRING" }, quando: { type: "STRING", nullable: true } },
      required: ["texto", "responsavel"] }),
    por_perguntar: lista({ type: "STRING" }),
    oportunidades: lista(item),
    momentos: lista({ type: "OBJECT", properties: { linha: { type: "INTEGER" }, titulo: { type: "STRING" } }, required: ["linha", "titulo"] }),
    coaching: { type: "OBJECT", properties: { correu_bem: lista({ type: "STRING" }), a_melhorar: lista({ type: "STRING" }) }, required: ["correu_bem", "a_melhorar"] },
    sentimento: { type: "OBJECT", properties: { inicio: { type: "STRING", enum: HUMOR }, fim: { type: "STRING", enum: HUMOR }, notas: { type: "STRING", nullable: true } },
      required: ["inicio", "fim"] },
  },
  required: ["resumo", "temperatura", "pontuacao", "porque_temperatura", "necessidades", "orcamento", "prazo", "decisores", "concorrencia",
    "objecoes", "sinais_compra", "preferencias", "riscos", "compromissos", "proximos_passos", "por_perguntar", "oportunidades", "momentos",
    "coaching", "sentimento"],
};

/** O esquema da análise: o mesmo para a chamada e a visita; a visita junta o levantamento (escolhas, medidas, valores). */
export function esquemaInsights(tipo: Tipo) {
  if (tipo !== "visita") return ESQUEMA_INSIGHTS_BASE;
  return {
    ...ESQUEMA_INSIGHTS_BASE,
    properties: {
      ...ESQUEMA_INSIGHTS_BASE.properties,
      escolhas: lista({ type: "OBJECT", properties: { peca: { type: "STRING" }, escolha: { type: "STRING" }, decidida: { type: "BOOLEAN" },
        linha: { type: "INTEGER", nullable: true } }, required: ["peca", "escolha", "decidida"] }),
      medidas: lista({ type: "OBJECT", properties: { o_que: { type: "STRING" }, valor: { type: "STRING" }, linha: { type: "INTEGER", nullable: true } },
        required: ["o_que", "valor"] }),
      valores: lista(item),
    },
    required: [...ESQUEMA_INSIGHTS_BASE.required, "escolhas", "medidas", "valores"],
  };
}
/** Compatível com quem já o usava (a chamada). */
export const ESQUEMA_INSIGHTS = ESQUEMA_INSIGHTS_BASE;

// ---- o guia ao vivo (durante a conversa) ------------------------------------------------------------------------------------------------
// 11/11: enquanto se fala, a cada minuto revisto, o que já se sabe dos temas-chave e a próxima pergunta. Os temas vêm da app (cada
// tema: chave, nome e a pergunta típica), para se poderem mudar sem mexer aqui. Modelo pequeno: tem de responder em segundos.

export interface TemaGuia { k: string; l: string; pergunta?: string }

export const INSTRUCAO_GUIA = (tipo: Tipo) => `Acompanhas ao vivo uma ${tipo === "visita" ? "visita a casa de um cliente" : "chamada de qualificação"} de uma empresa de
remodelações em Portugal. Recebes a transcrição até agora (cada linha com número e quem fala) e a lista dos temas que o comercial tem de
cobrir. Para cada tema dizes o estado:
- "respondido": o cliente já respondeu com clareza (põe a resposta curta, nas palavras dele, em 'resposta', e a linha);
- "parcial": falou-se mas a resposta ficou vaga ou incompleta (diz o que se sabe em 'resposta');
- "por_falar": ainda não se falou.
Uma pergunta do comercial sem resposta do cliente não conta como respondido. Nunca inventes. A conversa AINDA ESTÁ A DECORRER: a
transcrição acaba onde se está agora, não no fim; nunca digas que a conversa terminou nem que acabou cedo.
Depois, em 'proxima', a pergunta que o comercial deve fazer A SEGUIR: a mais útil agora, natural no seguimento do que se está a falar,
curta e pronta a dizer em voz alta (português de Portugal, trata o cliente por «o senhor»/«a senhora» ou pelo nome se foi dito). Se o tema
do momento ainda está a meio, não mudes de assunto: aprofunda-o. Se tudo está coberto, propõe fechar o passo seguinte (marcar a visita,
combinar o envio da proposta). Em 'porque' uma frase curta. Em 'alerta' só algo importante que o comercial deve notar já (uma objeção sem
resposta, uma contradição, o cliente a dizer que tem pouco tempo); senão null.`;

export const ESQUEMA_GUIA = {
  type: "OBJECT",
  properties: {
    temas: { type: "ARRAY", items: { type: "OBJECT", properties: {
      chave: { type: "STRING" }, estado: { type: "STRING", enum: ["respondido", "parcial", "por_falar"] },
      resposta: { type: "STRING", nullable: true }, linha: { type: "INTEGER", nullable: true },
    }, required: ["chave", "estado"] } },
    proxima: { type: "OBJECT", properties: { pergunta: { type: "STRING", nullable: true }, porque: { type: "STRING", nullable: true } }, required: ["pergunta"] },
    alerta: { type: "STRING", nullable: true },
  },
  required: ["temas", "proxima"],
};

export const textoGuia = (temas: TemaGuia[], segs: Segmento[]) =>
  "# Temas a cobrir\n" + temas.map((t) => `- ${t.k}: ${t.l}${t.pergunta ? ` (ex.: «${t.pergunta}»)` : ""}`).join("\n") +
  "\n\n# Transcrição até agora\n" + transcricaoNumerada(segs);

/** Acerta o guia: só os temas pedidos (pela ordem pedida; os que faltam ficam «por_falar»), linhas dentro da transcrição. */
export function limparGuia(r: Record<string, unknown>, temas: TemaGuia[], nLinhas: number) {
  const lista = Array.isArray(r?.temas) ? (r.temas as Record<string, unknown>[]) : [];
  const porChave = new Map(lista.filter((x) => x && typeof x.chave === "string").map((x) => [x.chave as string, x]));
  const estados = ["respondido", "parcial", "por_falar"];
  const out = temas.map((t) => {
    const x = porChave.get(t.k);
    const estado = x && estados.includes(String(x.estado)) ? String(x.estado) : "por_falar";
    const resposta = estado !== "por_falar" && typeof x?.resposta === "string" && x.resposta.trim() ? x.resposta.trim() : null;
    const l = Number(x?.linha);
    return { chave: t.k, estado, resposta, linha: Number.isInteger(l) && l >= 0 && l < nLinhas ? l : null };
  });
  const p = (r?.proxima ?? {}) as Record<string, unknown>;
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { temas: out, proxima: { pergunta: txt(p.pergunta), porque: txt(p.porque) }, alerta: txt(r?.alerta) };
}

export interface Segmento { inicio: number; texto: string; falante: string }
const rotulo = (f: string) => f === "comercial" ? "Comercial" : f === "cliente" ? "Cliente" : f === "outro" ? "Outra pessoa" : "Alguém";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** A transcrição como o modelo a lê: «[3] 0:42 Cliente: texto». */
export const transcricaoNumerada = (segs: Segmento[]) => segs.map((s, i) => `[${i}] ${mmss(s.inicio)} ${rotulo(s.falante)}: ${s.texto}`).join("\n");

/** Acerta o que o modelo devolveu: linhas fora da transcrição caem, a pontuação fica entre 0 e 100 e bate com a temperatura. */
export function limparInsights(r: Record<string, unknown>, nLinhas: number): Record<string, unknown> {
  const linhaOk = (x: unknown) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) < nLinhas ? x : null);
  const out: Record<string, unknown> = { ...r };
  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v)) out[k] = v.filter((x) => x !== null && x !== "").map((x) => (x && typeof x === "object" && "linha" in x ? { ...x, linha: linhaOk((x as { linha: unknown }).linha) } : x));
  }
  out.momentos = (Array.isArray(r.momentos) ? r.momentos : []).filter((m: { linha?: unknown }) => linhaOk(m?.linha) !== null);
  let p = Math.round(Number(r.pontuacao));
  if (!Number.isFinite(p)) p = r.temperatura === "quente" ? 80 : r.temperatura === "frio" ? 25 : 55;
  out.pontuacao = Math.max(0, Math.min(100, p));
  out.temperatura = (out.pontuacao as number) >= 70 ? "quente" : (out.pontuacao as number) >= 40 ? "morno" : "frio";
  return out;
}
