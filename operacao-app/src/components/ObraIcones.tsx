import type { SVGProps } from "react";

/**
 * Ícones do módulo de Obras, no mesmo traço de components/icons.tsx (que é
 * partilhado e fica como está).
 */

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

/** Capacete de obra. */
export const ObraCapacete = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 18h18" />
    <path d="M5 18v-2a7 7 0 0 1 14 0v2" />
    <path d="M10 9V5h4v4" />
  </svg>
);

/** Cronómetro — as minhas tarefas. */
export const ObraCronometro = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="14" r="7" />
    <path d="M12 14V11M10 3h4M12 3v4" />
  </svg>
);

/** Prancheta com visto — validar. */
export const ObraValidar = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 13l2 2 4-4" />
  </svg>
);

/** Gráfico de barras — métricas. */
export const ObraMetricas = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />
  </svg>
);

/** Moldes — modelos de obra. */
export const ObraModelo = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="5" rx="1" />
    <rect x="4" y="12" width="7" height="8" rx="1" />
    <rect x="14" y="12" width="6" height="8" rx="1" />
  </svg>
);

/** Ferramenta + — trabalho extra. */
export const ObraExtra = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

/** Pega de redimensionar. */
export const ObraPega = (p: P) => (
  <svg {...base({ strokeWidth: 1.5, ...p })}>
    <path d="M9 6v12M15 6v12" />
  </svg>
);
