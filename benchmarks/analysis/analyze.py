#!/usr/bin/env python3
"""Dependency-free starter analysis for browser benchmark summaries."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from statistics import median
from typing import Any


DIFFICULTY_PATTERN = re.compile(r"^(.*)-(easy|medium|hard)-(\d+)$")


def parse_case_id(case_id: str) -> dict[str, str | int]:
    match = DIFFICULTY_PATTERN.match(case_id)
    if match is None:
        return {"site": case_id, "difficulty": "unknown", "seed": "unknown"}

    site, difficulty, seed = match.groups()
    return {"site": site, "difficulty": difficulty, "seed": int(seed)}


def read_summaries(root_dir: Path) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    if not root_dir.exists():
        return summaries

    for summary_path in sorted(root_dir.glob("*/summary.json")):
        try:
            with summary_path.open("r", encoding="utf-8") as handle:
                summary = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue

        if isinstance(summary, dict):
            summaries.append(summary)

    return summaries


def normalized_score(summary: dict[str, Any]) -> float:
    score = summary.get("score")
    if not isinstance(score, dict):
        return 0.0

    max_score = score.get("maxScore", 0)
    if not isinstance(max_score, (int, float)) or max_score <= 0:
        return 0.0

    total_score = score.get("totalScore", 0)
    return float(total_score) / float(max_score)


def sample_stddev(values: list[float]) -> float:
    if len(values) <= 1:
        return 0.0

    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
    return math.sqrt(variance)


def flatten_summary(summary: dict[str, Any]) -> dict[str, Any]:
    case_parts = parse_case_id(str(summary.get("caseId", "unknown")))
    metrics = summary.get("metrics") if isinstance(summary.get("metrics"), dict) else {}
    score = summary.get("score") if isinstance(summary.get("score"), dict) else {}

    return {
        "runId": summary.get("runId", ""),
        "caseId": summary.get("caseId", ""),
        **case_parts,
        "providerId": summary.get("providerId", ""),
        "modelId": summary.get("modelId", ""),
        "status": summary.get("status", ""),
        "passed": bool(score.get("passed", False)),
        "totalScore": score.get("totalScore", 0),
        "maxScore": score.get("maxScore", 0),
        "normalizedScore": normalized_score(summary),
        "elapsedMs": summary.get("elapsedMs", 0),
        "toolCallCount": metrics.get("toolCallCount", 0),
        "failedToolCallCount": metrics.get("failedToolCallCount", 0),
        "navigationAttemptCount": metrics.get("navigationAttemptCount", 0),
        "screenshotCount": metrics.get("screenshotCount", 0),
        "htmlReadCount": metrics.get("htmlReadCount", 0),
        "ariaSnapshotCount": metrics.get("ariaSnapshotCount", 0),
        "inputTokens": metrics.get("inputTokens", 0),
        "outputTokens": metrics.get("outputTokens", 0),
        "costUsd": metrics.get("costUsd", 0),
        "toolCallCountsByName": metrics.get("toolCallCountsByName", {}),
    }


def group_rows(rows: list[dict[str, Any]]) -> dict[tuple[Any, ...], list[dict[str, Any]]]:
    groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for row in rows:
        key = (
            row["providerId"],
            row["modelId"],
            row["site"],
            row["difficulty"],
            row["seed"],
        )
        groups.setdefault(key, []).append(row)

    return groups


def print_grouped_report(rows: list[dict[str, Any]]) -> None:
    headers = [
        "provider",
        "model",
        "site",
        "difficulty",
        "seed",
        "runs",
        "successRate",
        "meanScore",
        "scoreStddev",
        "medianLatencyMs",
        "inputTokens",
        "outputTokens",
        "costUsd",
    ]
    print("\t".join(headers))

    for key, group in sorted(group_rows(rows).items()):
        scores = [float(row["normalizedScore"]) for row in group]
        success_rate = sum(1 for row in group if row["passed"]) / len(group)
        latencies = [float(row["elapsedMs"]) for row in group]
        input_tokens = sum(int(row["inputTokens"] or 0) for row in group)
        output_tokens = sum(int(row["outputTokens"] or 0) for row in group)
        cost_usd = sum(float(row["costUsd"] or 0) for row in group)

        print(
            "\t".join(
                [
                    str(key[0]),
                    str(key[1]),
                    str(key[2]),
                    str(key[3]),
                    str(key[4]),
                    str(len(group)),
                    f"{success_rate:.3f}",
                    f"{sum(scores) / len(scores):.3f}",
                    f"{sample_stddev(scores):.3f}",
                    f"{median(latencies):.0f}",
                    str(input_tokens),
                    str(output_tokens),
                    f"{cost_usd:.6f}",
                ]
            )
        )


def write_jsonl(rows: list[dict[str, Any]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, separators=(",", ":")))
            handle.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", default="data/benchmark-runs", help="Benchmark run root directory")
    parser.add_argument("--jsonl", help="Optional flattened JSONL output path")
    args = parser.parse_args()

    summaries = read_summaries(Path(args.dir))
    rows = [flatten_summary(summary) for summary in summaries]

    if args.jsonl:
        write_jsonl(rows, Path(args.jsonl))

    print_grouped_report(rows)


if __name__ == "__main__":
    main()
