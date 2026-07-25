# 仕様準拠エンジン改元

Status: **改元記録**

Generated: 2026-07-25T03:03:49.748Z

正本リポジトリとの照合で見つかったエンジン差を設定候補ではなく実装乖離として解消し、以後のデフォルト挙動を切り替えた。配置ルールだけでなく、太極・再命令・霊力・属性召喚・長期戦処理を同じ基準へ揃える。

## デフォルト変更

| 項目 | 旧エンジン | 新デフォルト |
|---|---|---|
| 太極軽減 | 太極占有中は全召喚−1、下限1 | 太極への手札通常召喚だけ−1、下限0 |
| 再命令枠 | 攻撃と回転が別枠 | 1体1ターン合計1回 |
| 回転 | 90/180/270度 | 左右90度 |
| 霊力上限 | 15 | なし |
| HP0以下の属性召喚 | 不可 | 合法、直後に撃破 |
| 未決着上限 | 80手番、生命差で暫定勝者 | 200手番、上限到達扱い |

旧挙動は `--legacy-engine` で再現できる。配置だけ旧挙動に戻す `--strict-summon` も引き続き独立して使用できる。

## 再凍結

- `docs\baselines\ver1-baseline.md`
- `docs\baselines\ver1-baseline-results.json`

過去baselineは再実行せず、旧エンジン紀元バナーを追加した。

バナー追加: 30ファイル

- `docs\baselines\c3-3-2-probe.md`
- `docs\baselines\deck-rules-v0.md`
- `docs\baselines\era-paper-migration.md`
- `docs\baselines\phase2a-main-search.md`
- `docs\baselines\phase2b-item-layer-v31.md`
- `docs\baselines\phase2b-item-layer.md`
- `docs\baselines\phase2d-rotate-attack.md`
- `docs\baselines\print-spec-paper.md`
- `docs\baselines\pure-vanilla-baseline-v3.1.md`
- `docs\baselines\pure-vanilla-baseline-v3.md`
- `docs\baselines\pure-vanilla-calibration-v2.md`
- `docs\baselines\pure-vanilla-calibration.md`
- `docs\baselines\pure-vanilla-v31-paper.md`
- `docs\baselines\r1-firstplayer-32k.md`
- `docs\baselines\react-cost-sweep.md`
- `docs\baselines\react-value-forked-v2.md`
- `docs\baselines\react-value-forked.md`
- `docs\baselines\rotation-cost-sensitivity-v1.md`
- `docs\baselines\shapes-0718-d1.md`
- `docs\baselines\shapes-0718-m.md`
- `docs\baselines\shapes-0718-print-confirmation.md`
- `docs\baselines\shapes-0718-t.md`
- `docs\baselines\shapes-0718.md`
- `docs\baselines\standard-mana-handicap.md`
- `docs\baselines\v4-ablation.md`
- `docs\baselines\v4-probe-paper.md`
- `docs\baselines\v4-probe.md`
- `docs\baselines\v41-tuning.md`
- `docs\baselines\vanilla-baseline-v1.1-r1.md`
- `docs\baselines\vanilla-baseline-v1.md`

## 保留

v4.1のATKレバー調整は保留。Ver1基準取得を先行した。

