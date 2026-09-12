# 実装済みの初期セットと、次に試す障害

最初は既存の時刻・状態変数・条件式・介入効果・証拠スナップショットで表せる3本を追加した。N+1は#001を再利用し、#002は容量増設が有効な対照デモとして残す。

## 主候補の順序

| 順序 | 候補 | 状態・実装判断 |
|---|---|---|
| 1 | N+1 Query Regression | #001を再利用。増設の遅延副作用が既にある |
| 2 | DB Deadlock Storm | #003。既存の時刻分岐でretryの短期改善と増幅を表現。停止範囲と競合順序の判断が加わる |
| 3 | Incompatible Schema Deployment | #004。旧版割合と互換性の状態を追加。rollbackの安全性が文脈で変わる |
| 4 | Retry Storm | #005。時間とretry制御を再利用。依存先復旧と自分たちの回復を区別する |
| 5 | Poison Message / Queue Backlog | 次の優先候補。depthだけでなく新規流入、成功処理、失敗再試行、DLQ隔離を別に積算する。consumer増設の浪費と隔離後の未処理業務を比較したい |
| 6 | Memory Leak | 次の優先候補。数時間のtrendを短時間で観察する時間尺度が必要。restartによるreset、増量で延びる再発時刻、顧客中断を分ける |
| 7 | Connection Pool Exhaustion | connection leakを第一候補にする。CPUと貸出中/待機中接続を分け、restartの軽減とleak修正を比較。#001との差を確保してから追加 |
| 8 | Long Transaction / Batch Lock | batch進捗と業務期限を導入してから。停止でAPIは回復するが締切を逃す判断を、単なる失敗率以外で扱う |
| 9 | Cache Stampede | TTL周期・同時miss・再生成を表す状態が必要。DB増強、TTL jitter、coalescing、古い値を返す許容の比較を置く |
| 10 | AWS Cost Explosion | excessive loggingを第一候補にする。サービスは初めから正常なので、費用予算と観測可能性を含む終了条件が必要。ログ削減による調査情報喪失を代償にする |

5以降は未実装。数だけ増やすために、queueをHTTP失敗率、数時間のmemory増加を3分の固定イベントへ置き換えない。#005の待ち行列排出も簡略化であり、queue教材を完成させたことにはならない。

## 追加候補のバックログ

以下もすべて未実装。優先度Bは現在のrequestモデルの拡張で検討しやすいもの、Cは整合性・複数作業・資源の所有範囲など、新しい表現が先に必要なもの。

| 候補 | 優先度 | 引き出したい判断・必要なモデル |
|---|---|---|
| Replica Lag / read-after-write | C | 書き込み成功と直後の読み取りを分離。primaryへ寄せる負荷と鮮度の取引 |
| Duplicate Event / non-idempotent consumer | C | 処理回数と業務上の副作用を分離。重複排除と取りこぼし |
| Out-of-order Event | C | event時刻と到着順を分離。古い更新の棄却と正当な遅延 |
| Dual Write Migration Failure | C | 片側成功・再実行・不整合の履歴。rollbackしても値は戻らない |
| Cutover / Backfill Race | C | backfill進捗と同時更新。停止時間、欠損、切替期限 |
| Partial Deployment | B | #004から派生。version差、routing、互換性のないworker間呼び出し |
| Feature Flag Misconfiguration | B | flag範囲と利用者分布。全停止と限定停止の影響差 |
| Secret Rotation Failure | B | old/new認証情報の有効期間と反映遅延。戻す対象を選ぶ |
| IAM Permission Drift | B | principalと操作別失敗。広い権限付与の副作用を明示する |
| Third-party Rate Limit | B | #005の派生。quota、正規trafficとretry、流量制御の代償 |
| Timeout Mismatch | B | 各層のdeadlineと残り時間。timeout延長が占有を増やす |
| Circuit Breaker Misconfiguration | B | #005の派生。half-open試行数、再開と再遮断の周期 |
| Hot Partition | C | 平均とpartition別の負荷。全体増設が効かない状態 |
| Scheduled Batch Overlap | C | 二つの進捗と期限。止めるbatchの選択 |
| Autoscaling Oscillation | C | 制御周期・起動遅延・cooldown。追従の速さと振動 |
| Noisy Neighbor | C | 共有資源と利用者別負荷。移動・隔離・費用 |
| Observability Aggregation Hides Hot Instance | B | 集約指標と個別分布。平均CPUだけで判断しない |
| False Correlation With Recent Deployment | B | 時間の一致と因果を分離。rollbackで機能だけ失う対照経路 |
| Multiple Simultaneous Causes | C | 独立した原因状態と部分回復。最初の原因発見後も残る影響 |

次の実装ではQueueとMemoryを優先しつつ、初期セットの試遊結果を先に読む。どの観測が情報を増やさず、どの分岐が暗記だけで通過できるかを確認してからモデルを増やす。
