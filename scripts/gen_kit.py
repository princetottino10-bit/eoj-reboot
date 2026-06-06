#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""異能学園総選挙 テストキット 統合印刷キット ビルド
  プレイマット(盤面2枚・プレイヤーボード・クイックリファレンス)と
  カード印刷キット(72枚)を1つのPDFに統合する。

  使い方:  python3 scripts/gen_kit.py
  出力:    oricard-testkit-kit.pdf  (プレイマット → カードの順で結合)
"""
import os
import runpy
import fitz  # PyMuPDF

ROOT = os.path.join(os.path.dirname(__file__), "..")
PLAYMAT = os.path.join(ROOT, "oricard-playmat.pdf")
CARDS   = os.path.join(ROOT, "oricard-testkit-printkit.pdf")
OUT     = os.path.join(ROOT, "oricard-testkit-kit.pdf")


def _run(script_name):
    """同ディレクトリの生成スクリプトを実行してPDFを出力させる"""
    path = os.path.join(os.path.dirname(__file__), script_name)
    runpy.run_path(path, run_name="__main__")


def main():
    # 1. 各パートを生成
    _run("gen_playmat.py")
    _run("gen_testkit_pdf.py")

    # 2. 結合（プレイマット → カード）
    out = fitz.open()
    for part in (PLAYMAT, CARDS):
        with fitz.open(part) as src:
            out.insert_pdf(src)
    out.save(OUT)
    n = out.page_count
    out.close()
    print(f"OK -> {OUT}")
    print(f"  total pages: {n}  (プレイマット + カード印刷キット)")


if __name__ == "__main__":
    main()
