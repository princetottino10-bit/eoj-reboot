// Seat tokens in browser storage.
//   sessionStorage: the token THIS tab plays with (survives reloads)
//   localStorage:   every token this browser holds per room (survives closing
//                   the tab, so an accidentally closed tab can take its seat back)
// Two tabs of one browser can therefore sit in two different seats; a tab
// opened while the room is full shares the seat this browser already holds.
export const NAME_KEY = "sim2online:name";
const tabKey = (code: string): string => `sim2online:tab:${code}`;
const allKey = (code: string): string => `sim2online:tokens:${code}`;
const MAX_TOKENS = 8;

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const tabToken = (code: string): string | null => safe(() => sessionStorage.getItem(tabKey(code)), null);

export const storedTokens = (code: string): string[] =>
  safe(() => {
    const raw = localStorage.getItem(allKey(code));
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string") : [];
  }, []);

export const rememberToken = (code: string, token: string, forThisTab: boolean): void => {
  safe(() => {
    const list = [token, ...storedTokens(code).filter((t) => t !== token)].slice(0, MAX_TOKENS);
    localStorage.setItem(allKey(code), JSON.stringify(list));
    if (forThisTab) sessionStorage.setItem(tabKey(code), token);
  }, undefined);
};

export const forgetToken = (code: string, token: string): void => {
  safe(() => {
    localStorage.setItem(allKey(code), JSON.stringify(storedTokens(code).filter((t) => t !== token)));
    if (sessionStorage.getItem(tabKey(code)) === token) sessionStorage.removeItem(tabKey(code));
  }, undefined);
};

export const savedName = (): string => safe(() => localStorage.getItem(NAME_KEY) ?? "", "");

// ---------------------------------------------------------- which token

/** What the server said about a token. status 0 = the request did not complete. */
export type TokenCheck = { status: number; role?: string; connections?: number };

export type SeatChoice =
  /** `shared`: another tab of this browser is sitting in that seat too (this tab only watches over its shoulder). */
  | { kind: "use"; token: string; shared?: boolean }
  | { kind: "join" }
  | { kind: "gone" }
  /** The server could not answer (rate limit, overload, network): every token is kept; ask again later. */
  | { kind: "retry"; status: number };

export type SeatSources = {
  /** ?watch=1: this tab wants to spectate. */
  watch: boolean;
  tab: string | null;
  stored: string[];
  check: (token: string) => Promise<TokenCheck>;
  forget: (token: string) => void;
};

/**
 * Picks the token a tab plays with. A token is forgotten only when the server
 * says it is not valid (401); any other failure keeps every token and asks for
 * a retry. A player tab prefers, in order: its own seat token; a seat token of
 * this browser no tab is using; a seat token another tab of this browser is
 * using (`shared`); its own spectator token. A spectator token never shadows a
 * seat token.
 *
 * A browser that already holds a seat never takes the other one by itself: the
 * room creator opening their own invite link in a second tab reconnects to
 * their seat instead of filling the seat the friend is being invited to. Two
 * seats in one browser are still possible — the room page asks for it (see
 * client.ts 「この端末で2人目として参加する」).
 */
export const chooseSeatToken = async (src: SeatSources): Promise<SeatChoice> => {
  const order = src.tab === null ? src.stored : [src.tab, ...src.stored.filter((t) => t !== src.tab)];
  let busySeat: string | null = null;
  let tabSpectator: string | null = null;
  for (const t of order) {
    const w = await src.check(t);
    if (w.status === 404) return { kind: "gone" };
    if (w.status === 401) {
      src.forget(t);
      continue;
    }
    if (w.status !== 200) return { kind: "retry", status: w.status };
    const own = t === src.tab;
    if (src.watch) {
      if (own || (w.role === "spectator" && w.connections === 0)) return { kind: "use", token: t };
      continue;
    }
    if (w.role === "player" && (own || w.connections === 0)) return { kind: "use", token: t };
    if (w.role === "player") busySeat ??= t;
    else if (own) tabSpectator = t;
  }
  if (src.watch) return { kind: "join" };
  if (busySeat !== null) return { kind: "use", token: busySeat, shared: true };
  return tabSpectator === null ? { kind: "join" } : { kind: "use", token: tabSpectator };
};
