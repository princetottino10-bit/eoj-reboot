import { resetGameUiExtra, setState } from "./app.js";

export function renderPass(player: 0 | 1): HTMLElement {
  const div = document.createElement("div");
  div.className = "screen-pass";
  div.innerHTML = `
    <h2>端末を<span class="${player === 0 ? "p0-color" : "p1-color"}">プレイヤー${player + 1}</span>に渡してください</h2>
    <p class="pass-note">相手のカードを見ないようにしてください</p>
    <button class="btn" id="ready-btn">準備完了</button>
  `;
  div.querySelector("#ready-btn")?.addEventListener("click", () => {
    setState({ screen: "game", gameUiExtra: resetGameUiExtra() });
  });
  return div;
}
