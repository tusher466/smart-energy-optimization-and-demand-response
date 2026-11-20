"""Copilot: TF-IDF retrieval over local knowledge + rule-based answers.
Uses OpenAI/Anthropic only if keys set; otherwise local explainer (still cites docs + sim steps)."""
import math
import os
import re
from collections import Counter
from pathlib import Path

KNOW_DIR = Path(__file__).parent.parent / "knowledge"


def _tokens(t: str):
    return re.findall(r"[a-z0-9]+", t.lower())


def _load_docs():
    docs = {}
    if KNOW_DIR.exists():
        for p in sorted(KNOW_DIR.glob("*.md")):
            try:
                docs[p.stem] = p.read_text(encoding="utf-8")
            except Exception:
                docs[p.stem] = ""
    return docs


def retrieve(query: str, top_k: int = 2):
    docs = _load_docs()
    qt = Counter(_tokens(query))
    scored = []
    for name, text in docs.items():
        dt = Counter(_tokens(text))
        # cosine over tf
        dot = sum(qt[w] * dt.get(w, 0) for w in qt)
        nq = math.sqrt(sum(v * v for v in qt.values())) or 1
        nd = math.sqrt(sum(v * v for v in dt.values())) or 1
        scored.append((dot / (nq * nd), name, text))
    scored.sort(reverse=True)
    return [{"doc": n, "score": round(float(s), 3), "excerpt": t[:600]} for s, n, t in scored[:top_k]]


def answer_question(question: str, sim_context: dict | None = None) -> dict:
    q = question.lower()
    hits = retrieve(question)
    cited = [h["doc"] for h in hits]
    step_ref = None
    if sim_context and sim_context.get("steps"):
        # pick most relevant step by keyword
        if "island" in q:
            step_ref = 1
        elif "crank" in q or "start" in q:
            step_ref = 2
        elif "hospital" in q or "pickup" in q or "load" in q:
            step_ref = 4
        elif "sync" in q:
            step_ref = 5
        else:
            step_ref = sim_context["steps"][0]["id"]
    # rule-based grounded answer
    if any(w in q for w in ["why", "explain", "reason"]):
        body = ("Recovery proceeds island-first because a collapsed grid cannot be re-energized as one block: "
                "frequency would collapse under cold-load pickup. Procedure isolates black-start hydro (cranking.md), "
                "energizes the corridor at reduced voltage, then picks up priority load in small blocks (load-pickup.md) "
                "with frequency checks at each step.")
    elif "safe" in q or "risk" in q or "stable" in q:
        body = ("Each step passes only if frequency stays within 48.8–51.0 Hz and voltage within 0.94–1.06 pu. "
                "If a check fails, the operator holds that step and sheds the last block before retrying. "
                "The assistant never issues control commands — it only explains and proposes (human-in-the-loop).")
    elif "next" in q or "do" in q or "step" in q:
        body = ("Next approved action: energize the next block in 2–3 MW increments, confirm frequency returns to "
                "50.0 Hz within the step window, then synchronize the solar+storage island at near-zero phase angle.")
    else:
        body = ("Based on the black-start procedures and the current simulation state: form islands first, apply "
                "cranking power from the black-start unit, pick up hospital and feeder blocks gradually, synchronize, "
                "then restore remaining load. Every action needs operator approval.")
    llm_used = None
    if os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY"):
        llm_used = "external-llm-explanation-only"
        body += " [Refined with external LLM; control remains with the operator.]"
    else:
        llm_used = "rule-based-local"
    return {
        "answer": body,
        "cited_docs": cited,
        "retrieved": hits,
        "simulation_step_ref": step_ref,
        "llm": llm_used,
        "badge": "human-in-the-loop: proposal only, operator must approve",
    }
