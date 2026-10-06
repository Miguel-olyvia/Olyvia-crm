import { useMemo, useRef, useState } from "react";
import { Button, Field, Input, Modal, Textarea } from "./ui";
import AssinaturaCanvas, { type AssinaturaHandle } from "./AssinaturaCanvas";
import { gerarPdfAuto } from "../domain/pdfAuto";
import { registarAuto, resumoDoAuto, type FechoObra } from "../lib/obrasFecho";
import { ErroDeEscrita } from "../lib/dados";
import { dataHora } from "../lib/formatar";

/**
 * O auto de receção, no telemóvel, com o cliente ao lado: o resumo da obra,
 * os remates que ficam por fazer, observações, o nome e a assinatura. Ao
 * assinar gera-se o PDF ali mesmo e guarda-se na obra.
 */
export default function ObraAutoRececao({
  fecho,
  orgId,
  aoFechar,
  aoGravar,
}: {
  fecho: FechoObra;
  orgId: string;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const assinatura = useRef<AssinaturaHandle | null>(null);
  const [nome, setNome] = useState(fecho.obra.cliente ?? "");
  const [observacoes, setObservacoes] = useState("");
  const [vazia, setVazia] = useState(true);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const resumo = useMemo(() => resumoDoAuto(fecho), [fecho]);

  async function assinar() {
    setErro(null);
    if (!nome.trim()) {
      setErro("Escreve o nome de quem assina.");
      return;
    }
    const a = await assinatura.current?.exportar();
    if (!a) {
      setErro("Falta a assinatura do cliente.");
      return;
    }
    setAGravar(true);
    try {
      const agora = new Date().toISOString();
      const pdf = gerarPdfAuto(
        { ...resumo, observacoes: observacoes.trim() || null, assinante: nome.trim(), assinadoEm: dataHora(agora) },
        { jpeg: a.bytes, largura: a.largura, altura: a.altura }
      );
      await registarAuto({
        organizationId: orgId,
        obraId: fecho.obra.id,
        assinante: nome.trim(),
        observacoes: observacoes.trim() || null,
        assinatura: a.blob,
        pdf,
        resumo: { ...resumo, remates_pendentes: resumo.remates.length, assinado_em: agora },
      });
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível guardar o auto.");
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal
      title="Auto de receção"
      size="lg"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar} disabled={aGravar}>
            Voltar
          </Button>
          <Button onClick={() => void assinar()} disabled={aGravar || vazia || !nome.trim()}>
            {aGravar ? "A guardar…" : "Assinar e guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="font-mono text-xs text-slate-500">{resumo.codigo}</p>
          <p className="font-semibold text-slate-800">{resumo.titulo}</p>
          {resumo.cliente && <p className="text-slate-600">{resumo.cliente}</p>}
          {resumo.morada && <p className="text-slate-500">{resumo.morada}</p>}
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {resumo.linhasDatas.map(([r, v]) => (
              <div key={r} className="contents">
                <dt className="text-slate-500">{r}</dt>
                <dd className="tabular text-slate-800">{v}</dd>
              </div>
            ))}
            <dt className="text-slate-500">Tarefas</dt>
            <dd className="text-slate-800">{resumo.tarefas}</dd>
          </dl>
        </div>

        <div>
          <p className="font-medium text-slate-700">
            {resumo.remates.length ? `Remates que ficam por fazer (${resumo.remates.length})` : "Sem remates por fazer"}
          </p>
          {resumo.remates.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
              {resumo.remates.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>

        <Field label="Observações (opcional)">
          <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </Field>

        <Field label="Nome de quem assina">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-slate-700">Assinatura do cliente</span>
            <button
              type="button"
              className="text-xs text-slate-500 underline"
              onClick={() => assinatura.current?.limpar()}
            >
              Limpar
            </button>
          </div>
          <AssinaturaCanvas ref={assinatura} aoMudar={setVazia} />
          <p className="text-xs text-slate-400">
            Ao assinar, o cliente declara que recebeu a obra nas condições descritas
            {resumo.remates.length ? ", com os remates indicados por fazer" : ""}. O PDF fica guardado na obra.
          </p>
        </div>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}
