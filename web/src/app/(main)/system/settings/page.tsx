"use client";

import * as React from "react";

import { CpuIcon, FlaskConicalIcon, KeyboardIcon, RadioTowerIcon, SearchIcon, ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { CHAT_SEND_MODE_OPTIONS, type ChatSendMode, setChatSendMode, useChatSendMode } from "@/lib/chat-send-mode";
import type { Settings } from "@/lib/types";

import { UpdateCard } from "./_components/update-card";

export default function SystemSettingsPage() {
  const [trafficCapture, setTrafficCapture] = React.useState(false);
  const [agentTrafficBinding, setAgentTrafficBinding] = React.useState(false);
  const [webSearch, setWebSearch] = React.useState(false);
  const [backend, setBackend] = React.useState("ddgs");
  const [braveKeySet, setBraveKeySet] = React.useState(false);
  const [braveKeyInput, setBraveKeyInput] = React.useState("");
  const [tavilyKeySet, setTavilyKeySet] = React.useState(false);
  const [tavilyKeyInput, setTavilyKeyInput] = React.useState("");
  const [savingTavilyKey, setSavingTavilyKey] = React.useState(false);
  const [proxyInput, setProxyInput] = React.useState("");
  const [savingProxy, setSavingProxy] = React.useState(false);
  const [globalProxyInput, setGlobalProxyInput] = React.useState("");
  const [savingGlobalProxy, setSavingGlobalProxy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState(false);
  const [pyInterp, setPyInterp] = React.useState("");
  const [workers, setWorkers] = React.useState("3");
  const [savingWorkers, setSavingWorkers] = React.useState(false);
  // 操作制約の注入范围(默认都开)。
  const [injectPlanner, setInjectPlanner] = React.useState(true);
  const [injectWorker, setInjectWorker] = React.useState(true);
  // 試験的な機能:noa コンテキスト圧縮(默认关)。
  const [noaCompaction, setNoaCompaction] = React.useState(false);
  // 纯前端偏好：不走 /api/settings，直接读写 localStorage。
  const sendMode = useChatSendMode();

  const apply = React.useCallback((s: Settings) => {
    setTrafficCapture(!!s.traffic_capture);
    setAgentTrafficBinding(!!s.agent_traffic_binding);
    setWebSearch(!!s.web_search_enabled);
    setBackend(s.web_search_backend || "ddgs");
    setBraveKeySet(!!s.brave_key_set);
    setTavilyKeySet(!!s.tavily_key_set);
    setProxyInput(s.web_search_proxy ?? "");
    setGlobalProxyInput(s.global_proxy ?? "");
    setPyInterp(s.python_interpreter ?? "");
    setWorkers(String(s.workers ?? 3));
    setInjectPlanner(s.constraints_inject_planner !== false);
    setInjectWorker(s.constraints_inject_worker !== false);
    setNoaCompaction(!!s.noa_compaction);
  }, []);

  const saveWorkers = () => {
    const n = Number(workers);
    if (!Number.isInteger(n) || n <= 0) {
      toast.error("同時実行数は1以上の整数を指定してください");
      return;
    }
    setSavingWorkers(true);
    api
      .setSettings({ workers: n })
      .then((s) => {
        apply(s);
        toast.success("Work Agentの同時実行数を保存しました（今後開始するタスクに適用されます）");
      })
      .catch((e) => toast.error("保存に失敗しました：" + (e as Error).message))
      .finally(() => setSavingWorkers(false));
  };

  const savePython = () => {
    setSaving(true);
    api
      .setSettings({ python_interpreter: pyInterp.trim() })
      .then((s) => {
        apply(s);
        toast.success("Pythonインタープリターの設定を保存しました");
      })
      .catch((e) => toast.error("保存に失敗しました：" + (e as Error).message))
      .finally(() => setSaving(false));
  };
  const detectPython = () => {
    setSaving(true);
    api
      .detectPython()
      .then((r) => setPyInterp(r.python_interpreter))
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  React.useEffect(() => {
    api
      .settings()
      .then(apply)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [apply]);

  const toggleTraffic = (v: boolean) => {
    setTrafficCapture(v); // optimistic
    setSaving(true);
    api
      .setSettings({ traffic_capture: v })
      .then(apply)
      .catch(() => setTrafficCapture(!v)) // revert on failure
      .finally(() => setSaving(false));
  };

  const toggleInjectPlanner = (v: boolean) => {
    setInjectPlanner(v); // optimistic
    api
      .setSettings({ constraints_inject_planner: v })
      .then(apply)
      .catch(() => setInjectPlanner(!v)); // revert on failure
  };

  const toggleAgentTrafficBinding = (v: boolean) => {
    setAgentTrafficBinding(v);
    setSaving(true);
    api
      .setSettings({ agent_traffic_binding: v })
      .then((s) => {
        apply(s);
        toast.success(v ? "Agentによるトラフィックの自動関連付けを有効にしました" : "Agentによるトラフィックの自動関連付けを無効にしました");
      })
      .catch((e) => {
        setAgentTrafficBinding(!v);
        toast.error(`保存に失敗しました：${(e as Error).message}`);
      })
      .finally(() => setSaving(false));
  };

  const toggleInjectWorker = (v: boolean) => {
    setInjectWorker(v); // optimistic
    api
      .setSettings({ constraints_inject_worker: v })
      .then(apply)
      .catch(() => setInjectWorker(!v)); // revert on failure
  };

  const toggleNoaCompaction = (v: boolean) => {
    setNoaCompaction(v); // optimistic
    api
      .setSettings({ noa_compaction: v })
      .then((s) => {
        apply(s);
        toast.success(v ? "noaコンテキスト圧縮を有効にしました（今後開始する実行に適用されます）" : "noaコンテキスト圧縮を無効にしました（組み込みの圧縮に戻ります）");
      })
      .catch((e) => {
        setNoaCompaction(!v); // revert on failure
        toast.error(`保存に失敗しました：${(e as Error).message}`);
      });
  };

  // Persist a web-search patch (enable and/or backend). Optimistic with refetch.
  const saveWebSearch = (patch: Partial<Settings>) => {
    setSaving(true);
    api
      .setSettings(patch)
      .then((s) => {
        apply(s);
        toast.success("Web検索の設定を保存しました");
      })
      .catch((e) => {
        toast.error("保存に失敗しました：" + (e as Error).message);
        api
          .settings()
          .then(apply)
          .catch(() => undefined);
      })
      .finally(() => setSaving(false));
  };

  const saveBraveKey = () => {
    setSavingKey(true);
    api
      .setSettings({ brave_search_api_key: braveKeyInput })
      .then((s) => {
        apply(s);
        setBraveKeyInput("");
        toast.success("Brave API Keyを保存しました");
      })
      .catch((e) => toast.error("保存に失敗しました：" + (e as Error).message))
      .finally(() => setSavingKey(false));
  };

  const saveTavilyKey = () => {
    setSavingTavilyKey(true);
    api
      .setSettings({ tavily_search_api_key: tavilyKeyInput })
      .then((s) => {
        apply(s);
        setTavilyKeyInput("");
        toast.success("Tavily API Keyを保存しました");
      })
      .catch((e) => toast.error("保存に失敗しました：" + (e as Error).message))
      .finally(() => setSavingTavilyKey(false));
  };

  const saveProxy = () => {
    setSavingProxy(true);
    api
      .setSettings({ web_search_proxy: proxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(proxyInput.trim() ? "出口Proxyを保存しました" : "出口Proxyを削除しました（直接接続に変更）");
      })
      .catch((e) => toast.error("保存に失敗しました：" + (e as Error).message))
      .finally(() => setSavingProxy(false));
  };

  const saveGlobalProxy = () => {
    setSavingGlobalProxy(true);
    api
      .setSettings({ global_proxy: globalProxyInput.trim() })
      .then((s) => {
        apply(s);
        toast.success(globalProxyInput.trim() ? "グローバルProxyを保存しました" : "グローバルProxyを削除しました（直接接続に変更）");
      })
      .catch((e) => toast.error("保存に失敗しました：" + (e as Error).message))
      .finally(() => setSavingGlobalProxy(false));
  };

  // Run a real "test" search ("test") against the CURRENT form values (backend +
  // proxy + entered key), falling back to saved values server-side. Toasts result.
  const runTest = () => {
    setTesting(true);
    api
      .testWebSearch({
        web_search_backend: backend,
        web_search_proxy: proxyInput.trim(),
        brave_search_api_key: braveKeyInput,
        tavily_search_api_key: tavilyKeyInput,
      })
      .then((r) => {
        if (r.ok) toast.success(`検索テストに成功しました · ${r.backend} が ${r.count}件の結果`);
        else toast.error("検索テストに失敗しました：" + (r.error || "不明なエラー"));
      })
      .catch((e) => toast.error("検索テストに失敗しました：" + (e as Error).message))
      .finally(() => setTesting(false));
  };

  // brave-free selected but no key stored and none being entered → tool stays off.
  const braveNeedsKey = webSearch && backend === "brave-free" && !braveKeySet;

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">システム設定</h1>
        <p className="text-muted-foreground text-sm">システム全体の実行設定</p>
      </div>

      {/* 多列而非 grid：Web検索卡片比其余高数倍，且高度随所选后端变化（brave/tavily
          的 key 输入是条件渲染）。grid 会按最高的一张撑满整行、在旁边留下大片空白，
          多列则自动按内容高度平衡填充。卡片间距靠 mb 而非 gap——多列布局下
          column-gap 只管列间距，行间距要由子元素自己给。 */}
      <div className="columns-1 gap-4 md:gap-6 lg:columns-2">
        <UpdateCard />

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              トラフィックキャプチャ
            </CardTitle>
            <CardDescription>
              有効にすると、すべてのAgentのHTTP通信を記録Proxy経由で保存し、traffic_search / traffic_get
              ツールとProxy設定がAgentに提供されます（Agent向け指示にはProxyの説明が含まれます）。
              <br />
              無効（デフォルト）の場合、通信は記録されません。Agent
              <b>Proxy設定とトラフィックツールは取得できず</b>、Agent向け指示にもProxyの説明は含まれません。切り替えるとAgentを再構築し、すぐに反映します。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="traffic-capture" className="text-sm font-normal text-muted-foreground">
              {trafficCapture ? "有効 · 通信を記録しProxyを提供中" : "無効 · 通信を記録せずProxyも提供しません"}
            </Label>
            <Switch
              id="traffic-capture"
              checked={trafficCapture}
              disabled={!loaded || saving}
              onCheckedChange={toggleTraffic}
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              Agentによるトラフィックの自動関連付け
            </CardTitle>
            <CardDescription id="agent-traffic-binding-description">
              デフォルトは無効です。有効にすると、脆弱性の登録時に起動するレポートAgentが既存のHTTPリクエスト／レスポンスを確認し、該当する通信を関連付けてからレポートを作成します。
              <b>パケットの確認や追加のツール呼び出しにより、Token使用量が増加します。</b>
              <br />
              TCP通信、パケットを取得していない場合、または該当する通信がない場合もレポートは通常どおり作成されます。この設定はトラフィックキャプチャ、手動での関連付け、保存済み証拠の表示には影響しません。次のAgent実行から有効になり、無効にすると新たな自動関連付けは直ちに停止します。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="agent-traffic-binding" className="text-sm font-normal text-muted-foreground">
              {agentTrafficBinding ? "有効 · Token使用量が増加します" : "無効 · 手動で関連付けできます"}
            </Label>
            <Switch
              id="agent-traffic-binding"
              aria-describedby="agent-traffic-binding-description"
              checked={agentTrafficBinding}
              disabled={!loaded || saving}
              onCheckedChange={toggleAgentTrafficBinding}
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              グローバルProxy
            </CardTitle>
            <CardDescription>
              すべてのAgentの<b>対象通信</b>をこのProxy経由で外部へ接続します（送信元IPの秘匿や踏み台に使用）。対応方式: <b>http / https / socks5</b>。{" "}
              <code>user:pass</code> 認証。空欄の場合は直接接続します。
              <br />
              <b>トラフィックキャプチャ</b>が有効な場合、このProxyは記録Proxyの<b>上流</b>として使われます（通信はすべて保存後にこのProxy経由で外部接続します）。キャプチャが無効な場合は、Agentのbash / WebFetchの外部接続に直接適用されます。Web検索用ProxyやLLM用Proxyとは独立しています。
              <br />
              <b>ヒント</b>: キャプチャが無効な場合、socks5は各コマンドラインツールの<code>ALL_PROXY</code>対応に依存します（curlは利用できますが、一部のツールでは無視される場合があります）。socks5を主に使う場合はトラフィックキャプチャを有効にしてください。この経路ではMITMが直接接続します。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="global-proxy" className="text-sm font-normal text-muted-foreground">
              Proxyアドレス
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="global-proxy"
                autoComplete="off"
                placeholder="socks5://user:pass@host:1080 または http://host:port（空欄の場合は直接接続）"
                value={globalProxyInput}
                disabled={!loaded || savingGlobalProxy}
                onChange={(e) => setGlobalProxyInput(e.target.value)}
              />
              <Button type="button" onClick={saveGlobalProxy} disabled={!loaded || savingGlobalProxy}>
                保存
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {globalProxyInput.trim() ? "設定済み · 対象通信はすべてこのProxy経由で接続します" : "未設定 · 対象通信は直接接続します"}
            </p>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlertIcon className="size-4" />
              操作制約の注入
            </CardTitle>
            <CardDescription>
              有効にすると、各タスクの<b>操作制約</b>（タスク概要の「操作制約」で管理するallow/deny項目）を該当するAgentのシステムプロンプトに追加し、探索範囲を制限します（例: 「現在のポートのみをテスト」「総当たりを禁止」）。
              <br />
              注入先として<b>Planner</b>と<b>Worker</b>
              を個別に設定できます。どちらもデフォルトで有効です。変更は次の実行から反映され、Agentの再構築は不要です。無効にすると、該当Agentには制約が渡されません。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="inject-planner" className="text-sm font-normal text-muted-foreground">
                Plannerに操作制約を注入{injectPlanner ? " · 有効" : " · 無効"}
              </Label>
              <Switch
                id="inject-planner"
                checked={injectPlanner}
                disabled={!loaded}
                onCheckedChange={toggleInjectPlanner}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="inject-worker" className="text-sm font-normal text-muted-foreground">
                Workerに操作制約を注入{injectWorker ? " · 有効" : " · 無効"}
              </Label>
              <Switch
                id="inject-worker"
                checked={injectWorker}
                disabled={!loaded}
                onCheckedChange={toggleInjectWorker}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConicalIcon className="size-4" />
              試験的な機能
            </CardTitle>
            <CardDescription>
              検証中の機能です。デフォルトでは無効です。Agentの動作や安定性に影響する可能性があるため、内容を理解したうえで有効にしてください。
              <br />
              <b>noa コンテキスト圧縮</b>：モデルが長い会話履歴を圧縮します（norma v0.4.0）。有効にすると、プラットフォームの4種類のAgent（
              <b>Planner / Worker / メインAgent / チャット</b>）は組み込み圧縮の代わりにnoaでコンテキストを管理します。
              圧縮前の内容は、後から確認できるようタスクの作業ディレクトリに保存されます。設定はAgentを再構築せず、今後の実行から反映されます。
              無効にすると、組み込み圧縮に戻ります。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="noa-compaction" className="text-sm font-normal text-muted-foreground">
              noa コンテキスト圧縮{noaCompaction ? " · 有効" : " · 無効"}
            </Label>
            <Switch
              id="noa-compaction"
              checked={noaCompaction}
              disabled={!loaded}
              onCheckedChange={toggleNoaCompaction}
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SearchIcon className="size-4" />
              Web検索
            </CardTitle>
            <CardDescription>
              Web検索の<b>全体設定と検索元</b>です。有効にすると、<b>各Agentの設定</b>でweb_searchを使うか個別に選べます（タイトル、リンク、概要のみを返し、本文は取得しません。本文の取得にはWebFetchを使用します）。Web検索は記録Proxyを経由せず、トラフィックキャプチャとは独立しています。
              <br />
              検索元は<b>DuckDuckGo（ddgs）</b>（Key不要）、<b>Brave（無料プラン）</b>（Brave API Keyが必要）、{" "}
              <b>Tavily</b>（Tavily API Keyが必要）、または<b>DeepSeek</b>（現在のLLM設定を使用）です。全体設定を無効にすると、各AgentでWeb検索を有効にできません。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="web-search" className="text-sm font-normal text-muted-foreground">
                {webSearch ? "有効 · 各Agentの設定で個別に有効化できます" : "無効 · 各AgentでWeb検索を有効にできません"}
              </Label>
              <Switch
                id="web-search"
                checked={webSearch}
                disabled={!loaded || saving}
                onCheckedChange={(v) => {
                  setWebSearch(v); // optimistic
                  saveWebSearch({ web_search_enabled: v });
                }}
              />
            </div>

            {webSearch && (
              <div className="flex items-center justify-between gap-4">
                <Label className="text-sm font-normal text-muted-foreground">検索元</Label>
                <Select
                  value={backend}
                  disabled={!loaded || saving}
                  onValueChange={(v) => {
                    setBackend(v); // optimistic
                    saveWebSearch({ web_search_backend: v });
                  }}
                >
                  <SelectTrigger className="w-48 shrink-0">
                    <SelectValue placeholder="検索元を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ddgs">DuckDuckGo（ddgs · 無料、Key不要）</SelectItem>
                    <SelectItem value="brave-free">Brave（無料プラン · Keyが必要）</SelectItem>
                    <SelectItem value="tavily">Tavily（Keyが必要）</SelectItem>
                    <SelectItem value="deepseek">DeepSeek（公式）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {webSearch && backend === "deepseek" && (
              <div className="border-border/60 bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
                <p className="text-sm font-medium">DeepSeek公式Web検索</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  この検索元は<b>現在有効なLLM設定</b>を使用します。<b>DeepSeek公式モデルのみ対応</b>で、この設定では<b>anthropicプロトコルが必要</b>です。
                  。DeepSeekのOpenAIプロトコルのエンドポイントはサーバー側検索に対応していません。LLM設定を切り替えると、この検索元が使えなくなる場合があります。
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  他の検索元と異なり、検索は<b>DeepSeekのサーバー側で実行</b>されます。検索のたびにモデル呼び出しが1回追加され、Tokenを消費します。検索リクエスト<b>は上記の出口Proxyを経由せず</b>、トラフィック記録にも含まれません。結果には<b>タイトルとリンクのみ</b>が含まれます（概要はありません）。本文が必要な場合はWebFetchで取得してください。
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  これらの条件を満たしているか確認してください。システムによるチェックはありません。下の「検索をテスト」ボタンで実際に検索して動作を確認できます。
                </p>
              </div>
            )}

            {webSearch && backend === "brave-free" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="brave-key" className="text-sm font-normal text-muted-foreground">
                  Brave Search API Key
                  {braveKeySet && <span className="ml-2 text-xs text-emerald-500">設定済み</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="brave-key"
                    type="password"
                    autoComplete="off"
                    placeholder={braveKeySet ? "設定済み（空欄のままなら変更しません）" : "Brave API Keyを入力"}
                    value={braveKeyInput}
                    disabled={!loaded || savingKey}
                    onChange={(e) => setBraveKeyInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={saveBraveKey}
                    disabled={!loaded || savingKey || braveKeyInput.trim() === ""}
                  >
                    保存
                  </Button>
                </div>
                {braveNeedsKey && (
                  <p className="text-xs text-amber-500">
                    Braveが選択されていますが、Keyが未設定です。Keyを保存するまで検索ツールは有効になりません。
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  無料プランの上限は月約2,000回です。https://brave.com/search/api/ でKeyを取得できます。
                </p>
              </div>
            )}

            {webSearch && backend === "tavily" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="tavily-key" className="text-sm font-normal text-muted-foreground">
                  Tavily Search API Key
                  {tavilyKeySet && <span className="ml-2 text-xs text-emerald-500">設定済み</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="tavily-key"
                    type="password"
                    autoComplete="off"
                    placeholder={tavilyKeySet ? "設定済み（空欄のままなら変更しません）" : "Tavily API Key（tvly-…）を入力"}
                    value={tavilyKeyInput}
                    disabled={!loaded || savingTavilyKey}
                    onChange={(e) => setTavilyKeyInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={saveTavilyKey}
                    disabled={!loaded || savingTavilyKey || tavilyKeyInput.trim() === ""}
                  >
                    保存
                  </Button>
                </div>
                {webSearch && backend === "tavily" && !tavilyKeySet && (
                  <p className="text-xs text-amber-500">
                    Tavilyが選択されていますが、Keyが未設定です。Keyを保存するまで検索ツールは有効になりません。
                  </p>
                )}
                <p className="text-muted-foreground text-xs">https://tavily.com で登録し、API Keyを取得してください。</p>
              </div>
            )}

            {webSearch && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="ws-proxy" className="text-sm font-normal text-muted-foreground">
                  出口Proxy（任意）
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="ws-proxy"
                    autoComplete="off"
                    placeholder="http://host:port または socks5://host:port（空欄の場合は直接接続）"
                    value={proxyInput}
                    disabled={!loaded || savingProxy}
                    onChange={(e) => setProxyInput(e.target.value)}
                  />
                  <Button type="button" onClick={saveProxy} disabled={!loaded || savingProxy}>
                    保存
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  検索エンドポイントへの接続専用のProxy（VPN/SOCKSなど）です。通信記録用のMITM Proxyとは別の設定です。ネットワークに接続できない場合は、このProxy経由でアクセスします。
                </p>
              </div>
            )}

            {webSearch && (
              <div className="flex items-center justify-between gap-4 border-t pt-4">
                <p className="text-muted-foreground text-xs">
                  現在の設定（検索元、Proxy、Key）を使って「test」を検索し、接続を確認します。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runTest}
                  disabled={!loaded || testing}
                  className="shrink-0"
                >
                  {testing ? "テスト中…" : "検索をテスト"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTowerIcon className="size-4" />
              カスタムスクリプト · Pythonインタープリター
            </CardTitle>
            <CardDescription>
              カスタム<b>script</b>タイプのツールでPythonを実行します。起動時に自動検出（python3を優先）します。venvや
              特定バージョンの絶対パスを入力できます。空欄の場合は実行時に自動検出します。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                className="font-mono text-sm"
                placeholder="/usr/bin/python3（空欄の場合は自動検出）"
                value={pyInterp}
                disabled={!loaded || saving}
                onChange={(e) => setPyInterp(e.target.value)}
              />
              <Button variant="outline" onClick={detectPython} disabled={!loaded || saving}>
                再検出
              </Button>
              <Button onClick={savePython} disabled={!loaded || saving}>
                保存
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CpuIcon className="size-4" />
              同時実行数 · Work Agent数
            </CardTitle>
            <CardDescription>
              タスクごとに同時実行するWork Agentの数（デフォルト: 3）です。数を増やすと並行する調査が増え、リソース消費も増加します。変更は
              <b>今後開始するタスクに適用され</b>、実行中のタスクには影響しません。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                className="w-32 font-mono text-sm"
                placeholder="3"
                value={workers}
                disabled={!loaded || savingWorkers}
                onChange={(e) => setWorkers(e.target.value)}
              />
              <Button onClick={saveWorkers} disabled={!loaded || savingWorkers}>
                保存
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyboardIcon className="size-4" />
              会話入力欄の送信キー
            </CardTitle>
            <CardDescription>
              チャット画面とタスク詳細のメインAgent入力欄で共通の設定です。選択後すぐに反映され、保存は不要です。
              <br />
              この設定は使用中のブラウザーにのみ保存され、アカウント間で同期されません。ブラウザーの変更やサイトデータの削除後は再設定が必要です。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="chat-send-mode" className="text-sm font-normal text-muted-foreground">
              送信方法
            </Label>
            <Select value={sendMode} onValueChange={(v) => setChatSendMode(v as ChatSendMode)}>
              <SelectTrigger id="chat-send-mode" className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAT_SEND_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
