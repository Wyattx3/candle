---
name: csv-data-wrangling
description: Clean, transform, merge, and summarize CSV data with pandas - dedupe, fix types, handle missing values, pivot, join datasets, and emit a cleaned CSV plus a brief report.
tags: csv, pandas, data-cleaning, etl, python
---

# CSV Data Wrangling

Goal: take messy or multiple CSVs, clean and reshape them with pandas, and
deliver a cleaned CSV plus a short report — both via sandbox URLs.

## When to use
User has CSV (or TSV/Excel) data that needs deduping, type fixing, missing-value
handling, joining, pivoting, or summary stats.

## Setup
```
install_packages(manager="pip", packages=["pandas", "openpyxl"])
```
(`openpyxl` only if you also read/write `.xlsx`.) Fetch remote files first with
`http_request` → `write_sandbox_file`, or inspect a local one with
`inspect_sandbox_file(path="/home/user/data.csv")` to see its shape/columns
before loading.

## Load defensively (run_python)
```python
import pandas as pd
df = pd.read_csv("/home/user/data.csv",
                 dtype=str,            # load as text first, coerce later
                 keep_default_na=True,
                 skipinitialspace=True)
print(df.shape)
print(df.dtypes)
print(df.head().to_string())
```
Loading as `str` first avoids pandas guessing wrong types on dirty data. If the
delimiter is unknown, pass `sep=None, engine="python"` to sniff it. For odd
encodings try `encoding="latin-1"` or `encoding="utf-8-sig"` (strips BOM).

## Clean
```python
# normalize column names
df.columns = (df.columns.str.strip().str.lower()
              .str.replace(r"[^\w]+", "_", regex=True))

# drop fully-empty rows/cols, strip whitespace in string cells
df = df.dropna(how="all").dropna(axis=1, how="all")
for c in df.select_dtypes("object"):
    df[c] = df[c].str.strip()

# dedupe (optionally on a key subset)
before = len(df)
df = df.drop_duplicates(subset=["email"], keep="first")
print("removed", before - len(df), "dupes")

# fix types AFTER cleaning
df["amount"] = pd.to_numeric(df["amount"], errors="coerce")     # bad -> NaN
df["signup"] = pd.to_datetime(df["signup"], errors="coerce")

# handle missing values
df["amount"] = df["amount"].fillna(0)
df = df.dropna(subset=["email"])        # drop rows missing a required key
```

## Merge / join datasets
```python
a = pd.read_csv("/home/user/customers.csv")
b = pd.read_csv("/home/user/orders.csv")
merged = a.merge(b, on="customer_id", how="left",
                 suffixes=("_cust", "_order"))
print("matched rows:", merged["order_id"].notna().sum())
```
Use `how="inner"` to keep only matches, `"outer"` to keep everything, and
inspect unmatched keys with `indicator=True` then filter on `_merge`.

## Pivot / aggregate
```python
pivot = pd.pivot_table(df, index="region", columns="month",
                       values="amount", aggfunc="sum", fill_value=0)
summary = (df.groupby("region")["amount"]
           .agg(["count", "sum", "mean"]).round(2))
print(summary.to_string())
```

## Output cleaned CSV + report
```python
df.to_csv("/home/user/clean.csv", index=False)

report = []
report.append(f"Rows: {len(df)}  Columns: {len(df.columns)}")
report.append(f"Columns: {', '.join(df.columns)}")
report.append("\nMissing per column:\n" + df.isna().sum().to_string())
report.append("\nNumeric summary:\n" + df.describe().to_string())
open("/home/user/report.txt", "w", encoding="utf-8").write("\n".join(report))
print("done")
```

## Gotchas
- `errors="coerce"` turns unparseable values into NaN instead of crashing —
  always check how many NaNs it created before filling/dropping.
- `drop_duplicates` keeps the FIRST by default; sort first if "latest wins".
- Chained assignment (`df[df.x>0]["y"] = ...`) silently fails — use `.loc`.
- Mixed-type columns load as `object`; coerce explicitly, don't trust inference.
- Excel-exported CSVs often carry a UTF-8 BOM → use `encoding="utf-8-sig"`.
- For very large files, pass `chunksize=` to `read_csv` and process in batches.

## Deliver
```
run_terminal("ls -lh /home/user/clean.csv /home/user/report.txt")
get_sandbox_file_url(path="/home/user/clean.csv")
get_sandbox_file_url(path="/home/user/report.txt")
```
State row counts before/after, what was cleaned, and any dropped data. URLs on
the last lines.
