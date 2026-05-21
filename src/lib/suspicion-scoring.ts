import type { SecurityEvent } from "@/lib/types";

export const SECURITY_EVENT_WEIGHTS: Record<string, number> = {
  visibility_hidden: 8,
  window_blur: 5,
  copy: 6,
  cut: 6,
  paste: 6,
  context_menu: 4,
  devtools_suspected: 15,
  proctor_looking_away: 12,
  proctor_typing: 10,
  proctor_phone_detected: 20,
  screen_share_suspected: 12,
  multi_monitor_suspected: 10,
};

const NEUTRAL_EVENTS = new Set(["visibility_visible", "window_focus"]);

export function getSecurityEventWeight(type: string): number {
  return SECURITY_EVENT_WEIGHTS[type] ?? 0;
}

export function computeSuspicionScoreFromEvents(
  events: SecurityEvent[] = [],
  options?: { eventCooldownMs?: number }
): number {
  const cooldownMs = options?.eventCooldownMs ?? 45000;
  const lastSeenByType = new Map<string, number>();
  let total = 0;

  for (const event of events) {
    if (!event?.type || NEUTRAL_EVENTS.has(event.type)) continue;

    const weight = getSecurityEventWeight(event.type);
    if (weight <= 0) continue;

    const eventKey = `${event.type}:${event.details ?? ""}`;
    const eventTime = Date.parse(event.timestamp);
    const comparableTime = Number.isFinite(eventTime) ? eventTime : Date.now();
    const lastSeen = lastSeenByType.get(eventKey);

    if (lastSeen !== undefined && comparableTime - lastSeen < cooldownMs) {
      continue;
    }

    lastSeenByType.set(eventKey, comparableTime);
    total += weight;
  }

  return Math.min(100, total);
}

export function mergeSuspicionScores(...scores: number[]): number {
  return Math.min(100, Math.max(0, ...scores.map((score) => score || 0)));
}
