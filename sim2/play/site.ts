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

/** The crowdfunding page (online/server.ts --cf-url marks <html data-cf-url>); null until it is set, and off the public build. */
export const cfUrl = (): string | null => {
  const url = isPublicSite() ? document.documentElement.dataset.cfUrl : undefined;
  return url === undefined || url === "" ? null : url;
};

const CF_LINK_INNER = '<span class="cf-tag">クラウドファンディング実施中</span><span class="cf-go">支援ページへ ▶</span>';

/** 「クラウドファンディング実施中 ▶ 支援ページへ」 as markup (play/site-public.css styles .cf-link). */
export const cfLinkHtml = (url: string): string =>
  `<a class="cf-link" href="${url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}" target="_blank" rel="noopener">${CF_LINK_INNER}</a>`;

/** Until the server has a --cf-url the public build shows 「クラウドファンディング準備中」 in its place: words, not a link. */
export const CF_SOON_HTML = '<span class="cf-link cf-soon"><span class="cf-tag">クラウドファンディング準備中</span></span>';

/** The same link for the end of a match (準備中 while there is no URL), or null off the public build. */
export const cfLink = (): HTMLElement | null => {
  if (!isPublicSite()) return null;
  const url = cfUrl();
  if (url === null) {
    const s = document.createElement("span");
    s.innerHTML = CF_SOON_HTML;
    return s.firstElementChild as HTMLElement;
  }
  const a = document.createElement("a");
  a.className = "cf-link";
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.innerHTML = CF_LINK_INNER;
  return a;
};
