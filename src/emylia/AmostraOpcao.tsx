// A amostra de uma opção de atributo: foto > hex > quadrado neutro tracejado. Decorativa (aria-hidden, alt vazio): o nome da opção vem sempre escrito ao lado.
// A foto é o caminho do bucket público `catalogo-opcoes` («{org}/{uuid}.webp»); se a imagem falhar (ou o storage não responder), volta ao hex.
import { cn } from "@/lib/utils";
import { useFotoOpcao } from "./fotoOpcaoUrl";

export interface AmostraOpcaoProps {
  /** o caminho da foto no bucket; null/ausente: sem foto (também quando a base ainda não devolve o campo) */
  foto?: string | null;
  hex: string | null;
  nome: string;
  /** o lado, em píxeis (24 por omissão) */
  tamanho?: number;
  testId?: string;
  /** a forma (arredondamento); por omissão um quadrado de cantos suaves */
  className?: string;
}

export function AmostraOpcao({ foto, hex, nome, tamanho = 24, testId, className }: AmostraOpcaoProps) {
  const { url, aoFalhar } = useFotoOpcao(foto);
  return (
    <span aria-hidden="true" data-testid={testId} data-hex={hex ?? ""} data-opcao={nome} data-foto={url ? foto : undefined}
      style={{ width: tamanho, height: tamanho, ...(hex ? { backgroundColor: hex } : {}) }}
      className={cn("inline-block shrink-0 overflow-hidden", url || hex ? "border border-foreground/20 bg-muted" : "border border-dashed border-muted-foreground/60", className ?? "rounded-md")}>
      {url && <img src={url} alt="" loading="lazy" onError={aoFalhar} className="block h-full w-full object-cover" />}
    </span>
  );
}

/** Uma foto POR CIMA de uma amostra que já tem o seu hex (as bolinhas das famílias, que podem ter cor dupla): a foto vence; se falhar, fica o hex que está por baixo.
 *  O pai tem de ser `relative` e `overflow-hidden`. Decorativa (alt vazio). */
export function FotoSobreAmostra({ foto }: { foto: string | null | undefined }) {
  const { url, aoFalhar } = useFotoOpcao(foto);
  return url ? <img src={url} alt="" loading="lazy" onError={aoFalhar} data-foto={foto ?? undefined} className="absolute inset-0 block h-full w-full object-cover" /> : null;
}
