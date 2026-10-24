// O painel lateral (metade do ecrã) de uma denúncia: cabeçalho com as ações de estado e cinco abas sublinhadas.
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { useTranslation } from "@/hooks/useTranslation";
import { EstadoChip, GravidadeChip, OrigemChip } from "../comum/Etiquetas";
import { confirmarRececaoDe, reabrirDenuncia, useDenuncia } from "../dados/loja";
import { erroDe } from "../lib/acoes";
import { estaFechada } from "../lib/estados";
import type { Denuncia } from "../lib/tipos";
import { AbaConversa } from "./AbaConversa";
import { AbaDecisao } from "./AbaDecisao";
import { AbaHistorico } from "./AbaHistorico";
import { AbaNotas } from "./AbaNotas";
import { AbaResumo } from "./AbaResumo";

function AcoesDeEstado({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const [erro, setErro] = useState<string | null>(null);
  const correr = (fazer: (id: string) => ReturnType<typeof confirmarRececaoDe>): void => {
    const r = fazer(d.id);
    const e = erroDe(r);
    setErro(e ? t(`cd.erroAcao.${e}`) : null);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {d.estado === "recebida" && (
          <Button type="button" className="min-h-11" onClick={() => correr(confirmarRececaoDe)}>{t("cd.acao.confirmarRececao")}</Button>
        )}
        {estaFechada(d.estado) && (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => correr(reabrirDenuncia)}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />{t("cd.acao.reabrir")}
          </Button>
        )}
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}

function Conteudo({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  return (
    <>
      <SheetHeader className="space-y-2 text-left">
        <SheetTitle className="font-mono">{d.codigo}</SheetTitle>
        <SheetDescription className="break-words">{d.resumo}</SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <EstadoChip estado={d.estado} />
          <OrigemChip anonima={d.anonima} />
          <GravidadeChip gravidade={d.gravidade} />
        </div>
      </SheetHeader>
      <AcoesDeEstado d={d} />
      <Tabs defaultValue="resumo" className="mt-4">
        <ListaAbas aria-label={t("cd.abas.titulo")}>
          <Aba value="resumo" rotulo={t("cd.abas.resumo")} />
          <Aba value="conversa" rotulo={t("cd.abas.conversa")} contador={d.mensagens.length} />
          <Aba value="notas" rotulo={t("cd.abas.notas")} contador={d.notas.length} />
          <Aba value="decisao" rotulo={t("cd.abas.decisao")} />
          <Aba value="historico" rotulo={t("cd.abas.historico")} />
        </ListaAbas>
        <TabsContent value="resumo" className="pt-4"><AbaResumo d={d} /></TabsContent>
        <TabsContent value="conversa" className="pt-4"><AbaConversa d={d} /></TabsContent>
        <TabsContent value="notas" className="pt-4"><AbaNotas d={d} /></TabsContent>
        <TabsContent value="decisao" className="pt-4"><AbaDecisao d={d} /></TabsContent>
        <TabsContent value="historico" className="pt-4"><AbaHistorico d={d} /></TabsContent>
      </Tabs>
    </>
  );
}

export function PainelDenuncia({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const d = useDenuncia(id);
  return (
    <Sheet open={d !== undefined} onOpenChange={(aberto) => !aberto && onFechar()}>
      <SheetContent className="w-full space-y-3 overflow-y-auto sm:w-1/2 sm:max-w-none">
        {d && <Conteudo key={d.id} d={d} />}
      </SheetContent>
    </Sheet>
  );
}
