/**
 * A ficha do local (CRM, anew_address_building) em frases curtas para quem
 * vai à obra: o que muda a maneira de trabalhar lá. Só o que está preenchido.
 * Os valores são os do CRM — ver src/lib/addresses/README.md na raiz.
 */

export interface FichaLocalCampos {
  acesso?: string | null;
  impacto_percent?: number | null;
  estacionamento?: string | null;
  zona_estacionamento?: string | null;
  tem_elevador?: boolean | null;
  n_elevadores?: number | null;
  n_andares?: number | null;
  piso?: string | null;
  tipologia?: string | null;
  area_util_m2?: number | null;
  n_casas_banho?: number | null;
  ano_construcao?: number | null;
  pavimento?: string | null;
  eletrica?: string | null;
  quadro_diferencial?: boolean | null;
  canalizacao?: string | null;
  gas?: string | null;
  amianto?: string | null;
  habitada_durante_obra?: boolean | null;
  animais?: boolean | null;
  notas_interior?: string | null;
}

export interface LinhaFicha {
  texto: string;
  /** Pede cuidado: acesso difícil, sem elevador num andar alto, amianto, casa habitada… */
  atencao?: boolean;
}

const PAVIMENTO: Record<string, string> = {
  ceramico: "cerâmico",
  madeira: "madeira",
  flutuante: "flutuante",
  vinilico: "vinílico",
  outro: "outro",
};
const CANALIZACAO: Record<string, string> = {
  ferro: "ferro",
  pvc: "PVC",
  multicamada: "multicamada",
  cobre: "cobre",
  misto: "mista",
};
const ZONA: Record<string, string> = { verde: "verde", amarela: "amarela", vermelha: "vermelha" };

/** O andar em número ("3.º Esq" → 3, "R/C" → 0), ou null. */
export function pisoNumero(piso: string | null | undefined): number | null {
  if (!piso) return null;
  if (/^\s*(r\/?c|rés|res)/i.test(piso)) return 0;
  const m = piso.match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

export function linhasExterior(f: FichaLocalCampos): LinhaFicha[] {
  const l: LinhaFicha[] = [];
  if (f.acesso === "dificil") {
    l.push({ texto: `Acesso difícil${f.impacto_percent ? ` (+${f.impacto_percent} %)` : ""}`, atencao: true });
  } else if (f.acesso === "facil") {
    l.push({ texto: "Acesso fácil" });
  }
  const p = pisoNumero(f.piso);
  if (f.piso) {
    const andar = p === 0 ? "R/C" : f.piso;
    const de = f.n_andares != null ? ` de ${f.n_andares}` : "";
    if (f.tem_elevador === false) {
      l.push({ texto: `${andar}${de} · sem elevador`, atencao: p != null && p >= 2 });
    } else if (f.tem_elevador) {
      l.push({ texto: `${andar}${de} · elevador${f.n_elevadores && f.n_elevadores > 1 ? ` ×${f.n_elevadores}` : ""}` });
    } else {
      l.push({ texto: `${andar}${de}` });
    }
  } else if (f.tem_elevador === false) {
    l.push({ texto: "Sem elevador" });
  } else if (f.tem_elevador) {
    l.push({ texto: "Com elevador" });
  }
  if (f.estacionamento === "sem_estacionamento") {
    l.push({ texto: "Sem estacionamento", atencao: true });
  } else if (f.estacionamento === "pago") {
    l.push({
      texto: `Estacionamento pago${f.zona_estacionamento ? ` (zona ${ZONA[f.zona_estacionamento] ?? f.zona_estacionamento})` : ""}`,
    });
  } else if (f.estacionamento === "nao_pago") {
    l.push({ texto: "Estacionamento gratuito" });
  }
  return l;
}

export function linhasInterior(f: FichaLocalCampos): LinhaFicha[] {
  const l: LinhaFicha[] = [];
  if (f.habitada_durante_obra) l.push({ texto: "Casa habitada durante a obra", atencao: true });
  if (f.animais) l.push({ texto: "Há animais", atencao: true });
  if (f.amianto === "sim") l.push({ texto: "Amianto", atencao: true });
  else if (f.amianto === "nao_sei") l.push({ texto: "Amianto: não se sabe", atencao: true });
  const casa = [
    f.tipologia,
    f.area_util_m2 ? `${Number(f.area_util_m2).toLocaleString("pt-PT")} m²` : null,
    f.n_casas_banho != null ? `${f.n_casas_banho} WC` : null,
    f.ano_construcao ? String(f.ano_construcao) : null,
  ].filter(Boolean);
  if (casa.length) l.push({ texto: casa.join(" · ") });
  if (f.pavimento) l.push({ texto: `Pavimento ${PAVIMENTO[f.pavimento] ?? f.pavimento}` });
  if (f.canalizacao && f.canalizacao !== "nao_sei") {
    l.push({ texto: `Canalização em ${CANALIZACAO[f.canalizacao] ?? f.canalizacao}` });
  }
  if (f.eletrica === "antiga") {
    l.push({ texto: `Elétrica antiga${f.quadro_diferencial === false ? ", sem diferencial" : ""}`, atencao: true });
  } else if (f.eletrica === "renovada") {
    l.push({ texto: "Elétrica renovada" });
  }
  if (f.gas === "canalizado") l.push({ texto: "Gás canalizado" });
  else if (f.gas === "garrafa") l.push({ texto: "Gás de garrafa" });
  return l;
}

/** Tem alguma coisa para mostrar? */
export function fichaTemDados(f: FichaLocalCampos | null | undefined): boolean {
  if (!f) return false;
  return linhasExterior(f).length + linhasInterior(f).length > 0 || !!f.notas_interior?.trim();
}
