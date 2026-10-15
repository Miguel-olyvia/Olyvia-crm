// Acompanhar, passo 2: o estado, as datas dos prazos e a conversa com o responsável do canal. Quem acompanha vê só
// o que lhe diz respeito: nunca vê notas internas, gravidade, avaliação nem quem é o responsável.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { EstadoChip } from "../comum/Etiquetas";
import { ListaMensagens } from "../comum/ListaMensagens";
import { SeletorFicheiros } from "../comum/SeletorFicheiros";
import { responderComoDenunciante, useDenuncia } from "../dados/loja";
import { dataCurta } from "../lib/datas";
import { prazoConfirmacao, prazoResposta } from "../lib/prazos";
import { estaFechada } from "../lib/estados";
import type { Anexo, Denuncia } from "../lib/tipos";

function Datas({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const linhas: [string, string][] = [
    [t("cd.acomp.recebidaEm"), dataCurta(d.recebidaEm, true)],
    d.confirmadaEm
      ? [t("cd.acomp.confirmadaEm"), dataCurta(d.confirmadaEm, true)]
      : [t("cd.acomp.confirmarAte"), dataCurta(prazoConfirmacao(d.recebidaEm), true)],
    [t("cd.acomp.responderAte"), dataCurta(prazoResposta(d.recebidaEm), true)],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} className="rounded-md border bg-card p-3">
          <dt className="text-xs text-muted-foreground">{rotulo}</dt>
          <dd className="text-sm font-medium">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Desfecho({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  if (d.decisao) {
    return (
      <div className="space-y-1 rounded-md border bg-muted p-3 text-sm">
        <p className="font-medium">{t("cd.acomp.resultado", { resultado: t(`cd.resultado.${d.decisao.resultado}`) })}</p>
        {d.decisao.medidas && <p className="whitespace-pre-line">{d.decisao.medidas}</p>}
      </div>
    );
  }
  if (d.motivoArquivo) return <p className="rounded-md border bg-muted p-3 text-sm">{t("cd.acomp.arquivada", { motivo: d.motivoArquivo })}</p>;
  return null;
}

function Resposta({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [erro, setErro] = useState(false);

  if (estaFechada(d.estado)) return <p className="text-sm text-muted-foreground">{t("cd.acomp.fechada")}</p>;

  const enviar = (): void => {
    const r = responderComoDenunciante(d.id, texto, anexos);
    setErro(!r.ok);
    if (r.ok) {
      setTexto("");
      setAnexos([]);
    }
  };

  return (
    <div className="space-y-3">
      <Campo id="acomp-resposta" rotulo={t("cd.acomp.responder")} erro={erro ? t("cd.erro.mensagemVazia") : undefined} ajuda={t("cd.acomp.anonimaNota")}>
        {(a) => <Textarea {...a} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />}
      </Campo>
      <SeletorFicheiros idBase="acomp-anexos" max={3} anexos={anexos} onChange={setAnexos} />
      <Button type="button" className="min-h-11" onClick={enviar}>{t("cd.acomp.enviar")}</Button>
    </div>
  );
}

export function VistaAcompanhamento({ id, onSair }: { id: string; onSair: () => void }) {
  const { t } = useTranslation();
  const d = useDenuncia(id);
  if (!d) return null;
  return (
    <section aria-labelledby="acomp-estado" className="space-y-5 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="acomp-estado" className="text-xl font-semibold">{t("cd.acomp.denuncia", { codigo: d.codigo })}</h2>
          <div className="mt-1 flex items-center gap-2"><EstadoChip estado={d.estado} /></div>
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={onSair}>{t("cd.acomp.sair")}</Button>
      </div>
      <p className="text-sm">{t(`cd.acomp.texto.${d.estado}`)}</p>
      <Datas d={d} />
      <Desfecho d={d} />
      <div className="space-y-3">
        <h3 className="text-base font-semibold">{t("cd.conversa.titulo")}</h3>
        <ListaMensagens mensagens={d.mensagens} perspetiva="denunciante" />
        <Resposta d={d} />
      </div>
    </section>
  );
}
