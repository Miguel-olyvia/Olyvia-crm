// A revisão da ficha submetida: o RH vê o que a pessoa preencheu, pode comentar campo a campo e decide: Aprovar, Devolver (com
// os comentários) ou Rejeitar (pede o motivo noutro diálogo). Os dados vêm da admissão em memória; nada sai daqui.
import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useAdmissao } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { rotuloDeCampoAdmissao } from "@/components/rh-exemplo/rotuloCampoAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { camposPreenchidos, codigoDoRotulo, valorParaRever } from "./dadosSubmetidos";

interface RevisaoAdmissaoDialogProps {
  pessoaId: string | null;
  aoFechar: () => void;
  aoAprovar: (pessoaId: string) => void;
  aoDevolver: (pessoaId: string, comentarios: Record<string, string>) => void;
  aoRejeitar: (pessoaId: string) => void;
}

interface LinhaProps {
  chave: string;
  comentario: string | undefined;
  aoComentar: (chave: string, texto: string | undefined) => void;
  dados: Record<string, unknown>;
}

function LinhaDeRevisao({ chave, comentario, aoComentar, dados }: LinhaProps) {
  const { t } = useTranslation();
  const rotulo = rotuloDeCampoAdmissao(t, codigoDoRotulo(chave));
  const aberto = comentario !== undefined;
  return (
    <li className="space-y-2 py-2">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{rotulo}</p>
          <p className="break-words text-sm">{valorParaRever(chave, dados[chave])}</p>
        </div>
        <Button
          type="button" variant={aberto ? "secondary" : "outline"} size="sm" aria-pressed={aberto}
          className={cn("min-h-11 shrink-0 gap-1.5", FOCO)} aria-label={t("rhAdm.revisao.comentarCampo", { campo: rotulo })}
          onClick={() => aoComentar(chave, aberto ? undefined : "")}
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          {t("rhAdm.revisao.comentar")}
        </Button>
      </div>
      {aberto && (
        <div className="space-y-1">
          <Label htmlFor={`rh-adm-com-${chave}`} className="text-xs">{t("rhAdm.revisao.comentarioSobre", { campo: rotulo })}</Label>
          <Textarea id={`rh-adm-com-${chave}`} value={comentario} onChange={(e) => aoComentar(chave, e.target.value)} className="min-h-16" />
        </div>
      )}
    </li>
  );
}

export function RevisaoAdmissaoDialog({ pessoaId, aoFechar, aoAprovar, aoDevolver, aoRejeitar }: RevisaoAdmissaoDialogProps) {
  const { t } = useTranslation();
  const adm = useAdmissao(pessoaId);
  const ficha = useFichaRh(pessoaId);
  const [comentarios, setComentarios] = useState<Record<string, string | undefined>>({});
  useEffect(() => setComentarios({}), [pessoaId]);

  const comentar = (chave: string, texto: string | undefined) => setComentarios((c) => ({ ...c, [chave]: texto }));
  const escritos = Object.fromEntries(Object.entries(comentarios).filter(([, v]) => (v ?? "").trim() !== "")) as Record<string, string>;
  const n = Object.keys(escritos).length;
  const campos = adm ? camposPreenchidos(adm.dadosSubmetidos) : [];

  return (
    <Dialog open={pessoaId !== null} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("rhAdm.revisao.titulo", { nome: ficha?.pessoa.nome_completo ?? "" })}</DialogTitle>
          <DialogDescription>{t("rhAdm.revisao.descricao")}</DialogDescription>
        </DialogHeader>
        {campos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("rhAdm.revisao.vazio")}</p>
        ) : (
          <ul className="divide-y rounded-md border px-3" aria-label={t("rhAdm.revisao.listaRotulo")}>
            {campos.map((c) => (
              <LinhaDeRevisao key={c} chave={c} comentario={comentarios[c]} aoComentar={comentar} dados={adm?.dadosSubmetidos ?? {}} />
            ))}
          </ul>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:space-x-0">
          <Button type="button" variant="ghost" className="min-h-11" onClick={aoFechar}>{t("employees.form.cancel")}</Button>
          <Button type="button" variant="outline" className="min-h-11 text-destructive" onClick={() => pessoaId && aoRejeitar(pessoaId)}>
            {t("rhAdm.acao.rejeitar")}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={n === 0} onClick={() => pessoaId && aoDevolver(pessoaId, escritos)}>
            {t("rhAdm.revisao.devolver", { n })}
          </Button>
          <Button type="button" className="min-h-11" onClick={() => pessoaId && aoAprovar(pessoaId)}>{t("rhAdm.acao.aprovar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
