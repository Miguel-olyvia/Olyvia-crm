import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getRememberSession, setRememberSession, supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { Button, Field, Input, Toggle } from "../components/ui";
import { AlertTriangle, ExternalLink, Eye, EyeOff, OperacaoMark } from "../components/icons";

const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia-ai.com";

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [manter, setManter] = useState(getRememberSession());
  const [aEntrar, setAEntrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAEntrar(true);
    // Fixa a preferência ANTES de entrar, para a sessão ficar gravada no
    // storage certo: localStorage se "manter", senão sessionStorage.
    setRememberSession(manter);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAEntrar(false);
    if (error) {
      setErro("Credenciais inválidas. Usa o mesmo email e password da Olyvia.");
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <OperacaoMark width={30} height={30} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Operações</h1>
          <p className="mt-1 text-sm text-slate-500">Entra com a tua conta Olyvia</p>
        </div>

        <div className="animate-in-pop rounded-2xl border border-slate-200/80 bg-white p-6 shadow-elevated">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.pt"
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <Input
                  type={verPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? "Esconder password" : "Mostrar password"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
                >
                  {verPassword ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}
                </button>
              </div>
            </Field>

            <Toggle
              id="manter"
              checked={manter}
              onChange={setManter}
              label="Manter sessão iniciada"
              hint="Desliga em computadores partilhados."
            />

            {erro && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-100">
                <AlertTriangle width={16} height={16} className="mt-0.5 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={aEntrar}>
              {aEntrar ? "A entrar…" : "Entrar"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          <a
            href={OLYVIA_URL}
            className="inline-flex items-center gap-1 transition-colors hover:text-brand"
          >
            Voltar à Olyvia <ExternalLink width={12} height={12} />
          </a>
        </p>
      </div>
    </div>
  );
}
