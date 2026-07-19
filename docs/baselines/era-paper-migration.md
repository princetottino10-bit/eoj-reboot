# era-paper-migration

Status: **完了**
Date: 2026-07-19T10:01:47.843Z

## 0. 改元記録

2026-07-19のユーザー裁定により、召喚配置は紙ルール（敵味方問わず隣接）が正式になった。従来の自軍隣接のみの測定はstrict紀元として仕分け、以後の現行判断にはpaper紀元の測定を使う。

- anyAdjacentSummon既定値: true（paper）。旧strictは `--strict-summon` で再現可能。
- 回帰確認: P-1と旧B1は 一致。
- KPI帯は未改訂。チームの4軸議論が終わるまで、旧帯との乖離は記述のみ。

## 1. paper紀元の柱

| 柱 | 構成 | 平均R | 先手 | 撃破/試合 | 占拠 | 生命 | 4チェック返し | ファイル |
|---|---|---:|---:|---:|---:|---:|---:|---|
| P-1 | 印刷仕様+紙 | 12.23 | 50.7% | 9.89 | 91.0% | 8.0% | 62.5% | `docs\baselines\print-spec-paper.md` |
| P-2 | v3.1素体+紙 | 13.49 | 51.0% | 13.03 | 73.1% | 26.9% | 71.0% | `docs\baselines\pure-vanilla-v31-paper.md` |
| P-3 | v4構成+紙 | 13.37 | 55.3% | 14.12 | 60.4% | 38.6% | 77.5% | `docs\baselines\v4-probe-paper.md` |

## 2. 初見

P-1が現行ゲームの正基準。旧strict印刷仕様から見ると、紙ルールは平均ラウンドを +4.05R、撃破を +5.40/試合動かした。先手勝率は -0.2pt で、2000試合の誤差幅内に収まる。

P-2は数値基盤の紙ルール版。旧v3.1 strict比で先手勝率は +2.3pt。2000試合では確定判定できないが、少なくとも大崩れはしていないかをここで監視する。

P-3はv4方向のpaper版。strict v4比で平均 +1.30R、撃破 +2.78/試合。v4の採否判断はせず、paper紀元上の切り分け材料として扱う。

## 3. strict紀元バナー対象


## 4. 再現情報

```powershell
node scripts\explore-stat-curves.cjs --era-paper --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `0f6324f195ccfc47bc5a11673b101fed0517988c` |
| Script SHA256 | `d1c49189122ed7372380c0138e1280a52df6f3e99052af8499eeb092924eea84` |
| Games per run | 2000 |
| Seed | 20260702 |
| Oracle / depth | yes / 6 |
