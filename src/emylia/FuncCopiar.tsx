// O bloco Contacto da ficha na V2 funcional: os mesmos campos (camposContacto), com um botão "Copiar" junto ao telefone, ao email e à morada.
// Copia com a área de transferência; se o browser recusar, seleciona o texto para se copiar à mão e di-lo. O aviso é anunciado (aria-live).
import { useRef } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { camposContacto, type Perfil } from "./perfilDocs";
import type { Empresa } from "./pessoasExemplo";
import { BORDA_CTRL } from "./PessoaLinha";
import { useAviso } from "./useAviso";

/** Os campos que têm botão de copiar, e o que se copia (sem a marca "(exemplo)"). */
const COPIAVEIS: Record<string, (f: Perfil) => string> = { Telefone: (f) => f.telefone.trim(), Email: (f) => f.email.trim(), Morada: (f) => f.morada.completa.trim() };

/** Copia o texto: devolve `true` se a área de transferência o aceitou. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** Seleciona o texto de um elemento (o recurso quando a cópia é recusada). */
function selecionar(el: HTMLElement | null): void {
  if (!el) return;
  const s = window.getSelection(), r = document.createRange();
  r.selectNodeContents(el);
  s?.removeAllRanges(); s?.addRange(r);
}

export function ContactoCopiar({ f, empresa }: { f: Perfil; empresa: Empresa | null }) {
  const [aviso, setAviso] = useAviso();
  const valores = useRef<Record<string, HTMLElement | null>>({});
  const copiar = async (rotulo: string): Promise<void> => {
    const texto = COPIAVEIS[rotulo](f);
    if (await copiarTexto(texto)) { setAviso(`Copiado: ${rotulo.toLowerCase()}`); return; }
    selecionar(valores.current[rotulo]);
    setAviso(`Não foi possível copiar. O ${rotulo.toLowerCase()} ficou selecionado: use Ctrl+C.`);
  };
  return (
    <div className="grid gap-2">
      <dl className="grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[9rem_minmax(0,1fr)]">
        {camposContacto(f, empresa).map((c) => (
          <div key={c.rotulo} className="contents">
            <dt className="self-center text-muted-foreground">{c.rotulo}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
              <span ref={(el) => { valores.current[c.rotulo] = el; }} className="break-words">{c.valor}</span>
              {COPIAVEIS[c.rotulo] && COPIAVEIS[c.rotulo](f) && (
                <Button type="button" variant="outline" aria-label={`Copiar ${c.rotulo.toLowerCase()}`} onClick={() => { void copiar(c.rotulo); }}
                  className={cn("h-auto min-h-11 min-w-11 gap-1.5 px-3 text-[15px]", BORDA_CTRL)}>
                  <Copy className="h-4 w-4" aria-hidden="true" />Copiar
                </Button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p aria-live="polite" aria-atomic="true" className="text-[15px] text-muted-foreground">{aviso}</p>
    </div>
  );
}
