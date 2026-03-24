import { ALL_ITEMS, ITEM_SETS } from '../data/cards';
import { V2_CHARACTERS } from '../data/cards-v2';
import { CARD_REVIEW_OVERRIDES } from '../data/review-overrides';
import type { Card, CharacterCard, Element, EffectType, Faction, ItemCard, SchoolClass } from '../types/card';

type ReviewRecord = {
  rating: number;
  comment: string;
  updatedAt: string;
};

type ReviewMap = Record<string, ReviewRecord>;

type ReviewCard = {
  id: string;
  card: Card;
  name: string;
  type: 'character' | 'item';
  manaCost: number;
  faction?: Faction;
  element?: Element;
  schoolClass?: SchoolClass;
  activateCost?: number;
  hp?: number;
  atk?: number;
  attackRange?: string;
  attackType?: string;
  keywords: string[];
  effectDescriptions: string[];
  effectGlossary: string[];
  itemSets: string[];
};

type FilterState = {
  search: string;
  type: 'all' | 'character' | 'item';
  faction: 'all' | Faction;
  cost: 'all' | '1' | '2' | '3' | '4' | '5';
  status: 'all' | 'reviewed' | 'pending';
};

const STORAGE_KEY = 'eoj-card-review-v1';

const FACTION_LABELS: Record<Faction, string> = {
  aggro: 'アグロ',
  tank: 'タンク',
  control: 'コントロール',
  synergy: 'シナジー',
  snipe: 'スナイプ',
  trick: 'トリック',
};

const ELEMENT_LABELS: Record<Element, string> = {
  faust: 'ファウスト',
  geist: 'ガイスト',
  licht: 'リヒト',
  nacht: 'ナハト',
  nicht: 'ニヒト',
};

const CLASS_LABELS: Partial<Record<SchoolClass, string>> = {
  combat: '戦闘',
  intel: '情報',
  medic: '医療',
  strategy: '戦略',
};

const ITEM_SET_LABELS: Record<string, string> = {
  A: 'A / 万能',
  B: 'B / 攻撃',
  C: 'C / 戦術',
  D: 'D / 持久',
};

const RANGE_LABELS: Record<string, string> = {
  front1: '前1',
  front_back: '前後',
  front2_line: '前2直線',
  front_row: '前列',
  magic: '魔法',
  snipe: '狙撃',
  cross: '十字',
  front_left: '前左',
  front_right: '前右',
};

const KEYWORD_LABELS: Record<string, string> = {
  protection: '防護: 受ける物理ダメージを1減らす。',
  dodge: '回避: 物理攻撃を受けない。魔法と貫通は受ける。',
  quickness: '先制: 攻撃時、先にダメージ処理を行う。',
  fortress: '要塞: 自分から攻撃できず、反撃のみ行う。',
  piercing: '貫通: protection を無視してダメージを与える。',
  summoning_lock: '召喚制限: 自分の盤面が4体以上の時だけ召喚できる。',
  reflect: '反射: 受けた魔法ダメージを攻撃側に返す。',
  anchor: '固定: push / pull / move で移動しない。',
  damage_link: 'ダメージ分散: 受けたダメージの半分を隣接味方へ分散する。',
  cover: 'カバー: 隣接味方への攻撃を代わりに受ける。',
  stealth: '潜伏: 攻撃が常にブラインド扱いになる。',
  pressure: '圧力: 隣接する敵の再行動コストを+1する。',
};

const EFFECT_LABELS: Partial<Record<EffectType, string>> = {
  damage: 'ダメージ: 対象のHPを指定値ぶん減らす。',
  heal: '回復: 対象のHPを指定値ぶん回復する。',
  buff_atk: 'ATK上昇: 対象のATKを指定値ぶん上げる。',
  debuff_atk: 'ATK低下: 対象のATKを指定値ぶん下げる。',
  rotate: '回転: 対象の向きを90度回す。',
  move: '移動: 対象を別のマスへ移す。',
  swap: '位置入替: 自分と対象、または対象同士の位置を入れ替える。',
  push: '押し出し: 対象を1マス遠ざける。端なら壁ダメージを受ける。',
  pull: '引き寄せ: 対象を1マス近づける。',
  draw: 'ドロー: 山札からカードを引く。',
  gain_mana: 'マナ獲得: 自分のマナを増やす。',
  steal_mana: 'マナ奪取: 相手のマナを減らし、自分のマナを増やす。',
  brainwash: '洗脳: 対象を行動済み・回転済みにし、洗脳状態にする。',
  freeze: '凍結: 次のターン、攻撃と回転ができなくなる。',
  direction_lock: '向き固定: 対象は回転できなくなる。',
  action_tax: '再行動コスト増加: 対象の再行動コストを上げる。',
  mark: 'マーク: スナイプ系カードが参照する目印を付与する。',
  grant_dodge: '回避付与: 回避キーワードを与える。',
  grant_protection: '防護付与: 防護キーワードを与える。',
  grant_piercing: '貫通付与: 貫通キーワードを与える。',
  grant_quickness: '先制付与: 先制キーワードを与える。',
  consume_markers: 'マーカー消費: 味方のマーカーを取り除いて効果を発動する。',
  discard_draw: '手札交換: 手札を捨てて引き直す。',
  skip_draw: 'ドロースキップ: ターン開始時の通常ドローを飛ばす。',
  reduce_activate_cost: '再行動コスト軽減: そのターンの再行動コストを下げる。',
  range_expand: '射程拡張: 条件を満たすと攻撃範囲が広がる。',
  exhaust_attack: '攻撃不能: このターンは攻撃できない。',
  field_quake: '属性反転: 盤面の属性を入れ替える。',
  field_swap: '属性交換: 2つのマスの属性を入れ替える。',
  element_corrupt: '属性汚染: 対象マスの属性を崩す。',
  piercing_damage: '貫通ダメージ: 防護を無視してダメージを与える。',
  discard_random: 'ランダム捨て札: 相手の手札をランダムに捨てさせる。',
  seal: '封印: 対象の能力を無効化する。',
  destroy_self: '自壊: 自分を破壊する。',
  copy_atk: 'ATKコピー: 対象のATKを自分に写す。',
  hp_swap: 'HP交換: 自分と対象の現在HPを入れ替える。',
  swap_enemies: '敵同士入替: 敵2体の位置を入れ替える。',
};

function isCharacter(card: Card): card is CharacterCard {
  return card.type === 'character';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value?: string): string {
  if (!value) return '未保存';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未保存';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function collectReviewCards(): ReviewCard[] {
  const itemSetMap = new Map<string, string[]>();
  for (const [setKey, items] of Object.entries(ITEM_SETS)) {
    for (const item of items) {
      const existing = itemSetMap.get(item.id) ?? [];
      if (!existing.includes(setKey)) existing.push(setKey);
      itemSetMap.set(item.id, existing);
    }
  }

  const activeItems = ALL_ITEMS.filter((item) => itemSetMap.has(item.id));

  const normalizeCard = (card: Card): ReviewCard => {
    const override = CARD_REVIEW_OVERRIDES[card.id];
    const effectGlossary = Array.from(
      new Set(
        card.effects
          .map((effect) => EFFECT_LABELS[effect.effect])
          .filter((label): label is string => Boolean(label)),
      ),
    );

    if (isCharacter(card)) {
      return {
        id: card.id,
        card,
        name: override?.name ?? card.name,
        type: 'character',
        manaCost: card.manaCost,
        faction: card.faction,
        element: card.element,
        schoolClass: card.schoolClass,
        activateCost: card.activateCost,
        hp: card.hp,
        atk: card.atk,
        attackRange: RANGE_LABELS[card.attackRange] ?? card.attackRange,
        attackType: card.attackType === 'physical' ? '物理' : '魔法',
        keywords: card.keywords,
        effectDescriptions: override?.effectDescriptions ?? card.effects.map((effect) => effect.description || `${effect.trigger}:${effect.effect}`),
        effectGlossary: override?.effectGlossary ?? effectGlossary,
        itemSets: [],
      };
    }

    const itemCard = card as ItemCard;
      return {
        id: itemCard.id,
        card: itemCard,
        name: override?.name ?? itemCard.name,
        type: 'item',
        manaCost: itemCard.manaCost,
        keywords: [],
        effectDescriptions: override?.effectDescriptions ?? itemCard.effects.map((effect) => effect.description || `${effect.trigger}:${effect.effect}`),
        effectGlossary: override?.effectGlossary ?? effectGlossary,
        itemSets: itemSetMap.get(itemCard.id) ?? [],
      };
    };

  return [...V2_CHARACTERS.map(normalizeCard), ...activeItems.map(normalizeCard)].sort((left, right) => {
    if (left.type !== right.type) return left.type === 'character' ? -1 : 1;
    if (left.type === 'character' && right.type === 'character' && left.faction && right.faction && left.faction !== right.faction) {
      return left.faction.localeCompare(right.faction);
    }
    if (left.manaCost !== right.manaCost) return left.manaCost - right.manaCost;
    return left.name.localeCompare(right.name, 'ja');
  });
}

export class CardReviewApp {
  private readonly cards = collectReviewCards();
  private readonly reviews: ReviewMap = this.loadReviews();
  private filterState: FilterState = {
    search: '',
    type: 'all',
    faction: 'all',
    cost: 'all',
    status: 'all',
  };
  private filteredCards: ReviewCard[] = [...this.cards];
  private selectedId = this.cards[0]?.id ?? '';

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    document.body.classList.add('review-mode');
    this.root.classList.add('review-app-root');
    this.syncSelectionFromUrl();
    this.filteredCards = this.getFilteredCards();
    if (!this.filteredCards.some((card) => card.id === this.selectedId)) {
      this.selectedId = this.filteredCards[0]?.id ?? this.cards[0]?.id ?? '';
    }
    this.rerender();
  }

  private loadReviews(): ReviewMap {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as ReviewMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveReviews(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.reviews));
  }

  private syncSelectionFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const cardId = params.get('card');
    if (cardId && this.cards.some((card) => card.id === cardId)) {
      this.selectedId = cardId;
    }
  }

  private updateUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'cards');
    if (this.selectedId) url.searchParams.set('card', this.selectedId);
    window.history.replaceState({}, '', url);
  }

  private getFilteredCards(): ReviewCard[] {
    return this.cards.filter((card) => {
      if (this.filterState.search) {
        const haystack = `${card.name} ${card.id}`.toLowerCase();
        if (!haystack.includes(this.filterState.search.toLowerCase())) return false;
      }
      if (this.filterState.type !== 'all' && card.type !== this.filterState.type) return false;
      if (this.filterState.faction !== 'all' && card.faction !== this.filterState.faction) return false;
      if (this.filterState.cost !== 'all' && String(card.manaCost) !== this.filterState.cost) return false;

      const review = this.reviews[card.id];
      const reviewed = Boolean(review && (review.rating > 0 || review.comment.trim()));
      if (this.filterState.status === 'reviewed' && !reviewed) return false;
      if (this.filterState.status === 'pending' && reviewed) return false;
      return true;
    });
  }

  private get selectedCard(): ReviewCard {
    return this.filteredCards.find((card) => card.id === this.selectedId)
      ?? this.cards.find((card) => card.id === this.selectedId)
      ?? this.filteredCards[0]
      ?? this.cards[0];
  }

  private get selectedReview(): ReviewRecord {
    return this.reviews[this.selectedCard.id] ?? { rating: 0, comment: '', updatedAt: '' };
  }

  private render(): string {
    const selected = this.selectedCard;
    const review = this.selectedReview;
    const reviewedCount = Object.values(this.reviews).filter((entry) => entry.rating > 0 || entry.comment.trim()).length;
    const selectedIndex = this.filteredCards.findIndex((card) => card.id === selected.id);

    return `
      <div class="review-shell">
        <header class="review-header">
          <div>
            <p class="review-kicker">EoJ Reboot</p>
            <h1 class="review-title">カードレビュー</h1>
            <p class="review-subtitle">スマホ前提の1枚レビュー。星評価とコメントは端末に保存されます。</p>
          </div>
          <div class="review-progress">
            <div class="review-progress-chip">${reviewedCount} / ${this.cards.length} レビュー済み</div>
            <div class="review-progress-chip">表示中 ${this.filteredCards.length} 枚</div>
            <button type="button" class="review-export-button" data-action="export-reviews">レビューJSONを保存</button>
          </div>
        </header>
        ${this.renderFilters()}
        <div class="review-layout">
          <aside class="review-list-panel" aria-label="カード一覧">
            <div class="review-list-header">
              <h2>カード一覧</h2>
              <span>${escapeHtml(selected.name)}</span>
            </div>
            ${this.renderList()}
          </aside>
          <section class="review-detail-panel" aria-label="カード詳細">
            ${this.renderDetail(selected, review, selectedIndex)}
          </section>
        </div>
      </div>
    `;
  }

  private renderFilters(): string {
    return `
      <section class="review-filters" aria-label="フィルター">
        <label class="review-filter search">
          <span>検索</span>
          <input type="search" id="review-search" value="${escapeHtml(this.filterState.search)}" placeholder="カード名 / ID" />
        </label>
        <label class="review-filter">
          <span>種類</span>
          <select id="review-type">
            ${this.renderOption(this.filterState.type, 'all', '全部')}
            ${this.renderOption(this.filterState.type, 'character', 'キャラ')}
            ${this.renderOption(this.filterState.type, 'item', 'アイテム')}
          </select>
        </label>
        <label class="review-filter">
          <span>派閥</span>
          <select id="review-faction">
            ${this.renderOption(this.filterState.faction, 'all', '全部')}
            ${Object.entries(FACTION_LABELS).map(([value, label]) => this.renderOption(this.filterState.faction, value, label)).join('')}
          </select>
        </label>
        <label class="review-filter">
          <span>コスト</span>
          <select id="review-cost">
            ${this.renderOption(this.filterState.cost, 'all', '全部')}
            ${[1, 2, 3, 4, 5].map((cost) => this.renderOption(this.filterState.cost, String(cost), `C${cost}`)).join('')}
          </select>
        </label>
        <label class="review-filter">
          <span>レビュー</span>
          <select id="review-status">
            ${this.renderOption(this.filterState.status, 'all', '全部')}
            ${this.renderOption(this.filterState.status, 'reviewed', 'レビュー済み')}
            ${this.renderOption(this.filterState.status, 'pending', '未レビュー')}
          </select>
        </label>
      </section>
    `;
  }

  private renderOption(currentValue: string, optionValue: string, label: string): string {
    return `<option value="${optionValue}"${currentValue === optionValue ? ' selected' : ''}>${label}</option>`;
  }

  private renderList(): string {
    if (!this.filteredCards.length) {
      return '<div class="review-empty-list">条件に合うカードがありません。</div>';
    }

    return `
      <div class="review-card-list">
        ${this.filteredCards.map((card) => {
          const review = this.reviews[card.id];
          const selected = card.id === this.selectedCard.id;
          const subtitle = card.type === 'character'
            ? `${FACTION_LABELS[card.faction!]} / C${card.manaCost}`
            : `${card.itemSets.map((setKey) => ITEM_SET_LABELS[setKey] ?? setKey).join(' ・ ')} / C${card.manaCost}`;
          return `
            <button type="button" class="review-list-card${selected ? ' is-selected' : ''}" data-card-id="${card.id}">
              <span class="review-list-card-name">${escapeHtml(card.name)}</span>
              <span class="review-list-card-subtitle">${escapeHtml(subtitle || 'アイテム')}</span>
              <span class="review-list-card-meta">
                <span>${card.type === 'character' ? 'CHAR' : 'ITEM'}</span>
                <span>${review?.rating ? `★${review.rating}` : '未評価'}</span>
              </span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderDetail(card: ReviewCard, review: ReviewRecord, index: number): string {
    const badges: string[] = [card.type === 'character' ? 'キャラクター' : 'アイテム', `C${card.manaCost}`];
    if (card.faction) badges.push(FACTION_LABELS[card.faction]);
    if (card.element) badges.push(ELEMENT_LABELS[card.element]);
    if (card.schoolClass) badges.push(CLASS_LABELS[card.schoolClass] ?? card.schoolClass);
    if (card.itemSets.length) badges.push(...card.itemSets.map((setKey) => ITEM_SET_LABELS[setKey] ?? setKey));

    const stats = isCharacter(card.card)
      ? [
          ['HP', String(card.hp ?? '-')],
          ['ATK', String(card.atk ?? '-')],
          ['aC', String(card.activateCost ?? '-')],
          ['射程', card.attackRange ?? '-'],
          ['攻撃', card.attackType ?? '-'],
        ]
      : [
          ['コスト', `C${card.manaCost}`],
          ['採用セット', card.itemSets.map((setKey) => ITEM_SET_LABELS[setKey] ?? setKey).join(' / ') || '-'],
        ];

    const keywords = card.keywords.length
      ? card.keywords.map((keyword) => KEYWORD_LABELS[keyword] ?? keyword)
      : ['なし'];
    const effects = card.effectDescriptions.length ? card.effectDescriptions : ['効果なし'];
    const effectGlossary = card.effectGlossary.length ? card.effectGlossary : ['なし'];

    return `
      <div class="review-detail-card">
        <div class="review-detail-head">
          <div>
            <p class="review-kicker">Card ${index + 1} / ${this.filteredCards.length}</p>
            <h2 class="review-detail-title">${escapeHtml(card.name)}</h2>
          </div>
          <div class="review-detail-badges">
            ${badges.map((badge) => `<span class="review-badge">${escapeHtml(badge)}</span>`).join('')}
          </div>
        </div>

        <div class="review-stats">
          ${stats.map(([label, value]) => `
            <div class="review-stat">
              <span class="review-stat-label">${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `).join('')}
        </div>

        <div class="review-rating-box">
          <div>
            <h3>評価</h3>
            <p>星だけ付けても、コメントだけ残しても大丈夫です。</p>
          </div>
          <div class="review-stars" role="group" aria-label="星評価">
            ${[1, 2, 3, 4, 5].map((value) => `
              <button
                type="button"
                class="review-star${review.rating >= value ? ' is-active' : ''}"
                data-action="set-rating"
                data-rating="${value}"
                aria-label="${value}つ星"
              >★</button>
            `).join('')}
            <button type="button" class="review-clear-rating" data-action="clear-rating">クリア</button>
          </div>
        </div>

        <label class="review-comment-box">
          <span>コメント</span>
          <textarea id="review-comment" rows="8" placeholder="強い・弱い・気になる点・リデザイン案など">${escapeHtml(review.comment)}</textarea>
          <small>最終保存: ${formatDate(review.updatedAt)}</small>
        </label>

        <div class="review-section-grid">
          <section class="review-section">
            <h3>キーワード</h3>
            <ul>${keywords.map((keyword) => `<li>${escapeHtml(keyword)}</li>`).join('')}</ul>
          </section>
          <section class="review-section">
            <h3>効果語の意味</h3>
            <ul>${effectGlossary.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>
          </section>
          <section class="review-section">
            <h3>効果</h3>
            <ul>${effects.map((effect) => `<li>${escapeHtml(effect)}</li>`).join('')}</ul>
          </section>
        </div>

        <div class="review-navigation">
          <button type="button" data-action="prev-card">前のカード</button>
          <button type="button" data-action="next-unreviewed">次の未レビュー</button>
          <button type="button" data-action="next-card">次のカード</button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    this.root.onclick = (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const cardButton = target.closest<HTMLElement>('[data-card-id]');
      if (cardButton?.dataset.cardId) {
        this.selectedId = cardButton.dataset.cardId;
        this.updateUrl();
        this.rerender(true);
        return;
      }

      const actionButton = target.closest<HTMLElement>('[data-action]');
      if (!actionButton) return;

      switch (actionButton.dataset.action) {
        case 'set-rating':
          this.updateReview({
            rating: Number(actionButton.dataset.rating || '0'),
          });
          return;
        case 'clear-rating':
          this.updateReview({ rating: 0 });
          return;
        case 'prev-card':
          this.stepSelection(-1);
          return;
        case 'next-card':
          this.stepSelection(1);
          return;
        case 'next-unreviewed':
          this.selectNextUnreviewed();
          return;
        case 'export-reviews':
          this.exportReviews();
          return;
        default:
          return;
      }
    };

    this.root.oninput = (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (!target) return;

      if (target.id === 'review-comment') {
        this.updateReview({ comment: target.value }, false);
        return;
      }

      if (target.id === 'review-search') this.filterState.search = target.value;
      if (target.id === 'review-type') this.filterState.type = target.value as FilterState['type'];
      if (target.id === 'review-faction') this.filterState.faction = target.value as FilterState['faction'];
      if (target.id === 'review-cost') this.filterState.cost = target.value as FilterState['cost'];
      if (target.id === 'review-status') this.filterState.status = target.value as FilterState['status'];

      if (target.id.startsWith('review-')) {
        this.filteredCards = this.getFilteredCards();
        if (!this.filteredCards.some((card) => card.id === this.selectedId)) {
          this.selectedId = this.filteredCards[0]?.id ?? this.cards[0]?.id ?? '';
        }
        this.updateUrl();
        this.rerender(false);
      }
    };
  }

  private updateReview(patch: Partial<ReviewRecord>, rerender = true): void {
    const current = this.selectedReview;
    this.reviews[this.selectedCard.id] = {
      rating: patch.rating ?? current.rating,
      comment: patch.comment ?? current.comment,
      updatedAt: new Date().toISOString(),
    };
    this.saveReviews();
    if (rerender) this.rerender(false);
  }

  private stepSelection(delta: number): void {
    if (!this.filteredCards.length) return;
    const currentIndex = this.filteredCards.findIndex((card) => card.id === this.selectedCard.id);
    const nextIndex = (currentIndex + delta + this.filteredCards.length) % this.filteredCards.length;
    this.selectedId = this.filteredCards[nextIndex].id;
    this.updateUrl();
    this.rerender(true);
  }

  private selectNextUnreviewed(): void {
    if (!this.filteredCards.length) return;
    const startIndex = this.filteredCards.findIndex((card) => card.id === this.selectedCard.id);
    for (let offset = 1; offset <= this.filteredCards.length; offset += 1) {
      const index = (startIndex + offset + this.filteredCards.length) % this.filteredCards.length;
      const candidate = this.filteredCards[index];
      const review = this.reviews[candidate.id];
      const reviewed = Boolean(review && (review.rating > 0 || review.comment.trim()));
      if (!reviewed) {
        this.selectedId = candidate.id;
        this.updateUrl();
        this.rerender(true);
        return;
      }
    }
  }

  private exportReviews(): void {
    const blob = new Blob([JSON.stringify(this.reviews, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eoj-card-reviews-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private rerender(scrollListSelection = false): void {
    this.root.innerHTML = this.render();
    this.bindEvents();
    if (scrollListSelection) {
      this.root.querySelector<HTMLElement>(`[data-card-id="${this.selectedCard.id}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }
}
