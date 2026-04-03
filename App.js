import React, { useEffect, useState, useRef } from "react";
import { Network } from "vis-network";

const API = "http://127.0.0.1:8000";

const theme = {
  bg: "#0b0f1a",
  surface: "#111827",
  surfaceAlt: "#1a2235",
  border: "#1e2d45",
  accent: "#3b82f6",
  accentGlow: "rgba(59,130,246,0.18)",
  danger: "#ef4444",
  dangerGlow: "rgba(239,68,68,0.15)",
  success: "#10b981",
  warning: "#f59e0b",
  textPrimary: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#475569",
};

const Card = ({ children, style = {} }) => (
  <div style={{
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    padding: "20px 24px",
    ...style,
  }}>{children}</div>
);

const Btn = ({ children, onClick, variant = "primary", disabled = false, style = {} }) => {
  const variants = {
    primary: { background: theme.accent, color: "#fff", border: "none" },
    ghost:   { background: "transparent", color: theme.textSecondary, border: `1px solid ${theme.border}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      padding: "8px 18px", borderRadius: 8,
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 13, fontWeight: 600, opacity: disabled ? 0.5 : 1,
      transition: "opacity 0.2s", letterSpacing: "0.02em", ...style,
    }}>{children}</button>
  );
};

const Badge = ({ children, color = theme.accent }) => (
  <span style={{
    background: color + "22", color,
    border: `1px solid ${color}44`,
    borderRadius: 6, padding: "2px 10px",
    fontSize: 11, fontWeight: 700,
    letterSpacing: "0.06em",
    fontFamily: "'IBM Plex Mono', monospace",
  }}>{children}</span>
);

const StatCard = ({ label, value, sub, color = theme.accent }) => (
  <div style={{
    background: theme.surfaceAlt,
    border: `1px solid ${theme.border}`,
    borderRadius: 12, padding: "18px 22px",
    borderTop: `3px solid ${color}`,
    minWidth: 140, flex: 1,
  }}>
    <div style={{ color: theme.textMuted, fontSize: 11, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ color, fontSize: 28, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>{sub}</div>}
  </div>
);

export default function App() {
  const [backendOk, setBackendOk]     = useState(false);
  const [file, setFile]               = useState(null);
  const [uploadMsg, setUploadMsg]     = useState("");
  const [genMsg, setGenMsg]           = useState("");
  const [txnCount, setTxnCount]       = useState(30000);
  const [runMsg, setRunMsg]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [results, setResults]         = useState([]);
  const [summary, setSummary]         = useState(null);
  const [graphData, setGraphData]     = useState(null);
  const [dateRange, setDateRange]     = useState(null);
  const [startDate, setStartDate]     = useState("");
  const [endDate, setEndDate]         = useState("");
  const [activePreset, setActivePreset] = useState("all");
  const [filterMsg, setFilterMsg]     = useState("");
  const [search, setSearch]           = useState("");
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [sortKey, setSortKey]         = useState("anomaly_score");
  const [sortDir, setSortDir]         = useState("desc");
  const [graphMode, setGraphMode]     = useState("fraud");
  const networkRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/`).then(r => r.json()).then(() => setBackendOk(true)).catch(() => setBackendOk(false));
  }, []);

  useEffect(() => {
    if (!graphData) return;
    const container = document.getElementById("network");
    if (!container) return;
    container.innerHTML = "";
    networkRef.current = new Network(
      container,
      { nodes: graphData.nodes, edges: graphData.edges },
      {
        nodes: { shape: "dot", font: { size: 11, color: theme.textSecondary, face: "IBM Plex Mono" }, borderWidth: 2 },
        edges: { arrows: "to", smooth: { type: "curvedCW", roundness: 0.2 }, color: { color: "#1e3a5f", highlight: theme.accent }, width: 1 },
        physics: { solver: "forceAtlas2Based", stabilization: { iterations: 150 } },
        interaction: { hover: true },
      }
    );
  }, [graphData]);

  const fetchDateRange = async () => {
    try {
      const res = await fetch(`${API}/date-range`);
      if (res.ok) {
        const d = await res.json();
        setDateRange(d);
        setStartDate(d.min.slice(0, 10));
        setEndDate(d.max.slice(0, 10));
      }
    } catch (_) {}
  };

  const runDetection = async (mode = graphMode) => {
    setLoading(true);
    setRunMsg("Building graph…");
    await fetch(`${API}/build-graph`, { method: "POST" });
    setRunMsg("Detecting anomalies…");
    await fetch(`${API}/detect-anomalies`, { method: "POST" });
    const [resData, sumData] = await Promise.all([
      fetch(`${API}/results`).then(r => r.json()),
      fetch(`${API}/summary`).then(r => r.json()),
    ]);
    setResults(resData);
    setSummary(sumData);
    const endpoint = mode === "fraud" ? "/fraud-subgraph" : "/graph?limit=300";
    const graphJson = await fetch(`${API}${endpoint}`).then(r => r.json());
    setGraphData(graphJson);
    setRunMsg("Detection complete ✓");
    setLoading(false);
  };

  const applyPreset = async (preset) => {
    if (!dateRange) return;
    const max = new Date(dateRange.max);
    let start = new Date(max);
    if (preset === "week")   start.setDate(max.getDate() - 7);
    if (preset === "month")  start.setMonth(max.getMonth() - 1);
    if (preset === "3month") start.setMonth(max.getMonth() - 3);
    if (preset === "6month") start.setMonth(max.getMonth() - 6);
    if (preset === "all")    start = new Date(dateRange.min);
    const s = start.toISOString().slice(0, 10);
    const e = max.toISOString().slice(0, 10);
    setStartDate(s); setEndDate(e); setActivePreset(preset);
    await applyCustomFilter(s, e);
  };

  const applyCustomFilter = async (s, e) => {
    setFilterMsg("Applying filter…");
    const res = await fetch(`${API}/filter-timeframe?start_date=${s}&end_date=${e}`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setFilterMsg(`✓ ${data.transactions.toLocaleString()} transactions in range`);
      await runDetection(graphMode);
    } else {
      setFilterMsg(`✗ ${data.detail || "Filter error"}`);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filteredResults = results
    .filter(r => {
      if (anomalyOnly && !r.is_anomaly) return false;
      if (search && !r.account.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const v = sortDir === "asc" ? 1 : -1;
      return a[sortKey] > b[sortKey] ? v : -v;
    });

  const SortArrow = ({ k }) => sortKey === k
    ? <span style={{ color: theme.accent }}>{sortDir === "asc" ? " ▲" : " ▼"}</span>
    : <span style={{ color: theme.textMuted }}> ⇅</span>;

  const switchGraph = async (mode) => {
    setGraphMode(mode);
    if (results.length === 0) return;
    const endpoint = mode === "fraud" ? "/fraud-subgraph" : "/graph?limit=300";
    const json = await fetch(`${API}${endpoint}`).then(r => r.json());
    setGraphData(json);
  };

  const presets = [
    { key: "week",   label: "Last 7 Days" },
    { key: "month",  label: "Last Month" },
    { key: "3month", label: "Last 3 Months" },
    { key: "6month", label: "Last 6 Months" },
    { key: "all",    label: "All Time" },
  ];

  const tableCols = [
    { key: "account",       label: "Account" },
    { key: "degree",        label: "Degree" },
    { key: "total_inflow",  label: "Inflow (₹)" },
    { key: "total_outflow", label: "Outflow (₹)" },
    { key: "anomaly_score", label: "Score" },
    { key: "is_anomaly",    label: "Status" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif", padding: "32px 40px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${theme.surface}; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 3px; }
        input[type=date] { color-scheme: dark; }
        th { cursor: pointer; user-select: none; }
        th:hover { color: ${theme.accent} !important; }
        tr:hover td { background: rgba(59,130,246,0.04); }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: backendOk ? theme.success : theme.danger, boxShadow: `0 0 8px ${backendOk ? theme.success : theme.danger}` }} />
            <span style={{ color: theme.textMuted, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em" }}>
              {backendOk ? "BACKEND ONLINE" : "BACKEND OFFLINE"}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Graph Anomaly <span style={{ color: theme.accent }}>Detection</span>
          </h1>
          <p style={{ margin: "4px 0 0", color: theme.textMuted, fontSize: 13 }}>
            Financial transaction flow analysis · Graph-theoretic approach
          </p>
        </div>
        {summary && <Badge color={summary.anomaly_rate > 30 ? theme.danger : theme.success}>{summary.anomaly_rate}% ANOMALY RATE</Badge>}
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
          <StatCard label="Transactions" value={summary.total_transactions.toLocaleString()} sub="in current timeframe" color={theme.accent} />
          <StatCard label="Accounts" value={summary.total_accounts.toLocaleString()} sub="unique nodes" color={theme.accent} />
          <StatCard label="Anomalies" value={summary.anomaly_count.toLocaleString()} sub={`${summary.anomaly_rate}% of accounts`} color={theme.danger} />
          <StatCard label="Threshold" value={summary.threshold.toLocaleString()} sub={`μ ${summary.mean_score} · σ ${summary.std_score}`} color={theme.warning} />
          <StatCard label="Normal" value={summary.normal_count.toLocaleString()} sub="clean accounts" color={theme.success} />
        </div>
      )}

      {/* Data source */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <Card style={{ flex: 1, minWidth: 260 }}>
          <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>OPTION A — UPLOAD CSV</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ background: theme.surfaceAlt, border: `1px dashed ${theme.border}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, color: theme.textSecondary }}>
              {file ? file.name : "Choose CSV file"}
              <input type="file" accept=".csv" style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
            </label>
            <Btn onClick={async () => {
              if (!file) return setUploadMsg("Select a file first");
              const fd = new FormData(); fd.append("file", file);
              const res = await fetch(`${API}/upload-data`, { method: "POST", body: fd });
              const d = await res.json();
              setUploadMsg(res.ok ? `✓ ${d.rows} rows loaded` : d.detail);
              if (res.ok) await fetchDateRange();
            }}>Upload</Btn>
          </div>
          {uploadMsg && <div style={{ color: theme.textSecondary, fontSize: 12, marginTop: 8 }}>{uploadMsg}</div>}
        </Card>

        <Card style={{ flex: 1, minWidth: 260 }}>
          <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>OPTION B — SYNTHETIC DATA</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ color: theme.textMuted, fontSize: 11, letterSpacing: "0.08em" }}>TRANSACTIONS</label>
              <select
                value={txnCount}
                onChange={e => setTxnCount(Number(e.target.value))}
                style={{
                  background: theme.surfaceAlt,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8, padding: "7px 12px",
                  color: theme.textPrimary,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13, cursor: "pointer", outline: "none",
                }}
              >
                {[5, 50, 100, 500, 1000, 5000, 10000, 30000].map(n => (
                  <option key={n} value={n}>{n.toLocaleString()} transactions</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={async () => {
              setGenMsg(`Generating ${txnCount.toLocaleString()} transactions…`);
              const res = await fetch(`${API}/generate-data?transactions=${txnCount}`, { method: "POST" });
              const d = await res.json();
              setGenMsg(`✓ ${d.transactions.toLocaleString()} txns · ${d.accounts.toLocaleString()} accounts`);
              await fetchDateRange();
            }}>Generate Dataset</Btn>
            <Btn variant="ghost" onClick={() => window.open(`${API}/download-data`, "_blank")}>Download CSV</Btn>
          </div>
          {genMsg && <div style={{ color: theme.textSecondary, fontSize: 12, marginTop: 8 }}>{genMsg}</div>}
        </Card>
      </div>

      {/* Timeframe filter */}
      {dateRange && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 14 }}>
            TIMEFRAME FILTER
            <span style={{ color: theme.textMuted, fontWeight: 400, marginLeft: 10, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
              Dataset: {dateRange.min.slice(0, 10)} → {dateRange.max.slice(0, 10)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {presets.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)} style={{
                background: activePreset === p.key ? theme.accent : theme.surfaceAlt,
                color: activePreset === p.key ? "#fff" : theme.textSecondary,
                border: `1px solid ${activePreset === p.key ? theme.accent : theme.border}`,
                borderRadius: 8, padding: "6px 14px", cursor: "pointer",
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600,
                transition: "all 0.15s",
              }}>{p.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {["From", "To"].map((lbl, i) => (
              <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: theme.textMuted, fontSize: 12 }}>{lbl}</span>
                <input type="date"
                  value={i === 0 ? startDate : endDate}
                  onChange={e => i === 0 ? setStartDate(e.target.value) : setEndDate(e.target.value)}
                  style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 10px", color: theme.textPrimary, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
                />
              </div>
            ))}
            <Btn onClick={() => { setActivePreset("custom"); applyCustomFilter(startDate, endDate); }}>Apply Range</Btn>
          </div>
          {filterMsg && <div style={{ color: filterMsg.startsWith("✓") ? theme.success : theme.danger, fontSize: 12, marginTop: 10, fontFamily: "'IBM Plex Mono', monospace" }}>{filterMsg}</div>}
        </Card>
      )}

      {/* Run detection */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>RUN DETECTION</div>
            <div style={{ color: theme.textSecondary, fontSize: 13 }}>Build graph → compute flow imbalance → threshold anomalies</div>
          </div>
          <Btn onClick={() => runDetection(graphMode)} disabled={loading} style={{ marginLeft: "auto" }}>
            {loading ? "Running…" : "▶  Run Detection"}
          </Btn>
        </div>
        {runMsg && (
          <div style={{
            marginTop: 12, padding: "8px 14px", borderRadius: 8,
            background: runMsg.includes("✓") ? theme.success + "15" : theme.accentGlow,
            color: runMsg.includes("✓") ? theme.success : theme.accent,
            fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
          }}>{runMsg}</div>
        )}
      </Card>

      {/* Results table */}
      {results.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>ANOMALY RESULTS</div>
            <Badge color={theme.textMuted}>{filteredResults.length} rows</Badge>
            <input placeholder="Search account…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ marginLeft: "auto", background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 12px", color: theme.textPrimary, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, width: 200 }}
            />
            <button onClick={() => setAnomalyOnly(v => !v)} style={{
              background: anomalyOnly ? theme.dangerGlow : "transparent",
              color: anomalyOnly ? theme.danger : theme.textSecondary,
              border: `1px solid ${anomalyOnly ? theme.danger : theme.border}`,
              borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600,
            }}>{anomalyOnly ? "⚠ Anomalies Only" : "Show All"}</button>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: theme.surfaceAlt, position: "sticky", top: 0, zIndex: 1 }}>
                  {tableCols.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      style={{ padding: "10px 14px", textAlign: "left", color: theme.textSecondary, fontWeight: 600, borderBottom: `1px solid ${theme.border}`, whiteSpace: "nowrap" }}>
                      {col.label}<SortArrow k={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r, i) => (
                  <tr key={i} style={{ background: r.is_anomaly ? `${theme.danger}0d` : i % 2 === 0 ? "transparent" : theme.surfaceAlt + "55", borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: "9px 14px", fontFamily: "'IBM Plex Mono', monospace", color: r.is_anomaly ? theme.danger : theme.textPrimary }}>{r.account}</td>
                    <td style={{ padding: "9px 14px", color: theme.textSecondary }}>{r.degree}</td>
                    <td style={{ padding: "9px 14px", color: theme.success, fontFamily: "'IBM Plex Mono', monospace" }}>{r.total_inflow?.toLocaleString() ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: theme.warning, fontFamily: "'IBM Plex Mono', monospace" }}>{r.total_outflow?.toLocaleString() ?? "—"}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "'IBM Plex Mono', monospace", color: r.is_anomaly ? theme.danger : theme.textSecondary }}>{r.anomaly_score?.toFixed(2) ?? "—"}</td>
                    <td style={{ padding: "9px 14px" }}>{r.is_anomaly ? <Badge color={theme.danger}>ANOMALY</Badge> : <Badge color={theme.success}>NORMAL</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Graph */}
      {results.length > 0 && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>TRANSACTION NETWORK</div>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              {[
                { key: "fraud", label: "⚠ Fraud Subgraph", active: theme.danger, activeGlow: theme.dangerGlow },
                { key: "full",  label: "◉ Full Graph",     active: theme.accent, activeGlow: theme.accentGlow },
              ].map(g => (
                <button key={g.key} onClick={() => switchGraph(g.key)} style={{
                  background: graphMode === g.key ? g.activeGlow : "transparent",
                  color: graphMode === g.key ? g.active : theme.textSecondary,
                  border: `1px solid ${graphMode === g.key ? g.active : theme.border}`,
                  borderRadius: 8, padding: "6px 14px", cursor: "pointer",
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600,
                  transition: "all 0.15s",
                }}>{g.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: theme.textMuted }}>
            <span><span style={{ color: theme.danger }}>●</span> Anomaly node</span>
            <span><span style={{ color: theme.accent }}>●</span> Normal node</span>
            <span>→ Transaction direction</span>
          </div>
          <div id="network" style={{ height: 560, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surfaceAlt }} />
        </Card>
      )}
    </div>
  );
}