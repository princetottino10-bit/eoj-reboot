// はじめての1局 (10/18): the controls of a first turn, one step at a time, at the
// top of the prompt (summon from the hand, choose the facing, attack, end the
// turn). Shown until the viewer's first turn ends, once per browser. Pure.

export type CoachStep = "hand" | "cell" | "facing" | "attack" | "end";

export type CoachInput = {
  /** It is my main step (my turn, nothing else to answer). */
  main: boolean;
  /** The current selection kind (play/select.ts Sel). */
  sel: string;
  /** My pieces on the board. */
  mine: number;
  /** My pieces that can still attack this turn. */
  canAttack: number;
  /** One of my pieces already attacked this turn. */
  attacked: boolean;
};

export const coachStep = (c: CoachInput): CoachStep | null => {
  if (!c.main) return null;
  if (c.sel === "hand") return "cell";
  if (c.sel === "place") return "facing";
  if (c.sel !== "none") return null;
  if (c.mine === 0) return "hand";
  if (c.canAttack > 0 && !c.attacked) return "attack";
  return "end";
};

const TEXT: Record<CoachStep, [string, string]> = {
  hand: ["1", "手札の札を触る(光っている札が今使える札)"],
  cell: ["2", "盤の光っているマスを触る"],
  facing: ["3", "盤上の矢印で向きを選ぶ(矢印の先が前)"],
  attack: ["4", "金の枠の駒を触り、丸いメニューの「攻」で攻撃"],
  end: ["5", "することが終わったら「ターン終了」"],
};

export const coachHtml = (step: CoachStep): string => {
  const [n, text] = TEXT[step];
  return `<div class="coach" role="note"><span class="coach-tag">はじめての1局</span><b class="coach-n">${n}</b><span class="coach-t">${text}</span><button type="button" class="coach-off" data-act="coach-off" aria-label="案内を閉じる">閉じる</button></div>`;
};
