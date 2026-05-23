# 異能学園総選挙 Reboot

default:
    @just --list

# ── セットアップ ──────────────────────────────────────────

# 全依存関係をインストール
setup:
    cd card-gen && uv sync
    cd game && npm install

# ── カード生成 ────────────────────────────────────────────

# PDFを生成 (card-gen/cards.pdf)
pdf:
    cd card-gen && uv run generate_cards.py

# カードリストMarkdownを生成 (data/cards.md)
md:
    cd card-gen && uv run generate_card_md.py

# ── ブラウザゲーム ────────────────────────────────────────

# 開発サーバーを起動 (http://localhost:5173)
dev:
    cd game && npm run dev

# テストを実行
test:
    cd game && npm run test:run

# テストをwatch modeで実行
test-watch:
    cd game && npm test

# プロダクションビルド
build:
    cd game && npm run build

# Firebase にデプロイ（ビルド済みでなければビルドしてから）
deploy: build
    firebase deploy
