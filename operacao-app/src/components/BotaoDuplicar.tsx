import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Modal, Toggle } from "./ui";
import { AlertTriangle, Copiar } from "./icons";
import { ErroDeEscrita } from "../lib/dados";
import type { ResultadoDaCopia } from "../lib/config";

/**
 * Duplicar, com a pergunta que falta antes.
 *
 * Pede sempre o nome novo. Uma cópia sem nome próprio fica ao lado da original
 * na lista, com o mesmo texto — e a partir daí ninguém sabe qual é qual.
 *
 * Diz também, por extenso, **o que a cópia não leva**. É a parte que engana:
 * quem duplica uma ordem fechada espera-a fechada, e quem duplica um plano
 * ativo espera-o a gerar ordens. Nenhuma das duas coisas acontece, de
 * propósito, e é melhor saber-se antes.
 */
export default function BotaoDuplicar({
  rotulo = "Duplicar",
  titulo,
  nomeSugerido,
  exigeNome = false,
  oQueNaoLeva,
  duplicar,
  paraOnde,
  comAtivos,
}: {
  rotulo?: string;
  /** O que aparece no cabeçalho da janela. Ex.: "Duplicar o plano". */
  titulo: string;
  nomeSugerido: string;
  /** Um local precisa mesmo de nome novo; os outros aceitam "(cópia)". */
  exigeNome?: boolean;
  oQueNaoLeva: readonly string[];
  duplicar: (nome: string, comAtivos: boolean) => Promise<ResultadoDaCopia>;
  /** Para onde ir depois. Se não vier, fica-se onde se está. */
  paraOnde?: (r: ResultadoDaCopia) => string;
  /** Só os locais têm esta pergunta. */
  comAtivos?: { rotulo: string; hint: string };
}) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(nomeSugerido);
  const [levarAtivos, setLevarAtivos] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const abrir = () => {
    setNome(nomeSugerido);
    setLevarAtivos(true);
    setErro(null);
    setAberto(true);
  };

  const confirmar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      const r = await duplicar(nome.trim(), levarAtivos);
      setAberto(false);
      if (paraOnde) navegar(paraOnde(r));
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível duplicar.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={abrir}>
        <Copiar width={14} height={14} />
        {rotulo}
      </Button>

      {aberto && (
        <Modal title={titulo} onClose={() => setAberto(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-slate-700" htmlFor="nome-copia">
                Nome da cópia
              </label>
              <Input
                id="nome-copia"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1.5 w-full"
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-400">
                {exigeNome
                  ? "Obrigatório. Dois locais com o mesmo nome na árvore não se distinguem."
                  : "Muda-o depois, se quiseres."}
              </p>
            </div>

            {comAtivos && (
              <Toggle
                checked={levarAtivos}
                onChange={setLevarAtivos}
                label={comAtivos.rotulo}
                hint={comAtivos.hint}
              />
            )}

            {/* A parte que engana: quem duplica uma ordem fechada espera-a
                fechada. Melhor saber-se antes de carregar. */}
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600">O que a cópia NÃO leva</p>
              <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-500">
                {oQueNaoLeva.map((x) => (
                  <li key={x} className="flex gap-1.5">
                    <span className="text-slate-300">—</span>
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </div>

            {erro && (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
                {erro}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={aGravar}>
                Cancelar
              </Button>
              <Button
                onClick={() => void confirmar()}
                disabled={aGravar || (exigeNome && !nome.trim())}
              >
                {aGravar ? "A duplicar…" : "Duplicar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
