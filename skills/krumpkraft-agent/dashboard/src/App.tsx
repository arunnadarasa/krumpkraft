import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081';
const EXPLORER_TX_URL = import.meta.env.VITE_EXPLORER_TX_URL || 'https://aeneid.storyscan.io/tx';

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  state: string;
  balance: string;
  ipBalance?: string;
  ipNativeBalance?: string;
  principalBalance?: string;
  ipAssetCount?: number;
  tasksCompleted: number;
  revenueGenerated: string;
  lastActive: number;
}

interface SwarmState {
  agentCount: number;
  totalBalance: string;
  totalIpBalance?: string;
  totalIpNativeBalance?: string;
  totalPrincipalBalance?: string;
  totalIpAssets?: number;
  totalTasks: number;
  totalRevenue: string;
  lastUpdate: number;
}

interface Transaction {
  agentId: string;
  txHash: string;
  type: string;
  timestamp: number;
}

interface BotActivityEntry {
  id: string;
  type: 'chat' | 'action';
  timestamp: number;
  agentId?: string;
  username?: string;
  message?: string;
  action?: 'chat' | 'commission' | 'pay' | 'dance';
  payload?: Record<string, unknown>;
}

type TransferToken = 'usdc' | 'jab' | 'ip';
type MainTab = 'dashboard' | 'activity';

export default function App() {
  const [health, setHealth] = useState<{ status?: string } | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [swarm, setSwarm] = useState<SwarmState | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transferToken, setTransferToken] = useState<TransferToken>('usdc');
  const [transferAgentId, setTransferAgentId] = useState<string>('');
  const [transferTo, setTransferTo] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(0);
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const [activity, setActivity] = useState<BotActivityEntry[]>([]);

  const TX_PER_PAGE = 5;
  const txTotalPages = Math.max(1, Math.ceil(transactions.length / TX_PER_PAGE));
  const txPageClamped = Math.min(txPage, txTotalPages - 1);
  const txSlice = transactions.slice(txPageClamped * TX_PER_PAGE, (txPageClamped + 1) * TX_PER_PAGE);

  useEffect(() => {
    if (txPage > txTotalPages - 1 && txTotalPages > 0) setTxPage(txTotalPages - 1);
  }, [txTotalPages, txPage]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, agentsRes, stateRes, txRes] = await Promise.all([
          fetch(`${API_URL}/health`),
          fetch(`${API_URL}/api/v1/agents`),
          fetch(`${API_URL}/api/v1/swarm/state`),
          fetch(`${API_URL}/api/v1/transactions?limit=50`),
        ]);
        if (healthRes.ok) setHealth(await healthRes.json());
        if (agentsRes.ok) {
          const d = await agentsRes.json();
          setAgents(d.agents || []);
        }
        if (stateRes.ok) {
          const d = await stateRes.json();
          setSwarm(d.swarm ? {
            ...d.swarm,
            totalBalance: String(d.swarm.totalBalance ?? 0),
            totalIpBalance: String(d.swarm.totalIpBalance ?? 0),
            totalIpNativeBalance: String(d.swarm.totalIpNativeBalance ?? 0),
            totalPrincipalBalance: String(d.swarm.totalPrincipalBalance ?? 0),
            totalIpAssets: d.swarm.totalIpAssets,
            totalRevenue: String(d.swarm.totalRevenue ?? 0),
          } : null);
        }
        if (txRes.ok) {
          const d = await txRes.json();
          setTransactions(d.transactions || []);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (activeTab !== 'activity') return;
    const fetchActivity = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/activity`);
        if (res.ok) {
          const d = await res.json();
          setActivity(d.activity || []);
        }
      } catch {
        // ignore
      }
    };
    fetchActivity();
    const t = setInterval(fetchActivity, 2500);
    return () => clearInterval(t);
  }, [activeTab]);

  const formatUsdc = (raw: string) => {
    const n = Number(raw) / 1e6;
    return n.toFixed(6);
  };

  const formatIp = (raw: string) => {
    const n = Number(raw) / 1e18;
    return n.toFixed(6);
  };

  const formatJab = (raw: string) => {
    const n = Number(raw) / 1e18;
    return n.toFixed(2);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return d.toLocaleString();
  };

  const sendTransfer = async () => {
    if (!transferAgentId || !transferTo?.trim() || !transferAmount?.trim()) {
      setTransferStatus('Fill agent, to address, and amount');
      return;
    }
    const command = transferToken === 'usdc' ? 'transferUsdc' : transferToken === 'jab' ? 'transferJab' : 'transferIp';
    setTransferStatus('Sending…');
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${transferAgentId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, params: { to: transferTo.trim(), amount: transferAmount.trim() } }),
      });
      const data = await res.json();
      if (data.success && data.result?.txHash) {
        setTransferStatus(`Sent. Tx: ${data.result.txHash}`);
        setTransferAmount('');
      } else {
        setTransferStatus(data.result?.error || data.error || 'Failed');
      }
    } catch (e) {
      setTransferStatus(e instanceof Error ? e.message : 'Request failed');
    }
  };

  const tokenLabel = transferToken === 'usdc' ? 'USDC.k' : transferToken === 'jab' ? 'JAB (KRUMP)' : '$IP (native)';
  const tokenPlaceholder = transferToken === 'usdc' ? '0.5' : transferToken === 'jab' ? '1.5' : '0.01';

  return (
    <div className="min-h-screen bg-krump-black bg-grid-pattern bg-[length:64px_64px] font-sans">
      {/* Glow */}
      <div className="fixed inset-0 bg-glow-gold pointer-events-none" aria-hidden />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <header className="mb-10 sm:mb-14 animate-fade-in">
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-white">
            KrumpKraft
          </h1>
          <p className="mt-1 text-krump-muted text-sm sm:text-base">
            Agentic Krump Commerce on EVVM Story
          </p>
          <p className="mt-3 text-krump-muted/80 text-xs">
            By StreetKode Fam — Asura, Hectik, Kronos & Jo
            {' · '}
            <a
              href="https://asura.lovable.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-krump-gold/90 hover:text-krump-gold underline underline-offset-2"
            >
              asura.lovable.app
            </a>
          </p>
          {error && (
            <p className="mt-3 text-amber-400/90 text-sm">
              API: {error}. Is the server running on {API_URL}?
            </p>
          )}
          <div className="mt-4 flex gap-2 border-b border-white/10 pb-0">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-krump-card/80 text-krump-gold border border-b-0 border-white/10 -mb-px'
                  : 'text-krump-muted hover:text-white hover:bg-white/5'
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'activity'
                  ? 'bg-krump-card/80 text-krump-gold border border-b-0 border-white/10 -mb-px'
                  : 'text-krump-muted hover:text-white hover:bg-white/5'
              }`}
            >
              Bots & activity
            </button>
          </div>
        </header>

        {activeTab === 'activity' ? (
          <section className="mb-10 animate-fade-in">
            <h2 className="font-display font-semibold text-lg text-white mb-3">Live activity</h2>
            <p className="text-krump-muted text-sm mb-4">Chat and LLM actions from bots (refreshes every 2.5s)</p>
            <div className="rounded-2xl bg-krump-card/80 backdrop-blur-xl border border-white/10 overflow-hidden">
              <div className="max-h-[60vh] overflow-y-auto">
                {activity.length === 0 && (
                  <p className="px-4 py-8 text-center text-krump-muted">No activity yet. Start the swarm with MINECRAFT_HOST and OPENROUTER_API_KEY to see bots.</p>
                )}
                <ul className="divide-y divide-white/5">
                  {activity.map((entry) => (
                    <li key={entry.id} className="px-4 py-3 hover:bg-white/5 transition-colors flex flex-wrap items-baseline gap-2">
                      <span className={`text-xs font-semibold uppercase tracking-wider shrink-0 ${entry.type === 'chat' ? 'text-krump-teal' : 'text-krump-gold'}`}>
                        {entry.type === 'chat' ? 'Chat' : entry.action ?? 'action'}
                      </span>
                      <span className="font-mono text-sm text-white/80 shrink-0">
                        {entry.type === 'chat' ? entry.username : entry.agentId}
                      </span>
                      {entry.type === 'chat' ? (
                        <span className="text-white/90 break-words">{entry.message}</span>
                      ) : (
                        <span className="text-white/80 break-words">
                          {entry.message ?? (entry.payload && JSON.stringify(entry.payload).slice(0, 80)) ?? ''}
                        </span>
                      )}
                      <span className="text-krump-muted text-xs ml-auto shrink-0">{formatTime(entry.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : (
          <>
        {/* Top section: Balances (hero) + Status (compact) */}
        <section className="mb-8 animate-fade-in space-y-4">
          {/* Balances — main token totals */}
          <div className="rounded-2xl bg-krump-card/80 backdrop-blur-xl border border-white/10 p-5 sm:p-6">
            <p className="text-krump-muted text-xs font-semibold uppercase tracking-wider mb-4">Swarm balances</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              <div className="flex flex-col">
                <p className="text-krump-teal/90 text-sm font-medium mb-1">USDC.k</p>
                <p className="font-display font-bold text-2xl sm:text-3xl text-white tabular-nums">
                  {swarm ? formatUsdc(swarm.totalBalance) : '—'}
                </p>
              </div>
              <div className="flex flex-col">
                <p className="text-white/70 text-sm font-medium mb-1">$IP (native)</p>
                <p className="font-display font-bold text-2xl sm:text-3xl text-white tabular-nums">
                  {swarm ? formatIp(swarm.totalIpNativeBalance ?? '0') : '—'}
                </p>
              </div>
              <div className="flex flex-col">
                <p className="text-krump-gold/90 text-sm font-medium mb-1">JAB (KRUMP)</p>
                <p className="font-display font-bold text-2xl sm:text-3xl text-white tabular-nums">
                  {swarm ? formatJab(swarm.totalPrincipalBalance ?? '0') : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Status — health, agents, tasks, revenue in one row */}
          <div className="rounded-xl bg-krump-card/50 backdrop-blur border border-white/10 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <StatusPill label="Health" value={health?.status ?? '—'} />
              {swarm && (
                <>
                  <StatusPill label="Agents" value={String(swarm.agentCount)} />
                  <StatusPill label="Tasks" value={String(swarm.totalTasks)} />
                  {swarm.totalIpAssets != null && (
                    <StatusPill label="IP Assets" value={String(swarm.totalIpAssets)} />
                  )}
                  <StatusPill label="Revenue" value={swarm ? formatUsdc(swarm.totalRevenue) : '—'} highlight />
                </>
              )}
            </div>
          </div>
        </section>

        {/* Send — single unified form with token tabs */}
        <section className="mb-10">
          <h2 className="font-display font-semibold text-lg text-white mb-3">Send</h2>
          <div className="rounded-2xl bg-krump-card/80 backdrop-blur-xl border border-white/10 overflow-hidden">
            <div className="flex border-b border-white/10">
              {(['usdc', 'jab', 'ip'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTransferToken(t); setTransferStatus(null); }}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    transferToken === t
                      ? 'bg-krump-gold/20 text-krump-gold border-b-2 border-krump-gold'
                      : 'text-krump-muted hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t === 'usdc' ? 'USDC.k' : t === 'jab' ? 'JAB' : '$IP'}
                </button>
              ))}
            </div>
            <div className="p-4 sm:p-5 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-krump-muted text-xs font-medium uppercase tracking-wider mb-1.5">Agent</label>
                <select
                  value={transferAgentId}
                  onChange={(e) => setTransferAgentId(e.target.value)}
                  className="w-full min-w-[140px] sm:min-w-[180px] bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-krump-gold/50 focus:border-krump-gold/50 transition"
                >
                  <option value="">Select agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-krump-muted text-xs font-medium uppercase tracking-wider mb-1.5">To address</label>
                <input
                  type="text"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-krump-gold/50 focus:border-krump-gold/50 transition"
                />
              </div>
              <div>
                <label className="block text-krump-muted text-xs font-medium uppercase tracking-wider mb-1.5">Amount ({tokenLabel})</label>
                <input
                  type="text"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder={tokenPlaceholder}
                  className="w-24 sm:w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-krump-gold/50 focus:border-krump-gold/50 transition"
                />
              </div>
              <button
                type="button"
                onClick={sendTransfer}
                className="px-5 py-2.5 rounded-xl bg-krump-gold text-krump-black font-semibold text-sm hover:bg-krump-gold/90 focus:outline-none focus:ring-2 focus:ring-krump-gold focus:ring-offset-2 focus:ring-offset-krump-black transition"
              >
                Transfer {tokenLabel}
              </button>
            </div>
            {transferStatus && (
              <p className="px-4 sm:px-5 pb-4 text-sm text-white/80">{transferStatus}</p>
            )}
          </div>
        </section>

        {/* Agents table */}
        <section className="mb-10">
          <h2 className="font-display font-semibold text-lg text-white mb-3">Agents</h2>
          <div className="rounded-2xl bg-krump-card/80 backdrop-blur-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">ID</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">State</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">USDC.k</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">$IP</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">JAB</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Assets</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Tasks</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-krump-muted">No agents</td></tr>
                  )}
                  {agents.map((a) => (
                    <tr key={a.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm text-white/90">{a.id}</td>
                      <td className="px-4 py-3 text-white/90">{a.name}</td>
                      <td className="px-4 py-3 text-white/80">{a.role}</td>
                      <td className="px-4 py-3 text-white/80">{a.state}</td>
                      <td className="px-4 py-3 font-mono text-sm text-krump-teal">{formatUsdc(a.balance)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-white/80">{formatIp(a.ipNativeBalance ?? '0')}</td>
                      <td className="px-4 py-3 font-mono text-sm text-krump-gold">{formatJab(a.principalBalance ?? '0')}</td>
                      <td className="px-4 py-3 font-mono text-sm text-white/80">{a.ipAssetCount != null ? a.ipAssetCount : '—'}</td>
                      <td className="px-4 py-3 text-white/80">{a.tasksCompleted}</td>
                      <td className="px-4 py-3 font-mono text-sm text-white/80">{formatUsdc(a.revenueGenerated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Recent transactions */}
        <section>
          <h2 className="font-display font-semibold text-lg text-white mb-3">Recent transactions</h2>
          <div className="rounded-2xl bg-krump-card/80 backdrop-blur-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Agent</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Tx</th>
                    <th className="px-4 py-3 text-xs font-semibold text-krump-muted uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-krump-muted">No recent transactions</td></tr>
                  )}
                  {txSlice.map((tx, i) => (
                    <tr key={`${tx.agentId}-${tx.txHash}-${tx.timestamp}-${i}`} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm text-white/90">{tx.agentId}</td>
                      <td className="px-4 py-3 text-white/80">{tx.type}</td>
                      <td className="px-4 py-3 font-mono text-sm max-w-[200px]">
                        <a
                          href={`${EXPLORER_TX_URL}/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-krump-teal hover:text-krump-tealDim truncate block hover:underline"
                          title={tx.txHash}
                        >
                          {tx.txHash.slice(0, 10)}…{tx.txHash.slice(-8)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-krump-muted text-sm">{formatTime(tx.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactions.length > TX_PER_PAGE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                <p className="text-krump-muted text-sm">
                  Page {txPageClamped + 1} of {txTotalPages}
                  <span className="ml-2 text-white/60">
                    ({transactions.length} total)
                  </span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTxPage((p) => Math.max(0, p - 1))}
                    disabled={txPageClamped === 0}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white/90 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxPage((p) => Math.min(txTotalPages - 1, p + 1))}
                    disabled={txPageClamped >= txTotalPages - 1}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white/90 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-krump-muted text-xs font-medium uppercase tracking-wider">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${highlight ? 'text-krump-gold' : 'text-white/90'}`}>
        {value}
      </span>
    </span>
  );
}
