// The settings page (/rules) is driven by its URL: who opened it (for=) and
// the settings to start from (s=). This module parses that and builds the
// links into and out of the page. Pure: no DOM.
//
//   /rules?s=…                   standalone: play the AI or create a room with the settings
//   /rules?for=ai&s=…            the AI table's start card; returns to /ai?s=…
//   /rules?for=lobby&s=…         the lobby's room creation; returns to /?s=…
//   /rules?for=ai-game           mid-game changes to the AI match stored in this browser; returns to /ai
//   /rules?for=room&code=XXXXXX&seat=0  the room owner's proposal; returns to /room/XXXXXX
//
// `seat` says which seat of the room opened the page, so a browser sitting in
// both seats edits as the seat that asked (online/rules-room.ts).

export type RulesRoute =
  | { for: "standalone" | "ai" | "lobby"; s: string | null }
  | { for: "ai-game" }
  | { for: "room"; code: string; seat: 0 | 1 | null }
  | { for: "bad"; error: string };

/** Same alphabet as the server's room codes (online/rooms.ts CODE_PATTERN). */
const ROOM_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export const parseRulesRoute = (search: string): RulesRoute => {
  const q = new URLSearchParams(search);
  const raw = q.get("s");
  const s = raw === null || raw === "" ? null : raw;
  const target = q.get("for") ?? "";
  switch (target) {
    case "":
      return { for: "standalone", s };
    case "ai":
    case "lobby":
      return { for: target, s };
    case "ai-game":
      return { for: "ai-game" };
    case "room": {
      const code = (q.get("code") ?? "").trim().toUpperCase();
      const raw = q.get("seat");
      const seat = raw === "0" ? 0 : raw === "1" ? 1 : null;
      return ROOM_CODE.test(code) ? { for: "room", code, seat } : { for: "bad", error: "部屋コードが正しくありません" };
    }
    default:
      return { for: "bad", error: "このページの開き方が正しくありません" };
  }
};

const withS = (path: string, s: string | null, extra = ""): string => {
  const q = [extra, s === null ? "" : `s=${encodeURIComponent(s)}`].filter((x) => x !== "").join("&");
  return q === "" ? path : `${path}?${q}`;
};

/** The link that opens the page. */
export const rulesHref = (route: Exclude<RulesRoute, { for: "bad" }>): string => {
  switch (route.for) {
    case "standalone":
      return withS("/rules", route.s);
    case "ai":
    case "lobby":
      return withS("/rules", route.s, `for=${route.for}`);
    case "ai-game":
      return "/rules?for=ai-game";
    default:
      return `/rules?for=room&code=${encodeURIComponent(route.code)}${route.seat === null ? "" : `&seat=${route.seat}`}`;
  }
};

/**
 * Where the page returns to: after a submit with the edited settings `s`, or
 * on 「戻る」 with the settings it was opened with. Standalone pages have no
 * origin: home.
 */
export const originHref = (route: RulesRoute, s: string | null): string => {
  switch (route.for) {
    case "ai":
      return withS("/ai", s);
    case "lobby":
      return withS("/", s);
    case "ai-game":
      return "/ai";
    case "room":
      return `/room/${route.code}`;
    default:
      return "/";
  }
};

/** Share links: the AI table's settings go straight to /ai; everything else opens this page (play the AI or make a room). */
export const shareHref = (origin: string, route: RulesRoute, s: string): string =>
  `${origin}${route.for === "ai" ? "/ai" : "/rules"}?s=${encodeURIComponent(s)}`;
