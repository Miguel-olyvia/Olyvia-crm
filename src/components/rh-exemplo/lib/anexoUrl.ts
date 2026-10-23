/** A forma de um endereço de anexo. Na apresentação o "endereço" é uma imagem desenhada no momento. */
export interface UrlAnexo {
  url: string;
  expiraEmSegundos: number | null;
  tipo: string | null;
  mime_type: string | null;
}

/** Uma folha de exemplo (SVG em data URL) com o título dado; nunca é um ficheiro real. */
export function urlDeExemplo(titulo: string): string {
  const seguro = titulo.replace(/[<>&"]/g, " ");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560"><rect width="420" height="560" fill="#f8fafc"/>` +
    `<rect x="20" y="20" width="380" height="520" fill="#ffffff" stroke="#cbd5e1"/>` +
    `<text x="40" y="70" font-family="sans-serif" font-size="18" fill="#0f172a">${seguro}</text>` +
    `<text x="40" y="100" font-family="sans-serif" font-size="12" fill="#64748b">Documento de exemplo</text>` +
    `<rect x="40" y="130" width="340" height="8" fill="#e2e8f0"/><rect x="40" y="154" width="300" height="8" fill="#e2e8f0"/>` +
    `<rect x="40" y="178" width="320" height="8" fill="#e2e8f0"/><rect x="40" y="202" width="260" height="8" fill="#e2e8f0"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
