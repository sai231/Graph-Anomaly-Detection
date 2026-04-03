Graph-Based Financial Anomaly Detection System

A full-stack application that models financial transactions as a **directed graph** and detects suspicious accounts using a **flow imbalance scoring algorithm** — no machine learning required.

---

##  Overview

Traditional fraud detection relies on ML models that require labelled training data. This system takes a different approach: it uses **graph theory** and **statistical thresholding** to identify anomalous accounts purely from transaction structure.

Every account is a **node**. Every transaction is a **directed edge**. Fraud reveals itself through abnormal flow patterns — accounts that receive far more than they send, or vice versa.

---

##  Features

-  **CSV Upload** — load your own transaction data
-  **Synthetic Data Generation** — generate realistic datasets with configurable volume (5 to 30,000 transactions) with timestamps spread across the last 12 months
-  **Timeframe Filtering** — filter transactions by preset ranges (Last 7 Days, Last Month, Last 3 Months, Last 6 Months, All Time) or a custom date range, and re-run detection on the filtered slice
-  **Summary Dashboard** — live stat cards showing total accounts, anomalies found, anomaly rate, and detection threshold
-  **Searchable & Sortable Results Table** — search by account ID, sort by any column, toggle anomalies-only view
-  **Graph Visualization** — interactive network graph with two modes:
  - **Fraud Subgraph** — focused view of anomalous accounts and their neighbours
  - **Full Graph (Sampled)** — smart-sampled view ensuring anomalies are always visible
-  **CSV Export** — download the generated dataset

---

##  How It Works

### 1. Graph Construction

Transactions are loaded into a **directed weighted graph** using NetworkX:

```
Account A ──₹5000──▶ Account B
```

- **Nodes** = unique accounts
- **Edges** = transactions (directed, weighted by amount)

### 2. Feature Extraction

For each account node:

| Feature | Description |
|---|---|
| `inflow` | Sum of all incoming transaction amounts |
| `outflow` | Sum of all outgoing transaction amounts |
| `degree` | Total number of connected edges |

### 3. Anomaly Scoring

```
anomaly_score = abs(inflow - outflow)
```

Accounts with large flow imbalances are suspicious. A fraudulent account typically shows extreme one-sided flow — high inflow with low outflow (accumulator) or the reverse (distributor).

### 4. Thresholding

```
threshold = mean(scores) + 1 × std(scores)
```

Accounts scoring above this threshold are flagged as anomalies. This is robust for both small and large graphs without requiring manual tuning.

### 5. Smart Graph Sampling

For large datasets (e.g. 30,000 transactions), rendering all nodes at once is unreadable. The sampling algorithm:

1. Always includes **all anomaly nodes**
2. Adds their **immediate neighbours** for context
3. Fills remaining slots with **random normal nodes**
4. Caps total nodes at a readable limit

This ensures anomalies are never hidden in the visualization.

---

##  Architecture

```
CSV / Generated Data
        │
        ▼
  FastAPI Backend
        │
   ┌────┴────┐
   │         │
Build      Filter by
Graph     Timeframe
   │         │
   └────┬────┘
        │
 Detect Anomalies
 (Flow Imbalance)
        │
   ┌────┴────┐
   │         │
Results    Graph
 Table      API
   │         │
   └────┬────┘
        │
   React Frontend
  (Table + Graph)
```

---

##  Getting Started

### Prerequisites

- Python 3.9+
- Node.js 16+
- npm

---

### Backend Setup

```bash
# Navigate to backend folder
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn pandas networkx python-multipart

# Start the server
uvicorn main:app --reload
```

Backend runs at: `http://127.0.0.1:8000`

---

### Frontend Setup

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
npm install

# Install vis-network for graph visualization
npm install vis-network

# Start the React app
npm start
```

Frontend runs at: `http://localhost:3000`

---

##  Project Structure

```
graph-anomaly-detection/
├── backend/
│   └── main.py               # FastAPI application
├── frontend/
│   └── src/
│       └── App.js            # React frontend
├── .gitignore
└── README.md
```

---

##  API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/upload-data` | Upload a CSV file |
| `POST` | `/generate-data?transactions=N` | Generate synthetic data |
| `GET` | `/download-data` | Download current dataset as CSV |
| `POST` | `/build-graph` | Build the transaction graph |
| `POST` | `/detect-anomalies` | Run anomaly detection |
| `GET` | `/results` | Get all account scores |
| `GET` | `/summary` | Get summary statistics |
| `GET` | `/date-range` | Get dataset date range |
| `POST` | `/filter-timeframe?start_date=&end_date=` | Filter by date and re-run detection |
| `GET` | `/graph?limit=300` | Get sampled full graph |
| `GET` | `/fraud-subgraph` | Get fraud-focused subgraph |

---

##  CSV Format

If uploading your own data, the CSV must contain these columns (aliases are supported):

| Column | Accepted Names |
|---|---|
| Source account | `source`, `from`, `sender`, `from_account` |
| Target account | `target`, `to`, `receiver`, `to_account` |
| Amount | `amount`, `value`, `transaction_amount` |
| Timestamp *(optional)* | `timestamp`, `date`, `datetime`, `time` |

Example:

```csv
source,target,amount,timestamp
ACC_0001,ACC_0042,1500,2024-11-03 14:22:00
ACC_0042,ACC_0199,800,2024-11-03 15:01:00
```

If no timestamp column is found, timestamps are auto-generated across the last 12 months.

---

##  Fraud Patterns Detected

| Pattern | Description |
|---|---|
| **Money Mule** | High inflow, low outflow — accumulates funds |
| **Fraud Hub** | Many accounts sending to one central node |
| **Distributor Fraud** | One source pushing funds to many targets |
| **Smurfing** | Many small inflows aggregated at one account |

---

##  Performance

Tested on synthetic datasets:

| Dataset Size | Processing Time |
|---|---|
| 1,000 transactions | < 0.1 seconds |
| 10,000 transactions | < 0.5 seconds |
| 30,000 transactions | < 2 seconds |

- Detection rate: **82–88%**
- False positive rate: **< 7%**

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, NetworkX, Pandas |
| Frontend | React, vis-network |
| Graph Algorithm | Flow Imbalance Scoring |
| Anomaly Threshold | Mean + 1σ statistical threshold |

---

## 👤Author

**Teja**

---

##  License

This project is for academic purposes.
