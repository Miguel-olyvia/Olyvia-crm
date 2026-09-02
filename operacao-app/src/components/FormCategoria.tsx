import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { gravarCategoria, type CategoriaAtivo } from "../lib/config";
import { Button, Field, Input, Modal, cx, useGravar } from "./ui";
import { Check, Plus } from "./icons";
import {
  SUGESTOES,
  porUsar,
  type CategoriaSugerida,
} from "../domain/categorias-sugeridas";

/**
 * Criar categorias de equipamento — várias de uma vez.
 *
 * O que isto resolve, dito por quem estava a montar a operação: "faltam
 * muitas categorias, só tenho duas". E tinha razão. A lista começava vazia e
 * cada categoria era um formulário inteiro: nome, código, gravar, outra vez.
 * Trinta categorias eram trinta voltas.
 *
 * Agora abre com um catálogo por ofício. Toca-se no que serve, ignora-se o
 * resto, e grava tudo de uma vez. O formulário à mão continua lá em baixo
 * para o que não está no catálogo — que é sempre metade, em qualquer negócio
 * a sério.
 *
 * O que já existe não aparece: oferecer "Extintores" a quem já escreveu
 * "extintor" é fazer perder tempo a comparar.
 */
export default function FormCategoria({
  jaExistem,
  aoFechar,
  aoGravar,
}: {
  jaExistem: readonly CategoriaAtivo[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { activeOrgId } = useAuth();
  const { aGravar, erro, gravar } = useGravar();

  const [escolhidas, setEscolhidas] = useState<CategoriaSugerida[]>([]);
  const [aberta, setAberta] = useState<string | null>(SUGESTOES[0]?.familia ?? null);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");

  const familias = useMemo(
    () =>
      SUGESTOES.map((f) => ({ ...f, disponiveis: porUsar(f, jaExistem) })).filter(
        (f) => f.disponiveis.length > 0
      ),
    [jaExistem]
  );

  const temEscolhida = (c: CategoriaSugerida) =>
    escolhidas.some((e) => e.codigo === c.codigo);

  const alternar = (c: CategoriaSugerida) =>
    setEscolhidas((es) =>
      es.some((e) => e.codigo === c.codigo)
        ? es.filter((e) => e.codigo !== c.codigo)
        : [...es, c]
    );

  const familiaInteira = (cs: readonly CategoriaSugerida[]) => {
    const todasEscolhidas = cs.every(temEscolhida);
    setEscolhidas((es) =>
      todasEscolhidas
        ? es.filter((e) => !cs.some((c) => c.codigo === e.codigo))
        : [...es.filter((e) => !cs.some((c) => c.codigo === e.codigo)), ...cs]
    );
  };

  const aMao = !!nome.trim() && !!codigo.trim();
  const quantas = escolhidas.length + (aMao ? 1 : 0);

  return (
    <Modal
      title="Categorias de equipamento"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            disabled={quantas === 0 || aGravar}
            onClick={() =>
              void gravar(async () => {
                // Uma de cada vez, e por ordem: se a quinta rebentar por
                // código repetido, as quatro primeiras ficam criadas. Perder
                // as quatro para poupar uma mensagem seria pior.
                for (const c of escolhidas) {
                  await gravarCategoria({
                    orgId: activeOrgId!,
                    codigo: c.codigo,
                    nome: c.nome,
                  });
                }
                if (aMao) {
                  await gravarCategoria({
                    orgId: activeOrgId!,
                    codigo: codigo.trim().toUpperCase(),
                    nome: nome.trim(),
                  });
                }
              }, aoGravar)
            }
          >
            {aGravar
              ? "A gravar…"
              : quantas === 0
                ? "Escolhe pelo menos uma"
                : quantas === 1
                  ? "Criar 1 categoria"
                  : `Criar ${quantas} categorias`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Uma categoria é o que um equipamento <em>é</em> — extintor, elevador,
          quadro elétrico. É por ela que as medições e as checklists sabem onde
          se aplicam.
        </p>

        {familias.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Já tens todas as do catálogo. Cria a tua aqui em baixo.
          </p>
        ) : (
          <div className="space-y-1.5">
            {familias.map((f) => {
              const aberto = aberta === f.familia;
              const escolhidasAqui = f.disponiveis.filter(temEscolhida).length;
              return (
                <div
                  key={f.familia}
                  className="overflow-hidden rounded-lg ring-1 ring-slate-200"
                >
                  <button
                    type="button"
                    onClick={() => setAberta(aberto ? null : f.familia)}
                    className="flex w-full items-center justify-between gap-3 bg-white px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">
                        {f.familia}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {f.paraQuem}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-slate-400">
                      {escolhidasAqui > 0 ? (
                        <span className="text-brand">{escolhidasAqui} escolhidas</span>
                      ) : (
                        f.disponiveis.length
                      )}
                    </span>
                  </button>

                  {aberto && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {f.disponiveis.map((c) => (
                          <button
                            key={c.codigo}
                            type="button"
                            onClick={() => alternar(c)}
                            className={cx(
                              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
                              "text-xs font-medium ring-1 transition-all active:scale-[0.98]",
                              temEscolhida(c)
                                ? "bg-brand text-white ring-brand"
                                : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                            )}
                          >
                            {temEscolhida(c) && <Check width={12} height={12} />}
                            {c.nome}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => familiaInteira(f.disponiveis)}
                        className="mt-2 text-xs font-medium text-brand hover:underline"
                      >
                        {f.disponiveis.every(temEscolhida)
                          ? "Tirar todas"
                          : "Escolher todas"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* O catálogo nunca chega. Metade das categorias de qualquer empresa
            a sério não está em lista nenhuma. */}
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Plus width={13} height={13} /> Ou cria a tua
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Nome">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Compressores"
                className="w-full"
              />
            </Field>
            <Field label="Código" hint="Curto. Vai no código do equipamento.">
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="COMP"
                className="w-full font-mono sm:w-28"
              />
            </Field>
          </div>
        </div>

        {erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
        )}
      </div>
    </Modal>
  );
}
