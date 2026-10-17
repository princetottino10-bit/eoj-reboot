// 遊び方 (/guide): the table of contents follows the scroll, closes itself
// after a jump on a phone, and a card in the list opens large on a click.
// The page reads fine without it. No rules logic here.

const toc = document.querySelector<HTMLDetailsElement>("#tocBox");
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".g-toc a"));
const narrow = window.matchMedia("(max-width: 920px)");

// a phone starts with the contents folded so the page opens on its text
if (toc !== null && narrow.matches) toc.open = false;

for (const a of links) {
  a.addEventListener("click", () => {
    if (toc !== null && narrow.matches) toc.open = false;
  });
}

const sections = links
  .map((a) => document.querySelector<HTMLElement>(a.hash))
  .filter((s): s is HTMLElement => s !== null);

const mark = (id: string): void => {
  for (const a of links) a.classList.toggle("is-on", a.hash === `#${id}`);
};

const spy = new IntersectionObserver(
  (entries) => {
    const seen = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top);
    if (seen.length > 0) mark(seen[0].target.id);
  },
  { rootMargin: "-20% 0px -70% 0px" },
);
for (const s of sections) spy.observe(s);

// a card in the list opens large; a click or Escape closes it
document.querySelector(".g-main")?.addEventListener("click", (ev) => {
  const img = (ev.target as HTMLElement).closest<HTMLImageElement>(".cl-card img");
  if (img === null) return;
  const zoom = document.createElement("button");
  zoom.type = "button";
  zoom.className = "g-zoom";
  zoom.setAttribute("aria-label", "閉じる");
  const big = document.createElement("img");
  big.src = img.src;
  big.alt = img.alt;
  zoom.append(big);
  const close = (): void => {
    zoom.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  zoom.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.append(zoom);
  zoom.focus();
});
