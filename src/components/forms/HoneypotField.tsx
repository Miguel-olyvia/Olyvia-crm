// Campo armadilha do formulario publico: um humano nunca o ve nem o preenche,
// um bot que preenche tudo escreve nele e o servidor descarta o envio.
// Escondido por CSS fora do ecra (sem display:none, que alguns bots ignoram),
// fora da ordem do teclado e dos leitores de ecra.

import type { CSSProperties } from 'react';

interface HoneypotFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const ESCONDIDO: CSSProperties = {
  position: 'absolute',
  left: '-10000px',
  top: 'auto',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
};

export function HoneypotField({ value, onChange }: HoneypotFieldProps) {
  return (
    <div aria-hidden="true" style={ESCONDIDO}>
      <input
        type="text"
        name="website"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
    </div>
  );
}
