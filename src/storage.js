import { createClient } from "@supabase/supabase-js";

// These values are injected by Vite from .env at build time.
// They are public-safe (anon key only has row-level insert permission).
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Save a provenance log to Supabase.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 */
export async function saveLog(log) {
  const { error } = await supabase.from("provenance_logs").insert({
    participant_id:    log.participant_id,
    task_id:           log.task_id,
    prolific_id:       log.prolific_id ?? null,
    logged_at:         log.logged_at,
    sentences:         log.sentences,
    llm_model:         log.llm_model ?? null,
    ownership_ratings: log.ownership_ratings ?? null,
  });

  if (error) {
    console.error("Supabase save error:", error);
    return { ok: false, error };
  }
  return { ok: true };
}
