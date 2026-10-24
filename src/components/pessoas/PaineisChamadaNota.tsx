import { useEffect, useId, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BotoesPainel } from "./BotoesPainel";
import { ErroAcao } from "./ErroAcao";
import { MolduraPainel, type PropsPainel } from "./PainelBase";
import { useExecutarAcao } from "./useExecutarAcao";
import { useFocoInicial } from "./useFocoInicial";

type PropsComTitulo = PropsPainel & { titulo: string };

/** Nota: um campo de texto cujo conteúdo entra na atividade. ("Registar chamada" tem a sua própria vista: `FormChamada`.) */
export function PainelNota({ id, titulo, ativo, pessoa, acoes, aoFechar, aoConcluir, aoMudarConteudo }: PropsComTitulo) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const campo = useFocoInicial<HTMLTextAreaElement>(ativo);
  const idCampo = useId();
  useEffect(() => aoMudarConteudo(texto.trim() !== ""), [texto, aoMudarConteudo]);
  const acao = useExecutarAcao();
  const guardar = () => {
    const mensagem = t("pessoasPagina.live.note", { name: pessoa.nome });
    acao.executar(() => acoes.juntarNota(pessoa.id, texto), () => aoConcluir(mensagem), mensagem);
  };
  return (
    <MolduraPainel id={id} titulo={titulo} ativo={ativo}>
      <div className="space-y-1">
        <Label htmlFor={idCampo}>{t("pessoasPagina.panel.noteLabel")}</Label>
        <Textarea id={idCampo} ref={campo} value={texto} rows={3} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <ErroAcao chave={acao.erro} chaveExtra={acao.erroExtra} />
      <BotoesPainel
        guardar={guardar} aoCancelar={aoFechar} desativado={texto.trim() === ""} dica={t("pessoasPagina.panel.hintNote")} aGuardar={acao.aGuardar}
      />
    </MolduraPainel>
  );
}
