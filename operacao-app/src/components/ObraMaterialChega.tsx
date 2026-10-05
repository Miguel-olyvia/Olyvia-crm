import { useEffect, useState } from "react";
import { Button, Input, cx } from "./ui";
import { ErroDeEscrita } from "../lib/dados";
import { avisarAlertasMudaram, definirMaterialChega, type RespostaMaterial, type TarefaObra } from "../lib/obras";
import { data as formatarData } from "../lib/formatar";

/**
 * "O material desta tarefa chega a …". Mostra a data (do CRM — encomenda ou
 * prazo do fornecedor — ou dita à mão) e, a quem pode (gestor ou supervisor
 * da obra), deixa mudá-la: antes de gravar, mostra o impacto — a tarefa passa
 * para esse dia e as dependentes são empurradas, como num atraso.
 */
export default function ObraMaterialChega({
  tarefa,
  podeEditar,
  aoMudar,
}: {
  tarefa: TarefaObra;
  podeEditar: boolean;
  aoMudar: () => void;
}) {
  const atual = tarefa.material_chega_em ?? "";
  const [data, setData] = useState(atual);
  const [nota, setNota] = useState(tarefa.material_chega_nota ?? "");
  const [impacto, setImpacto] = useState<RespostaMaterial | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);

  useEffect(() => {
    setData(tarefa.material_chega_em ?? "");
    setNota(tarefa.material_chega_nota ?? "");
    setEditar(false);
  }, [tarefa.id, tarefa.material_chega_em, tarefa.material_chega_nota]);

  // A pré-visualização: o que muda se gravar esta data.
  useEffect(() => {
    if (!editar || !data || data === atual) {
      setImpacto(null);
      return;
    }
    let vivo = true;
    definirMaterialChega({ tarefaId: tarefa.id, data, simular: true })
      .then((r) => vivo && setImpacto(r))
      .catch(() => vivo && setImpacto(null));
    return () => {
      vivo = false;
    };
  }, [editar, data, atual, tarefa.id]);

  const aberta = tarefa.estado === "por_fazer" || tarefa.estado === "rejeitada";
  if (!tarefa.material_chega_em && !(podeEditar && aberta)) return null;

  const gravar = async (valor: string | null) => {
    setAGravar(true);
    setErro(null);
    try {
      await definirMaterialChega({ tarefaId: tarefa.id, data: valor, nota: valor ? nota : null });
      avisarAlertasMudaram();
      setEditar(false);
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível falar com o servidor.");
    } finally {
      setAGravar(false);
    }
  };

  const tarde =
    !!tarefa.material_chega_em && !!tarefa.inicio_planeado && tarefa.material_chega_em > tarefa.inicio_planeado;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm" data-testid="material-chega">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Material</p>
        {podeEditar && aberta && !editar && (
          <Button size="sm" variant="secondary" onClick={() => setEditar(true)}>
            {tarefa.material_chega_em ? "Mudar data" : "Material chega a…"}
          </Button>
        )}
      </div>

      {tarefa.material_chega_em && !editar && (
        <p className={cx("text-xs", tarde ? "text-red-700" : "text-slate-600")}>
          Chega a <b>{formatarData(tarefa.material_chega_em)}</b>
          {tarefa.material_chega_origem === "crm" ? " (do CRM)" : ""}
          {tarefa.material_chega_nota && <> — {tarefa.material_chega_nota}</>}
          {tarde && <> · está planeada para antes ({formatarData(tarefa.inicio_planeado)})</>}
        </p>
      )}

      {editar && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="O material chega a" />
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Porquê (ex.: bancada encomendada ao marmorista)"
              maxLength={500}
              aria-label="Nota"
            />
          </div>
          {impacto && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
              {impacto.moveu ? (
                <>
                  A tarefa passa para <b>{formatarData(impacto.novo_inicio)}</b>
                  {impacto.empurradas.length > 0 && <> e empurra {impacto.empurradas.length} tarefa(s) a seguir</>}
                  {impacto.fim_obra_novo !== impacto.fim_obra_anterior && (
                    <>
                      {" "}
                      · fim da obra {formatarData(impacto.fim_obra_anterior)} → <b>{formatarData(impacto.fim_obra_novo)}</b>
                    </>
                  )}
                  .
                </>
              ) : (
                <>Chega a tempo: o plano não mexe.</>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" disabled={aGravar || !data} onClick={() => void gravar(data)}>
              {aGravar ? "A gravar…" : "Gravar"}
            </Button>
            {tarefa.material_chega_em && (
              <Button size="sm" variant="ghost" disabled={aGravar} onClick={() => void gravar(null)}>
                Já não condiciona
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={aGravar} onClick={() => setEditar(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}
