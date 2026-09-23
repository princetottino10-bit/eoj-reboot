// CONFIG_SCHEMA: the one description of every rule variable a player may
// change. The CLI help, the local play UI, the online lobby / room settings
// panel and the server-side validation all read this table. Pure data and
// pure functions: no node builtins, importable from the browser.
import type { Config } from "./types.ts";

// ------------------------------------------------------------------ groups

export type ConfigGroupId = "economy" | "mana" | "board" | "action" | "combat" | "victory" | "hand" | "special";

/** The first group holds the variables the balance talk keeps coming back to; the panel opens it first. */
export const CONFIG_GROUPS: readonly { id: ConfigGroupId; label: string }[] = [
  { id: "economy", label: "霊力の出入り(主要)" },
  { id: "mana", label: "霊力" },
  { id: "board", label: "盤" },
  { id: "action", label: "行動" },
  { id: "combat", label: "戦闘" },
  { id: "victory", label: "勝敗" },
  { id: "hand", label: "手札" },
  { id: "special", label: "特殊" },
];

/**
 * Config fields that are not rule variables a player tunes:
 *   boardCells        - the board is a fixed 3x3; this only caps the unit count
 *   maxActionsPerTurn - a safety stop for the AI planners, not a rule
 */
export const NON_PLAY_CONFIG_KEYS = ["boardCells", "maxActionsPerTurn"] as const;
export type NonPlayKey = (typeof NON_PLAY_CONFIG_KEYS)[number];
export type PlayKey = Exclude<keyof Config, NonPlayKey>;

/** A partial config limited to player-tunable keys. */
export type ConfigPatch = Partial<Pick<Config, PlayKey>>;

// ------------------------------------------------------------------ fields

type FieldBase = {
  key: PlayKey;
  group: ConfigGroupId;
  /** Japanese name shown in the panel and in the change log. */
  label: string;
  /** One-line explanation. */
  desc: string;
  /** false = only between matches ("次の試合から"). */
  midGame: boolean;
};

export type Choice = { value: string; label: string };

export type ConfigField =
  | (FieldBase & { kind: "int"; min: number; max: number; unit?: string })
  | (FieldBase & { kind: "intPair"; min: number; max: number; parts: readonly [string, string] })
  | (FieldBase & { kind: "intList"; min: number; max: number; maxLength: number })
  | (FieldBase & { kind: "optInt"; min: number; max: number; nullLabel: string })
  | (FieldBase & { kind: "choice"; choices: readonly Choice[] })
  | (FieldBase & { kind: "bool" });

export const CONFIG_SCHEMA: readonly ConfigField[] = [
  // ------------------------------------------------------------- economy
  {
    key: "baseIncome", group: "economy", kind: "int", min: 0, max: 10,
    label: "毎ターン収入", desc: "チップによる上乗せを除いた、毎ターンの霊力の収入", midGame: true,
  },
  {
    key: "chipIncomeSteps", group: "economy", kind: "intList", min: 1, max: 9, maxLength: 6,
    label: "収入が増える占拠チップ数",
    desc: "チップ(ターン終了時の占拠数まで増え、減らない)がこの枚数に達するたびに毎ターン収入+1。例 3,4,5 → 3枚で+1・4枚で+2・5枚で+3",
    midGame: true,
  },
  {
    key: "chipMode", group: "economy", kind: "choice",
    choices: [
      { value: "catch_up", label: "占拠数まで追いつく" },
      { value: "one_per_turn", label: "1ターンに1枚まで" },
    ],
    label: "チップの増え方", desc: "ターン終了時、占拠数がチップ枚数を上回っているときの増え方", midGame: true,
  },
  {
    key: "attackCostDelta", group: "economy", kind: "int", min: -5, max: 5,
    label: "攻撃コストの増減", desc: "全カードの攻撃コストに足す値(攻撃コストは1より下がらない)。カードごとの値は「カード」で変える", midGame: true,
  },
  {
    key: "refundMode", group: "economy", kind: "choice",
    choices: [
      { value: "killer_half", label: "撃破した側" },
      { value: "half", label: "撃破された側" },
      { value: "none", label: "誰も得ない" },
    ],
    label: "撃破報酬を受け取る側", desc: "式神が撃破されたときの霊力を誰が得るか", midGame: true,
  },
  {
    key: "killRewardBase", group: "economy", kind: "choice",
    choices: [
      { value: "half_floor", label: "半額・切り捨て" },
      { value: "half_ceil", label: "半額・切り上げ" },
      { value: "full", label: "全額" },
      { value: "zero", label: "なし(0)" },
      { value: "card", label: "カードの霊力価" },
    ],
    label: "撃破報酬の額", desc: "撃破された式神の召喚コスト(または「カードの霊力価」)から決まる、受け取る霊力", midGame: true,
  },
  {
    key: "killRewardBonus", group: "economy", kind: "int", min: -5, max: 5,
    label: "撃破報酬の加算", desc: "撃破報酬の額に足す値(合計は0より下がらない)。額を「0」にするとこの値が固定の報酬になる", midGame: true,
  },
  {
    key: "killRewardCondition", group: "economy", kind: "choice",
    choices: [
      { value: "always", label: "いつでも" },
      { value: "behind", label: "占拠が相手以下のときだけ" },
      { value: "upset", label: "格上撃破ボーナスあり" },
    ],
    label: "撃破報酬の条件",
    desc: "撃破した側が受け取る報酬の条件(撃破報酬を受け取る側が「撃破した側」のときだけ効く)。占拠が相手以下のときだけ: 撃破の瞬間に撃破した側の占拠が相手より多ければ誰も得ない(「劣勢の判定」がチップならチップで比べる)。格上撃破ボーナス: 報酬に(撃破された式神の召喚コスト−撃破した式神の召喚コスト)÷2(切り捨て)を足す(霊具は使用コスト、反撃は反撃した式神で数える)",
    midGame: true,
  },
  {
    key: "incomeMode", group: "economy", kind: "choice",
    choices: [
      { value: "ratchet", label: "チップは減らない" },
      { value: "current", label: "今の占拠で決まる" },
    ],
    label: "収入の決め方",
    desc: "今の占拠で決まる: 収入を受け取る時点の占拠数(制圧の数え方に従う)がチップになり、それで収入の段階が決まる。占拠を失うと収入も下がる(チップの増え方は使わない)",
    midGame: true,
  },
  {
    key: "underdogDiscount", group: "economy", kind: "int", min: 0, max: 3,
    label: "劣勢時の大型割引",
    desc: "劣勢(「劣勢の判定」による)のとき、「大型割引の対象コスト」以上の式神の召喚(継承召喚を含む)をこの値だけ安くする。「占拠・チップそれぞれ」では1段ごとに引く(太極の軽減と重なり、1より下がらない。0でなし)",
    midGame: true,
  },
  {
    key: "underdogDiscountMinCost", group: "economy", kind: "int", min: 1, max: 20,
    label: "大型割引の対象コスト", desc: "劣勢時の大型割引の対象になる式神の、カードの召喚コストの下限", midGame: true,
  },
  {
    key: "underdogIncome", group: "economy", kind: "int", min: 0, max: 3,
    label: "劣勢ボーナス", desc: "収入を受け取るとき、劣勢(「劣勢の判定」による)なら収入にこの値を足す。「占拠・チップそれぞれ」では1段ごとに足す(0でなし)", midGame: true,
  },
  {
    key: "underdogBy", group: "economy", kind: "choice",
    choices: [
      { value: "cells", label: "占拠数" },
      { value: "chips", label: "チップ(ラチェット)" },
      { value: "both", label: "占拠・チップそれぞれ" },
    ],
    label: "劣勢の判定",
    desc: "劣勢ボーナス・劣勢時の大型割引・撃破報酬の「占拠が相手以下のときだけ」が使う「劣勢」の決め方。占拠数: その時点の占拠数(制圧の数え方に従う)が相手より少ない。チップ: チップ(減らないラチェット)が相手より少ない(自分のターン中には変わらない)。占拠・チップそれぞれ: 占拠数で負けていれば1段、チップで負けていればさらに1段(撃破報酬はどちらか一方で相手以下なら受け取る)",
    midGame: true,
  },
  // ---------------------------------------------------------------- mana
  {
    key: "startMana", group: "mana", kind: "intPair", min: 0, max: 15, parts: ["先手", "後手"],
    label: "初期霊力", desc: "最初の自分のターンに持っている霊力", midGame: false,
  },
  {
    key: "manaCap", group: "mana", kind: "int", min: 1, max: 30,
    label: "霊力上限", desc: "霊力はこの値を超えて貯まらない", midGame: true,
  },
  // not mid-match: the turn that straddles a switch would be paid twice (turn_end -> turn_start) or not at all
  {
    key: "incomeTiming", group: "mana", kind: "choice",
    choices: [
      { value: "turn_start", label: "ターン開始時" },
      { value: "turn_end", label: "ターン終了時" },
    ],
    label: "収入のタイミング", desc: "霊力の収入を自分のターンの開始時と終了時のどちらで得るか", midGame: false,
  },
  // --------------------------------------------------------------- board
  {
    key: "taijiDiscount", group: "board", kind: "int", min: 0, max: 10,
    label: "太極の軽減", desc: "太極のマスに召喚するときの召喚コストの割引", midGame: true,
  },
  {
    key: "taijiFloor", group: "board", kind: "int", min: 0, max: 10,
    label: "太極の下限", desc: "太極で割り引いても召喚コストはこの値より下がらない", midGame: true,
  },
  {
    key: "attrBonus", group: "board", kind: "int", min: 0, max: 5,
    label: "属性ボーナス", desc: "同じ属性のマスでHP+この値、反対の属性のマスでHP−この値", midGame: true,
  },
  {
    key: "blindBonus", group: "board", kind: "int", min: 0, max: 5,
    label: "死角ボーナス", desc: "死角からの物理攻撃に加わるダメージ", midGame: true,
  },
  {
    key: "maxHp", group: "board", kind: "int", min: 1, max: 20,
    label: "最大HP", desc: "属性ボーナスを含めたHPの上限", midGame: true,
  },
  // -------------------------------------------------------------- action
  {
    key: "rotateCost", group: "action", kind: "int", min: 0, max: 5,
    label: "回転コスト", desc: "回転命令1回に払う霊力", midGame: true,
  },
  {
    key: "summonLimit", group: "action", kind: "optInt", min: 1, max: 5, nullLabel: "なし",
    label: "1ターンの召喚上限", desc: "1ターンに召喚(継承召喚を含む)できる回数", midGame: true,
  },
  // -------------------------------------------------------------- combat
  {
    key: "counterMode", group: "combat", kind: "choice",
    choices: [
      { value: "all", label: "反撃範囲内の全員" },
      { value: "single", label: "1体だけ" },
      { value: "gap", label: "隙位置の敵だけ" },
    ],
    label: "反撃方式", desc: "攻撃を受けた式神のうち、どれが反撃するか(gap: 範囲攻撃は隙位置だけが反撃できる)", midGame: true,
  },
  {
    key: "counterResolve", group: "combat", kind: "choice",
    choices: [
      { value: "chosen", label: "1体ずつ・反撃側が順番を選ぶ" },
      { value: "sum", label: "まとめて同時に" },
    ],
    label: "複数の反撃の解決",
    desc: "1体ずつ: 反撃は反撃側が選んだ順に1体ずつ当たり、攻撃側が撃破されたら残りは反撃しない(術式の式神は反撃しない)。まとめて: 合計を一度に受ける",
    midGame: true,
  },
  {
    key: "aoeMode", group: "combat", kind: "choice",
    choices: [
      { value: "on", label: "味方も巻き込む" },
      { value: "no_ff", label: "敵だけに当たる" },
      { value: "off", label: "範囲攻撃なし(単体)" },
    ],
    label: "範囲攻撃の味方巻き込み", desc: "範囲攻撃が範囲内の味方にも当たるか", midGame: true,
  },
  {
    key: "jutsuAoeSparesAllies", group: "combat", kind: "bool",
    label: "術式の範囲攻撃は味方に当たらない",
    desc: "オンにすると術式・範囲の攻撃は範囲内の敵だけに当たる(物理・範囲は「範囲攻撃の味方巻き込み」に従う)",
    midGame: true,
  },
  {
    key: "summonCostScale", group: "combat", kind: "choice",
    choices: [
      { value: "full", label: "通常" },
      { value: "half", label: "半額" },
    ],
    label: "召喚コスト半額", desc: "召喚コストを半分(切り上げ・下限1)にする", midGame: true,
  },
  // ------------------------------------------------------------- victory
  {
    key: "controlWin", group: "victory", kind: "int", min: 1, max: 9,
    label: "制圧に必要なマス数", desc: "この数のマスを占拠し続けると制圧勝ち", midGame: true,
  },
  {
    key: "controlHold", group: "victory", kind: "choice",
    choices: [
      { value: "next_turn_end", label: "次の自ターン終了時まで維持" },
      { value: "next_turn_start", label: "次の自ターン開始時に判定" },
    ],
    label: "制圧の保持判定", desc: "制圧に入ってから勝ちになるまでの判定の仕方", midGame: true,
  },
  {
    key: "controlCount", group: "victory", kind: "choice",
    choices: [
      { value: "cells", label: "1体で1マス" },
      { value: "hp", label: "HPが基準以上なら2マス分" },
      { value: "cost", label: "召喚コストが基準以上なら2マス分" },
    ],
    label: "制圧の数え方",
    desc: "占拠の数え方。制圧・占拠チップ(収入)・デッキ切れ判定・表示の占拠数のすべてに使う。HP: 今のHP(ダメージで基準を下回れば1マスに戻る)。召喚コスト: カードの召喚コスト。マヨヒガで隠れた式神は0",
    midGame: true,
  },
  {
    key: "controlCountThreshold", group: "victory", kind: "int", min: 1, max: 20,
    label: "2マス分になる基準",
    desc: "制圧の数え方が「HP」「召喚コスト」のとき、この値以上の式神を2マス分に数える(検討中の値: HPなら11、召喚コストなら8)",
    midGame: true,
  },
  // not mid-match: points earned under one mode mean nothing under the other
  {
    key: "controlWinMode", group: "victory", kind: "choice",
    choices: [
      { value: "hold", label: "制圧を維持して勝つ" },
      { value: "points", label: "制圧点をためて勝つ" },
    ],
    label: "制圧の勝ち方",
    desc: "制圧点: 自分のターン終了時に占拠が「制圧に必要なマス数」以上なら制圧点+1(減らない)。「勝ちに必要な制圧点」に達したらその場で勝ち。制圧の保持判定は使わない",
    midGame: false,
  },
  {
    key: "controlPointsToWin", group: "victory", kind: "int", min: 1, max: 9,
    label: "勝ちに必要な制圧点", desc: "制圧の勝ち方が「制圧点」のとき、この点数に達したら勝ち", midGame: true,
  },
  {
    key: "controlWinLate", group: "victory", kind: "int", min: 0, max: 9,
    label: "終盤の制圧ライン",
    desc: "どちらかが初めて墓地を山札に戻した後は、制圧(成立・維持・制圧点)に必要なマス数をこの値にする(制圧の数え方に従う)。切り替わった時点で制圧中の側も判定し直す。0でなし",
    midGame: true,
  },
  {
    key: "instantWinCells", group: "victory", kind: "int", min: 0, max: 18,
    label: "コールド勝ち",
    desc: "自分のターン終了時に占拠(制圧の数え方に従う)がこの値以上ならその場で勝ち(制圧の勝ち方によらない)。0でなし",
    midGame: true,
  },
  {
    key: "lifeValueEnabled", group: "victory", kind: "bool",
    label: "生命価", desc: "撃破された式神の生命価だけ生命を失い、生命0で負ける", midGame: true,
  },
  {
    key: "startLife", group: "victory", kind: "int", min: 1, max: 50,
    label: "初期生命", desc: "試合開始時の生命", midGame: false,
  },
  {
    key: "deckOutMode", group: "victory", kind: "choice",
    choices: [
      { value: "none", label: "なし" },
      { value: "second", label: "2回目の山札切れで判定" },
    ],
    label: "デッキ切れ判定", desc: "どちらかが墓地を2回山札に戻した時点で、占拠数の多い側の勝ち", midGame: true,
  },
  {
    key: "roundLimit", group: "victory", kind: "int", min: 1, max: 99,
    label: "ラウンド上限", desc: "このラウンドを超えたら引き分け", midGame: true,
  },
  {
    key: "simultaneousDeathTurnPlayerWins", group: "victory", kind: "bool",
    label: "同時に生命0なら手番側の勝ち", desc: "オフにすると、両者の生命が同時に0になったとき手番でない側の勝ち", midGame: true,
  },
  // ---------------------------------------------------------------- hand
  {
    key: "handRefill", group: "hand", kind: "int", min: 1, max: 10,
    label: "補充枚数", desc: "開始時の手札枚数と、ターン終了時にこの枚数まで引く上限", midGame: true,
  },
  {
    key: "handMode", group: "hand", kind: "choice",
    choices: [
      { value: "refill_to_5", label: "補充枚数まで引く" },
      { value: "replace_discarded", label: "捨てた枚数だけ引く" },
    ],
    label: "補充方式", desc: "ターン終了時の手札の補充の仕方", midGame: true,
  },
  {
    key: "mulligan", group: "hand", kind: "bool",
    label: "マリガン", desc: "対戦開始前に一度だけ、手札を山札に戻して引き直せる", midGame: false,
  },
  // ------------------------------------------------------------- special
  {
    key: "inheritSummon", group: "special", kind: "bool",
    label: "継承召喚", desc: "自分の式神を、より召喚コストの高い式神に置き換えて召喚できる", midGame: true,
  },
  {
    key: "moveOnKill", group: "special", kind: "bool",
    label: "撃破時に移動", desc: "敵をちょうど1体撃破したとき、攻撃した式神がそのマスへ移動する", midGame: true,
  },
  {
    key: "effects", group: "special", kind: "bool",
    label: "カード効果", desc: "カードの効果と霊具を使う(オフはルールだけの挙動)", midGame: true,
  },
];

const BY_KEY = new Map<string, ConfigField>(CONFIG_SCHEMA.map((f) => [f.key, f]));

export const fieldOf = (key: string): ConfigField | undefined => BY_KEY.get(key);

// -------------------------------------------------------------- validation

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Validates one value. Returns the cleaned copy, or an error message. */
export const checkFieldValue = (field: ConfigField, v: unknown): Parsed<unknown> => {
  const range = (lo: number, hi: number): string => `${field.label}は${lo}〜${hi}の整数にしてください`;
  switch (field.kind) {
    case "int":
      return isInt(v) && v >= field.min && v <= field.max
        ? { ok: true, value: v }
        : { ok: false, error: range(field.min, field.max) };
    case "optInt":
      if (v === null) return { ok: true, value: null };
      return isInt(v) && v >= field.min && v <= field.max
        ? { ok: true, value: v }
        : { ok: false, error: `${field.label}は「${field.nullLabel}」か${field.min}〜${field.max}の整数にしてください` };
    case "intPair":
      if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => isInt(x) && x >= field.min && x <= field.max)) {
        return { ok: false, error: `${field.label}は${field.min}〜${field.max}の整数2つにしてください` };
      }
      return { ok: true, value: [v[0], v[1]] };
    case "intList": {
      if (!Array.isArray(v) || v.length > field.maxLength) {
        return { ok: false, error: `${field.label}は${field.maxLength}個までの整数の並びにしてください` };
      }
      if (!v.every((x) => isInt(x) && x >= field.min && x <= field.max)) {
        return { ok: false, error: `${field.label}の各値は${field.min}〜${field.max}の整数にしてください` };
      }
      for (let i = 1; i < v.length; i++) {
        if ((v[i] as number) <= (v[i - 1] as number)) return { ok: false, error: `${field.label}は小さい順に並べてください` };
      }
      return { ok: true, value: (v as number[]).slice() };
    }
    case "choice":
      return typeof v === "string" && field.choices.some((c) => c.value === v)
        ? { ok: true, value: v }
        : { ok: false, error: `${field.label}の選択肢が不正です` };
    default:
      return typeof v === "boolean" ? { ok: true, value: v } : { ok: false, error: `${field.label}はオンかオフにしてください` };
  }
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type PatchOptions = {
  /** true = reject variables that cannot change during a match. */
  midGame: boolean;
};

/** Rebuilds a ConfigPatch from untrusted JSON: known keys only, every value checked. */
export const parseConfigPatch = (raw: unknown, opts: PatchOptions): Parsed<ConfigPatch> => {
  if (raw === undefined) return { ok: true, value: {} };
  if (!isObj(raw)) return { ok: false, error: "設定の形式が不正です" };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const field = fieldOf(k);
    if (field === undefined) return { ok: false, error: `不明な設定項目です: ${k.slice(0, 40)}` };
    if (opts.midGame && !field.midGame) {
      return { ok: false, error: `「${field.label}」は試合の途中では変更できません(次の試合から)` };
    }
    const checked = checkFieldValue(field, v);
    if (!checked.ok) return checked;
    out[k] = checked.value;
  }
  return { ok: true, value: out as ConfigPatch };
};

/** Relations between fields that single-value ranges cannot express. */
export const checkConfigRelations = (cfg: Config): string | null => {
  if (cfg.startMana[0] > cfg.manaCap || cfg.startMana[1] > cfg.manaCap) {
    return "初期霊力は霊力上限以下にしてください";
  }
  return null;
};

// ----------------------------------------------------------------- helpers

const copyValue = <T>(v: T): T => (Array.isArray(v) ? (v.slice() as T) : v);

export const sameValue = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
};

/** A new Config with the patch applied. Neither input is modified. */
export const applyConfigPatch = (cfg: Config, patch: ConfigPatch): Config => {
  const next: Config = { ...cfg, startMana: [cfg.startMana[0], cfg.startMana[1]], chipIncomeSteps: cfg.chipIncomeSteps.slice() };
  const rec = next as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (fieldOf(k) !== undefined && v !== undefined) rec[k] = copyValue(v);
  }
  return next;
};

export type ConfigChange = { key: PlayKey; from: unknown; to: unknown };

/** Schema-ordered list of the play variables that differ. */
export const configChanges = (before: Config, after: Config): ConfigChange[] => {
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;
  return CONFIG_SCHEMA.filter((f) => !sameValue(b[f.key], a[f.key])).map((f) => ({
    key: f.key,
    from: copyValue(b[f.key]),
    to: copyValue(a[f.key]),
  }));
};

/** The minimal patch that turns `base` into `cfg`. */
export const diffPatch = (base: Config, cfg: Config): ConfigPatch => {
  const out: Record<string, unknown> = {};
  for (const c of configChanges(base, cfg)) out[c.key] = c.to;
  return out as ConfigPatch;
};

/** Human-readable value, e.g. "3,4" / "なし" / "オン" / the choice label. */
export const formatConfigValue = (field: ConfigField, v: unknown): string => {
  switch (field.kind) {
    case "bool":
      return v === true ? "オン" : "オフ";
    case "choice":
      return field.choices.find((c) => c.value === v)?.label ?? String(v);
    case "optInt":
      return v === null ? field.nullLabel : String(v);
    case "intPair":
      return Array.isArray(v) ? `${field.parts[0]}${v[0]}・${field.parts[1]}${v[1]}` : String(v);
    case "intList":
      return Array.isArray(v) ? (v.length === 0 ? "なし" : v.join(",")) : String(v);
    default:
      return String(v);
  }
};

/** "収入 3→4" style text for one change. */
export const describeChange = (c: ConfigChange): string => {
  const field = fieldOf(c.key);
  if (field === undefined) return c.key;
  return `${field.label} ${formatConfigValue(field, c.from)}→${formatConfigValue(field, c.to)}`;
};

/** Plain-text table for the CLI help. */
export const schemaHelpText = (): string =>
  CONFIG_GROUPS.map((g) => {
    const rows = CONFIG_SCHEMA.filter((f) => f.group === g.id).map((f) => {
      const range =
        f.kind === "int" || f.kind === "intPair" || f.kind === "intList" || f.kind === "optInt"
          ? ` [${f.min}..${f.max}]`
          : f.kind === "choice"
            ? ` [${f.choices.map((c) => c.value).join("|")}]`
            : " [on|off]";
      return `  ${f.key.padEnd(32)} ${f.label}${range}${f.midGame ? "" : " (試合途中は不可)"}\n  ${"".padEnd(32)} ${f.desc}`;
    });
    return `${g.label}\n${rows.join("\n")}`;
  }).join("\n");
