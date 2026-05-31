if (new URLSearchParams(window.location.search).get("review") === "cards") {
  const { startCardReviewApp } = await import("./ui/card-review.js");
  startCardReviewApp();
} else {
  const { startApp } = await import("./ui/app.js");
  startApp();
}
