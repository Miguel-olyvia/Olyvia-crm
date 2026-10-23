// Os tipos que a folha de uma PO e os seus separadores partilham.
import type { DlgPo } from "./PoDialogos";

export type TabPo = "lines" | "rec" | "guias" | "portal" | "ann" | "notes" | "hist";

/** O estado da folha aberta (PD do mockup): as notas por gravar, o texto do campo de acrescentar artigo e se há alterações por gravar. */
export interface EstadoPd { notesInt: string; notesSup: string; add: string; dirty: boolean }

/** O que os separadores podem pedir à folha: abrir um diálogo, mudar de separador, duplicar a PO ou restaurá-la. */
export interface AcoesPo { pedir: (d: DlgPo) => void; irTab: (t: TabPo) => void; duplicar: () => void; restaurar: () => void }
