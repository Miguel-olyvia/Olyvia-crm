// 6/11 (Rúben: «o passo 7 não devia ser todo preenchido automaticamente a partir das escolhas do Estúdio?»). As peças escolhidas no
// Estúdio respondem às perguntas das «Peças da casa de banho» (emylia/campos.ts, PECAS_WC): a medida sai da planta, o resto do produto
// (nome, cores, destaque). Só se responde ao que o Estúdio sabe; o que não sabe fica como estava. O Estúdio é a decisão mais recente:
// o que responde passa por cima da resposta da visita.
import type { TipoPeca } from "@/emylia/planta";
import { produto, type Categoria, type Cor, type Produto } from "./catalogoFake";
import type { Projeto } from "./necessidadesEstudio";

const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COR_BASE: Record<Cor, string> = { branco: "Branco", cinza: "Cinza", bege: "Bege", preto: "Preto", madeira: "Outra" };
/** A cor de um metal pelo nome (cromado, preto, dourado, inox). */
function metal(p: Produto): string | undefined {
  const n = limpo(p.n);
  if (/inox/.test(n)) return "Inox escovado";
  if (/dourad/.test(n)) return "Dourado";
  if (/cromad/.test(n)) return "Cromado";
  if (/pret/.test(n)) return "Preto";
  return undefined;
}
const acabamento = (p: Produto) => { const n = limpo(`${p.n} ${p.destaque ?? ""}`); return /\bmate\b/.test(n) ? "Mate" : /brilho/.test(n) ? "Brilho" : undefined; };
/** O formato pelo nome («120 x 60»); um que não está nas opções vai para «Outro», com o detalhe. */
function formato(p: Produto, k: string, out: Record<string, string>) {
  const m = p.n.match(/(\d{2,3})\s*x\s*(\d{2,3})/);
  if (!m) return;
  const f = `${m[1]} x ${m[2]}`;
  if (["120 x 60", "60 x 60", "30 x 60"].includes(f)) out[k] = f;
  else { out[k] = "Outro"; out[`${k}_detalhe`] = f; }
}

export function respostasDoEstudio(p: Projeto): Record<string, string> {
  const out: Record<string, string> = {};
  // a peça de cada tipo com produto escolhido: as da planta primeiro, depois as que estão por colocar
  const pecas = [
    ...p.depois.pecas.map((x) => ({ tipo: x.tipo, w: x.w as number | undefined, h: x.h as number | undefined, prod: produto(p.escolhas[x.id]), acomp: p.acompanha[x.id] ?? {} })),
    ...(p.porColocar ?? []).map((x) => ({ tipo: x.tipo, w: undefined as number | undefined, h: undefined as number | undefined, prod: produto(x.produto), acomp: x.acompanha ?? {} })),
  ];
  const daPeca = (t: TipoPeca) => pecas.find((x) => x.tipo === t && x.prod) ?? pecas.find((x) => x.tipo === t);
  const acompanha = (cat: Categoria, ...donos: TipoPeca[]) => {
    for (const t of donos) for (const x of pecas.filter((y) => y.tipo === t)) { const pr = produto(x.acomp[cat]); if (pr) return pr; }
    return undefined;
  };
  const medida = (w?: number, h?: number) => (w && h ? `${Math.max(w, h)} x ${Math.min(w, h)}` : undefined);

  // base de duche: a medida da planta, a cor e a textura do produto
  const base = daPeca("base");
  if (base?.prod) {
    const pr = base.prod, n = limpo(`${pr.n} ${pr.destaque ?? ""}`);
    const m = medida(base.w ?? pr.w, base.h ?? pr.h);
    if (m) out.pc_base_medida = m;
    out.pc_base_cor = COR_BASE[pr.cores[0]];
    if (pr.cores[0] === "madeira") out.pc_base_cor_detalhe = "Madeira";
    if (/rugos|ardosia/.test(n)) out.pc_base_textura = "Rugosa";
    else if (/\blisa\b/.test(n)) out.pc_base_textura = "Lisa";
  }
  // coluna de duche (vai com a base ou com a banheira)
  const col = acompanha("coluna_duche", "base", "banheira");
  if (col) {
    const n = limpo(col.n);
    if (/termostat/.test(n)) out.pc_coluna_tipo = "Termostática"; else if (/misturador/.test(n)) out.pc_coluna_tipo = "Misturadora";
    if (/circular|redond/.test(n)) out.pc_coluna_forma = "Circular"; else if (/quadrad/.test(n)) out.pc_coluna_forma = "Quadrada";
    const c = metal(col); if (c) out.pc_coluna_cor = c;
  }
  // resguardo
  const res = acompanha("resguardo", "base", "banheira");
  if (res) {
    const n = limpo(res.n);
    if (/entrada no meio|dois fixos/.test(n)) out.pc_resg_abertura = "Dois fixos, entrada no meio";
    else if (/desliz/.test(n)) out.pc_resg_abertura = "Fixo e deslizante";
    else if (/porta/.test(n)) out.pc_resg_abertura = "Porta de abrir";
    else if (/fixo|walk/.test(n)) out.pc_resg_abertura = "Fixo";
    if (/fosc/.test(n)) out.pc_resg_vidro = "Fosco";
    else if (/serigraf/.test(n)) out.pc_resg_vidro = "Serigrafado";
    else if (/vidro/.test(limpo(`${res.colecao} ${res.destaque ?? ""}`))) out.pc_resg_vidro = "Transparente";
    const c = metal(res); if (c) out.pc_resg_perfil = c;
    const largura = base ? Math.max(base.w ?? base.prod?.w ?? 0, base.h ?? base.prod?.h ?? 0) : 0;
    if (largura) out.pc_resg_medida = `${largura} x 200`;
  }
  // revestimento e pavimento
  const rev = produto(p.revestimento);
  if (rev) {
    out.pc_rev_modelo = rev.n;
    const a = acabamento(rev); if (a) out.pc_rev_acabamento = a;
    formato(rev, "pc_rev_formato", out);
  }
  const pav = produto(p.pavimento);
  if (pav) {
    out.pc_pav_igual = rev && rev.colecao === pav.colecao && rev.cores[0] === pav.cores[0] ? "Sim" : "Não";
    if (out.pc_pav_igual === "Não") {
      out.pc_pav_modelo = pav.n;
      const a = acabamento(pav); if (a) out.pc_pav_acabamento = a;
      formato(pav, "pc_pav_formato", out);
    }
  }
  // torneira do lavatório (vai com o móvel)
  const tor = acompanha("torneira", "movel");
  if (tor) {
    const n = limpo(tor.n);
    out.pc_torn_lavatorio = /pe alto/.test(n) ? "De pé alto" : /parede/.test(n) ? "De parede" : "Monocomando";
    const c = metal(tor); if (c) out.pc_torn_cor = c;
  }
  // móvel
  const mov = daPeca("movel");
  if (mov?.prod) {
    const pr = mov.prod, n = limpo(`${pr.n} ${pr.destaque ?? ""}`);
    if (/suspens/.test(n)) out.pc_movel_montagem = "Suspenso"; else if (/ao chao/.test(n)) out.pc_movel_montagem = "Ao chão";
    if (/porta/.test(n) && /gaveta/.test(n)) out.pc_movel_abertura = "Porta e gavetas";
    else if (/gaveta/.test(n)) out.pc_movel_abertura = "Gavetas";
    else if (/porta/.test(n)) out.pc_movel_abertura = "Portas";
    const w = mov.w ?? pr.w; if (w) out.pc_movel_largura = String(Math.max(w, mov.h ?? 0));
    // a cor das frentes é o fim do nome («…, Axis Oak», «…, Cinza Antracite»)
    const partes = pr.n.split(",");
    out.pc_movel_frentes = partes.length > 1 ? partes[partes.length - 1].trim() : pr.cores.map((c) => c[0].toUpperCase() + c.slice(1)).join(", ");
    if (/tampo ceramic/.test(n)) out.pc_movel_tampo = "Cerâmico"; else if (/tampo (em )?resina/.test(n)) out.pc_movel_tampo = "Resina";
  }
  if (pecas.some((x) => x.tipo === "movel")) out.pc_movel_coluna = pecas.some((x) => x.tipo === "coluna") ? "Sim" : "Não";
  // espelho
  const esp = daPeca("espelho");
  if (esp?.prod) {
    const n = limpo(`${esp.prod.n} ${esp.prod.destaque ?? ""}`);
    out.pc_espelho_luz = /led indireto|luz indireta/.test(n) ? "LED indireto" : /led|luz/.test(n) ? "LED direto" : "Sem luz";
    const m = esp.prod.n.match(/(\d{2,3})\s*x\s*(\d{2,3})/);
    if (m) out.pc_espelho_medida = `${m[1]} x ${m[2]}`;
  }
  // sanita e bidé
  const san = daPeca("sanita");
  if (san?.prod) {
    const n = limpo(`${san.prod.n} ${san.prod.destaque ?? ""}`);
    out.pc_sanita_tipo = /compacta/.test(n) ? "Compacta" : /suspens/.test(n) ? "Suspensa" : "Ao chão";
    if (/sem aro/.test(n)) out.pc_sanita_descarga = "Sem aro"; else if (/com aro/.test(n)) out.pc_sanita_descarga = "Com aro";
    if (/amortecid/.test(n)) out.pc_sanita_tampa = "Amortecida";
  }
  const bid = daPeca("bide");
  if (bid?.prod) out.pc_bide = /suspens/.test(limpo(bid.prod.n)) ? "Suspenso" : "Ao chão";
  else if (!bid && pecas.some((x) => x.tipo === "sanita")) out.pc_bide = "Não";
  // 11/11 (Rúben: «já ter o pé-direito preenchido, a janela na área e o toalheiro: vêm do Estúdio»): a altura da divisão e as peças da
  // planta respondem às perguntas da área de intervenção (com o prefixo da divisão, se o Estúdio não for a principal)
  const pre = p.prefixoPerguntas ?? "";
  const pe = p.alturas?.peDireito;
  if (pe && pe > 0) out[pre + "diag_pe_direito_m"] = pe >= 295 ? "3 m ou mais" : `${String(Math.min(2.8, Math.max(2.4, Math.round(pe / 10) / 10))).replace(".", ",")} m`;
  if (p.antes.paredes.length) out[pre + "diag_janela"] = p.antes.pecas.some((x) => x.tipo === "janela") || p.depois.pecas.some((x) => x.tipo === "janela") ? "Sim" : "Não";
  if ((p.divisao ?? "Casa de banho") === "Casa de banho" && (p.depois.paredes.length || p.depois.pecas.length)) {
    const toa = pecas.find((x) => x.tipo === "toalheiro");
    out[pre + "diag_toalheiro"] = toa && !/agua|hidraul/.test(limpo(`${toa.prod?.n ?? ""} ${toa.prod?.destaque ?? ""}`)) ? "Sim" : "Não";
  }
  // as perguntas da visita respondidas no Estúdio (perguntasDaVisita.ts)
  for (const [k, v] of Object.entries(p.perguntas ?? {})) if (v != null && v !== "") out[k] = v;
  // opções e extras: o teto pela altura do teto falso; o resto pelos serviços escolhidos
  const serv = new Map((p.servicos ?? []).map((s) => [s.id, s.q]));
  if (p.alturas.tetoFalso !== null) out.pc_teto = "Teto falso"; else if (serv.has("sv-pintura-teto")) out.pc_teto = "Pintar";
  if (serv.has("sv-estores")) out.pc_estores = "Pintar";
  if (serv.has("sv-ventilador")) out.pc_ventilacao = "Ventilador";
  if (serv.has("sv-tomada")) out.pc_tomadas = String(Math.min(10, Math.max(0, Math.round(serv.get("sv-tomada") ?? 0))));
  if (serv.has("sv-aplique")) out.pc_aplique = "Sim";
  return out;
}
