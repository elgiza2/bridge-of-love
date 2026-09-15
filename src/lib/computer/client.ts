/** @doc Browser client for the Computer Agent (Supabase edge function `computer-agent`). */
import { supabase } from "@/integrations/supabase/client";
import { edgeAnonKey, edgeUrl } from "@/lib/edgeRuntime";

export interface ComputerFile {
  name: string;
  url: string;
  type?: string;
}

export interface ComputerTask {
  id: string;
  status: "pending" | "running" | "done" | "failed" | string;
  progress: string | null;
  result_text: string | null;
  files: ComputerFile[];
  error: string | null;
  prompt: string;
  live_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  provider_session_id?: string | null;
}

export interface ComputerEvent {
  id: string;
  title: string;
  detail: string | null;
  url: string | null;
  created_at: string;
  kind?: string | null;
  duration?: number | null;
  screenshot_url?: string | null;
}


const SIGN_IN_MESSAGE = "سجّل الدخول أولاً لتشغيل مهام الكمبيوتر. / Please sign in to run computer tasks.";

const SUPABASE_ANON_KEY = edgeAnonKey("computer-agent");
const COMPUTER_AGENT_URL = edgeUrl("computer-agent");


async function call<T>(body: Record<string, unknown>): Promise<T> {
  let { data: sess } = await supabase.auth.getSession();
  let token = sess.session?.access_token;
  if (!token) {
    // Session may still be rehydrating or the access token expired.
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token;
  }
  if (!token) {
    // Visitors who have not signed up still get the agent: a throwaway
    // anonymous identity carries the same RLS scoping without a signup wall.
    const { data: anon } = await supabase.auth.signInAnonymously();
    token = anon.session?.access_token;
  }
  if (!token) throw new Error(SIGN_IN_MESSAGE);

  const resp = await fetch(COMPUTER_AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ ...body, token }),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (resp.status === 401) throw new Error(SIGN_IN_MESSAGE);
  if (!resp.ok) throw new Error((data.error as string) || `HTTP ${resp.status}`);
  return data as T;

}

export function createComputerTask(input: {
  prompt: string;
  conversation_id?: string | null;
  message_id?: string | null;
  attachments?: string[];
}) {
  return call<{ task_id: string; status: string; error?: string; message?: string }>({
    action: "create",
    ...input,
  });
}

/**
 * Polls a task and — when the provider reports a terminal state — writes that
 * state back onto the `computer_tasks` row.
 *
 * The poll response is transient: the deployed function reads the provider live
 * but leaves the row on `running`, so a task that really finished stayed
 * "running" forever in the database. Anything that reads the row instead of
 * polling (reopened conversations, usage, background continuation) then saw a
 * task that never ends. Persisting here keeps the row authoritative and can
 * only ever move a task forward: `done`/`failed` are written once, never back.
 */
export async function pollComputerTask(taskId: string) {
  const res = await call<{ task: ComputerTask; events: ComputerEvent[] }>({
    action: "poll",
    task_id: taskId,
  });
  void persistTerminalState(res.task);
  return res;
}

const persisted = new Set<string>();

async function persistTerminalState(task: ComputerTask | null | undefined) {
  if (!task?.id) return;
  const terminal = task.status === "done" || task.status === "failed";
  if (!terminal || persisted.has(task.id)) return;
  persisted.add(task.id);
  try {
    const { data } = await supabase
      .from("computer_tasks")
      .select("status")
      .eq("id", task.id)
      .maybeSingle();
    const current = (data as { status?: string } | null)?.status;
    if (!current || current === "done" || current === "failed") return;
    await supabase
      .from("computer_tasks")
      .update({
        status: task.status,
        result_text: task.result_text ?? null,
        error: task.error ?? null,
      })
      .eq("id", task.id);
  } catch {
    // Best-effort bookkeeping: the live poll already drives the UI.
    persisted.delete(task.id);
  }
}

export function stopComputerTask(taskId: string) {
  return call<{ ok: boolean }>({ action: "stop", task_id: taskId });
}

/** Human-friendly message for backend failure codes (no provider names). */
export function computerErrorMessage(
  code: string | null | undefined,
  providerMessage?: string | null,
): string {
  switch (code) {
    case "no_capacity":
      return "Computer agent is unavailable right now. Please try again shortly.";
    case "rate_limited":
      return "Too many computer tasks at once — try again in a minute.";
    case "stopped":
      return "Task stopped.";
    case "provider_error":
      return providerMessage?.trim() || "The computer task couldn't be started. Please try again.";
    default:
      return providerMessage?.trim() || code || "";
  }
}
