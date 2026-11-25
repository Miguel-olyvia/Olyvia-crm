/**
 * «Ligar a pessoa»: liga um ativo do grupo Pessoas a uma atribuição do RH (`pessoas_equipamentos`) que ainda não tem ativo. Só
 * existe para quem tem `ativos.edit` E `hr.pessoas.retribuicao.edit` (a base exige as duas). Não muda o valor, a conta nem o estado
 * da atribuição no RH. Lista só as atribuições ainda ativas (as devolvidas não se ligam).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { CampoSelect } from "@/components/rh-exemplo/form/Campos";
import { useAtivoMutacoes } from "@/hooks/ativos/useAtivoMutacoes";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { AtribuicaoSemAtivo, Ativo } from "./lib/tipos";

export const PERMISSOES_LIGAR = ["ativos.edit", "hr.pessoas.retribuicao.edit"] as const;

interface Props {
  ativo: Ativo | null;
  /** As atribuições do RH sem ativo (a lista traz também as devolvidas; aqui só contam as `atribuido`). */
  atribuicoes: readonly AtribuicaoSemAtivo[];
  aoFechar: () => void;
  aoLigar?: (aviso: { nome: string; pessoa: string }) => void;
}

function Formulario({ ativo, atribuicoes, aoFechar, aoLigar }: Omit<Props, "ativo"> & { ativo: Ativo }) {
  const { t } = useTranslation();
  const { ligarPessoa } = useAtivoMutacoes();
  const [escolhida, setEscolhida] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const ocupado = useRef(false);
  const ativas = atribuicoes.filter((a) => a.estado === "atribuido");

  const confirmar = async () => {
    if (ocupado.current) return;
    const alvo = ativas.find((a) => a.id === escolhida);
    setErro(alvo ? null : t("ativos.ligar.val"));
    setAviso(null);
    if (!alvo) return;
    ocupado.current = true;
    setAGuardar(true);
    try {
      const r = await ligarPessoa(ativo.id, alvo.id);
      if (r.ok) {
        aoLigar?.({ nome: ativo.nome, pessoa: alvo.pessoaNome ?? "" });
        aoFechar();
      } else setAviso(r.mensagem);
    } finally {
      ocupado.current = false;
      setAGuardar(false);
    }
  };

  const rotulo = (a: AtribuicaoSemAtivo): string =>
    [a.pessoaNome, a.descricao, a.valor !== null ? euros(a.valor, "") : null, a.entrega ? dataPt(a.entrega) : null].filter(Boolean).join(" · ");

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void confirmar(); }}>
      {ativas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ativos.ligar.semAtribuicoes")}</p>
      ) : (
        <CampoSelect
          id="ativo-ligar-atribuicao" label={t("ativos.ligar.atribuicao")} valor={escolhida} onChange={setEscolhida} obrigatorio erro={erro}
          vazioLabel={t("ativos.ligar.escolher")} opcoes={ativas.map((a) => ({ value: a.id, label: rotulo(a) }))}
        />
      )}
      {aviso && <p role="alert" className="text-sm font-medium text-destructive">{aviso}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("ativos.sheet.cancelar")}</Button>
        <Button type="submit" disabled={aGuardar || ativas.length === 0} className={cn("min-h-11", FOCO)}>{t("ativos.ligar.confirmar")}</Button>
      </DialogFooter>
    </form>
  );
}

export function LigarPessoaDialog({ ativo, atribuicoes, aoFechar, aoLigar }: Props) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const permitido = PERMISSOES_LIGAR.every((p) => hasPermission(p));
  return (
    <Dialog open={ativo !== null && permitido} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ativos.ligar.titulo")}</DialogTitle>
          <DialogDescription>{ativo ? `${ativo.nome}. ${t("ativos.ligar.ajuda")}` : ""}</DialogDescription>
        </DialogHeader>
        {ativo && permitido && <Formulario key={ativo.id} ativo={ativo} atribuicoes={atribuicoes} aoFechar={aoFechar} aoLigar={aoLigar} />}
      </DialogContent>
    </Dialog>
  );
}
