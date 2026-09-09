import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase, getRememberSession, setRememberSession } from "../lib/supabase";
import { sendMagicLink } from "../lib/collaborators";
import { useAuth } from "../auth/AuthProvider";
import { Button, Field, Input, Toggle } from "../components/ui";
import { DucMark, AlertTriangle, Eye, EyeOff, ExternalLink } from "../components/icons";

const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia-ai.com";

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(getRememberSession());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSending, setMagicSending] = useState(false);
  const [magicMsg, setMagicMsg] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  // Externos: entrar por link mágico (sem password). Usa o email do formulário.
  const sendMagic = async () => {
    if (!email.trim()) {
      setError("Escreve o teu email primeiro.");
      return;
    }
    setError(null);
    setMagicMsg(null);
    setMagicSending(true);
    setRememberSession(remember);
    const redirectTo = window.location.origin + import.meta.env.BASE_URL;
    const err = await sendMagicLink(email, redirectTo);
    setMagicSending(false);
    if (err) setError(err);
    else setMagicMsg("Enviámos um link de acesso para o teu email. Abre-o para entrar.");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // Fixa a preferência ANTES do sign-in, para a sessão ser gravada no storage
    // certo (localStorage se "manter", senão sessionStorage — só nesta aba).
    setRememberSession(remember);
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
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <DucMark width={30} height={30} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Documento Único de Cliente
          </h1>
          <p className="mt-1 text-sm text-slate-500">Entra com a tua conta Olyvia</p>
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

            <Toggle
              id="remember"
              checked={remember}
              onChange={setRemember}
              label="Manter sessão iniciada"
              hint="Fica ligado neste dispositivo. Desliga em computadores partilhados."
            />

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-100">
                <AlertTriangle width={16} height={16} className="shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "A entrar…" : "Entrar"}
            </Button>

            <div className="flex items-center gap-2 pt-1">
              <span className="h-px flex-1 bg-slate-100" />
              <span className="text-[11px] uppercase tracking-wide text-slate-300">ou</span>
              <span className="h-px flex-1 bg-slate-100" />
            </div>
            <button
              type="button"
              onClick={sendMagic}
              disabled={magicSending}
              className="w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {magicSending ? "A enviar…" : "Sou externo — entrar por link mágico"}
            </button>
            {magicMsg && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-700 ring-1 ring-inset ring-emerald-100">
                {magicMsg}
              </p>
            )}
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
