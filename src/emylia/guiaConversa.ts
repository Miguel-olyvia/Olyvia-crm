// 11/11 (Rúben: «melhorar ainda mais a transcrição e os insights; aprende e melhora»). O guia ao vivo: enquanto a conversa decorre, a
// cada minuto revisto (o bloco da segunda passagem), a Olyvia diz que temas-chave já têm resposta e qual a próxima pergunta a fazer.
// Antes, os insights só chegavam no fim, quando já não dava para perguntar o que faltou. Só lógica, sem React (testa-se à parte).
import type { Fala } from "./chamadaMotor";

export interface TemaGuia { k: string; l: string; pergunta?: string }
export type EstadoTema = "respondido" | "parcial" | "por_falar";
export interface TemaVisto { chave: string; estado: EstadoTema; resposta: string | null; linha: number | null }
export interface GuiaConversa { temas: TemaVisto[]; proxima: { pergunta: string | null; porque: string | null }; alerta: string | null }

/** Os temas que uma boa conversa cobre (o que a análise do fim também procura: perguntas-chave da chamada e da visita). */
export const TEMAS_GUIA: Record<"chamada" | "visita", TemaGuia[]> = {
  chamada: [
    { k: "o_que_quer", l: "O que quer fazer", pergunta: "O que é que gostava de fazer na casa?" },
    { k: "porque_agora", l: "Porquê agora", pergunta: "E o que o levou a pensar nisto agora?" },
    { k: "imovel", l: "Casa e morada", pergunta: "É moradia ou apartamento? Em que zona fica?" },
    { k: "proprietario", l: "Proprietário", pergunta: "A casa é sua?" },
    { k: "decisores", l: "Quem decide", pergunta: "Vai decidir sozinho ou com mais alguém?" },
    { k: "orcamento", l: "Orçamento", pergunta: "Tem algum valor em mente para esta obra?" },
    { k: "prazo", l: "Para quando", pergunta: "Para quando gostava de ter a obra feita?" },
    { k: "outros_orcamentos", l: "Outros orçamentos", pergunta: "Já pediu outros orçamentos?" },
    { k: "visita", l: "Visita marcada", pergunta: "Que dia lhe dá mais jeito para passarmos aí?" },
  ],
  visita: [
    { k: "o_que_quer", l: "O que quer fazer", pergunta: "O que é que mais o incomoda neste espaço?" },
    { k: "estado", l: "Estado do espaço", pergunta: "Já teve problemas de humidade ou de canalização aqui?" },
    { k: "medidas", l: "Medidas", pergunta: "Posso medir aqui esta parede?" },
    { k: "escolhas", l: "Escolhas peça a peça", pergunta: "Para a base de duche, prefere à medida ou standard?" },
    { k: "estilo", l: "Estilo e cores", pergunta: "Que estilo gosta mais: claro e neutro, ou algo com mais cor?" },
    { k: "orcamento", l: "Orçamento", pergunta: "Tem algum valor em mente para esta obra?" },
    { k: "prazo", l: "Para quando", pergunta: "Para quando gostava de ter a obra feita?" },
    { k: "decisores", l: "Quem decide", pergunta: "Mais alguém vai ajudar a decidir?" },
    { k: "proximo_passo", l: "Próximo passo", pergunta: "Envio-lhe a proposta até quando, e falamos depois?" },
  ],
};

/** Quantas falas revistas novas pedem um guia novo, e de quanto em quanto tempo no mínimo (o modelo pequeno responde em ~2 a 4 s). */
export const GUIA_FALAS_NOVAS = 3, GUIA_INTERVALO_MS = 25_000;

/** Pede-se um guia novo? Só com falas revistas novas desde o último (as provisórias ainda vão mudar) e com tempo desde o último pedido.
 *  Num ficheiro (os blocos chegam em segundos, em paralelo) o intervalo é 0: pede-se assim que o anterior responde. */
export function devePedirGuia(falas: readonly Fala[], ultimo: { revistas: number; em: number } | null, agora: number, intervalo = GUIA_INTERVALO_MS): boolean {
  const revistas = falas.filter((f) => f.revista).length;
  if (revistas < GUIA_FALAS_NOVAS) return false;
  if (!ultimo) return true;
  return revistas - ultimo.revistas >= GUIA_FALAS_NOVAS && agora - ultimo.em >= intervalo;
}

/** As falas que vão ao guia: as revistas e, no fim, as provisórias que ainda não foram revistas (o que se acabou de dizer conta). */
export const falasParaGuia = (falas: readonly Fala[]): Fala[] => falas.filter((f) => f.texto.trim());

const ORDEM: Record<EstadoTema, number> = { por_falar: 0, parcial: 1, respondido: 2 };
/** Junta o guia novo ao anterior: um tema nunca recua (respondido fica respondido; o modelo pequeno às vezes esquece o que já viu). */
export function juntarGuia(antes: GuiaConversa | null, novo: GuiaConversa): GuiaConversa {
  if (!antes) return novo;
  const velho = new Map(antes.temas.map((t) => [t.chave, t]));
  return {
    ...novo,
    // sem pergunta nova, fica a que estava (não se apaga o cartão a meio da conversa)
    proxima: novo.proxima.pergunta ? novo.proxima : antes.proxima,
    temas: novo.temas.map((t) => {
      const v = velho.get(t.chave);
      return v && ORDEM[v.estado] > ORDEM[t.estado] ? v : t;
    }),
  };
}

/** Quantos temas estão respondidos (e a meio), para o «5 de 9». */
export const contasGuia = (g: GuiaConversa) => ({
  feitos: g.temas.filter((t) => t.estado === "respondido").length,
  meio: g.temas.filter((t) => t.estado === "parcial").length,
  total: g.temas.length,
});
