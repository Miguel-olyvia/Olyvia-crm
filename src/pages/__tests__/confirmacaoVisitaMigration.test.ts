/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import migrationSql from "../../../supabase/migrations/20261229600000_confirmacao_visita_ao_confirmar.sql?raw";

// A confirmacao ao cliente sai quando a EMPRESA confirma na Agenda. Teste de
// texto: confirma que as guardas estao no SQL. NAO prova que o SQL corre --
// isso so o db push (e a prova na nike) mostram.

function raw(): string {
  return migrationSql;
}

function sql(): string {
  return raw().toLowerCase().replace(/"/g, "").replace(/\s+/g, " ").trim();
}

describe("migration: confirmacao da visita ao confirmar na Agenda", () => {
  it("existe e esta em CRLF", () => {
    const text = raw();
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("omissao = comportamento de hoje (booking, interruptor desligado, visitas antigas sem modo)", () => {
    const s = sql();
    expect(s).toContain("add column if not exists confirmation_send_on text not null default 'booking'");
    expect(s).toContain("add column if not exists send_confirmation_on_confirm boolean not null default false");
    expect(s).toMatch(/alter table public\.schedule_items add column if not exists confirmation_send_on text;/);
  });

  it("o gatilho so dispara na confirmacao da EMPRESA (confirmed_at vazio) e so no modo novo", () => {
    const s = sql();
    expect(s).toContain("after insert or update of status on public.schedule_items");
    expect(s).toContain("new.status = 'confirmed' and new.confirmed_at is null and new.confirmation_send_on = 'agenda_confirm'");
    // confirmed -> confirmed nao reenvia
    expect(s).toContain("if old.status::text = 'confirmed' then return null;");
  });

  it("idempotente: uma confirmacao automatica por visita, canal e hora", () => {
    const s = sql();
    expect(s).toContain("create unique index if not exists visit_confirmation_sends_auto_once on public.visit_confirmation_sends (schedule_item_id, channel, visit_start_snapshot) where kind = 'auto'");
    expect(s).toContain("on conflict (schedule_item_id, channel, visit_start_snapshot) where kind = 'auto' do nothing");
  });

  it("fila fechada: RLS ligada, sem politicas, sem privilegios para anon/authenticated", () => {
    const s = sql();
    expect(s).toContain("alter table public.visit_confirmation_sends enable row level security");
    expect(s).not.toMatch(/create policy/);
    expect(s).toContain("revoke all on table public.visit_confirmation_sends from anon");
    expect(s).toContain("revoke all on table public.visit_confirmation_sends from authenticated");
  });

  it("RPCs com ambito por dentro; a de reclamar so para a service_role", () => {
    const s = sql();
    expect(s).toContain("get_schedule_item_scope_context(si.organization_id, 'scheduling.items.view')");
    expect(s).toContain("get_schedule_item_scope_context(v_item.organization_id, 'scheduling.items.edit')");
    expect(s).toContain("revoke all on function public.fn_visit_confirmation_claim(uuid, integer) from authenticated");
    expect(s).toContain("grant execute on function public.fn_visit_confirmation_claim(uuid, integer) to service_role");
    expect(s).toContain("for update skip locked");
    expect(s).toContain("k_max_per_day constant integer := 3");
  });

  it("todas as funcoes sao security definer com search_path fixo", () => {
    const s = sql();
    const defs = s.split("create or replace function").slice(1);
    expect(defs.length).toBe(5);
    for (const d of defs) {
      expect(d).toContain("security definer");
      expect(d).toContain("set search_path to 'public', 'pg_temp'");
    }
  });

  it("RAISE sem % por escapar e colunas char do catalogo convertidas a text", () => {
    const text = raw();
    for (const m of text.matchAll(/RAISE EXCEPTION '([^']*)'(,[^;]*)?/g)) {
      const pct = (m[1].match(/%/g) ?? []).length;
      const args = m[2] ? m[2].split(",").length - 1 : 0;
      expect(pct).toBeLessThanOrEqual(args);
    }
    expect(sql()).not.toMatch(/contype\s*(\|\||=)/);
  });

  it("termina com o bloco de conferir", () => {
    const s = sql();
    expect(s).toContain("ha formularios fora do modo booking logo a seguir a migration");
    expect(s).toContain("visit_confirmation_sends nao deve ter politicas");
  });
});
