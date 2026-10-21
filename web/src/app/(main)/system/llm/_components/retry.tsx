"use client";

// LLM 重试配置的共用件：五层重试各自的「次数 + 间隔」。
//
// 五层从内到外：建连(SDK) → 空响应(SDK) → 同 provider 安全窗口 → ローテーションのサーキットブレーカー → 意図の再実行。
// 前三层跟着端点走，所以每个模型配置都能覆盖全局默认。后两层是进程级的，只有全局一份。
//
// 所有输入都遵循同一套「留空 = 不配置」语义，与后端 db.RetryRule 一致：
//   次数   空/0 = 用内置デフォルト | -1 = 关闭这层重试 | >0 = 用这个次数
//   间隔   空/0 = 用这层原本的指数退避 | >0 = 改用这个固定毫秒间隔

import * as React from "react";

import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { LLMRetryOverride, LLMRetryPolicy, LLMRetryRule } from "@/lib/types";

export const ZERO_RULE: LLMRetryRule = { attempts: 0, interval_ms: 0 };
export const ZERO_OVERRIDE: LLMRetryOverride = {
  connect: ZERO_RULE,
  empty: ZERO_RULE,
  stream: ZERO_RULE,
};
const ZERO_POLICY: LLMRetryPolicy = {
  ...ZERO_OVERRIDE,
  breaker: ZERO_RULE,
  intent: ZERO_RULE,
};

type LayerMeta = {
  title: string;
  /** 这层重试发生在哪、由谁执行 */
  where: string;
  /** 什么样的错误会走到这层——具体到状态码，别让人猜 */
  trigger: string;
  /** 长得像但【不】走这层的错误，省得填了没反应还以为是 bug */
  skips?: string;
  desc: string;
  attemptsLabel: string;
  /** 次数留空时的デフォルト値，用于占位符 */
  defAttempts: number;
  /** 间隔留空时的默认策略，用于占位符 */
  defInterval: string;
  /** 次数填 -1 的含义 */
  offHint: string;
};

export const RETRY_LAYERS = {
  connect: {
    title: "接続確立時の再試行",
      where: "SDK · HTTP 200を受け取る前",
    trigger:
      "HTTP 200を受け取る前の接続リセット、読み書きのタイムアウト、DNSエラーなどのネットワークエラーと、HTTP 408、429、500、502、503、504が対象です。",
      skips: "その他のステータスコード（400 / 401 / 403 / 404 / 413 / 422など）は確定的な拒否です。再試行しても失敗するため、そのままエラーを返します。",
      desc: "同じリクエストをそのまま再送します。HTTP 200を受け取ってストリームが始まった後の切断は、この段階では再試行しません。",
    attemptsLabel: "再試行回数",
    defAttempts: 3,
      defInterval: "0.5秒→1秒→2秒の指数バックオフ（最大8秒）",
      offHint: "-1 = 再試行せず、失敗をすぐに返す",
  },
  empty: {
    title: "空の応答の再試行",
      where: "SDK · openai形式のみ",
    trigger:
      "HTTP 200と正常なfinish_reason（stop）を受け取ったものの、応答に内容がない場合が対象です。ゲートウェイの空フレームや思考フィールドの欠落などが該当します。",
      skips: "max_tokensによる切り詰めで内容がない場合は対象外です。出力上限を調整してください。再送しても同じ結果になる可能性があります。",
      desc: "プロンプト全体を再送するため、長いコンテキストではコストが高くなります。回数は少なめに設定してください。",
    attemptsLabel: "再試行回数",
    defAttempts: 2,
      defInterval: "0.5秒→1秒→2秒の指数バックオフ（最大8秒）",
      offHint: "-1 = 空の応答をそのまま返す",
  },
  stream: {
    title: "同一プロバイダーでの安全な再試行",
      where: "ARTEX · 出力を呼び出し元に返す前",
    trigger:
      "HTTP 200を受け取ってストリームを開始した後、出力を呼び出し元に返す前に接続が切れた場合、プロバイダーが過負荷の場合、またはストリーム内で429 / 5xxエラーが発生した場合が対象です。",
    skips:
      "402 / insufficient_quotaはローテーションで別の設定に切り替え、413 / context lengthは圧縮で処理します。400 / 401 / 403 / 404 / 422などの確定的な拒否も再試行しません。",
      desc: "同じ設定でリクエストを再送します。まだ出力を返していない段階のため、モデル出力やツール実行は重複しません。",
    attemptsLabel: "再試行回数",
    defAttempts: 2,
      defInterval: "0.5秒→1秒の指数バックオフ（最大4秒）",
      offHint: "-1 = ストリーム切断を外側の意図再実行に引き渡す",
  },
  breaker: {
    title: "ローテーションのサーキットブレーカー",
      where: "ARTEX · プロセス全体で共通",
    trigger:
      "429、5xx、ネットワークエラーなどの一時的な失敗がしきい値まで連続すると作動します。残高不足（402）、無効なキー（401 / 403）、モデルが存在しない（404）などの確定的な失敗では初回で作動します。",
      skips: "一度成功すると失敗回数はリセットされます。",
      desc: "作動後はクールダウンに入り、その間ローテーションでこの設定をスキップします。状態は保存され、再起動後も維持されます。",
    attemptsLabel: "連続失敗のしきい値",
    defAttempts: 3,
      defInterval: "1分→5分→30分の段階式",
      offHint: "-1 = 一時的な失敗では作動しない（確定的な失敗では作動）",
  },
  intent: {
    title: "意図の再実行",
      where: "ARTEX · プロセス全体で共通",
    trigger:
      "内側の再試行を使い切った場合、または出力を返し始めた後に切断されて安全に再送できない場合、workerはmodel_errorで終了します。この段階では処理全体を再実行します。",
      skips: "残高不足はローテーションで別設定に切り替えるため、ここでは再実行しません。タスクが一時停止、終了、または後処理に入ると、待機時間を消費せず中断します。",
      desc: "意図全体を最初から再実行します。最も外側の段階のため、再実行すると内側の各段階も再度実行されます。",
    attemptsLabel: "再実行回数",
    defAttempts: 2,
    defInterval: "固定 3s",
      offHint: "-1 = 再実行せず、意図をblockedとして終了",
  },
} satisfies Record<string, LayerMeta>;

type LayerKey = keyof typeof RETRY_LAYERS;

/** 毫秒的人话，只用于在输入框旁边回显，免得数零。 */
function humanMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Number((ms / 1000).toFixed(2))}s`;
  return `${Number((ms / 60_000).toFixed(2))}min`;
}

/** 受控数字输入：空串 ↔ 0，中间态（"-"、"1e"）原样留在本地，不打扰父级。 */
function NumField({
  id,
  value,
  onChange,
  placeholder,
  min,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  placeholder: string;
  min: number;
}) {
  const [text, setText] = React.useState(value === 0 ? "" : String(value));
  // 父级换了一整套值（读取到策略、切换配置）时跟上。自己敲字时不会走到这里，
  // 因为那时 value 已经等于本地文本 parse 后的结果。
  React.useEffect(() => {
    const incoming = value === 0 ? "" : String(value);
    setText((cur) => (Number(cur || 0) === value ? cur : incoming));
  }, [value]);
  return (
    <Input
      id={id}
      type="number"
      min={min}
      className="w-28 shrink-0"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? 0 : Math.trunc(n));
      }}
    />
  );
}

/** 一层重试的两个旋钮。idPrefix 用来在同一页出现多次时保住 label 的 htmlFor。 */
export function RetryRuleFields({
  layer,
  idPrefix,
  value,
  onChange,
  compact,
}: {
  layer: LayerKey;
  idPrefix: string;
  value: LLMRetryRule;
  onChange: (r: LLMRetryRule) => void;
  /** true = 配置抽屉里的紧凑版：省掉展开说明，只留「什么错误会走到这层」这一句 */
  compact?: boolean;
}) {
  const meta = RETRY_LAYERS[layer];
  const human = humanMs(value.interval_ms);
  return (
    <div className={compact ? "grid gap-2" : "grid gap-3 rounded-lg border p-3"}>
      <div className="grid gap-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <Label className="text-sm">{meta.title}</Label>
          <span className="text-muted-foreground text-xs">{meta.where}</span>
        </div>
        {/* 哪些错误会走到这层，具体到状态码——填了旋钮却看不到效果，多半是错误压根不落在这层。 */}
        <p className="text-muted-foreground text-xs">
          <span className="font-medium text-foreground">発生条件</span>：{meta.trigger}
        </p>
        {!compact && meta.skips && (
          <p className="text-muted-foreground text-xs">
            <span className="font-medium text-foreground">この段階で処理しない条件</span>：{meta.skips}
          </p>
        )}
        {!compact && <p className="text-muted-foreground text-xs">{meta.desc}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-${layer}-n`} className="text-muted-foreground text-xs">
            {meta.attemptsLabel}
          </Label>
          <NumField
            id={`${idPrefix}-${layer}-n`}
            min={-1}
            value={value.attempts}
            placeholder={`デフォルト ${meta.defAttempts}`}
            onChange={(n) => onChange({ ...value, attempts: n })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-${layer}-ms`} className="text-muted-foreground text-xs">
            間隔（ms）
          </Label>
          <NumField
            id={`${idPrefix}-${layer}-ms`}
            min={0}
            value={value.interval_ms}
            placeholder="デフォルトの待機時間"
            onChange={(n) => onChange({ ...value, interval_ms: n })}
          />
          <span className="text-muted-foreground text-xs">{human ? `固定 ${human}` : meta.defInterval}</span>
        </div>
      </div>
      {!compact && <p className="text-muted-foreground text-xs">空欄の場合はデフォルトを使用。{meta.offHint}。</p>}
    </div>
  );
}

/** 模型配置抽屉里的三层覆盖（跟着端点走的那三层）。 */
export function ProfileRetryFields({
  value,
  onChange,
}: {
  value: LLMRetryOverride;
  onChange: (o: LLMRetryOverride) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-0.5">
        <Label className="text-sm">再試行の上書き設定</Label>
        <p className="text-muted-foreground text-xs">
          この設定にのみ適用し、「再試行と待機」の全体デフォルトを上書きします。空欄の場合は全体設定に従います。回数に-1を指定すると、この段階の再試行を無効にします。
          間隔を指定すると、指数バックオフの代わりに固定間隔を使用します。サーキットブレーカーと意図の再実行はプロセス全体の設定で、全体設定画面でのみ変更できます。
        </p>
      </div>
      {(["connect", "empty", "stream"] as const).map((k) => (
        <div key={k} className="border-t pt-3 first:border-t-0 first:pt-0">
          <RetryRuleFields
            compact
            layer={k}
            idPrefix="pf"
            value={value[k]}
            onChange={(r) => onChange({ ...value, [k]: r })}
          />
        </div>
      ))}
    </div>
  );
}

/** 「再試行と待機」tab：五层的全局デフォルト値。 */
export function RetryPolicyPanel() {
  const [policy, setPolicy] = React.useState<LLMRetryPolicy>(ZERO_POLICY);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.llmRetryPolicy();
      setPolicy({ ...ZERO_POLICY, ...p });
    } catch (e) {
      toast.error(`再試行ポリシーの読み込みに失敗しました：${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      // 后端会把越界值夹回区间并回传，直接用回传值刷新，所见即所存。
      const saved = await api.saveLLMRetryPolicy(policy);
      setPolicy({ ...ZERO_POLICY, ...saved });
      toast.success("保存しました。すぐに有効になります（実行中の呼び出しには現在の設定が適用されます）");
    } catch (e) {
      toast.error(`保存に失敗しました：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: LayerKey) => (r: LLMRetryRule) => setPolicy((p) => ({ ...p, [k]: r }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-10 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" /> 再試行ポリシーを読み込み中…
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-xs leading-relaxed">
            1回のモデル呼び出しでは、内側から順に5段階で再試行します:
            <span className="text-foreground"> 接続確立 → 空の応答 → 同一プロバイダーでの安全な再試行 → ローテーションのサーキットブレーカー → 意図の再実行</span>
            。内側の再試行を使い切ってから外側に進みます。各段階の回数は掛け合わされるため、上限を大きくすると一時的な障害でもリクエスト数が増える場合があります。
            すべて空欄の場合は現在のデフォルトが適用され、この設定画面がない場合と同じ動作です。内側の3段階はモデル設定ごとに上書きできます。
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(RETRY_LAYERS) as LayerKey[]).map((k) => (
          <RetryRuleFields key={k} layer={k} idPrefix="gl" value={policy[k]} onChange={set(k)} />
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          保存
        </Button>
        <Button variant="outline" onClick={() => setPolicy(ZERO_POLICY)} disabled={saving}>
          すべてデフォルトに戻す
        </Button>
      </div>
    </div>
  );
}
