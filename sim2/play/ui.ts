// Play UI. All rules logic comes from the engine modules below - this file
// only renders state and forwards user choices into legalActions/isLegal/
// applyActionInPlace/startTurn/endTurn. No damage, cost or legality maths here.
import { cardOf, canAttack, parsePack } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { allCells, cellAttr, turnFacing } from "../src/board.ts";
import { attackCells, blindCells } from "../src/combat.ts";
import { incomeFor, isLegal, legalActions, applyActionInPlace, summonCostAt } from "../src/rules.ts";
import {
  cardOfUnit,
  createGame,
  makeCtx,
  occupied,
  opponent,
  unitAt,
  unitByUid,
  unitHp,
  unitMaxHp,
} from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { checkRoundLimit, endTurn, pendingTansuChoices, startTurn } from "../src/turn.ts";
import type { TansuChoice } from "../src/effects.ts";
import { defaultConfig } from "../src/types.ts";
import type {
  Action,
  AttackVariant,
  ChipMode,
  Facing,
  GameEvent,
  GameState,
  PlayerId,
  Pos,
} from "../src/types.ts";
import { isHidden } from "../src/state.ts";
import { effectTextOf, reiguTargeting, rotateCommandLocked } from "../src/effects.ts";
import { makeGreedy } from "../src/ai/greedy.ts";
import { makeBeam } from "../src/ai/beam.ts";
import { profileWeights } from "../src/ai/eval.ts";
import type { Ai } from "../src/ai/greedy.ts";

const PACK_NAME = "tsukumo-miyako";
const AI_DELAY_MS = 300;

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el;
};
const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Sel =
  | { kind: "none" }
  | { kind: "hand"; handIndex: number; pos: Pos | null }
  | { kind: "unit"; uid: number; attackMode: AttackVariant | null; summonAttack: boolean }
  /** tm17 Kuryugai spending its rotate on someone else. */
  | { kind: "proxy"; uid: number; targetUid: number | null }
  | { kind: "reigu"; handIndex: number; targetUid: number | null };

type Phase = "config" | "play" | "discard" | "ai" | "over" | "tansu";

type Game = {
  ctx: Ctx;
  state: GameState;
  events: GameEvent[];
  logged: number;
  humanSeat: PlayerId;
  ai: Ai;
  aiLabel: string;
  sel: Sel;
  phase: Phase;
  discardSel: Set<number>;
  banner: string;
  /** tm07 decisions the human still owes at this turn start. */
  tansuQueue: number[];
  tansuAnswers: Map<number, TansuChoice>;
};

let G: Game | null = null;
let PACK: CardPack | null = null;

const seatName = (g: Game, p: PlayerId): string =>
  `${p === 0 ? "先手" : "後手"}(${p === g.humanSeat ? "あなた" : "AI"})`;

const FACING_ARROW = ["↑", "→", "↓", "←"];
const FACING_LABEL = ["上", "右", "下", "左"];
const ATTR_LABEL: Record<string, string> = { yin: "陰", yang: "陽", taiji: "太極", empty: "空", none: "無" };

// ------------------------------------------------------------- log

const describe = (g: Game, e: GameEvent): { text: string; cls: string } | null => {
  const name = (id: string): string => cardOf(g.ctx.pack, id).nameJa;
  switch (e.t) {
    case "turnStart":
      return {
        text: `── R${e.round} ${seatName(g, e.player)}のターン開始 (霊力+${e.income})`,
        cls: "hl",
      };
    case "summon":
      return {
        text: `${seatName(g, e.player)}: ${name(e.cardId)} を (${e.pos.x},${e.pos.y}) に${
          e.taiji ? "【太極】" : ""
        }召喚 ${FACING_ARROW[e.facing]} (霊力-${e.cost})`,
        cls: "",
      };
    case "rotate":
      return { text: `${seatName(g, e.player)}: 回転 (霊力-${e.cost})`, cls: "" };
    case "reigu":
      return {
        text: `◆ 霊具 — ${seatName(g, e.player)}が ${name(e.cardId)} を使用 (霊力-${e.cost})`,
        cls: "reigu",
      };
    case "effect":
      return { text: `★ ${e.text}`, cls: "fx" };
    case "attack": {
      if (e.variant === "heal") {
        const h = e.hits[0];
        return {
          text: `${seatName(g, e.player)}: ${name(e.cardId)}が味方 ${name(h.cardId)} を回復 +${
            -h.dmg
          } (霊力-${e.cost})`,
          cls: "",
        };
      }
      const hits = e.hits
        .map(
          (h) =>
            `${name(h.cardId)}に${h.dmg}${h.blind ? "【死角】" : ""}${h.ally ? "(味方)" : ""}${
              h.destroyed ? "→撃破" : ""
            }`,
        )
        .join(" / ");
      const counter = e.counterTotal > 0 ? ` ⇔ 反撃${e.counterTotal}` : "";
      const dead = e.attackerDestroyed ? " → 攻撃側撃破" : "";
      const kind = e.variant === "konshin" ? "渾身" : e.aoe ? "範囲" : "";
      return {
        text: `${seatName(g, e.player)}: ${name(e.cardId)}が${kind}攻撃 (霊力-${
          e.cost
        }) ${hits}${counter}${dead}`,
        cls: "",
      };
    }
    case "destroy":
      return {
        text: `　撃破: ${seatName(g, e.owner)}の${name(e.cardId)} → 生命-${e.lifeLoss} / 霊力+${
          e.manaGain
        }`,
        cls: "wr",
      };
    case "turnEnd": {
      const bits = [`占拠${e.occupied}`];
      if (e.chipGained > 0) bits.push(`チップ+${e.chipGained}(計${e.chips})`);
      if (e.reach) bits.push("制圧リーチ宣言");
      if (e.discarded > 0) bits.push(`${e.discarded}枚捨てて${e.drawn}枚補充`);
      else if (e.drawn > 0) bits.push(`${e.drawn}枚補充`);
      return { text: `${seatName(g, e.player)}: ターン終了 — ${bits.join(" / ")}`, cls: "" };
    }
    case "gameEnd": {
      const how =
        e.winType === "control" ? "制圧勝ち" : e.winType === "life" ? "生命を0にして勝ち" : "ラウンド上限";
      const who = e.winner === null ? "引き分け" : `${seatName(g, e.winner)}の${how}`;
      return { text: `◆ 決着 (R${e.round}): ${who}`, cls: "wr" };
    }
    default:
      return null;
  }
};

const flushLog = (): void => {
  const g = G;
  if (g === null) return;
  const box = $("log");
  for (let i = g.logged; i < g.events.length; i++) {
    const e = g.events[i];
    const d = describe(g, e);
    if (d !== null) {
      const div = document.createElement("div");
      div.className = d.cls;
      div.textContent = d.text;
      box.appendChild(div);
    }
    if (e.t === "turnEnd" && e.reach) {
      g.banner = `${seatName(g, e.player)} が制圧リーチを宣言! 次の自ターン開始時まで5マス維持で勝利`;
    }
    if (e.t === "turnEnd" && e.chipGained > 0) {
      g.banner = `${seatName(g, e.player)} がチップ+${e.chipGained}(計${e.chips}、収入${incomeFor(
        g.ctx,
        e.chips,
      )})`;
    }
    if (e.t === "gameEnd") {
      const d2 = describe(g, e);
      g.banner = d2 === null ? "決着" : d2.text;
    }
  }
  g.logged = g.events.length;
  box.scrollTop = box.scrollHeight;
};

// ---------------------------------------------------------- rendering

/** Effect text block for a card, or a dash when the card has none. */
const effectBlock = (g: Game, cardId: string): string => {
  const text = effectTextOf(cardId);
  if (text === null) return `<span class="fx none">効果 ─</span>`;
  if (!g.ctx.cfg.effects) {
    return `<span class="fx off">(効果off) ${esc(text)}</span>`;
  }
  return `<span class="fx">${esc(text)}</span>`;
};

const miniDiagram = (range: Pos[], blind: Pos[]): string => {
  const cells: string[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const dx = col - 2;
      const dy = 2 - row;
      let cls = "";
      if (dx === 0 && dy === 0) cls = "self";
      else if (range.some((c) => c.x === dx && c.y === dy)) cls = "rng";
      else if (blind.some((c) => c.x === dx && c.y === dy)) cls = "bld";
      cells.push(`<div class="${cls}"></div>`);
    }
  }
  return `<div class="mini">${cells.join("")}</div>`;
};

const panelHtml = (g: Game, p: PlayerId): string => {
  const ps = g.state.players[p];
  const isTurn = g.state.turnPlayer === p && !g.state.ended;
  return `<div class="row">
    <b>${seatName(g, p)}</b>
    <span class="stat">生命 <b>${ps.life}</b></span>
    <span class="stat">霊力 <b>${ps.mana}</b></span>
    <span class="stat">チップ <b>${ps.chips}</b>(収入${incomeFor(g.ctx, ps.chips)})</span>
    <span class="stat">占拠 <b>${occupied(g.state, p)}</b>/${g.ctx.cfg.controlWin}</span>
    <span class="stat">手札 ${ps.hand.length}</span>
    <span class="stat">山札 ${ps.deck.length} / 墓地 ${ps.grave.length}</span>
    ${ps.reach ? '<span class="stat" style="color:#a83a2c"><b>制圧リーチ</b></span>' : ""}
    ${isTurn ? '<span class="stat turnmark">手番中</span>' : ""}
  </div>`;
};

/** Cells the human may currently click, and what clicking does. */
const pickableCells = (g: Game): Map<string, "summon" | "target"> => {
  const out = new Map<string, "summon" | "target">();
  if (g.phase !== "play") return out;
  const sel = g.sel;
  if (sel.kind === "hand") {
    for (const c of allCells()) {
      const any = ([0, 1, 2, 3] as Facing[]).some((f) =>
        isLegal(g.ctx, g.state, { kind: "summon", handIndex: sel.handIndex, pos: c, facing: f }),
      );
      if (any) out.set(`${c.x},${c.y}`, "summon");
    }
  } else if (sel.kind === "unit" && sel.attackMode !== null) {
    for (const a of legalActions(g.ctx, g.state)) {
      if (a.kind !== "attack" || a.uid !== sel.uid) continue;
      if ((a.variant ?? "normal") !== sel.attackMode) continue;
      if (a.targetUid === null) {
        const u = unitByUid(g.state, sel.uid);
        if (u !== undefined) for (const c of attackCells(g.ctx, u)) out.set(`${c.x},${c.y}`, "target");
      } else {
        const t = unitByUid(g.state, a.targetUid);
        if (t !== undefined) out.set(`${t.pos.x},${t.pos.y}`, "target");
      }
    }
  } else if (sel.kind === "proxy" && sel.targetUid === null) {
    for (const a of legalActions(g.ctx, g.state)) {
      if (a.kind !== "proxyRotate" || a.uid !== sel.uid) continue;
      const t = unitByUid(g.state, a.targetUid);
      if (t !== undefined) out.set(`${t.pos.x},${t.pos.y}`, "target");
    }
  } else if (sel.kind === "reigu" && sel.targetUid === null) {
    for (const a of legalActions(g.ctx, g.state)) {
      if (a.kind !== "reigu" || a.handIndex !== sel.handIndex) continue;
      if (a.targetUid === null) continue;
      const t = unitByUid(g.state, a.targetUid);
      if (t !== undefined) out.set(`${t.pos.x},${t.pos.y}`, "target");
    }
  }
  return out;
};

const renderBoard = (g: Game): void => {
  const board = $("board");
  board.innerHTML = "";
  const pick = pickableCells(g);
  const sel = g.sel;
  const shownUnit = sel.kind === "unit" ? unitByUid(g.state, sel.uid) : undefined;
  const rangeKeys = new Set(
    shownUnit === undefined ? [] : attackCells(g.ctx, shownUnit).map((c) => `${c.x},${c.y}`),
  );
  const blindKeys = new Set(
    shownUnit === undefined ? [] : blindCells(g.ctx, shownUnit).map((c) => `${c.x},${c.y}`),
  );

  for (let y = 2; y >= 0; y--) {
    for (let x = 0; x < 3; x++) {
      const pos: Pos = { x, y };
      const key = `${x},${y}`;
      const attr = cellAttr(pos);
      const u = unitAt(g.state, pos);
      const classes = ["cell", attr];
      const mode = pick.get(key);
      if (mode === "summon") classes.push("pick");
      if (mode === "target") classes.push("target");
      if (rangeKeys.has(key)) classes.push("inrange");
      if (blindKeys.has(key)) classes.push("inblind");
      if (shownUnit !== undefined && u !== undefined && u.uid === shownUnit.uid) {
        classes.push("selected");
      }
      if (u !== undefined && g.phase === "play" && mode === undefined) classes.push("clickable");

      const btn = document.createElement("button");
      btn.className = classes.join(" ");
      btn.type = "button";
      let inner = `<span class="attr">${ATTR_LABEL[attr]}</span>`;
      if (u !== undefined) {
        const card = cardOfUnit(g.ctx, u);
        const hp = unitHp(g.ctx, u);
        const max = unitMaxHp(g.ctx, u);
        const flags: string[] = [];
        if (isHidden(u)) flags.push("マヨヒガ(隠)");
        if (u.attackedThisTurn) flags.push("攻撃済");
        else if (u.rotatedThisTurn) flags.push("回転済");
        if (u.atkBuff > 0) flags.push(`ATK+${u.atkBuff}`);
        inner += `<span class="unit o${u.owner}">
          <span class="nm">${esc(card.nameJa)}</span>
          <span class="arrow">${FACING_ARROW[u.facing]}</span>
          HP ${hp}/${max}・ATK ${card.atk}
          <br>${ATTR_LABEL[card.attribute]}${card.aoe ? "・範囲" : ""}${
            card.attackType === "jutsu" ? "・術" : ""
          }
          ${flags.length > 0 ? `<br><span class="done">${flags.join("/")}</span>` : ""}
        </span>`;
      }
      btn.innerHTML = inner;
      const occupant =
        u === undefined
          ? "空きマス"
          : `${seatName(g, u.owner)}の${cardOfUnit(g.ctx, u).nameJa} ${FACING_LABEL[u.facing]}向き HP${unitHp(g.ctx, u)}`;
      btn.setAttribute(
        "aria-label",
        `(${x},${y}) ${ATTR_LABEL[attr]}のマス / ${occupant}${
          mode === "summon" ? " / 召喚可能" : mode === "target" ? " / 攻撃対象" : ""
        }`,
      );
      btn.addEventListener("click", () => onCellClick(pos, mode));
      board.appendChild(btn);
    }
  }
};

const renderHand = (g: Game): void => {
  const box = $("hand");
  box.innerHTML = "";
  const ps = g.state.players[g.humanSeat];
  const myTurn = g.state.turnPlayer === g.humanSeat && g.phase === "play";

  if (g.phase === "discard") {
    const list = document.createElement("div");
    list.innerHTML = `<div>捨てる札を選んでください(0枚でも可)。確定すると5枚まで補充します。</div>`;
    ps.hand.forEach((id, i) => {
      const card = cardOf(g.ctx.pack, id);
      const label = document.createElement("label");
      label.className = "discard-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = g.discardSel.has(i);
      cb.addEventListener("change", () => {
        if (cb.checked) g.discardSel.add(i);
        else g.discardSel.delete(i);
      });
      label.appendChild(cb);
      label.appendChild(
        document.createTextNode(
          ` ${card.nameJa}(召${card.summonCost}/攻${card.attackCost}・HP${card.hp}/ATK${card.atk}・${
            ATTR_LABEL[card.attribute]
          }${card.kind === "reigu" ? "・霊具=召喚不可" : ""})`,
        ),
      );
      list.appendChild(label);
    });
    box.appendChild(list);
    return;
  }

  const reiguPlayable = new Set<number>();
  if (myTurn) {
    for (const a of legalActions(g.ctx, g.state)) {
      if (a.kind === "reigu") reiguPlayable.add(a.handIndex);
    }
  }

  ps.hand.forEach((id, i) => {
    const card = cardOf(g.ctx.pack, id);
    const isReigu = card.kind === "reigu";
    const summonable = isReigu
      ? reiguPlayable.has(i)
      : myTurn &&
        allCells().some((c) =>
          ([0, 1, 2, 3] as Facing[]).some((f) =>
            isLegal(g.ctx, g.state, { kind: "summon", handIndex: i, pos: c, facing: f }),
          ),
        );
    const div = document.createElement("button");
    div.type = "button";
    div.disabled = !summonable;
    const selected =
      (g.sel.kind === "hand" || g.sel.kind === "reigu") && g.sel.handIndex === i;
    div.className = `card${summonable ? "" : " dead"}${selected ? " sel" : ""}`;
    div.innerHTML = isReigu
      ? `<span class="nm">${esc(card.nameJa)}</span>
        <b>霊具</b> 霊力${card.summonCost}
        ${effectBlock(g, card.id)}`
      : `<span class="nm">${esc(card.nameJa)}</span>
      召${card.summonCost} / 攻${card.attackCost}<br>
      HP${card.hp} ATK${card.atk}<br>
      ${ATTR_LABEL[card.attribute]}${card.aoe ? "・範囲" : ""}${
        card.attackType === "jutsu" ? "・術" : ""
      }
      ${miniDiagram(card.attackRange, card.blindSpots)}
      ${effectBlock(g, card.id)}`;
    if (summonable) div.addEventListener("click", () => onHandClick(i, isReigu));
    box.appendChild(div);
  });
  if (ps.hand.length === 0) box.textContent = "(手札なし)";
};

const button = (label: string, enabled: boolean, cls: string, fn: () => void): HTMLElement => {
  const b = document.createElement("button");
  b.textContent = label;
  b.disabled = !enabled;
  if (cls.length > 0) b.className = cls;
  if (enabled) b.addEventListener("click", fn);
  return b;
};

const renderControls = (g: Game): void => {
  const box = $("controls");
  box.innerHTML = "";
  const hint = $("hint");
  hint.textContent = "";
  const info = $("selinfo");
  info.innerHTML = "";
  // effect text for whatever is selected
  if (g.sel.kind === "unit") {
    const su = unitByUid(g.state, g.sel.uid);
    if (su !== undefined) {
      const c = cardOfUnit(g.ctx, su);
      info.innerHTML = `<b>${esc(c.nameJa)}</b> ${effectBlock(g, c.id)}`;
    }
  } else if (g.sel.kind === "hand" || g.sel.kind === "reigu") {
    const id = g.state.players[g.humanSeat].hand[g.sel.handIndex];
    if (id !== undefined) {
      const c = cardOf(g.ctx.pack, id);
      info.innerHTML = `<b>${esc(c.nameJa)}</b> ${effectBlock(g, c.id)}`;
    }
  }

  if (g.phase === "over") {
    box.appendChild(button("もう一度", true, "primary", () => showSetup()));
    return;
  }
  if (g.phase === "ai") {
    hint.textContent = "AIの手番です…";
    return;
  }
  if (g.phase === "tansu") {
    const uid = g.tansuQueue[0];
    const u = uid === undefined ? undefined : unitByUid(g.state, uid);
    if (u === undefined) {
      beginTurn();
      return;
    }
    hint.textContent = `【古箪笥】ターン開始効果: HPを1減らして何を得ますか? (現在HP ${unitHp(
      g.ctx,
      u,
    )})`;
    info.innerHTML = `<b>古箪笥</b> ${effectBlock(g, "tm07")}`;
    const answer = (choice: TansuChoice): void => {
      g.tansuAnswers.set(u.uid, choice);
      g.tansuQueue = g.tansuQueue.slice(1);
      if (g.tansuQueue.length === 0) beginTurn();
      else render();
    };
    box.appendChild(button("HP-1 → 霊力+1", true, "primary", () => answer("mana")));
    box.appendChild(button("HP-1 → 1ドロー", true, "", () => answer("draw")));
    box.appendChild(button("使わない", true, "", () => answer("skip")));
    return;
  }
  if (g.phase === "discard") {
    hint.textContent = "手札整理: 捨てる札を選んで確定してください。";
    box.appendChild(
      button("確定して補充", true, "primary", () => {
        const chosen = [...g.discardSel];
        endTurn(g.ctx, g.state, g.events, () => chosen);
        g.discardSel.clear();
        flushLog();
        void advance();
      }),
    );
    box.appendChild(button("捨てずに確定", true, "", () => {
      g.discardSel.clear();
      endTurn(g.ctx, g.state, g.events, () => []);
      flushLog();
      void advance();
    }));
    return;
  }
  if (g.phase !== "play") return;

  const sel = g.sel;
  if (sel.kind === "hand") {
    const card = cardOf(g.ctx.pack, g.state.players[g.humanSeat].hand[sel.handIndex]);
    if (sel.pos === null) {
      hint.textContent = `${card.nameJa} を置くマスを選んでください(緑枠)。`;
    } else {
      hint.textContent = `(${sel.pos.x},${sel.pos.y}) 費用${summonCostAt(
        g.ctx,
        card,
        sel.pos,
      )} — 向きを選んでください。`;
      for (const f of [0, 1, 2, 3] as Facing[]) {
        const act: Action = { kind: "summon", handIndex: sel.handIndex, pos: sel.pos, facing: f };
        box.appendChild(
          button(`${FACING_ARROW[f]} ${FACING_LABEL[f]}`, isLegal(g.ctx, g.state, act), "", () =>
            doSummon(act),
          ),
        );
      }
    }
    box.appendChild(button("選択解除", true, "", () => setSel({ kind: "none" })));
  } else if (sel.kind === "reigu") {
    const card = cardOf(g.ctx.pack, g.state.players[g.humanSeat].hand[sel.handIndex]);
    const targeting = reiguTargeting(card.id);
    if (targeting === "none") {
      hint.textContent = `${card.nameJa}: 対象なし。使用しますか?`;
      box.appendChild(
        button(`${card.nameJa} を使用 (霊力${card.summonCost})`, true, "primary", () =>
          doAction({ kind: "reigu", handIndex: sel.handIndex, targetUid: null, facing: null }),
        ),
      );
    } else if (sel.targetUid === null) {
      hint.textContent = `${card.nameJa}: 対象を選んでください(赤枠)。`;
    } else {
      const t = unitByUid(g.state, sel.targetUid);
      hint.textContent = `${card.nameJa}: ${
        t === undefined ? "" : cardOfUnit(g.ctx, t).nameJa
      } に対する向きを選んでください。`;
      for (const a of legalActions(g.ctx, g.state)) {
        if (a.kind !== "reigu" || a.handIndex !== sel.handIndex) continue;
        if (a.targetUid !== sel.targetUid || a.facing === null) continue;
        const f = a.facing;
        box.appendChild(
          button(`${FACING_ARROW[f]} ${FACING_LABEL[f]}`, true, "", () => doAction(a)),
        );
      }
    }
    box.appendChild(button("選択解除", true, "", () => setSel({ kind: "none" })));
  } else if (sel.kind === "proxy") {
    if (sel.targetUid === null) {
      hint.textContent = "代理回転: 回すユニットを選んでください(赤枠)。";
    } else {
      const t = unitByUid(g.state, sel.targetUid);
      hint.textContent = `代理回転: ${
        t === undefined ? "" : cardOfUnit(g.ctx, t).nameJa
      } をどちらに回しますか。`;
      for (const a of legalActions(g.ctx, g.state)) {
        if (a.kind !== "proxyRotate" || a.uid !== sel.uid || a.targetUid !== sel.targetUid) continue;
        const f = a.facing;
        box.appendChild(
          button(`${FACING_ARROW[f]} ${FACING_LABEL[f]}`, true, "", () => doAction(a)),
        );
      }
    }
    box.appendChild(button("選択解除", true, "", () => setSel({ kind: "none" })));
  } else if (sel.kind === "unit") {
    const u = unitByUid(g.state, sel.uid);
    if (u === undefined) {
      setSel({ kind: "none" });
      return;
    }
    const card = cardOfUnit(g.ctx, u);
    const mine = u.owner === g.humanSeat;
    if (!mine) {
      hint.textContent = `相手の ${card.nameJa}: 緑=攻撃範囲 / 赤=死角。`;
      box.appendChild(button("選択解除", true, "", () => setSel({ kind: "none" })));
      return;
    }
    const all = legalActions(g.ctx, g.state);
    const attacks = all.filter(
      (a) => a.kind === "attack" && a.uid === u.uid && (a.variant ?? "normal") === "normal",
    );
    const konshins = all.filter(
      (a) => a.kind === "attack" && a.uid === u.uid && a.variant === "konshin",
    );
    const heals = all.filter((a) => a.kind === "attack" && a.uid === u.uid && a.variant === "heal");
    const proxies = all.filter((a) => a.kind === "proxyRotate" && a.uid === u.uid);
    let reason = "";
    if (u.attackedThisTurn) reason = "(このユニットは行動終了)";
    else if (!canAttack(card)) reason = "(攻撃手段なし)";
    else if (g.state.players[g.humanSeat].mana < card.attackCost) reason = "(霊力不足)";
    else if (attacks.length === 0) reason = "(範囲内に敵なし)";

    if (sel.summonAttack) {
      hint.textContent = `召喚攻撃: 対象を選ぶか、スキップしてください。${reason}`;
    } else {
      hint.textContent = `${card.nameJa}: 緑=攻撃範囲 / 赤=死角。${reason}`;
    }

    if (card.aoe && attacks.length > 0) {
      box.appendChild(
        button(`範囲攻撃 (霊力${card.attackCost})`, true, "danger", () =>
          doAction({ kind: "attack", uid: u.uid, targetUid: null }),
        ),
      );
    } else {
      box.appendChild(
        button(
          `攻撃 (霊力${card.attackCost})${reason}`,
          attacks.length > 0 && sel.attackMode !== "normal",
          "danger",
          () =>
            setSel({
              kind: "unit",
              uid: u.uid,
              attackMode: "normal",
              summonAttack: sel.summonAttack,
            }),
        ),
      );
    }
    // tm09 Kubihiki: the +1 / -1 HP variant
    if (konshins.length > 0) {
      const aoeKonshin = konshins.find((a) => a.kind === "attack" && a.targetUid === null);
      box.appendChild(
        button(
          `渾身攻撃 (+1ダメージ / 自身-1HP)`,
          true,
          "danger",
          aoeKonshin !== undefined
            ? () => doAction({ kind: "attack", uid: u.uid, targetUid: null, variant: "konshin" })
            : () =>
                setSel({
                  kind: "unit",
                  uid: u.uid,
                  attackMode: "konshin",
                  summonAttack: sel.summonAttack,
                }),
        ),
      );
    }
    // tm06 Meoto-Men: heal an ally instead of striking
    if (heals.length > 0) {
      box.appendChild(
        button(`回復 (味方に+${card.atk}HP)`, true, "", () =>
          setSel({ kind: "unit", uid: u.uid, attackMode: "heal", summonAttack: sel.summonAttack }),
        ),
      );
    }
    // tm17 Kuryugai: proxy rotation
    if (proxies.length > 0) {
      box.appendChild(
        button(`代理回転 (他の1体を回す・霊力${g.ctx.cfg.rotateCost})`, true, "", () =>
          setSel({ kind: "proxy", uid: u.uid, targetUid: null }),
        ),
      );
    }
    for (const [dir, label] of [
      [-1, "回転 左"],
      [1, "回転 右"],
    ] as [1 | -1, string][]) {
      const act: Action = { kind: "rotate", uid: u.uid, facing: turnFacing(u.facing, dir) };
      const ok = isLegal(g.ctx, g.state, act);
      const why = u.attackedThisTurn
        ? "(行動終了)"
        : u.rotatedThisTurn
          ? "(回転済)"
          : g.state.players[g.humanSeat].mana < g.ctx.cfg.rotateCost
            ? "(霊力不足)"
            : rotateCommandLocked(g.ctx, g.state, g.humanSeat)
              ? "(玖龍街により回転不可)"
              : "";
      box.appendChild(button(`${label} (霊力${g.ctx.cfg.rotateCost})${why}`, ok, "", () => doAction(act)));
    }
    box.appendChild(
      button(sel.summonAttack ? "召喚攻撃をスキップ" : "選択解除", true, "", () =>
        setSel({ kind: "none" }),
      ),
    );
  } else {
    hint.textContent = "手札のカードか、盤上のユニットを選んでください。";
  }

  box.appendChild(
    button("ターン終了", true, "primary", () => {
      g.sel = { kind: "none" };
      g.phase = "discard";
      render();
    }),
  );
};

const render = (): void => {
  const g = G;
  if (g === null) return;
  $("oppPanel").className = `panel seat${opponent(g.humanSeat)}`;
  $("oppPanel").innerHTML = panelHtml(g, opponent(g.humanSeat));
  $("selfPanel").className = `panel seat${g.humanSeat}`;
  $("selfPanel").innerHTML = panelHtml(g, g.humanSeat);
  const banner = $("banner");
  banner.textContent = g.banner;
  banner.className = g.banner.length > 0 ? "on" : "";
  renderBoard(g);
  renderHand(g);
  renderControls(g);
};

// ------------------------------------------------------------ actions

const setSel = (sel: Sel): void => {
  if (G === null) return;
  G.sel = sel;
  render();
};

const onHandClick = (handIndex: number, isReigu: boolean): void => {
  const g = G;
  if (g === null || g.phase !== "play") return;
  const sel = g.sel;
  if ((sel.kind === "hand" || sel.kind === "reigu") && sel.handIndex === handIndex) {
    setSel({ kind: "none" });
    return;
  }
  setSel(
    isReigu
      ? { kind: "reigu", handIndex, targetUid: null }
      : { kind: "hand", handIndex, pos: null },
  );
};

const onCellClick = (pos: Pos, mode: "summon" | "target" | undefined): void => {
  const g = G;
  if (g === null || g.phase !== "play") return;
  const sel = g.sel;
  if (mode === "summon" && sel.kind === "hand") {
    setSel({ kind: "hand", handIndex: sel.handIndex, pos });
    return;
  }
  if (mode === "target" && sel.kind === "unit" && sel.attackMode !== null) {
    const t = unitAt(g.state, pos);
    const act: Action = {
      kind: "attack",
      uid: sel.uid,
      targetUid: t === undefined ? null : t.uid,
      variant: sel.attackMode,
    };
    if (isLegal(g.ctx, g.state, act)) {
      doAction(act);
      return;
    }
    const aoe: Action = { kind: "attack", uid: sel.uid, targetUid: null, variant: sel.attackMode };
    if (isLegal(g.ctx, g.state, aoe)) doAction(aoe);
    return;
  }
  if (mode === "target" && sel.kind === "proxy") {
    const t = unitAt(g.state, pos);
    if (t !== undefined) setSel({ kind: "proxy", uid: sel.uid, targetUid: t.uid });
    return;
  }
  if (mode === "target" && sel.kind === "reigu") {
    const t = unitAt(g.state, pos);
    if (t === undefined) return;
    const direct: Action = {
      kind: "reigu",
      handIndex: sel.handIndex,
      targetUid: t.uid,
      facing: null,
    };
    if (isLegal(g.ctx, g.state, direct)) doAction(direct);
    else setSel({ kind: "reigu", handIndex: sel.handIndex, targetUid: t.uid });
    return;
  }
  const u = unitAt(g.state, pos);
  if (u !== undefined && !isHidden(u)) {
    setSel({ kind: "unit", uid: u.uid, attackMode: null, summonAttack: false });
  } else setSel({ kind: "none" });
};

const doAction = (a: Action): void => {
  const g = G;
  if (g === null) return;
  if (!isLegal(g.ctx, g.state, a)) return;
  applyActionInPlace(g.ctx, g.state, a, g.events);
  flushLog();
  if (g.state.ended) {
    g.phase = "over";
    render();
    return;
  }
  g.sel = { kind: "none" };
  render();
};

const doSummon = (a: Action): void => {
  const g = G;
  if (g === null || a.kind !== "summon") return;
  if (!isLegal(g.ctx, g.state, a)) return;
  applyActionInPlace(g.ctx, g.state, a, g.events);
  flushLog();
  if (g.state.ended) {
    g.phase = "over";
    render();
    return;
  }
  // offer the optional summon-attack straight away
  const fresh = g.state.units[g.state.units.length - 1];
  const canHit = legalActions(g.ctx, g.state).some(
    (x) => x.kind === "attack" && x.uid === fresh.uid,
  );
  g.sel = canHit
    ? { kind: "unit", uid: fresh.uid, attackMode: "normal", summonAttack: true }
    : { kind: "none" };
  render();
};

// -------------------------------------------------------- turn driver

const runAiTurn = async (): Promise<void> => {
  const g = G;
  if (g === null) return;
  const plan = g.ai.planTurn(g.ctx, g.state);
  let taken = 0;
  for (const a of plan) {
    if (g.state.ended) break;
    if (a.kind === "pass") break;
    if (taken >= g.ctx.cfg.maxActionsPerTurn) break;
    if (!isLegal(g.ctx, g.state, a)) break;
    await sleep(AI_DELAY_MS);
    applyActionInPlace(g.ctx, g.state, a, g.events);
    taken += 1;
    flushLog();
    render();
  }
  if (g.state.ended) {
    g.phase = "over";
    render();
    return;
  }
  await sleep(AI_DELAY_MS);
  endTurn(g.ctx, g.state, g.events); // default discard policy for the AI seat
  flushLog();
  render();
  await advance();
};

const advance = async (): Promise<void> => {
  const g = G;
  if (g === null) return;
  if (g.state.ended || checkRoundLimit(g.ctx, g.state, g.events)) {
    flushLog();
    g.phase = "over";
    render();
    return;
  }
  // The human decides their own tm07 (Furu-Tansu) trades, so ask before the
  // turn actually starts. The AI keeps the engine's default policy.
  if (g.state.turnPlayer === g.humanSeat) {
    const pending = pendingTansuChoices(g.ctx, g.state);
    if (pending.length > 0) {
      g.tansuQueue = pending;
      g.tansuAnswers = new Map();
      g.sel = { kind: "none" };
      g.phase = "tansu";
      render();
      return; // resumed by beginTurn() once every choice is in
    }
  }
  beginTurn();
};

/** Runs startTurn with whatever tm07 answers were collected, then hands off. */
const beginTurn = (): void => {
  const g = G;
  if (g === null) return;
  const answers = g.tansuAnswers;
  startTurn(g.ctx, g.state, g.events, (_ctx, _s, unit) => answers.get(unit.uid) ?? "mana");
  g.tansuQueue = [];
  g.tansuAnswers = new Map();
  flushLog();
  if (g.state.ended) {
    g.phase = "over";
    render();
    return;
  }
  g.sel = { kind: "none" };
  if (g.state.turnPlayer === g.humanSeat) {
    g.banner = "";
    g.phase = "play";
    render();
  } else {
    g.phase = "ai";
    render();
    void runAiTurn();
  }
};

// ------------------------------------------------------------- setup

const showSetup = (): void => {
  const box = $("setup");
  box.innerHTML = `
    <h2>対戦設定</h2>
    <div class="row">
      <label>自分の席
        <select id="cfgSeat"><option value="0">先手</option><option value="1">後手</option></select>
      </label>
      <label>AI
        <select id="cfgAi"><option value="greedy">greedy</option><option value="beam">beam</option></select>
      </label>
      <label>AIの評価
        <select id="cfgEval">
          <option value="territorial">territorial</option>
          <option value="aggressive">aggressive</option>
          <option value="balanced">balanced</option>
        </select>
      </label>
      <label>チップ
        <select id="cfgChip">
          <option value="catch_up">catch_up</option>
          <option value="one_per_turn">one_per_turn</option>
        </select>
      </label>
      <label>カード効果
        <select id="cfgEffects"><option value="on">on</option><option value="off">off</option></select>
      </label>
      <label>シード <input id="cfgSeed" type="number" value="20260830" style="width:110px"></label>
      <button id="cfgStart" class="primary">対戦開始</button>
    </div>
    <div class="muted" style="margin-top:6px">パックは ${PACK_NAME} のミラー固定。効果 off ではルールのみ(霊具は召喚不可の死に札)。</div>`;
  $("cfgStart").addEventListener("click", () => void startGame());
  if (G !== null) {
    G.phase = "config";
    render();
  }
};

const startGame = async (): Promise<void> => {
  if (PACK === null) {
    const res = await fetch(`/data/pack-${PACK_NAME}.json`);
    PACK = parsePack(await res.json());
  }
  const seat = Number((document.getElementById("cfgSeat") as HTMLSelectElement).value) as PlayerId;
  const aiName = (document.getElementById("cfgAi") as HTMLSelectElement).value;
  const evalName = (document.getElementById("cfgEval") as HTMLSelectElement).value;
  const chipMode = (document.getElementById("cfgChip") as HTMLSelectElement).value as ChipMode;
  const seed = Number((document.getElementById("cfgSeed") as HTMLInputElement).value) || 1;

  const effects =
    (document.getElementById("cfgEffects") as HTMLSelectElement).value === "on";
  const ctx = makeCtx({ ...defaultConfig(), chipMode, effects }, PACK);
  const weights = profileWeights(evalName);
  const ai: Ai = aiName === "beam" ? makeBeam({ weights }) : makeGreedy(weights);

  G = {
    ctx,
    state: createGame(ctx, seed),
    events: [],
    logged: 0,
    humanSeat: seat,
    ai,
    aiLabel: `${aiName}/${evalName}`,
    sel: { kind: "none" },
    phase: "play",
    discardSel: new Set<number>(),
    tansuQueue: [],
    tansuAnswers: new Map<number, TansuChoice>(),
    banner: `対戦開始 — あなたは${seat === 0 ? "先手" : "後手"} / AI: ${aiName} (${evalName}) / チップ: ${chipMode} / 効果: ${
      effects ? "on" : "off"
    }`,
  };
  $("log").innerHTML = "";
  await advance();
};

showSetup();
