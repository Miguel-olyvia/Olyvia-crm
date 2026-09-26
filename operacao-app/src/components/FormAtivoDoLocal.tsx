import { useState } from "react";
import { Button, Field, Input, Select } from "./ui";
import { AlertTriangle, X } from "./icons";
import { ErroDeEscrita } from "../lib/dados";
import { gravarAtivo, type CategoriaAtivo, type CentroCusto } from "../lib/config";
import type { AtivoRow } from "../lib/dados";

const CRITICIDADES = [
  { v: "baixa", t: "Baixa" },
  { v: "normal", t: "Normal" },
  { v: "alta", t: "Alta" },
  { v: "critica", t: "Crítica" },
];

/**
 * Criar ou editar um equipamento, dentro da ficha do sítio onde ele está.
 *
 * O local não se escolhe: já se sabe qual é, porque se chegou aqui por ele.
 * Foi o que sempre faltou — na lista de Definições, criar um equipamento
 * obrigava a lembrar em que sítio se estava.
 *
 * O centro de custo está aqui e não só na ordem porque é daqui que ele se
 * propaga: uma ordem sobre este equipamento herda-o sozinha.
 */
export default function FormAtivoDoLocal({
  orgId,
  localId,
  ativo,
  categorias,
  centros,
  aoFechar,
  aoGravar,
}: {
  orgId: string;
  localId: string;
  ativo?: AtivoRow;
  categorias: readonly CategoriaAtivo[];
  centros: readonly CentroCusto[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [codigo, setCodigo] = useState(ativo?.codigo ?? "");
  const [nome, setNome] = useState(ativo?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState(ativo?.categoria_id ?? "");
  const [marca, setMarca] = useState(ativo?.marca ?? "");
  const [modelo, setModelo] = useState(ativo?.modelo ?? "");
  const [numSerie, setNumSerie] = useState(ativo?.num_serie ?? "");
  const [criticidade, setCriticidade] = useState(ativo?.criticidade ?? "normal");
  const [centroCustoId, setCentroCustoId] = useState(ativo?.centro_custo_id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const gravar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      await gravarAtivo({
        id: ativo?.id ?? null,
        orgId,
        localId,
        codigo: codigo.trim(),
        nome: nome.trim(),
        categoriaId: categoriaId || null,
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        numeroSerie: numSerie.trim() || null,
        criticidade,
        centroCustoId: centroCustoId || null,
      });
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/70">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Código" hint="Único na empresa. É o que se diz ao telefone.">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ex.: 100.107"
            className="w-full"
            autoFocus
          />
        </Field>
        <Field label="Nome">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Extintor do hall"
            className="w-full"
          />
        </Field>

        <Field
          label="Categoria"
          hint={
            categorias.length === 0
              ? "Ainda não há. Criam-se em Definições › Procedimentos."
              : undefined
          }
        >
          <Select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            disabled={categorias.length === 0}
            className="w-full"
          >
            <option value="">— sem categoria —</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Criticidade" hint="Alta e crítica destacam-se na lista.">
          <Select
            value={criticidade}
            onChange={(e) => setCriticidade(e.target.value)}
            className="w-full"
          >
            {CRITICIDADES.map((c) => (
              <option key={c.v} value={c.v}>
                {c.t}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Marca">
          <Input value={marca} onChange={(e) => setMarca(e.target.value)} className="w-full" />
        </Field>
        <Field label="Modelo">
          <Input value={modelo} onChange={(e) => setModelo(e.target.value)} className="w-full" />
        </Field>

        <Field label="Número de série">
          <Input
            value={numSerie}
            onChange={(e) => setNumSerie(e.target.value)}
            className="w-full"
          />
        </Field>

        <Field
          label="Centro de custo"
          hint="As ordens sobre este equipamento herdam-no sozinhas."
        >
          <Select
            value={centroCustoId}
            onChange={(e) => setCentroCustoId(e.target.value)}
            disabled={centros.length === 0}
            className="w-full"
          >
            <option value="">— nenhum —</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nome}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {erro && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void gravar()}
          disabled={aGravar || !codigo.trim() || !nome.trim()}
        >
          {aGravar ? "A gravar…" : "Gravar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={aoFechar} disabled={aGravar}>
          <X width={13} height={13} /> Cancelar
        </Button>
      </div>
    </div>
  );
}
