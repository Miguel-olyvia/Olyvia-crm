// Custo de um serviço pela receita. Espelho de public.fn_custo_servico_calc.
//   custo por medida = Σ horas × €/h (mão de obra) + Σ horas × €/h (equipamentos)
//                      + Σ quantidade × preço (consumíveis)
//                      [+ horas × estrutura €/h, se somar_estrutura]

export interface LinhaMaoObra {
  perfil: string;
  horas: number;
  /** null = o perfil não tem custo/hora (usa-se a média dos perfis). */
  custoHora: number | null;
}
export interface LinhaEquipamento {
  equipamento: string;
  horas: number;
  custoHora: number;
}
export interface LinhaConsumivel {
  consumivel: string;
  quantidade: number;
  preco: number | null;
  /** Data do preço (ISO). Mais velho do que mesesDesatualizado → aviso. */
  dataPreco?: string | null;
}
export interface Receita {
  maoObra: LinhaMaoObra[];
  equipamentos: LinhaEquipamento[];
  consumiveis: LinhaConsumivel[];
}
export interface OpcoesCusto {
  mediaHora: number | null;
  estruturaHora: number;
  somarEstrutura: boolean;
  mesesDesatualizado: number;
  hoje?: Date;
}

export type TipoAviso = "sem_receita" | "sem_custo_hora" | "custo_desatualizado" | "consumivel_sem_preco";
export interface AvisoCusto {
  tipo: TipoAviso;
  mensagem: string;
}

export interface CustoCalculado {
  horas: number;
  maoObra: number;
  equipamentos: number;
  consumiveis: number;
  estrutura: number;
  custoPorMedida: number;
  avisos: AvisoCusto[];
}

function limiteDesatualizado(hoje: Date, meses: number): Date {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  d.setMonth(d.getMonth() - meses);
  return d;
}

export function custoReceita(r: Receita, o: OpcoesCusto): CustoCalculado {
  const semCh: string[] = [];
  const velhos: string[] = [];
  const semPreco: string[] = [];
  let horas = 0;
  let mo = 0;
  for (const l of r.maoObra) {
    let ch = l.custoHora;
    if (ch == null) {
      if (!semCh.includes(l.perfil)) semCh.push(l.perfil);
      ch = o.mediaHora ?? 0;
    }
    horas += l.horas;
    mo += l.horas * ch;
  }
  const eq = r.equipamentos.reduce((a, l) => a + l.horas * l.custoHora, 0);
  const limite = limiteDesatualizado(o.hoje ?? new Date(), o.mesesDesatualizado);
  let cons = 0;
  for (const l of r.consumiveis) {
    if (l.preco == null) semPreco.push(l.consumivel);
    if (l.dataPreco && new Date(l.dataPreco) < limite) {
      velhos.push(`${l.consumivel} (${new Date(l.dataPreco).toLocaleDateString("pt-PT")})`);
    }
    cons += l.quantidade * (l.preco ?? 0);
  }
  const estrutura = o.somarEstrutura ? horas * o.estruturaHora : 0;
  const avisos: AvisoCusto[] = [];
  if (semCh.length)
    avisos.push({ tipo: "sem_custo_hora", mensagem: `Perfil sem custo/hora: ${semCh.join(", ")}. Usou-se o custo médio dos perfis.` });
  if (velhos.length)
    avisos.push({ tipo: "custo_desatualizado", mensagem: `Preço com mais de ${o.mesesDesatualizado} meses: ${velhos.join("; ")}.` });
  if (semPreco.length)
    avisos.push({ tipo: "consumivel_sem_preco", mensagem: `Consumível sem preço: ${semPreco.join(", ")}.` });
  return {
    horas,
    maoObra: mo,
    equipamentos: eq,
    consumiveis: cons,
    estrutura,
    custoPorMedida: mo + eq + cons + estrutura,
    avisos,
  };
}

/** Margem sobre o preço, em %: (preço − custo) ÷ preço. null sem preço. */
export function margemPct(preco: number | null | undefined, custo: number): number | null {
  return preco && preco > 0 ? ((preco - custo) / preco) * 100 : null;
}

/** O preço que dá a margem alvo: custo ÷ (1 − alvo). */
export function precoSugerido(custo: number, alvoPct: number): number | null {
  return alvoPct < 100 ? Math.round((custo / (1 - alvoPct / 100)) * 100) / 100 : null;
}
