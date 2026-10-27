/** Confirmação de «Desligar»: pede o motivo (mínimo 3 caracteres) e só desliga com ele. */
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import type { ErroLigacao, ResultadoGravacao } from "@/components/rh-exemplo/organizacao/tipos";

interface DesligarDialogoProps {
  /** A pessoa a desligar; `null` com o diálogo fechado. */
  pessoa: { id: string; nome: string } | null;
  aoCancelar: () => void;
  /** Devolve o resultado da gravação (com o erro, se não desligou). */
  aoConfirmar: (pessoaId: string, motivo: string) => Promise<ResultadoGravacao>;
}

function Corpo({ pessoa, aoCancelar, aoConfirmar }: Omit<DesligarDialogoProps, "pessoa"> & { pessoa: { id: string; nome: string } }) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<ErroLigacao | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const confirmar = async (): Promise<void> => {
    setAGravar(true);
    try {
      const r = await aoConfirmar(pessoa.id, motivo);
      setErro(r.ok ? null : r.erro);
      setMensagem(r.ok ? null : (r.mensagem ?? null));
    } finally {
      setAGravar(false);
    }
  };
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("rhOrg.desligar.titulo", { nome: pessoa.nome })}</AlertDialogTitle>
        <AlertDialogDescription>{t("rhOrg.desligar.desc")}</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-2">
        <Label htmlFor="rhOrg-motivo-desligar">{t("rhOrg.desligar.motivo")}</Label>
        <Textarea
          id="rhOrg-motivo-desligar"
          value={motivo}
          rows={3}
          aria-invalid={erro !== null}
          aria-describedby={erro ? "rhOrg-motivo-erro" : undefined}
          onChange={(e) => setMotivo(e.target.value)}
        />
        {erro && <p id="rhOrg-motivo-erro" role="alert" className="text-sm text-destructive">{mensagem ?? t(`rhOrg.erro.${erro}`)}</p>}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel className="min-h-11" onClick={aoCancelar}>{t("rhOrg.form.cancelar")}</AlertDialogCancel>
        <Button type="button" variant="destructive" className="min-h-11" disabled={aGravar} onClick={() => void confirmar()}>{t("rhOrg.desligar.confirmar")}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

export function DesligarDialogo({ pessoa, aoCancelar, aoConfirmar }: DesligarDialogoProps) {
  return (
    <AlertDialog open={pessoa !== null} onOpenChange={(aberto) => !aberto && aoCancelar()}>
      {pessoa && <Corpo pessoa={pessoa} aoCancelar={aoCancelar} aoConfirmar={aoConfirmar} />}
    </AlertDialog>
  );
}
