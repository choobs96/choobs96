#!/usr/bin/env python3
"""Push Moomoo positions into Asset Hub.

Needs OpenD running and logged in on this machine, plus:
    pip install moomoo-api requests

Usage (e.g. from cron every few hours):
    ASSET_HUB_URL=http://127.0.0.1:8787 BRIDGE_TOKEN=... ASSET_HUB_ACCOUNT=moomoo python3 bridges/moomoo_export.py
"""
import os
import sys

import requests
from moomoo import OpenSecTradeContext, TrdMarket, TrdEnv, SecurityFirm, Currency, RET_OK

HUB = os.environ.get("ASSET_HUB_URL", "http://127.0.0.1:8787")
TOKEN = os.environ["BRIDGE_TOKEN"]
ACCOUNT = os.environ.get("ASSET_HUB_ACCOUNT", "moomoo")
OPEND_HOST = os.environ.get("OPEND_HOST", "127.0.0.1")
OPEND_PORT = int(os.environ.get("OPEND_PORT", "11111"))
# Moomoo AU accounts use FUTUAU; SG uses FUTUSG; US uses FUTUINC.
FIRM = getattr(SecurityFirm, os.environ.get("MOOMOO_FIRM", "FUTUAU"))
MARKETS = [m.strip() for m in os.environ.get("MOOMOO_MARKETS", "US,HK,AU").split(",") if m.strip()]

EXCHANGE = {"US": "NASDAQ", "HK": "SEHK", "AU": "ASX", "SG": "SGX"}
CCY = {"US": "USD", "HK": "HKD", "AU": "AUD", "SG": "SGD", "CN": "CNY", "JP": "JPY"}


def num(v):
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def main():
    holdings = []
    for market in MARKETS:
        ctx = OpenSecTradeContext(filter_trdmarket=getattr(TrdMarket, market), host=OPEND_HOST, port=OPEND_PORT, security_firm=FIRM)
        try:
            ret, pos = ctx.position_list_query(trd_env=TrdEnv.REAL, refresh_cache=True)
            if ret != RET_OK:
                print(f"{market}: positions failed: {pos}", file=sys.stderr)
                continue
            for _, p in pos.iterrows():
                qty = num(p.get("qty"))
                if not qty:
                    continue
                code = str(p.get("code", ""))
                prefix = code.split(".")[0] if "." in code else market
                holdings.append({
                    "symbol": code.split(".", 1)[-1],
                    "name": p.get("stock_name") or code,
                    "cls": "stock",
                    "ccy": p.get("currency") or CCY.get(prefix, "USD"),
                    "exchange": EXCHANGE.get(prefix, prefix),
                    "qty": qty,
                    "price": num(p.get("nominal_price")),
                    "value": num(p.get("market_val")),
                    "cost": (num(p.get("average_cost")) or num(p.get("cost_price")) or 0) * qty or None,
                })
            # Cash is reported in the currency we ask for; ask in USD and label it so.
            ret, acc = ctx.accinfo_query(trd_env=TrdEnv.REAL, refresh_cache=True, currency=Currency.USD)
            if ret == RET_OK and len(acc):
                cash = num(acc.iloc[0].get("cash"))
                if cash:
                    holdings.append({"symbol": "USD", "name": f"Cash ({market} account)", "cls": "cash", "ccy": "USD", "value": cash})
        finally:
            ctx.close()

    r = requests.post(f"{HUB}/api/bridge/{ACCOUNT}", json={"holdings": holdings}, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=30)
    r.raise_for_status()
    print(f"Pushed {len(holdings)} Moomoo rows to Asset Hub.")


if __name__ == "__main__":
    main()
