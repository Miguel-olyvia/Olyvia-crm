/** A mensagem de erro da base, sem o prefixo técnico. */
export function mensagemErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/row-level security/i.test(m)) return "Sem permissão para fazer isto.";
  if (/permission denied/i.test(m)) return "Sem permissão para fazer isto.";
  return m;
}
