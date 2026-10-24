/**
 * Diagnóstico da necessidade — campos para o PLANEAMENTO da obra.
 *
 * Uma necessidade do negócio = uma área de intervenção (casa de banho,
 * cozinha…). Além do que já se pedia (área, demolir, proteger, intervenção),
 * a visita regista medidas e características em campos FECHADOS — números e
 * escolhas, nada de texto livre — porque é com eles que as Operações
 * calculam os tempos das tarefas e aprendem o ritmo real de cada uma
 * (operacao-app/db/obras.sql, 2c: ops_obra_medidas e ops_obra_fatores).
 *
 * Tudo opcional: a necessidade grava-se na mesma sem nada disto (reunião de
 * 02/10/2026 — "não podemos ir ao pormenor"; obrigatórios só quando a equipa
 * decidir). Colunas deal_needs.diag_* da migração 20261208100000.
 */

export interface DiagnosticoPlaneamento {
  tipo_area: string;
  m2_pavimento: string;
  perimetro_m: string;
  pe_direito_m: string;
  altura_revestimento: string;
  pontos_agua: string;
  pontos_eletricos: string;
  janela: string;
  local_cortes: string;
  gas: string;
  toalheiro: string;
  distancia_entrada: string;
  mobilada: string;
  portas_proteger: string;
  cliente_recusou_fotos: string;
}

export const DIAGNOSTICO_PLANEAMENTO_VAZIO: DiagnosticoPlaneamento = {
  tipo_area: "",
  m2_pavimento: "",
  perimetro_m: "",
  pe_direito_m: "",
  altura_revestimento: "",
  pontos_agua: "",
  pontos_eletricos: "",
  janela: "",
  local_cortes: "",
  gas: "",
  toalheiro: "",
  distancia_entrada: "",
  mobilada: "",
  portas_proteger: "",
  cliente_recusou_fotos: "",
};

type Campo = keyof DiagnosticoPlaneamento;
type Tipo = "escolha" | "sim_nao" | "decimal" | "inteiro";

interface DefinicaoCampo {
  campo: Campo;
  tipo: Tipo;
  rotulo: string;
  ajuda?: string;
  opcoes?: readonly { valor: string; rotulo: string }[];
  min?: number;
  max?: number;
  unidade?: string;
}

/** A ordem e o texto dos campos, como aparecem no ecrã. */
export const CAMPOS_PLANEAMENTO: readonly DefinicaoCampo[] = [
  {
    campo: "tipo_area", tipo: "escolha", rotulo: "Divisão",
    opcoes: [{ valor: "casa_banho", rotulo: "Casa de banho" }, { valor: "cozinha", rotulo: "Cozinha" }, { valor: "outro", rotulo: "Outra" }],
  },
  { campo: "m2_pavimento", tipo: "decimal", rotulo: "Pavimento", unidade: "m²", min: 0.1, max: 10000 },
  { campo: "perimetro_m", tipo: "decimal", rotulo: "Perímetro das paredes", unidade: "m", min: 0.1, max: 10000,
    ajuda: "Com a altura do revestimento, dá os m² de parede." },
  { campo: "pe_direito_m", tipo: "decimal", rotulo: "Pé-direito", unidade: "m", min: 1.5, max: 10 },
  {
    campo: "altura_revestimento", tipo: "escolha", rotulo: "Revestimento de parede até",
    opcoes: [{ valor: "20cm", rotulo: "20 cm" }, { valor: "60cm", rotulo: "60 cm" }, { valor: "120cm", rotulo: "120 cm" }, { valor: "teto", rotulo: "Ao teto" }],
  },
  { campo: "pontos_agua", tipo: "inteiro", rotulo: "Pontos de água", min: 0, max: 50 },
  { campo: "pontos_eletricos", tipo: "inteiro", rotulo: "Pontos elétricos", min: 0, max: 200 },
  {
    campo: "gas", tipo: "escolha", rotulo: "Gás",
    opcoes: [{ valor: "sem", rotulo: "Não há" }, { valor: "manter", rotulo: "Manter" }, { valor: "anular", rotulo: "Anular" }, { valor: "instalar", rotulo: "Instalar" }],
  },
  { campo: "toalheiro", tipo: "sim_nao", rotulo: "Toalheiro elétrico" },
  { campo: "janela", tipo: "sim_nao", rotulo: "Janela na área", ajuda: "Trabalhos com pó: sem janela é mais lento." },
  {
    campo: "local_cortes", tipo: "escolha", rotulo: "Onde se fazem os cortes",
    opcoes: [{ valor: "na_area", rotulo: "Na própria área" }, { valor: "varanda", rotulo: "Varanda" }, { valor: "fora", rotulo: "Fora (garagem, rua)" }],
  },
  {
    campo: "distancia_entrada", tipo: "escolha", rotulo: "Da entrada da casa até à área",
    opcoes: [{ valor: "curta", rotulo: "Curta (até 5 m)" }, { valor: "media", rotulo: "Média (5–15 m)" }, { valor: "longa", rotulo: "Longa (mais de 15 m)" }],
  },
  {
    campo: "mobilada", tipo: "escolha", rotulo: "Casa mobilada no caminho",
    opcoes: [{ valor: "pouco", rotulo: "Pouco" }, { valor: "medio", rotulo: "Médio" }, { valor: "muito", rotulo: "Muito" }],
  },
  { campo: "portas_proteger", tipo: "inteiro", rotulo: "Portas a proteger", min: 0, max: 50 },
  { campo: "cliente_recusou_fotos", tipo: "sim_nao", rotulo: "O cliente não quis fotografias" },
];

const coluna = (c: Campo) => `diag_${c}`;

/** As colunas de deal_needs, para o select. */
export const COLUNAS_PLANEAMENTO = CAMPOS_PLANEAMENTO.map((d) => coluna(d.campo)).join(", ");

/** Da linha de deal_needs para o formulário. */
export function deLinha(linha: Record<string, unknown> | null | undefined): DiagnosticoPlaneamento {
  const f = { ...DIAGNOSTICO_PLANEAMENTO_VAZIO };
  if (!linha) return f;
  for (const d of CAMPOS_PLANEAMENTO) {
    const v = linha[coluna(d.campo)];
    f[d.campo] = v == null ? "" : d.tipo === "sim_nao" ? (v ? "sim" : "nao") : String(v);
  }
  return f;
}

const numero = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

/** O que está mal (para mostrar ao gravar). null = pronto. */
export function validarPlaneamento(f: DiagnosticoPlaneamento): string | null {
  for (const d of CAMPOS_PLANEAMENTO) {
    const s = f[d.campo];
    if (!s) continue;
    if (d.tipo === "escolha" && !d.opcoes!.some((o) => o.valor === s)) return `${d.rotulo}: escolha inválida.`;
    if (d.tipo === "sim_nao" && s !== "sim" && s !== "nao") return `${d.rotulo}: escolha inválida.`;
    if (d.tipo === "decimal" || d.tipo === "inteiro") {
      const v = numero(s);
      if (v == null) continue;
      if (Number.isNaN(v)) return `${d.rotulo}: tem de ser um número.`;
      if (d.tipo === "inteiro" && !Number.isInteger(v)) return `${d.rotulo}: tem de ser um número inteiro.`;
      if ((d.min != null && v < d.min) || (d.max != null && v > d.max))
        return `${d.rotulo}: de ${String(d.min).replace(".", ",")} a ${d.max}${d.unidade ? ` ${d.unidade}` : ""}.`;
    }
  }
  return null;
}

/** As chaves diag_* para o payload de rpc_update_deal_needs (vazio = null). */
export function paraPayload(f: DiagnosticoPlaneamento): Record<string, string | number | boolean | null> {
  const p: Record<string, string | number | boolean | null> = {};
  for (const d of CAMPOS_PLANEAMENTO) {
    const s = f[d.campo].trim();
    p[coluna(d.campo)] =
      s === "" ? null
      : d.tipo === "sim_nao" ? s === "sim"
      : d.tipo === "decimal" || d.tipo === "inteiro" ? numero(s)
      : s;
  }
  return p;
}

/** m² de parede pela altura do revestimento (o mesmo cálculo das Operações). */
export function m2Parede(f: DiagnosticoPlaneamento): number | null {
  const per = numero(f.perimetro_m);
  if (per == null || Number.isNaN(per)) return null;
  const alt =
    f.altura_revestimento === "20cm" ? 0.2
    : f.altura_revestimento === "60cm" ? 0.6
    : f.altura_revestimento === "120cm" ? 1.2
    : f.altura_revestimento === "teto" ? (numero(f.pe_direito_m) || 2.5)
    : null;
  return alt == null ? null : Math.round(per * alt * 100) / 100;
}

/** Algum campo preenchido? */
export const temPlaneamento = (f: DiagnosticoPlaneamento): boolean => Object.values(f).some((v) => v.trim() !== "");
