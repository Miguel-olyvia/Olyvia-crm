import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AcompanhamentoVista from "../components/AcompanhamentoVista";
import { Spinner } from "../components/ui";
import { OperacaoMark } from "../components/icons";
import { acompanhar, urlsDasFotos, type Acompanhamento } from "../lib/acompanhamento";
import { ErroDeDados } from "../lib/dados";

/**
 * A página pública do cliente: /operacao/acompanhar/<token>.
 *
 * Fora do ProtectedRoute — o cliente não tem conta. Tudo o que aparece vem
 * de rpc_ops_acompanhar, que só devolve o que o cliente deve ver; o storage
 * só assina as fotos que a equipa marcou.
 */
export default function Acompanhar() {
  const { token = "" } = useParams();
  const [dados, setDados] = useState<Acompanhamento | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await acompanhar(token);
        if (!vivo) return;
        setDados(d);
        document.title = `${d.obra.titulo} · Acompanhamento da obra`;
        const u = await urlsDasFotos(d.fotos);
        if (vivo) setUrls(u);
      } catch (e) {
        if (vivo) setErro(e instanceof ErroDeDados ? e.message : "Não foi possível abrir o acompanhamento.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  if (erro) {
    return (
      <div className="app-canvas flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <OperacaoMark width={26} height={26} />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Acompanhamento indisponível</h1>
          <p className="text-sm leading-relaxed text-slate-500">{erro}</p>
        </div>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="A abrir a sua obra…" />
      </div>
    );
  }

  return <AcompanhamentoVista dados={dados} urls={urls} />;
}
