// Famílias (interface): as peças pequenas que os passos partilham (erro de leitura, bolinhas de cor, listas de erros e avisos).
// Só tokens do tema (claro e escuro) e os componentes do Catálogo; alvos de 44 px (min-h-11).
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FotoSobreAmostra } from "../AmostraOpcao";
import { BTN, estiloDaCor } from "./estilosFamilias";

/** Uma linha de erro curta, com «Tentar de novo» (como na página de Produtos). */
export function ErroLeitura({ texto, erro, tentar }: { texto: string; erro: string; tentar: () => void }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-destructive">
      {texto}: {erro}
      <Button type="button" variant="outline" className={BTN} onClick={tentar}>Tentar de novo</Button>
    </p>
  );
}

/** As metades de uma cor dupla (ou tripla), pela ordem dos hex. Vazio com menos de dois hex. */
export function MetadesDaCor({ hex }: { hex: readonly string[] }) {
  if (hex.length < 2) return null;
  return <>{hex.map((h, i) => <span key={`${i}-${h}`} aria-hidden="true" style={{ backgroundColor: h }} className="flex-1" />)}</>;
}

/** Uma amostra de cor DECORATIVA (aria-hidden): o nome da cor vai sempre em texto ao lado. Borda interior fixa de 2 px (foreground a 60 %) para que o branco e o preto se vejam
 *  em fundo claro e escuro. `data-hex` diz que hex desenha. Com `foto` (a da opção), a foto vence o hex; se falhar, fica o hex. */
export function AmostraDeCor({ hex, foto, className }: { hex: readonly string[]; foto?: string | null; className?: string }) {
  return (
    <span aria-hidden="true" data-hex={hex.join(",")} style={estiloDaCor(hex)} className={cn("relative inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full border-2 border-foreground/60", className)}>
      <MetadesDaCor hex={hex} />
      <FotoSobreAmostra foto={foto} />
    </span>
  );
}

export interface ListasProps {
  erros: readonly string[]; avisos: readonly string[]; rotuloErros: string; rotuloAvisos: string;
  /** `alert`: os erros entram num contentor role=alert (aparecem depois de uma ação do utilizador); `{ status }`: uma região educada (role=status, com este nome) que já está no
   *  ecrã quando o passo abre e leva erros e avisos. */
  viva: "alert" | { status: string };
  /** o id do contentor dos erros, para os campos o ligarem com aria-describedby (só com `viva: "alert"`) */
  idErros?: string;
}

/** Os erros (bloqueiam) e os avisos (só informam) do núcleo, em listas com nome. */
export function ListasDeProblemas({ erros, avisos, rotuloErros, rotuloAvisos, viva, idErros }: ListasProps) {
  const ulErros = erros.length > 0 && (
    <ul aria-label={rotuloErros} className="grid gap-1 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-[15px] text-destructive">
      {erros.map((e, i) => <li key={`${i}-${e}`}>Erro: {e}</li>)}
    </ul>
  );
  const ulAvisos = avisos.length > 0 && (
    <ul aria-label={rotuloAvisos} className="grid gap-1 rounded-lg border border-border bg-muted px-3 py-2 text-[15px] text-foreground">
      {avisos.map((a, i) => <li key={`${i}-${a}`}>Aviso: {a}</li>)}
    </ul>
  );
  if (viva === "alert") return <>{ulErros && <div role="alert" id={idErros}>{ulErros}</div>}{ulAvisos}</>;
  return <div role="status" aria-label={viva.status} className="grid gap-2">{ulErros}{ulAvisos}</div>;
}
