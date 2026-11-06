// 6/11 (Rúben: «no Estúdio, no passo 2, ter os serviços a serem sugeridos automaticamente com base nos produtos escolhidos»). Cada
// produto escolhido pede os trabalhos que vão com ele: a base de duche pede a impermeabilização, o toalheiro elétrico e o espelho com luz
// pedem corrente, o revestimento novo pede as paredes a direito… Cada sugestão diz porquê (o produto que a pediu) e traz a quantidade
// (a planta, ou uma tomada por aparelho). O comercial junta com um toque ou diz «agora não» (não volta a aparecer).
import { produto, servico, type Produto, type Servico } from "./catalogoFake";
import { qtdSugerida, type Projeto } from "./necessidadesEstudio";

export interface Sugestao { sv: Servico; porque: string[]; q: number }

const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const temLuz = (p: Produto) => /led|luz/.test(limpo(`${p.n} ${p.destaque ?? ""}`));
const eletrico = (p: Produto) => /eletric/.test(limpo(p.n));
/** «a Base Ardósia por medida, Preta» → «a Base Ardósia por medida» (o nome sem a cor, mais curto de ler). */
const curto = (p: Produto) => p.n.split(",")[0];

/** Os produtos escolhidos no Estúdio (as peças da planta, as que estão por colocar e o que vai com elas). */
export function produtosEscolhidos(p: Projeto): Produto[] {
  const ids = [
    ...p.depois.pecas.map((x) => p.escolhas[x.id]),
    ...(p.porColocar ?? []).map((x) => x.produto),
    ...Object.values(p.acompanha).flatMap((a) => Object.values(a)),
    ...(p.porColocar ?? []).flatMap((x) => Object.values(x.acompanha ?? {})),
    p.revestimento, p.pavimento,
  ];
  return ids.map((id) => produto(id)).filter((x): x is Produto => !!x);
}

/** As sugestões pelos produtos escolhidos, sem as que já estão juntas e sem as recusadas. */
export function sugestoesDeServicos(p: Projeto): Sugestao[] {
  const prods = produtosEscolhidos(p);
  if (!prods.length) return [];
  const pedidos = new Map<string, { porque: string[]; tomadas?: number }>();
  const pede = (id: string, porque: string, tomadas = 0) => {
    const ja = pedidos.get(id) ?? { porque: [], tomadas: 0 };
    if (!ja.porque.includes(porque)) ja.porque.push(porque);
    ja.tomadas = (ja.tomadas ?? 0) + tomadas;
    pedidos.set(id, ja);
  };
  const de = (cat: Produto["cat"]) => prods.filter((x) => x.cat === cat);

  for (const b of de("base")) {
    pede("sv-imperm", `${curto(b)}: a zona do duche fica impermeabilizada antes do revestimento.`);
    pede("sv-nicho", `${curto(b)}: um nicho no duche para os champôs.`);
  }
  for (const b of de("banheira")) pede("sv-imperm", `${curto(b)}: a parede da banheira fica impermeabilizada.`);
  for (const t of de("toalheiro").filter(eletrico)) pede("sv-tomada", `${curto(t)}: liga-se a uma tomada.`, 1);
  for (const e of de("espelho")) {
    if (temLuz(e)) pede("sv-tomada", `${curto(e)}: a luz precisa de corrente atrás do espelho.`, 1);
    else pede("sv-aplique", `${curto(e)} não tem luz: um aplique LED por cima.`);
  }
  for (const m of de("movel")) pede("sv-tomada", `${curto(m)}: uma tomada ao lado, para o secador.`, 1);
  const aparelhos = de("toalheiro").filter(eletrico).length + de("espelho").filter(temLuz).length;
  if (aparelhos >= 2) pede("sv-eletrica", `${aparelhos} aparelhos elétricos novos: um circuito com diferencial só para a casa de banho.`);
  const rev = de("revestimento")[0], pav = de("pavimento")[0];
  if (rev) pede("sv-reboco", `${curto(rev)}: as paredes ficam a direito para a placa assentar bem.`);
  if (pav && !rev) pede("sv-rodape", `${curto(pav)}: o chão novo leva rodapé do mesmo cerâmico.`);
  if (p.alturas.tetoFalso !== null) pede("sv-pintura-teto", "O teto falso fica pintado com tinta anti-humidade.");
  if (p.depois.paredes.length && !p.depois.pecas.some((x) => x.tipo === "janela")) pede("sv-ventilador", "Na planta não há janela: um ventilador tira a humidade.");
  pede("sv-limpeza", "No fim da obra, a casa de banho fica pronta a usar.");

  const juntos = new Set((p.servicos ?? []).map((x) => x.id)), recusados = new Set(p.servicosRecusados ?? []);
  const out: Sugestao[] = [];
  for (const [id, { porque, tomadas }] of pedidos) {
    const sv = servico(id);
    if (!sv || juntos.has(id) || recusados.has(id)) continue;
    const q = tomadas ? tomadas : Math.max(sv.un === "un" ? 1 : 0.5, qtdSugerida(sv, p));
    out.push({ sv, porque, q });
  }
  return out;
}

/** Juntar sugestões (uma ou todas), com a quantidade sugerida. */
export function juntarSugestoes(p: Projeto, ss: readonly Sugestao[]): Projeto {
  const ja = new Set((p.servicos ?? []).map((x) => x.id));
  const novos = ss.filter((s) => !ja.has(s.sv.id)).map((s) => ({ id: s.sv.id, q: s.q }));
  return novos.length ? { ...p, servicos: [...(p.servicos ?? []), ...novos] } : p;
}
/** «Agora não»: a sugestão não volta (o serviço continua na lista de todos, para juntar à mão). */
export const recusarSugestao = (p: Projeto, id: string): Projeto => ({ ...p, servicosRecusados: [...new Set([...(p.servicosRecusados ?? []), id])] });
