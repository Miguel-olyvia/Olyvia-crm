import { useEffect, useState } from "react";

// Frases de celebração (pt-PT, tom animado)
const PHRASES = [
  "Mais um cliente a caminho da satisfação! 🚀",
  "Documento criado — agora é pôr o cliente feliz! 😄",
  "Bora encantar mais um cliente! ✨",
  "Novo DUC, nova história de sucesso! 🌟",
  "Rumo ao cliente satisfeito! 💪",
];

// Palete das peças de confetti (brand teal, emerald, amber, blue, rose)
const COLORS = ["#14b8a6", "#10b981", "#f59e0b", "#3b82f6", "#f43f5e"];

const PIECES = 28;

// Escolhe um índice de forma robusta: usa performance.now() se existir,
// caso contrário cai para 0 (primeira frase). Determinístico no 1.º render.
function pickPhraseIndex(): number {
  const t =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : 0;
  return Math.floor(t) % PHRASES.length;
}

export function Celebration({ onDone }: { onDone: () => void }) {
  // Frase estável escolhida uma única vez no arranque
  const [phrase] = useState<string>(() => PHRASES[pickPhraseIndex()]);

  useEffect(() => {
    // Desaparece sozinho ao fim de ~2.8s
    const id = setTimeout(onDone, 2800);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      // Overlay fixo por cima de tudo; clicar dispensa
      onClick={onDone}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm"
    >
      {/* Keyframes embutidos (sem libs, sem config externa) */}
      <style>{`
        @keyframes duc-confetti {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
        @keyframes duc-pop {
          0%   { transform: scale(0.85); opacity: 0; }
          60%  { transform: scale(1.03); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Camada de confetti: variação derivada por índice (sem Math.random) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: PIECES }).map((_, i) => {
          const left = (i * 37) % 100; // posição horizontal (%)
          const delay = ((i * 13) % 10) / 10; // atraso 0..0.9s
          const duration = 2.2 + ((i * 7) % 8) / 10; // 2.2..2.9s
          const size = 6 + ((i * 5) % 6); // 6..11px
          const color = COLORS[i % COLORS.length];
          return (
            <span
              key={i}
              className="absolute top-0 block rounded-[2px]"
              style={{
                left: `${left}%`,
                width: `${size}px`,
                height: `${size + 3}px`,
                backgroundColor: color,
                animation: `duc-confetti ${duration}s linear ${delay}s forwards`,
              }}
            />
          );
        })}
      </div>

      {/* Cartão central com entrada suave */}
      <div
        className="relative rounded-2xl bg-white p-6 text-center shadow-elevated"
        style={{ animation: "duc-pop 0.35s ease-out both" }}
      >
        <div className="mb-2 text-5xl">🎉</div>
        <p className="text-lg font-semibold text-slate-800">{phrase}</p>
        <p className="mt-1 text-sm text-brand">Documento Único de Cliente criado</p>
      </div>
    </div>
  );
}
