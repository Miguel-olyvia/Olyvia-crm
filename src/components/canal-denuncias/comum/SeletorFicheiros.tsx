// Anexos simulados: guarda-se só o nome e o tamanho de cada ficheiro, em memória. Nada é lido nem enviado.
import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { formatoTamanho } from "../lib/formato";
import { MAX_FICHEIROS, type Anexo } from "../lib/tipos";

interface SeletorFicheirosProps {
  anexos: Anexo[];
  onChange: (anexos: Anexo[]) => void;
  max?: number;
  /** Prefixo dos identificadores, para poder haver dois seletores na mesma página. */
  idBase: string;
}

export function SeletorFicheiros({ anexos, onChange, max = MAX_FICHEIROS, idBase }: SeletorFicheirosProps) {
  const { t } = useTranslation();
  const entrada = useRef<HTMLInputElement>(null);
  const [cortados, setCortados] = useState(false);
  const cheio = anexos.length >= max;

  const aoEscolher = (lista: FileList | null): void => {
    const escolhidos = Array.from(lista ?? []).map((f) => ({ nome: f.name, tamanho: f.size }));
    const livres = max - anexos.length;
    setCortados(escolhidos.length > livres);
    onChange([...anexos, ...escolhidos.slice(0, livres)]);
    if (entrada.current) entrada.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="min-h-11" disabled={cheio} onClick={() => entrada.current?.click()}>
          <Paperclip className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("cd.provas.adicionar")}
        </Button>
        <span id={`${idBase}-contador`} className="text-sm text-muted-foreground">
          {t("cd.provas.contador", { n: anexos.length, max })}
        </span>
        <input ref={entrada} type="file" multiple tabIndex={-1} aria-hidden="true" className="hidden" onChange={(e) => aoEscolher(e.target.files)} />
      </div>
      {cortados && <p role="status" className="text-sm text-muted-foreground">{t("cd.provas.cortados", { max })}</p>}
      {anexos.length > 0 && (
        <ul aria-label={t("cd.provas.lista")} className="divide-y rounded-md border bg-card">
          {anexos.map((a, i) => (
            <li key={`${a.nome}-${i}`} className="flex min-h-11 items-center justify-between gap-2 px-3 text-sm">
              <span className="min-w-0 truncate">{a.nome} <span className="text-muted-foreground">· {formatoTamanho(a.tamanho)}</span></span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11"
                aria-label={t("cd.provas.remover", { nome: a.nome })}
                onClick={() => onChange(anexos.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
