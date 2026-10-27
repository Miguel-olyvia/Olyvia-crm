/** O mes por omissao do processamento: o mes de hoje (AAAA-MM), a mesma logica do ecra real em components/hr/processamento. */
export function mesPorOmissao(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}
