from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import pandas as pd
import networkx as nx
import io
import random
from datetime import datetime, timedelta

app = FastAPI()

# -------------------------
# CORS
# -------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# In-memory store
# -------------------------
DATA_STORE = {
    "data": None,           # full dataset (with timestamps)
    "filtered_data": None,  # currently active filtered dataset
    "graph": None,
    "results": None,
}

# -------------------------
# Health check
# -------------------------
@app.get("/")
def root():
    return {"message": "Backend is running"}

# -------------------------
# Upload CSV
# -------------------------
@app.post("/upload-data")
async def upload_data(file: UploadFile = File(...)):
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))

    df.columns = [c.lower().strip() for c in df.columns]

    column_aliases = {
        "source": ["source", "from", "sender", "from_account"],
        "target": ["target", "to", "receiver", "to_account"],
        "amount": ["amount", "value", "transaction_amount"]
    }

    normalized = {}
    for canonical, variants in column_aliases.items():
        for v in variants:
            if v in df.columns:
                normalized[canonical] = df[v]
                break
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required column for '{canonical}'"
            )

    clean_df = pd.DataFrame(normalized)

    # If no timestamp column, generate random timestamps over last year
    if "timestamp" not in df.columns:
        base_date = datetime.now() - timedelta(days=365)
        clean_df["timestamp"] = [
            (base_date + timedelta(seconds=random.randint(0, 365 * 24 * 3600))).isoformat()
            for _ in range(len(clean_df))
        ]
    else:
        clean_df["timestamp"] = df["timestamp"]

    DATA_STORE["data"] = clean_df
    DATA_STORE["filtered_data"] = clean_df
    DATA_STORE["graph"] = None
    DATA_STORE["results"] = None

    return {
        "message": "Data uploaded successfully",
        "rows": len(clean_df)
    }

# -------------------------
# Generate synthetic data (with timestamps)
# -------------------------
@app.post("/generate-data")
def generate_data(
    accounts: int = 3000,
    transactions: int = 30000
):
    nodes = [f"ACC_{i:04d}" for i in range(accounts)]
    data = []

    base_date = datetime.now() - timedelta(days=365)

    for _ in range(transactions):
        src = random.choice(nodes)
        dst = random.choice(nodes)
        if src == dst:
            continue

        amount = random.randint(10, 1000)
        ts = base_date + timedelta(seconds=random.randint(0, 365 * 24 * 3600))

        data.append({
            "source": src,
            "target": dst,
            "amount": amount,
            "timestamp": ts.isoformat()
        })

    df = pd.DataFrame(data)

    DATA_STORE["data"] = df
    DATA_STORE["filtered_data"] = df
    DATA_STORE["graph"] = None
    DATA_STORE["results"] = None

    return {
        "message": "Synthetic dataset generated",
        "accounts": accounts,
        "transactions": len(df),
        "date_range": {
            "start": base_date.isoformat(),
            "end": datetime.now().isoformat()
        }
    }

# -------------------------
# Filter by timeframe
# -------------------------
@app.post("/filter-timeframe")
def filter_timeframe(start_date: str, end_date: str):
    """
    Filter transactions by date range, then reset graph + results.
    Dates should be ISO format: YYYY-MM-DD
    """
    if DATA_STORE["data"] is None:
        raise HTTPException(status_code=400, detail="No dataset available")

    df = DATA_STORE["data"].copy()

    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    filtered = df[(df["timestamp"] >= start) & (df["timestamp"] <= end)]

    if len(filtered) == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No transactions found between {start_date} and {end_date}"
        )

    DATA_STORE["filtered_data"] = filtered
    DATA_STORE["graph"] = None
    DATA_STORE["results"] = None

    return {
        "message": "Timeframe filter applied",
        "start": start_date,
        "end": end_date,
        "transactions": len(filtered)
    }

# -------------------------
# Get available date range in dataset
# -------------------------
@app.get("/date-range")
def get_date_range():
    if DATA_STORE["data"] is None:
        raise HTTPException(status_code=400, detail="No dataset available")

    df = DATA_STORE["data"].copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    return {
        "min": df["timestamp"].min().isoformat(),
        "max": df["timestamp"].max().isoformat()
    }

# -------------------------
# Download CSV
# -------------------------
@app.get("/download-data")
def download_data():
    if DATA_STORE["data"] is None:
        raise HTTPException(status_code=400, detail="No dataset available")

    stream = io.StringIO()
    DATA_STORE["data"].to_csv(stream, index=False)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"}
    )

# -------------------------
# Build transaction graph (uses filtered_data)
# -------------------------
@app.post("/build-graph")
def build_graph():
    df = DATA_STORE["filtered_data"]
    if df is None:
        raise HTTPException(status_code=400, detail="No data available")

    G = nx.DiGraph()

    for _, row in df.iterrows():
        G.add_edge(
            str(row["source"]),
            str(row["target"]),
            weight=float(row["amount"])
        )

    DATA_STORE["graph"] = G

    return {
        "message": "Graph built successfully",
        "nodes": len(G.nodes()),
        "edges": len(G.edges())
    }

# -------------------------
# Detect anomalies (flow imbalance)
# -------------------------
@app.post("/detect-anomalies")
def detect_anomalies():
    if DATA_STORE["graph"] is None:
        raise HTTPException(status_code=400, detail="Graph not built")

    G = DATA_STORE["graph"]
    results = []

    for node in G.nodes():
        inflow = sum(
            data.get("weight", 0)
            for _, _, data in G.in_edges(node, data=True)
        )
        outflow = sum(
            data.get("weight", 0)
            for _, _, data in G.out_edges(node, data=True)
        )

        degree = G.degree(node)
        anomaly_score = abs(inflow - outflow)

        results.append({
            "account": node,
            "degree": degree,
            "total_inflow": round(inflow, 2),
            "total_outflow": round(outflow, 2),
            "anomaly_score": round(anomaly_score, 2)
        })

    scores = [r["anomaly_score"] for r in results]
    mean_score = sum(scores) / len(scores)
    std_score = (sum((s - mean_score) ** 2 for s in scores) / len(scores)) ** 0.5
    threshold = mean_score + std_score

    for r in results:
        r["is_anomaly"] = r["anomaly_score"] > threshold

    DATA_STORE["results"] = results

    return {
        "message": "Anomaly detection complete",
        "threshold": round(threshold, 2),
        "total_accounts": len(results),
        "anomalies": sum(r["is_anomaly"] for r in results)
    }

# -------------------------
# Summary stats
# -------------------------
@app.get("/summary")
def get_summary():
    results = DATA_STORE["results"]
    filtered = DATA_STORE["filtered_data"]

    if results is None or filtered is None:
        raise HTTPException(status_code=400, detail="Run detection first")

    scores = [r["anomaly_score"] for r in results]
    mean_score = sum(scores) / len(scores)
    std_score = (sum((s - mean_score) ** 2 for s in scores) / len(scores)) ** 0.5
    threshold = mean_score + std_score

    anomaly_count = sum(r["is_anomaly"] for r in results)

    return {
        "total_transactions": len(filtered),
        "total_accounts": len(results),
        "anomaly_count": anomaly_count,
        "normal_count": len(results) - anomaly_count,
        "anomaly_rate": round(anomaly_count / len(results) * 100, 2),
        "threshold": round(threshold, 2),
        "mean_score": round(mean_score, 2),
        "std_score": round(std_score, 2)
    }

# -------------------------
# Results table
# -------------------------
@app.get("/results")
def get_results():
    if DATA_STORE["results"] is None:
        raise HTTPException(status_code=400, detail="No results available")
    return DATA_STORE["results"]

# -------------------------
# Graph visualization (SMART SAMPLING)
# -------------------------
@app.get("/graph")
def get_graph(limit: int = Query(300)):
    if DATA_STORE["graph"] is None:
        raise HTTPException(status_code=400, detail="Graph not built")

    G = DATA_STORE["graph"]
    results = DATA_STORE["results"] or []

    anomaly_nodes = {
        str(r["account"])
        for r in results
        if r.get("is_anomaly")
    }

    normal_nodes = [n for n in G.nodes() if n not in anomaly_nodes]

    sampled_nodes = (
        list(anomaly_nodes) +
        normal_nodes[: max(0, limit - len(anomaly_nodes))]
    )

    nodes = []
    edges = []

    for n in sampled_nodes:
        nodes.append({
            "id": n,
            "label": n,
            "color": "#ef4444" if n in anomaly_nodes else "#60a5fa"
        })

    for u, v in G.edges():
        if u in sampled_nodes and v in sampled_nodes:
            edges.append({"from": u, "to": v})

    return {"nodes": nodes, "edges": edges}

# -------------------------
# Fraud subgraph
# -------------------------
@app.get("/fraud-subgraph")
def fraud_subgraph():
    G = DATA_STORE["graph"]
    results = DATA_STORE["results"]

    if G is None or results is None:
        raise HTTPException(status_code=400, detail="Run detection first")

    anomalies = [r["account"] for r in results if r["is_anomaly"]]

    if len(anomalies) == 0:
        raise HTTPException(status_code=400, detail="No anomalies found")

    nodes = set()
    edges = []

    for a in anomalies[:10]:
        nodes.add(a)
        neighbors = list(G.successors(a)) + list(G.predecessors(a))
        for n in neighbors:
            nodes.add(n)
            if G.has_edge(a, n):
                edges.append((a, n))
            if G.has_edge(n, a):
                edges.append((n, a))

    node_list = []
    for n in nodes:
        node_list.append({
            "id": n,
            "label": n,
            "color": "#ef4444" if n in anomalies else "#60a5fa",
            "size": 25 if n in anomalies else 12
        })

    edge_list = [{"from": u, "to": v} for u, v in edges]

    return {"nodes": node_list, "edges": edge_list}