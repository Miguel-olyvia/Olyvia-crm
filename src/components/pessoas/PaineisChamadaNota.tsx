import { useEffect, useId, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BotoesPainel } from "./BotoesPainel";
import { MolduraPainel, type PropsPainel } from "./PainelBase";
import { useFocoInicial } from "./useFocoInicial";

type PropsComTitulo = PropsPainel & { titulo: string };

/** Nota: um campo de texto cujo conteúdo entra na atividade. ("Registar chamada" tem a sua própria vista: `FormChamada`.) */
export function PainelNota({ id, titulo, ativo, pessoa, acoes, aoFechar, aoConcluir, aoMudarConteudo }: PropsComTitulo) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const campo = useFocoInicial<HTMLTextAreaElement>(ativo);
  const idCampo = useId();
  useEffect(() => aoMudarConteudo(texto.trim() !== ""), [texto, aoMudarConteudo]);
  const guardar = () => {
    acoes.juntarNota(pessoa.id, texto);
    aoConcluir(t("pessoasPagina.live.note", { name: pessoa.nome }));
  };
  return (
    <MolduraPainel id={id} titulo={titulo} ativo={ativo}>
      <div className="space-y-1">
        <Label htmlFor={idCampo}>{t("pessoasPagina.panel.noteLabel")}</Label>
        <Textarea id={idCampo} ref={campo} value={texto} rows={3} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <BotoesPainel guardar={guardar} aoCancelar={aoFechar} desativado={texto.trim() === ""} dica={t("pessoasPagina.panel.hintNote")} />
    </MolduraPainel>
  );
}
