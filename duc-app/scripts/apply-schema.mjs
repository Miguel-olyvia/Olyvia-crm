// Aplica duc-app/db/schema.sql à BD do projeto Supabase via Management API (HTTPS).
// Token lido de (por ordem): env SUPABASE_PAT  |  ficheiro duc-app/.supabase-token
//
// Uso:  node duc-app/scripts/apply-schema.mjs
//
// O PAT gera-se em: Supabase dashboard → (conta, canto sup. dir.) → Account
// Preferences → Access Tokens → Generate new token.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PROJECT_REF = "tzbfgwpckrfbqcolqxtm";

function readToken() {
  if (process.env.SUPABASE_PAT && process.env.SUPABASE_PAT.trim()) {
    return process.env.SUPABASE_PAT.trim();
  }
  const tokenFile = path.join(root, ".supabase-token");
  if (fs.existsSync(tokenFile)) {
    return fs.readFileSync(tokenFile, "utf8").trim();
  }
  return null;
}

const token = readToken();
if (!token) {
  console.error(
    "Falta o PAT. Cria duc-app/.supabase-token com o token, ou exporta SUPABASE_PAT."
  );
  process.exit(2);
}

const sql = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

try {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("ERRO HTTP", res.status, text);
    process.exit(1);
  }
  console.log("SCHEMA APLICADO com sucesso.");
  console.log("Resposta:", text || "(vazia)");

  // Verificação: confirma que as tabelas existem.
  const check = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "select table_name from information_schema.tables where table_name in ('anew_client_ducs','anew_client_duc_items') order by table_name;",
    }),
  });
  console.log("Tabelas DUC presentes:", await check.text());
} catch (e) {
  console.error("ERRO", e?.message || e);
  process.exit(1);
}
