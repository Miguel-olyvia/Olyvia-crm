// Formatação de tamanhos de ficheiro.

const UNIDADES = ["B", "KB", "MB", "GB"];

/** 214000 → «209 KB». */
export function formatoTamanho(bytes: number): string {
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < UNIDADES.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${i === 0 ? valor : valor.toFixed(valor < 10 ? 1 : 0)} ${UNIDADES[i]}`;
}
