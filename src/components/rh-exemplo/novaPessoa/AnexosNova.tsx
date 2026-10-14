// Os anexos do painel "Nova pessoa": cartão de cidadão (frente e verso), comprovativo de IBAN e fotografia. A escolha do
// ficheiro é simulada: guarda-se só o nome, o tamanho e o tipo em memória e nunca se envia nada. Os limites são os do convite
// real (no máximo 4 ficheiros no total, 2 do cartão, 1 do IBAN, 1 fotografia; PDF, PNG ou JPEG; fotografia só PNG ou JPEG).
import { useRef, useState, type ChangeEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import {
  chaveDeErroAnexo, contarPorTipo, formatarTamanho, LIMITES_ANEXOS, validarFicheiroLocal, verificarLimitesDeContagem,
  type TipoAnexoConvite,
} from "@/components/rh-exemplo/lib/conviteAnexos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { useNova } from "./contextoNova";
import type { AnexoSimulado } from "./tiposNova";

function LinhaAnexo({ tipo }: { tipo: TipoAnexoConvite }) {
  const { t } = useTranslation();
  const { valores, alterar } = useNova();
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const anexos = valores.extra.anexos;
  const doTipo = anexos.filter((a) => a.tipo === tipo);
  const id = `hr-novo-anexo-${tipo}`;
  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const ficheiro = e.target.files?.[0];
    e.target.value = "";
    if (!ficheiro) return;
    const codigo = validarFicheiroLocal(tipo, ficheiro) ?? verificarLimitesDeContagem(tipo, contarPorTipo(anexos));
    setErro(codigo === null ? null : t(chaveDeErroAnexo(codigo)));
    if (codigo !== null) return;
    const novo: AnexoSimulado = {
      id: `${tipo}-${anexos.length}-${ficheiro.name}`, tipo, nome: ficheiro.name, tamanho: ficheiro.size, mime: ficheiro.type,
    };
    alterar("extra", { anexos: [...anexos, novo] });
  };
  const retirar = (anexoId: string) => {
    setErro(null);
    alterar("extra", { anexos: anexos.filter((a) => a.id !== anexoId) });
  };
  return (
    <li className="space-y-2 border-t border-border/60 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{t(`hr.anexos.tipo.${tipo}`)}</span>
        <span className="text-xs text-muted-foreground">
          {t(tipo === "fotografia" ? "hr.anexos.ajudaFotografia" : "hr.anexos.ajudaFicheiros")}
        </span>
      </div>
      <input
        ref={entrada} type="file" tabIndex={-1} className="sr-only" onChange={escolher}
        aria-label={t("rhNova.anexos.escolherDe", { tipo: t(`hr.anexos.tipo.${tipo}`) })}
        accept={(tipo === "fotografia" ? LIMITES_ANEXOS.mimesFotografia : LIMITES_ANEXOS.mimesAceites).join(",")}
      />
      <Button
        id={id} type="button" variant="outline" onClick={() => entrada.current?.click()}
        aria-describedby={erro ? `${id}-erro` : undefined} className={cn("min-h-11 gap-2", FOCO)}
      >
        <Paperclip className="h-4 w-4" aria-hidden="true" />
        {t("rhNova.anexos.escolher")}
      </Button>
      {doTipo.length > 0 && (
        <ul className="space-y-1">
          {doTipo.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">{a.nome} <span className="text-muted-foreground">({formatarTamanho(a.tamanho)})</span></span>
              <Button
                type="button" variant="ghost" size="icon" onClick={() => retirar(a.id)} className={cn("h-11 w-11 shrink-0", FOCO)}
                aria-label={t("rhNova.anexos.retirarNome", { nome: a.nome })}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">{erro}</p>}
    </li>
  );
}

export function AnexosNova({ tipos }: { tipos: readonly TipoAnexoConvite[] }) {
  const { t } = useTranslation();
  const { valores } = useNova();
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {t("rhNova.anexos.contador", { n: valores.extra.anexos.length, max: LIMITES_ANEXOS.maxActivos })} {t("rhNova.anexos.simulado")}
      </p>
      <ul>{tipos.map((tipo) => <LinhaAnexo key={tipo} tipo={tipo} />)}</ul>
    </div>
  );
}
