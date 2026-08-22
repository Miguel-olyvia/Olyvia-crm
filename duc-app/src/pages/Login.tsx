import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { Button, Field, Input } from "../components/ui";
import { FileSolid, AlertTriangle, Eye, EyeOff, ExternalLink } from "../components/icons";

const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia.pt";

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError("Credenciais inválidas. Usa o mesmo email/password da Olyvia.");
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-elevated">
            <FileSolid width={26} height={26} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Documento Único de Cliente
          </h1>
          <p className="mt-1 text-sm text-slate-500">Acede com a tua conta Olyvia</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-elevated animate-in-pop">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-800">Entrar</h2>
            <p className="text-sm text-slate-500">Usa as tuas credenciais Olyvia.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                placeholder="nome@empresa.pt"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  title={showPassword ? "Ocultar password" : "Mostrar password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}
                </button>
              </div>
            </Field>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
                <AlertTriangle width={16} height={16} className="shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "A entrar…" : "Entrar"}
            </Button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <a
            href={OLYVIA_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-slate-500 transition-colors hover:text-brand"
          >
            Ir para a Olyvia <ExternalLink width={13} height={13} />
          </a>
        </div>
      </div>
    </div>
  );
}
