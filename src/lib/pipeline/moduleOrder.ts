/**
 * Ordem dos módulos do pipeline — regras puras, sem I/O.
 *
 * O "Cliente" é o passo terminal da cadeia de aquisição: é o único módulo que
 * não cria nada a seguir a si (converte, e acaba). Nada pode vir depois dele.
 *
 * Até 2026-08-31 isso não era garantido em lado nenhum: os DOIS manípulos de
 * arrasto — `DealWorkflowConfig.handleFlowDragEnd` e
 * `PipelineModuleToggle.handleDragEnd` — chamavam `arrayMove` sem guarda, e o
 * Cliente podia ficar em primeiro. Guardar só um deles deixaria o outro aberto,
 * por isso ambos passam por `reorderPipelineModules`.
 */

export interface OrderableModule {
  id: string;
  enabled: boolean;
  /** Passo terminal. Ausente nas configurações já guardadas — ver `isTerminal`. */
  terminal?: boolean;
}

/**
 * `terminal` é opcional de propósito: as configurações já guardadas não o têm, e
 * o recurso ao id evita uma migração de dados que teria de escrever nas 15
 * organizações — incluindo as de clientes, que são só de leitura — para corrigir
 * algo que hoje é apenas cosmético (nada além da UI lê esta tabela).
 */
export function isTerminal<T extends OrderableModule>(m: T): boolean {
  return m.terminal ?? m.id === "cliente";
}

/**
 * Põe os módulos terminais no fim, preservando a ordem relativa dos restantes.
 * Aplicada à LEITURA e à ESCRITA: uma organização cuja configuração já esteja
 * torta é corrigida assim que a abre, sem migração e sem escrita alheia.
 */
export function normalizeModuleOrder<T extends OrderableModule>(modules: T[]): T[] {
  const normais = modules.filter((m) => !isTerminal(m));
  const terminais = modules.filter((m) => isTerminal(m));
  return [...normais, ...terminais];
}

/**
 * Reordenação segura. Devolve o array inalterado se o gesto for ilegal, para o
 * chamador poder comparar por identidade e não escrever nada.
 */
export function reorderPipelineModules<T extends OrderableModule>(
  modules: T[],
  activeId: string,
  overId: string,
): T[] {
  if (activeId === overId) return modules;

  const oldIndex = modules.findIndex((m) => m.id === activeId);
  const overIndex = modules.findIndex((m) => m.id === overId);
  if (oldIndex < 0 || overIndex < 0) return modules;

  // Arrastar o próprio terminal nunca é válido.
  if (isTerminal(modules[oldIndex])) return modules;

  // Largar DEPOIS do terminal também não: o alvo é limitado à última posição
  // livre antes dele.
  const primeiroTerminal = modules.findIndex((m) => isTerminal(m));
  const limite = primeiroTerminal < 0 ? modules.length - 1 : primeiroTerminal - 1;
  const newIndex = Math.min(overIndex, limite);
  if (newIndex === oldIndex) return modules;

  const copia = [...modules];
  const [movido] = copia.splice(oldIndex, 1);
  copia.splice(newIndex, 0, movido);
  return normalizeModuleOrder(copia);
}
