// O seletor de ficheiros do portal, simulado: abre o seletor do navegador mas só guarda os NOMES (nada se lê nem se envia).
// Valida cada ficheiro como o convite de admissão (formato e tamanho) e não passa do máximo (4 por documento, como no fluxo 1).
import { useId, useState, type ChangeEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { chaveDeErroAdmissao } from "@/components/rh-exemplo/lib/errosAdmissao";
import { validarFicheiroLocal, type TipoAnexoConvite } from "@/components/rh-exemplo/lib/conviteAnexos";
import { MAX_FICHEIROS_PEDIDO, juntarFicheiros } from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface SeletorFicheirosProps {
  nomes: readonly string[];
  aoMudar: (nomes: string[]) => void;
  /** Quantos ficheiros no máximo (4 por omissão; 1 quando só cabe um). */
  max?: number;
  /** As regras de formato de cada tipo (a fotografia só aceita imagens). */
  tipo?: TipoAnexoConvite;
}

export function SeletorFicheiros({ nomes, aoMudar, max = MAX_FICHEIROS_PEDIDO, tipo = "cartao_cidadao" }: SeletorFicheirosProps) {
  const { t } = useTranslation();
  const id = useId();
  const [erro, setErro] = useState<string | null>(null);

  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const ficheiros = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of ficheiros) {
      const recusa = validarFicheiroLocal(tipo, f);
      if (recusa) return setErro(t(chaveDeErroAdmissao(recusa)?.chave ?? "rhPortal.erro.ficheiro_invalido"));
    }
    const r = juntarFicheiros(nomes, ficheiros.map((f) => f.name), max);
    if (!r.ok) return setErro(t("rhPortal.erro.max_ficheiros", { n: max }));
    setErro(null);
    aoMudar(r.nomes);
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className={cn(buttonVariants({ variant: "outline" }), "min-h-11 cursor-pointer gap-2 focus-within:ring-2 focus-within:ring-ring", FOCO)}
      >
        <Paperclip className="h-4 w-4" aria-hidden="true" />
        {t("rhPortal.ficheiros.escolher")}
        <input id={id} type="file" multiple={max > 1} className="sr-only" onChange={escolher} />
      </label>
      <p className="text-xs text-muted-foreground" role="status">
        {t("rhPortal.ficheiros.contagem", { n: nomes.length, max })}
      </p>
      {nomes.length > 0 && (
        <ul className="space-y-1" aria-label={t("rhPortal.ficheiros.lista")}>
          {nomes.map((nome) => (
            <li key={nome} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm">
              <span className="min-w-0 truncate">{nome}</span>
              <button
                type="button" className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted", FOCO)}
                aria-label={t("rhPortal.ficheiros.remover", { nome })} onClick={() => aoMudar(nomes.filter((n) => n !== nome))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
