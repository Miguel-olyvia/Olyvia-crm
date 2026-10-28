// A aba «Identificadas» de «As minhas denúncias»: as denúncias identificadas da própria pessoa, na organização ativa, com
// o estado, o prazo e o resumo. Clicar numa abre o painel lateral com a conversa. Sem nenhuma, um estado vazio útil
// com «Nova denúncia» (secundário: o botão principal da página é só um).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { AvisoLeitura } from "../comum/AvisoLeitura";
import { EstadoChip, PrazoTexto } from "../comum/Etiquetas";
import { useFonte, type EstadoLeitura } from "../dados/fonte";
import { dataCurta } from "../lib/datas";
import { prazoAtual } from "../lib/prazos";
import type { Denuncia } from "../lib/tipos";
import { PainelMinhaDenuncia } from "./PainelMinhaDenuncia";

function SemDenuncias({ onNova }: { onNova: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-card p-6 text-center">
      <p className="font-medium">{t("cdm.identificadas.vazioTitulo")}</p>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">{t("cdm.identificadas.vazioTexto")}</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={onNova}>{t("cdm.denunciar.botao")}</Button>
    </div>
  );
}

function Cartao({ d, onAbrir }: { d: Denuncia; onAbrir: (id: string) => void }) {
  const { t } = useTranslation();
  const hoje = useFonte().hoje();
  return (
    <li>
      <button
        type="button"
        onClick={() => onAbrir(d.id)}
        aria-label={t("cd.lista.abrir", { codigo: d.codigo })}
        className={`flex min-h-11 w-full flex-col gap-1.5 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted motion-reduce:transition-none ${FOCO}`}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{d.codigo}</span>
          <EstadoChip estado={d.estado} />
          <span className="text-xs text-muted-foreground">{t("cdm.identificadas.recebidaEm", { data: dataCurta(d.recebidaEm, true) })}</span>
        </span>
        <span className="break-words text-sm">{d.resumo}</span>
        <span className="text-sm text-muted-foreground"><PrazoTexto prazo={prazoAtual(d, hoje)} /></span>
      </button>
    </li>
  );
}

interface AbaIdentificadasProps {
  denuncias: readonly Denuncia[];
  estado: EstadoLeitura;
  onTentar: () => void;
  onNova: () => void;
}

export function AbaIdentificadas({ denuncias, estado, onTentar, onNova }: AbaIdentificadasProps) {
  const { t } = useTranslation();
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("cdm.identificadas.intro")}</p>
      {estado !== "ok" ? (
        <AvisoLeitura estado={estado} onTentar={onTentar} />
      ) : denuncias.length === 0 ? (
        <SemDenuncias onNova={onNova} />
      ) : (
        <ul aria-label={t("cdm.identificadas.lista")} className="space-y-2">
          {denuncias.map((d) => <Cartao key={d.id} d={d} onAbrir={setAberta} />)}
        </ul>
      )}
      <PainelMinhaDenuncia id={aberta} onFechar={() => setAberta(null)} />
    </div>
  );
}
