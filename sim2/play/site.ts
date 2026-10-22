// The public build of the table (online/server.ts --public): the server marks
// every page it serves with <html data-site="public"> and adds
// play/site-public.css. There the rules are the decided ones only (no settings
// page, no proposals, no share links carrying settings), the cards show the
// printed faces and backs, and the board shows the printed board's squares.
// Outside a browser (tests, the CLI) this is never the public build.

export const isPublicSite = (): boolean =>
  typeof document !== "undefined" && document.documentElement?.dataset.site === "public";

/** The printed card face for a print number (play/art/face/, cut from the 10/15 card files). */
export const faceUrl = (printId: string): string => `/play/art/face/${encodeURIComponent(printId)}.webp`;

/** The printed card back. */
export const BACK_URL = "/play/art/face/back.webp";

/** Where the public build sends people for the rules. */
export const GUIDE_HREF = "/guide";
