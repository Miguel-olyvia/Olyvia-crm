// O caso real P-2026-0109 / CC-2026-0331 (Anabela Schroeder) montado numa organização vazia, da lead até ao orçamento pronto a enviar,
// só com as ações da app (as mesmas dos botões). 26/10/2026.
// Usa-se em dois sítios: o teste casoAnabela.test.ts (que segue até ao fim da obra) e o protótipo sem conta em desenvolvimento
// (http://localhost:5174/sem-conta?caso=anabela), para seguir o resto do fluxo no ecrã, clique a clique.
// A equipa é falsa (um técnico por ofício, com "(teste)" no nome e um custo por hora inventado).
import { faltaProdutosVisita, garantirServico, r2, totaisIva, type acoes, type Estado, type LinhaOrc, type Negocio, type Tarefa } from "../motor";
import { CONTACTO, EXTERIOR, INTERIOR, ESCOLHAS, LEAD, OBRA, PROPOSTA, emFalta, grupoVisita, gruposArea, prefixoDivisao, type Grupo } from "../campos";
import { catalogo0 } from "../v2/catalogoModelo";
import { BRUTO_SERVICOS } from "../dados/mudelarServicos";
import { custosDe, horaPerfil, derivarServicos } from "../v2/custosModelo";
import { guardarFichaTecnico, usarTecnicos } from "../equipa/tecnicos";
import { ZONAS, TAXA, OFICIAL, PAGAMENTO, type LinhaP } from "./propostaAnabela";

export interface Lacuna { k: string; t: string; feito: string }
type Acoes = ReturnType<typeof acoes>;

export const K_ANABELA = catalogo0();
export const SVC_DO_SKU = new Map(BRUTO_SERVICOS.servicos.map((x) => [x[1], x[0]]));
export const PROD_DO_SKU = new Map(K_ANABELA.produtos.filter((p) => p.sku).map((p) => [p.sku!, p]));
/** Todas as linhas da proposta (os componentes dos bundles soltos), com a zona. */
export const LINHAS_P: (LinhaP & { zona: string })[] = ZONAS.flatMap((z) => z.itens.flatMap((it) => ("b" in it ? it.c : [it]).map((l) => ({ ...l, zona: z.zona }))));
// alguns SKU são serviço e produto ao mesmo tempo (MCCAC0008): a 23%, com o produto no Catálogo, é o produto
export const ehServico = (l: LinhaP) => !!l.sku && SVC_DO_SKU.has(l.sku) && (l.iva === 6 || !PROD_DO_SKU.has(l.sku));
export const ehProduto = (l: LinhaP) => !!l.sku && !ehServico(l) && PROD_DO_SKU.has(l.sku);

/** A equipa falsa: um técnico por ofício (perfil, nome, €/h). */
export const EQUIPA_TESTE: [string, string, number][] = [
  ["servente", "Servente (teste)", 14.2], ["canalizador", "Canalizador (teste)", 18.5], ["ladrilhador", "Ladrilhador (teste)", 17.8],
  ["montador", "Montador (teste)", 16.9], ["eletricista", "Eletricista (teste)", 18], ["pintor", "Pintor (teste)", 16],
  ["pedreiro", "Pedreiro (teste)", 16.5], ["carpinteiro", "Carpinteiro (teste)", 17], ["ajudante", "Ajudante (teste)", 12.5],
  ["marmorista", "Marmorista (teste)", 17.5], ["pladurista", "Pladurista (teste)", 16], ["gas", "Técnico de gás (teste)", 19],
  ["projetista", "Projetista 3D (teste)", 19], ["tecnico-avac", "Técnico AVAC (teste)", 19.5],
];

/** Preenche os campos em falta de um grupo com a 1.ª opção (o que não interessa a este caso). */
export function preencher(d: Negocio, gs: Grupo[]) {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
}

function garantir(ok: unknown, msg: string): asserts ok { if (!ok) throw new Error("Caso Anabela: " + msg); }

export interface CasoMontado {
  id: number;
  lacunas: Lacuna[];
  log: string[];
  /** Quantidade por serviço, como na proposta. */
  qSvc: Map<string, number>;
  /** As linhas da proposta que entraram como linhas livres (sem SKU, ou uma unidade de serviço a outro preço). */
  livres: (LinhaP & { zona: string })[];
}

/**
 * Monta o caso em S (uma organização vazia: estadoVazio), com A = acoes(S, …). Termina com o orçamento pronto: as linhas, os preços
 * da proposta, as zonas, as linhas livres e o acerto dos cêntimos do sistema antigo. Lança um erro se algum passo não fizer o que devia.
 */
export function montarAnabela(S: Estado, A: Acoes, avisos: { msg: string; sub?: string }[] = []): CasoMontado {
  const K = K_ANABELA, lacunas: Lacuna[] = [], log: string[] = [];
  const lacuna = (k: string, t: string, feito: string) => { if (!lacunas.some((x) => x.k === k)) lacunas.push({ k, t, feito }); };
  const C = custosDe(S);

  /* ---------------- 0. o que a organização vazia tem para este contrato */
  const semNoCatalogo = LINHAS_P.filter((l) => l.sku && !ehServico(l) && !ehProduto(l)).map((l) => l.sku);
  garantir(!semNoCatalogo.length, "SKU fora do Catálogo: " + semNoCatalogo.join(", "));
  const sids = [...new Set(LINHAS_P.filter(ehServico).map((l) => SVC_DO_SKU.get(l.sku!)!))];
  for (const sid of sids) garantirServico(S, sid);
  for (const l of LINHAS_P.filter(ehServico)) garantir((S.svc[SVC_DO_SKU.get(l.sku!)!].iva ?? 6) === l.iva, "IVA de " + l.sku);
  const perfis = new Set<string>();
  for (const x of BRUTO_SERVICOS.servicos) if (sids.includes(x[0])) for (const m of x[13]) perfis.add(m[1]);
  const semHora = [...perfis].filter((p) => horaPerfil(C, p).eh == null);
  const semCustoAntes = sids.filter((sid) => S.svc[sid]?.semCusto);
  log.push(`ANTES DA EQUIPA · perfis: ${[...perfis].join(", ")} · sem €/h: ${semHora.join(", ") || "nenhum"} · serviços bloqueados: ${semCustoAntes.length}`);
  if (semHora.length) lacuna("equipa-vazia", `Numa organização nova não há técnicos. O perfil ${semHora.join(", ")} não tem salário nem técnicos: ${semCustoAntes.length} serviços da proposta ficam sem custo e o orçamento não se envia.`, "Criei um técnico por ofício (Utilizadores › Técnico de obra).");

  /* ---------------- 1. a equipa falsa (um técnico por ofício, como se cria em Utilizadores) */
  for (const [perfilId, nome, eh] of EQUIPA_TESTE) {
    const p = C.perfis.find((x) => x.id === perfilId);
    garantir(p, "perfil " + perfilId);
    if (!S.tecnicos!.some((t) => t.n === nome)) guardarFichaTecnico(S.tecnicos!, { nome, perfilId, perfilNome: p.n, custoHora: eh });
  }
  usarTecnicos(S.tecnicos!);
  derivarServicos(S);
  garantir(!sids.some((sid) => S.svc[sid]?.semCusto), "serviços sem custo depois da equipa");
  const difPreco: string[] = [];
  for (const sid of sids) {
    const bruto = BRUTO_SERVICOS.servicos.find((x) => x[0] === sid)!;
    const naProp = LINHAS_P.find((l) => l.sku === bruto[1])!.pu;
    if (Math.abs(S.svc[sid].preco - naProp) > 0.005) difPreco.push(`${bruto[1]} ${bruto[2]}: app ${S.svc[sid].preco} · PVP ${bruto[6]} · proposta ${naProp}`);
  }
  log.push(`PREÇOS DE SERVIÇO DIFERENTES DA PROPOSTA (${difPreco.length}):\n  ${difPreco.join("\n  ")}`);

  /* ---------------- 2. a lead e o contacto: a linha "Remodelação geral" (4 zonas, sem modelo) */
  S.novo = { nome: "", tel: "", err: "" };
  A.novoCriar("Anabela Maria Machado Correia Schroeder", "+351910000000", "geral");
  const id = S.deals[0].id;
  const d = () => S.deals.find((x) => x.id === id)!;
  garantir(d().linha === "geral", "linha do negócio");
  const F: Record<string, string> = {
    email: "cliente.caso@exemplo.pt", pref: "Telefone", hora: "Manhã", idioma: "Português", origem: "Loja", rgpd: "Sim",
    tipo_cliente: "Particular", nif: "123456789", concelho: "Oeiras", pedido: "Remodelação geral: casa (pintura, tetos, eletricidade, pavimento, AVAC), 2 casas de banho e cozinha",
    morada: "Rua de Exemplo 1", cp: "2795-000", localidade: "Linda-a-Velha",
  };
  for (const [k, v] of Object.entries(F)) A.campo(id, k, v);
  preencher(d(), LEAD);
  A.contactar(id);
  garantir(d().fase === 1, "contactar");
  preencher(d(), CONTACTO);
  A.marcarVisita(id);
  garantir(d().fase === 2, "marcar a visita");

  /* ---------------- 3. a visita e o levantamento (3.º D com elevador; o ponto de gás da cozinha anula-se) */
  const LEV: Record<string, string> = {
    // 27/10: as divisões do contrato (a casa, as casas de banho e a cozinha): a linha fica "Remodelação geral"
    diag_tipo_area: "Casa de banho, Cozinha, Sala",
    diag_distancia_entrada: "Curta (até 5 m)", diag_portas_proteger: "0", diag_mobilada: "Pouco", tem_elevador: "Sim", andar: "3",
    diag_local_cortes: "Varanda", estacionamento: "Não pago", amianto: "Não", diag_gas: "Anular", acesso: "Fácil",
    habitada_durante_obra: "Não", diag_janela: "Sim", contentor: "Não", dist_entulho: "Até 10 m", materiais_cliente: "Não",
  };
  for (const [k, v] of Object.entries(LEV)) A.campo(id, k, v);
  // as outras divisões (a cozinha e a sala) com as mesmas respostas da área que a principal
  for (const div of ["Cozinha", "Sala"]) for (const [k, v] of Object.entries(LEV)) if (k.startsWith("diag_") && k !== "diag_tipo_area") A.campo(id, prefixoDivisao(div) + k, v);
  preencher(d(), [EXTERIOR, INTERIOR, ...gruposArea(S.campos, d().f), ESCOLHAS, ...((d().vis ?? []).map(grupoVisita))]);
  d().visita.fotos = 6;

  // os serviços (6%, e as subempreitadas a 23%) e os produtos (23%), somados por artigo (a visita guarda um artigo uma vez); uma linha
  // de serviço tem um só preço unitário: uma unidade a outro preço (a 2.ª máquina de ar condicionado) entra como linha livre
  const qSvc = new Map<string, number>(), qProd = new Map<string, { q: number; total: number; pus: Set<number> }>();
  const livres: (LinhaP & { zona: string })[] = [];
  const pu0 = new Map<string, number>(), aParte = new Set<LinhaP>();
  for (const l of LINHAS_P) {
    if (ehServico(l)) {
      const sid = SVC_DO_SKU.get(l.sku!)!;
      if (pu0.has(sid) && pu0.get(sid) !== l.pu) { aParte.add(l); livres.push({ ...l, d: `${l.d} (outra unidade)` }); continue; }
      pu0.set(sid, l.pu); qSvc.set(sid, r2((qSvc.get(sid) ?? 0) + l.q)); continue;
    }
    if (ehProduto(l)) {
      const p = PROD_DO_SKU.get(l.sku!)!, x = qProd.get(p.id) ?? { q: 0, total: 0, pus: new Set<number>() };
      x.q = r2(x.q + l.q); x.total = r2(x.total + r2(l.q * l.pu)); x.pus.add(l.pu); qProd.set(p.id, x); continue;
    }
    livres.push(l);
  }
  for (const [sid, q] of qSvc) A.extra(id, sid, q);
  for (const [pid, x] of qProd) A.produto(id, K.produtos.find((p) => p.id === pid)!, x.q);
  // os produtos cuja instalação a proposta põe noutro serviço: vendidos sem a instalação que trazem
  const semInst = (d().visita.prod ?? []).filter((p) => p.svc && !qSvc.has(p.svc));
  for (const p of semInst) A.produtoSemServico(id, p.id, true);
  log.push(`PRODUTOS SEM A INSTALAÇÃO QUE TRAZEM (${semInst.length}): ${semInst.map((p) => `${p.n} (${p.svc})`).join(" | ") || "nenhum"}`);
  const difProd = [...qProd].map(([pid, x]) => [K.produtos.find((p) => p.id === pid)!, x] as const)
    .filter(([p, x]) => Math.abs(r2((p.pvp ?? 0) * x.q) - x.total) > 0.005).map(([p, x]) => `${p.sku} ${p.n}: PVP ${p.pvp} · proposta ${[...x.pus].join(" e ")}`);
  log.push(`PREÇOS DE PRODUTO DIFERENTES DA PROPOSTA (${difProd.length}):\n  ${difProd.join("\n  ")}`);

  // as obrigações de produto: responder «não mantém» e ver se o produto escolhido as cumpre
  for (const x of faltaProdutosVisita(d(), S)) if (x.t.startsWith("Falta responder")) A.manter(id, x.sid, "nao");
  const naoCumpre = faltaProdutosVisita(d(), S);
  if (naoCumpre.length) {
    lacuna("obrigacao-produto", `O produto escolhido não cumpre a obrigação do serviço: ${naoCumpre.map((x) => x.t).join("; ")}.`, "Respondi que o cliente mantém.");
    for (const x of naoCumpre) A.manter(id, x.sid, "sim");
  }
  A.fecharVisita(id);
  garantir(d().fase === 3, "fechar a visita: " + JSON.stringify(avisos.at(-1)));
  const o = d().orc!;

  const trazidosAMais = o.linhas.filter((l) => l.t === "svc" && !qSvc.has(l.sid));
  if (trazidosAMais.length) lacuna("ligacao-produto", `Produtos ligados a outro serviço trazem linhas a mais: ${trazidosAMais.map((l) => (l.t === "svc" ? S.svc[l.sid].n : "")).join("; ")}.`, "Ficaram no orçamento.");
  const qDif = o.linhas.filter((l) => l.t === "svc" && qSvc.has(l.sid) && Math.abs(l.q - qSvc.get(l.sid)!) > 0.004);
  garantir(!qDif.length, "quantidades dos serviços diferentes da proposta");
  if (o.demolicao) lacuna("demolicao", "A demolição e o entulho ligam-se sozinhos pelos serviços.", "Ficou ligada.");
  const lev = o.linhas.filter((l) => l.t === "mat" && l.d.startsWith("Levantamento · "));
  if (lev.some((l) => l.t === "mat" && /gás/i.test(l.d))) lacuna("levantamento-gas", "O gás do levantamento entra outra vez, a 23%.", "Nada.");
  if (lev.length) {
    lacuna("levantamento", `As respostas do levantamento juntam linhas próprias: ${lev.map((l) => (l.t === "mat" ? `${l.d.slice(15)} (${l.preco} €)` : "")).join("; ")}.`, "Preço dessas linhas posto a 0 € à mão.");
    o.linhas.forEach((l, i) => { if (l.t === "mat" && l.d.startsWith("Levantamento · ")) A.precoLinha(id, i, 0); });
  }

  // os preços: os da proposta (serviço: o preço unitário; produto: o total da linha)
  o.linhas.forEach((l, i) => {
    if (l.t === "svc" && qSvc.has(l.sid)) {
      const sku = BRUTO_SERVICOS.servicos.find((x) => x[0] === l.sid)![1];
      const dela = LINHAS_P.filter((x) => x.sku === sku && !aParte.has(x));
      const pus = [...new Set(dela.map((x) => x.pu))];
      const total = r2(dela.reduce((a, x) => a + r2(x.q * x.pu), 0));
      A.precoLinha(id, i, pus.length === 1 ? pus[0] : r2(total / l.q));
    }
    if (l.t === "mat" && l.d.startsWith("Produto · ")) {
      const pid = d().visita.prod!.find((p) => l.d.startsWith("Produto · " + p.n))?.id;
      const x = pid ? qProd.get(pid) : undefined;
      if (x) A.precoLinha(id, i, x.total);
    }
  });
  // as linhas que o Catálogo não tem e a taxa de consultoria (a 6%): linhas livres, com a taxa de IVA da proposta
  for (const l of livres) garantir(A.linhaLivre(id, { d: l.d, q: l.q, pu: l.pu, iva: l.iva }) >= 0, "linha livre " + l.d);
  garantir(A.linhaLivre(id, { d: TAXA.d, q: 1, pu: TAXA.valor, iva: 6 }) >= 0, "taxa de consultoria");

  // as zonas da proposta: cada linha repartida pela quantidade de cada zona e, nos produtos, também pelo valor
  garantir(A.zonasOrc(id, ZONAS.map((z) => z.zona)), "zonas do orçamento");
  const porZ = (f: (l: LinhaP) => boolean) => {
    const m = new Map<string, { q: number; v: number }>();
    for (const l of LINHAS_P.filter(f)) { const x = m.get(l.zona) ?? { q: 0, v: 0 }; x.q = r2(x.q + l.q); x.v = r2(x.v + r2(l.q * l.pu)); m.set(l.zona, x); }
    return [...m];
  };
  d().orc!.linhas.forEach((l, i) => {
    let zs: { z: string; q: number; preco?: number }[] | null = null;
    if (l.t === "svc" && qSvc.has(l.sid)) zs = porZ((x) => ehServico(x) && !aParte.has(x) && SVC_DO_SKU.get(x.sku!) === l.sid).map(([z, x]) => ({ z, q: x.q }));
    else if (l.t === "mat" && l.d.startsWith("Produto · ")) {
      const pid = d().visita.prod!.find((p) => l.d.startsWith("Produto · " + p.n))?.id;
      if (pid) zs = porZ((x) => ehProduto(x) && PROD_DO_SKU.get(x.sku!)!.id === pid).map(([z, x]) => ({ z, q: x.q, preco: x.v }));
    } else if (l.t === "mat" && l.livre) {
      const lp = livres.find((x) => x.d === l.d);
      if (lp) zs = [{ z: lp.zona, q: l.livre.q }];
    }
    if (zs) garantir(A.zonasLinha(id, i, zs), "zonas da linha " + i + ": " + JSON.stringify(avisos.at(-1)));
  });

  // o arredondamento dos bundles do sistema antigo: acerto dos cêntimos em duas linhas de quantidade 1 da cozinha
  const ti0 = totaisIva(d(), S);
  const alvoMat = r2(OFICIAL.iva23 / 0.23), alvoMo = r2(OFICIAL.subtotal - alvoMat);
  const dMo = r2(alvoMo - ti0.mo), dMat = r2(alvoMat - ti0.mat);
  if (Math.abs(dMo) > 0.004 || Math.abs(dMat) > 0.004) {
    lacuna("arredondamento", `O sistema antigo arredondou o preço unitário dos bundles: a soma dos componentes dá ${r2(ti0.base)} € sem IVA e o contrato diz ${OFICIAL.subtotal} € (mão de obra ${dMo} €, materiais ${dMat} €).`, "Acerto de cêntimos em duas linhas de quantidade 1 (o modelo de remodelação da cozinha e o termoacumulador), para bater com o contrato.");
    const iMo = o.linhas.findIndex((l) => l.t === "svc" && l.sid === SVC_DO_SKU.get("MOMRCC"));
    const iMat = o.linhas.findIndex((l) => l.t === "mat" && l.d.includes("Termoacumulador"));
    const lm = o.linhas[iMo] as Extract<LinhaOrc, { t: "svc" }>, lt = o.linhas[iMat] as Extract<LinhaOrc, { t: "mat" }>;
    A.precoLinha(id, iMo, r2(lm.pu + dMo));
    A.precoLinha(id, iMat, r2(lt.preco + dMat));
  }
  const TI = totaisIva(d(), S);
  log.push(`TOTAIS DA APP · mo ${r2(TI.mo)} · mat ${r2(TI.mat)} · base ${r2(TI.base)} · iva 6% ${r2(TI.ivaMo)} · iva 23% ${r2(TI.ivaMat)} · total ${r2(TI.total)}`);
  garantir(r2(TI.total) === OFICIAL.total, `total ${r2(TI.total)} em vez de ${OFICIAL.total}`);
  return { id, lacunas, log, qSvc, livres };
}

/** 26/10: o momento da obra de cada prestação do contrato (a retificação das medidas da cozinha no fim da fase 1, das demolições). */
const MOMENTO_PRESTACOES: (0 | 1 | "fim")[] = [0, 0, 0, 1, "fim"];

/**
 * Leva o caso montado (montarAnabela) da proposta até à obra pronta a aprovar: as 5 prestações à medida, a proposta enviada e
 * aceite, o contrato assinado e a 1.ª prestação faturada e paga. Para ver a obra no ecrã (/sem-conta?caso=anabela-obra).
 */
export function avancarAteObra(S: Estado, A: Acoes, id: number, avisos: { msg: string; sub?: string }[] = []): void {
  const d = () => S.deals.find((x) => x.id === id)!;
  A.verificar(id);
  for (const [k, v] of Object.entries({ validade: "15 dias", inicio_prev: "2026-11-02", garantia: "5 anos", modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Direção", multa: "Não", notas_cliente: "Proposta P-2026-0109. Inclui IVA à taxa legal." })) A.campo(id, k, v);
  garantir(A.pagamentoPlano(id, "À medida", PAGAMENTO.map(([l, p], i) => ({ l, p: p / 100, fase: MOMENTO_PRESTACOES[i] }))), "prestações à medida");
  preencher(d(), PROPOSTA);
  A.enviar(id);
  garantir(d().orc!.enviada, "enviar a proposta: " + JSON.stringify(avisos.slice(-2)));
  A.aceitar(id);
  A.enviarContrato(id);
  A.assinarCom(id, { tipo: "sms", nome: "Anabela Correia", q: "12/10/2026 12:54", id: "OTP-CC-2026-0331" });
  garantir(d().orc!.contrato === "assinado", "assinar o contrato");
  for (const [k, v] of Object.entries({ nome_fiscal: "Anabela Maria Machado Correia Schroeder", nif_fat: "123456789", morada_fiscal_igual: "Sim", email_fat: "cliente.caso@exemplo.pt", serie: "FT 2026", vencimento: "Pronto pagamento", metodo: "Transferência", conta: "Banco A · conta à ordem", comprovativo: "Transferência adjudicação (teste)" })) A.campo(id, k, v);
  const papel = S.role;
  S.role = "financeiro";
  A.emitir(id);
  A.validar(id);
  S.role = papel;
  garantir(d().fin.pago && d().obra.plano, "pagar a 1.ª prestação e gerar o plano");
}

/** Uma fotografia de exemplo (um quadrado de cor, em SVG), para as tarefas da obra de demonstração. */
const fotoExemplo = (i: number) => "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="hsl(${(i * 47) % 360} 35% 72%)"/><text x="80" y="66" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#333">obra · foto ${i + 1}</text></svg>`);

/**
 * 27/10: a obra do caso a meio, só para ver no ecrã como fica uma obra grande em andamento (/sem-conta?caso=anabela-obra-a-meio).
 * Segue de avancarAteObra: aprova o plano, recebe os materiais no Inventário, arranca e põe o relógio a meio da obra. As tarefas
 * que já acabaram ficam feitas e validadas (algumas com mais horas do que o previsto, para se ver o desvio); as duas últimas
 * acabadas ficam por validar; as do dia ficam em curso. Usa as ações da app, como os botões.
 */
export function avancarObraAMeio(S: Estado, A: Acoes, id: number, receber: (ref: string) => string): void {
  const d = () => S.deals.find((x) => x.id === id)!;
  const papel = S.role;
  S.role = "operacoes";
  preencher(d(), [OBRA[0]]);
  A.campo(id, "inicio", "2026-11-02");
  A.aprovarPlano(id);
  garantir(d().obra.plano!.estado === "aprovado", "aprovar o plano");
  const ref = d().obra.ec?.ref;
  if (ref) { const e = receber(ref); garantir(!e, "receber os materiais: " + e); }
  A.arrancar(id);
  garantir(d().obra.plano!.estado === "em curso", "arrancar a obra");

  const p = d().obra.plano!;
  const fim = Math.max(...p.tasks.map((t) => t.dia + t.dur));
  const hoje = Math.floor(fim * 0.45);
  const ordem = p.tasks.map((t, ti) => ({ t, ti })).sort((a, b) => a.t.dia + a.t.dur - (b.t.dia + b.t.dur));
  const acabadas = ordem.filter(({ t }) => t.dia + t.dur <= hoje), doDia = ordem.filter(({ t }) => t.dia <= hoje && t.dia + t.dur > hoje);
  // as horas reais: perto do previsto, umas acima e outras abaixo (uma em cada quatro passa 20%)
  const fator = (k: number) => (k % 4 === 3 ? 1.2 : k % 3 === 1 ? 0.9 : 1.05);
  acabadas.forEach(({ t, ti }, k) => {
    p.dia = Math.max(p.dia, t.dia);
    A.comecarTarefa(id, ti);
    A.registarTarefa(id, ti, { horas: Math.max(0.5, t.h * fator(k)), foto: fotoExemplo(ti), nota: k % 4 === 3 ? "Paredes com mais irregularidades do que o previsto." : undefined });
    A.marcarFeita(id, ti);
  });
  A.validarVarias(id, acabadas.slice(0, -2).map((x) => x.ti));
  doDia.forEach(({ t, ti }) => {
    A.comecarTarefa(id, ti);
    A.registarTarefa(id, ti, { horas: Math.max(0.5, Math.round(t.h * ((hoje - t.dia + 0.5) / t.dur) * 2) / 2), foto: fotoExemplo(ti) });
  });
  p.dia = hoje;
  S.role = papel;
}

/**
 * 27/10: a obra a meio, mais o que uma obra grande tem nesse ponto, para ver os ecrãs cheios (/sem-conta?caso=anabela-complexa):
 * uma correção pedida, um imprevisto que atrasa e outro que para tarefas (com a adenda proposta ao cliente), um problema reportado
 * por um técnico, um técnico sem registo no dia e mensagens do cliente por ler.
 */
export function complicarObra(S: Estado, A: Acoes, id: number): void {
  const d = () => S.deals.find((x) => x.id === id)!;
  const p = d().obra.plano!, papel = S.role;
  const ti = (pred: (t: Tarefa) => boolean) => p.tasks.findIndex(pred);
  S.role = "operacoes";
  // a correção: a primeira das feitas por validar
  const feita = ti((t) => t.exec?.estado === "feita");
  if (feita >= 0) A.pedirCorrecao(id, feita, "Juntas por limpar", { horas: 4 });
  // um técnico do dia sem registo hoje: tira-se o registo de uma das tarefas em curso
  const emCurso = p.tasks.filter((t) => t.exec?.estado === "em curso");
  if (emCurso.length > 1) { const t = emCurso[emCurso.length - 1]; t.exec = undefined; }
  // dois imprevistos nas tarefas por começar: um atrasa 2 dias, o outro para a tarefa até o cliente decidir
  const porComecar = p.tasks.map((t, i) => ({ t, i })).filter(({ t }) => !t.exec && t.dia > p.dia).sort((a, b) => a.t.dia - b.t.dia);
  if (porComecar[0]) A.registarImprevisto(id, { texto: "Parede da sala com humidade, tem de secar antes de pintar", onde: "Sala, parede da janela", foto: fotoExemplo(90), grav: "atrasa", tarefas: [porComecar[0].i], dias: 2 });
  const canal = porComecar.find(({ t }) => /canaliz/i.test(t.sk + " " + t.nome)) ?? porComecar[1];
  if (canal) {
    const im = A.registarImprevisto(id, { texto: "Cano antigo em ferro dentro da parede da cozinha", onde: "Cozinha, parede do lava-loiça", foto: fotoExemplo(91), grav: "impede", tarefas: [canal.i] });
    if (im) A.proporImprevisto(id, im, [], [{ n: "Trocar o troço de canalização em ferro", h: 8, preco: 420, perfil: "Canalização", mats: [{ n: "Tubo multicamada 20 mm", q: 6, un: "m", preco: 4.5 }] }]);
  }
  // um técnico reporta um problema no Hoje dele
  S.role = "tecnico";
  A.ocorrencia(id, "Falta uma caixa de azulejo da casa de banho comum; o que há não chega para acabar a parede.");
  // o cliente escreveu no portal
  A.mensagemObra(id, "cliente", "Bom dia! Pode confirmar se a cozinha fica pronta antes do Natal?");
  A.mensagemObra(id, "cliente", "E as torneiras da casa de banho, já chegaram? Queria ver antes de montar.");
  S.role = papel;
}

/**
 * 27/10: um 2.º negócio no mesmo caso, com o orçamento longo do contrato (4 zonas, cerca de 60 linhas) ainda por enviar, para ver
 * o orçamento, a verificação e o "Antes de enviar". Outro nome, para não se confundir com a obra.
 */
export function orcamentoLongo(S: Estado, A: Acoes): number {
  const M = montarAnabela(S, A);
  const d = S.deals.find((x) => x.id === M.id)!;
  d.nome = "Rui Teixeira (teste)";
  d.f.email = "rui.teixeira@exemplo.pt";
  return M.id;
}
