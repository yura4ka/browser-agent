#!/usr/bin/env python3
"""Analyze browser benchmark summaries and generate performance plots."""

from __future__ import annotations

import argparse
import json
import re
import sys
import textwrap
from pathlib import Path
from typing import Any

try:
    import matplotlib
    import numpy as np
    import pandas as pd
except ModuleNotFoundError as error:
    print(
        f"Missing Python dependency: {error.name}. Activate the benchmark venv with "
        "numpy, pandas, and matplotlib installed, then run this script again.",
        file=sys.stderr,
    )
    raise SystemExit(1) from error

matplotlib.use("Agg")
import matplotlib.pyplot as plt


DIFFICULTY_ORDER = ["easy", "medium", "hard"]
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
        except (OSError, json.JSONDecodeError) as error:
            print(f"Skipping {summary_path}: {error}")
            continue

        if isinstance(summary, dict):
            summary["summaryPath"] = str(summary_path)
            summaries.append(summary)

    return summaries


def number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)) and np.isfinite(value):
        return float(value)
    return default


def flatten_summary(summary: dict[str, Any]) -> dict[str, Any]:
    case_id = str(summary.get("caseId", "unknown"))
    case_parts = parse_case_id(case_id)
    metrics = summary.get("metrics") if isinstance(summary.get("metrics"), dict) else {}
    score = summary.get("score") if isinstance(summary.get("score"), dict) else {}
    provider_id = str(summary.get("providerId", "unknown"))
    model_id = str(summary.get("modelId", "unknown"))

    input_tokens = number(metrics.get("inputTokens"), 0.0)
    output_tokens = number(metrics.get("outputTokens"), 0.0)

    return {
        "summaryPath": summary.get("summaryPath", ""),
        "runId": summary.get("runId", ""),
        "caseId": case_id,
        **case_parts,
        "providerId": provider_id,
        "modelId": model_id,
        "model": f"{provider_id}/{model_id}",
        "modelLabel": model_id,
        "status": summary.get("status", "unknown"),
        "passed": bool(score.get("passed", False)),
        "rawTotalScore": number(score.get("totalScore"), 0.0),
        "rawMaxScore": number(score.get("maxScore"), np.nan),
        "elapsedMs": number(summary.get("elapsedMs"), 0.0),
        "toolCallCount": number(metrics.get("toolCallCount"), 0.0),
        "failedToolCallCount": number(metrics.get("failedToolCallCount"), 0.0),
        "navigationAttemptCount": number(metrics.get("navigationAttemptCount"), 0.0),
        "screenshotCount": number(metrics.get("screenshotCount"), 0.0),
        "htmlReadCount": number(metrics.get("htmlReadCount"), 0.0),
        "ariaSnapshotCount": number(metrics.get("ariaSnapshotCount"), 0.0),
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": input_tokens + output_tokens,
        "costUsd": number(metrics.get("costUsd"), 0.0),
        "toolCallCountsByName": metrics.get("toolCallCountsByName", {}),
    }


def build_runs_frame(summaries: list[dict[str, Any]]) -> pd.DataFrame:
    rows = [flatten_summary(summary) for summary in summaries]
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(
            columns=[
                "summaryPath",
                "runId",
                "caseId",
                "site",
                "difficulty",
                "seed",
                "providerId",
                "modelId",
                "model",
                "modelLabel",
                "status",
                "passed",
                "rawTotalScore",
                "rawMaxScore",
                "effectiveTotalScore",
                "effectiveMaxScore",
                "effectiveNormalizedScore",
                "elapsedMs",
                "toolCallCount",
                "failedToolCallCount",
                "toolErrorRate",
                "navigationAttemptCount",
                "screenshotCount",
                "htmlReadCount",
                "ariaSnapshotCount",
                "inputTokens",
                "outputTokens",
                "totalTokens",
                "costUsd",
                "toolCallCountsByName",
            ]
        )

    case_max_scores = df.groupby("caseId")["rawMaxScore"].transform("max")
    df["effectiveMaxScore"] = df["rawMaxScore"].fillna(case_max_scores).fillna(0.0)
    df["effectiveTotalScore"] = np.where(
        df["status"].eq("completed"), df["rawTotalScore"], 0.0
    )
    df["effectiveNormalizedScore"] = safe_divide(
        df["effectiveTotalScore"], df["effectiveMaxScore"]
    )
    df["toolErrorRate"] = safe_divide(
        df["failedToolCallCount"], df["toolCallCount"]
    )

    return df


def safe_divide(numerator: Any, denominator: Any) -> Any:
    with np.errstate(divide="ignore", invalid="ignore"):
        result = np.divide(numerator, denominator)
    if np.isscalar(result):
        return 0.0 if not np.isfinite(result) else float(result)
    return pd.Series(result).replace([np.inf, -np.inf], 0.0).fillna(0.0)


def points_success_rate(group: pd.DataFrame) -> float:
    return float(safe_divide(group["effectiveTotalScore"].sum(), group["effectiveMaxScore"].sum()))


def tool_error_rate(group: pd.DataFrame) -> float:
    return float(safe_divide(group["failedToolCallCount"].sum(), group["toolCallCount"].sum()))


def summarize_group(group: pd.DataFrame) -> pd.Series:
    total_score = group["effectiveTotalScore"].sum()
    max_score = group["effectiveMaxScore"].sum()
    tool_calls = group["toolCallCount"].sum()
    total_tokens = group["totalTokens"].sum()
    cost = group["costUsd"].sum()
    completed = group["status"].eq("completed")

    return pd.Series(
        {
            "runs": int(len(group)),
            "completedRuns": int(completed.sum()),
            "failedRuns": int(group["status"].eq("failed").sum()),
            "timeoutRuns": int(group["status"].eq("timeout").sum()),
            "abortedRuns": int(group["status"].eq("aborted").sum()),
            "pointsEarned": total_score,
            "pointsPossible": max_score,
            "pointsSuccessRate": safe_divide(total_score, max_score),
            "meanNormalizedScore": group["effectiveNormalizedScore"].mean(),
            "scoreStddev": group["effectiveNormalizedScore"].std(ddof=1)
            if len(group) > 1
            else 0.0,
            "perfectPassRate": group["passed"].mean(),
            "toolCallCount": tool_calls,
            "failedToolCallCount": group["failedToolCallCount"].sum(),
            "toolErrorRate": safe_divide(group["failedToolCallCount"].sum(), tool_calls),
            "toolCallsPerRun": safe_divide(tool_calls, len(group)),
            "toolCallsPerPoint": safe_divide(tool_calls, total_score),
            "totalTokens": total_tokens,
            "tokensPerRun": safe_divide(total_tokens, len(group)),
            "tokensPerPoint": safe_divide(total_tokens, total_score),
            "medianLatencyMs": group["elapsedMs"].median(),
            "costUsd": cost,
            "costPerPoint": safe_divide(cost, total_score),
        }
    )


def build_summaries(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    if df.empty:
        empty_summary = pd.DataFrame()
        return empty_summary, empty_summary

    model_summary = (
        df.groupby(["providerId", "modelId", "model", "modelLabel"], dropna=False)
        .apply(summarize_group)
        .reset_index()
        .sort_values(["pointsSuccessRate", "pointsEarned"], ascending=[False, False])
    )
    by_task_difficulty = (
        df.groupby(
            ["providerId", "modelId", "model", "modelLabel", "site", "difficulty"],
            dropna=False,
        )
        .apply(summarize_group)
        .reset_index()
        .sort_values(["site", "difficulty", "pointsSuccessRate"], ascending=[True, True, False])
    )

    return model_summary, by_task_difficulty


def build_tool_usage_frame(df: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        counts = row.get("toolCallCountsByName", {})
        if not isinstance(counts, dict):
            continue
        for tool_name, count in counts.items():
            rows.append(
                {
                    "providerId": row["providerId"],
                    "modelId": row["modelId"],
                    "model": row["model"],
                    "modelLabel": row["modelLabel"],
                    "difficulty": row["difficulty"],
                    "toolName": tool_name or "unknown",
                    "toolCallCount": number(count, 0.0),
                }
            )

    if not rows:
        return pd.DataFrame(
            columns=[
                "providerId",
                "modelId",
                "model",
                "modelLabel",
                "difficulty",
                "toolName",
                "toolCallCount",
            ]
        )

    return (
        pd.DataFrame(rows)
        .groupby(
            ["providerId", "modelId", "model", "modelLabel", "difficulty", "toolName"],
            as_index=False,
        )
        ["toolCallCount"]
        .sum()
        .sort_values(["difficulty", "model", "toolCallCount"], ascending=[True, True, False])
    )


def build_results_table(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    rows = []
    for (site, difficulty, model_label), group in df.groupby(
        ["site", "difficulty", "modelLabel"], dropna=False
    ):
        rows.append(
            {
                "siteDifficulty": f"{site} / {difficulty}",
                "site": site,
                "difficulty": difficulty,
                "modelLabel": model_label,
                "pointsSuccessRate": points_success_rate(group),
            }
        )

    table_source = pd.DataFrame(rows)
    if table_source.empty:
        return pd.DataFrame()

    table_source["difficultyOrder"] = table_source["difficulty"].map(
        {difficulty: index for index, difficulty in enumerate(DIFFICULTY_ORDER)}
    ).fillna(len(DIFFICULTY_ORDER))
    table_source = table_source.sort_values(["site", "difficultyOrder", "difficulty"])
    table_source["percentage"] = table_source["pointsSuccessRate"].map(
        lambda value: f"{value * 100:.1f}%"
    )
    row_order = table_source["siteDifficulty"].drop_duplicates().tolist()

    return table_source.pivot(
        index="siteDifficulty", columns="modelLabel", values="percentage"
    ).reindex(row_order).fillna("-")


def write_markdown_table(table: pd.DataFrame, output_path: Path) -> None:
    if table.empty:
        output_path.write_text("No benchmark summaries found.\n", encoding="utf-8")
        return

    headers = ["site / difficulty", *[str(column) for column in table.columns]]
    lines = [
        f"| {' | '.join(headers)} |",
        f"| {' | '.join(['---'] * len(headers))} |",
    ]
    for index, row in table.iterrows():
        values = [str(index), *[str(row[column]) for column in table.columns]]
        lines.append(f"| {' | '.join(values)} |")

    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_outputs(
    df: pd.DataFrame,
    model_summary: pd.DataFrame,
    by_task_difficulty: pd.DataFrame,
    tool_usage: pd.DataFrame,
    results_table: pd.DataFrame,
    output_dir: Path,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_df = df.drop(columns=["toolCallCountsByName"], errors="ignore")
    csv_df.to_csv(output_dir / "runs.csv", index=False)
    model_summary.to_csv(output_dir / "model_summary.csv", index=False)
    by_task_difficulty.to_csv(output_dir / "by_model_task_difficulty.csv", index=False)
    tool_usage.to_csv(output_dir / "tool_usage_by_model_difficulty.csv", index=False)
    results_table.to_csv(output_dir / "results_table.csv")
    write_markdown_table(results_table, output_dir / "results_table.md")


def wrapped_labels(labels: list[str], width: int = 24) -> list[str]:
    return ["\n".join(textwrap.wrap(label, width=width) or [label]) for label in labels]


def sanitize_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_") or "unknown"


def ordered_difficulties(values: pd.Index | list[str]) -> list[str]:
    value_set = set(values)
    ordered = [difficulty for difficulty in DIFFICULTY_ORDER if difficulty in value_set]
    ordered.extend(sorted(value_set - set(DIFFICULTY_ORDER)))
    return ordered


def finish_plot(path: Path) -> None:
    plt.tight_layout()
    plt.savefig(path, dpi=160)
    plt.close()


def format_rate_label(value: float) -> str:
    return f"{value * 100:.1f}%"


def format_number_label(value: float) -> str:
    if abs(value) >= 1000:
        return f"{value:,.0f}"
    if float(value).is_integer():
        return f"{value:.0f}"
    return f"{value:.1f}"


def add_vertical_bar_labels(
    bars: Any,
    formatter: Any,
    padding: int = 3,
) -> None:
    axis = plt.gca()
    for bar in bars:
        height = bar.get_height()
        if not np.isfinite(height) or height == 0:
            continue
        axis.annotate(
            formatter(float(height)),
            xy=(bar.get_x() + bar.get_width() / 2, height),
            xytext=(0, padding),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=8,
            rotation=90,
            clip_on=False,
        )


def plot_grouped_bars(
    pivot: pd.DataFrame,
    title: str,
    ylabel: str,
    output_path: Path,
    ylim: tuple[float, float] | None = None,
    legend_title: str = "difficulty",
    label_formatter: Any = format_number_label,
) -> None:
    if pivot.empty:
        return

    pivot = pivot.fillna(0.0)
    x = np.arange(len(pivot.index))
    columns = list(pivot.columns)
    group_width = min(0.68, max(0.28, 0.16 * len(columns)))
    width = min(0.18, group_width / max(len(columns), 1))

    plt.figure(figsize=(max(8.0, len(pivot.index) * 1.4), 5.2))
    for index, column in enumerate(columns):
        offset = (index - (len(columns) - 1) / 2) * width
        bars = plt.bar(x + offset, pivot[column].to_numpy(), width=width, label=str(column))
        add_vertical_bar_labels(bars, label_formatter)

    plt.title(title)
    plt.ylabel(ylabel)
    if ylim is not None:
        plt.ylim(*ylim)
    plt.xticks(x, wrapped_labels([str(value) for value in pivot.index]), rotation=30, ha="right")
    plt.legend(title=legend_title)
    plt.grid(axis="y", alpha=0.25)
    finish_plot(output_path)


def plot_points_success_by_task(df: pd.DataFrame, plots_dir: Path) -> None:
    for site, site_df in df.groupby("site", dropna=False):
        grouped = (
            site_df.groupby(["modelLabel", "difficulty"], dropna=False)
            .apply(points_success_rate)
            .rename("pointsSuccessRate")
            .reset_index()
        )
        if grouped.empty:
            continue

        pivot = grouped.pivot(index="modelLabel", columns="difficulty", values="pointsSuccessRate")
        pivot = pivot.reindex(columns=ordered_difficulties(list(pivot.columns)))
        output_path = plots_dir / f"points_success_by_task_{sanitize_filename(str(site))}.png"
        plot_grouped_bars(
            pivot,
            f"Points-Based Success Rate: {site}",
            "points success rate",
            output_path,
            ylim=(0.0, 1.0),
            label_formatter=format_rate_label,
        )


def plot_points_success_all_runs(df: pd.DataFrame, plots_dir: Path) -> None:
    grouped = (
        df.groupby("modelLabel", dropna=False)
        .apply(points_success_rate)
        .rename("pointsSuccessRate")
        .sort_values(ascending=False)
    )
    if grouped.empty:
        return

    plt.figure(figsize=(max(8.0, len(grouped.index) * 1.2), 5.2))
    bars = plt.bar(np.arange(len(grouped.index)), grouped.to_numpy(), width=0.32)
    add_vertical_bar_labels(bars, format_rate_label)
    plt.title("Points-Based Success Rate: All Runs")
    plt.ylabel("points success rate")
    plt.ylim(0.0, 1.0)
    plt.xticks(
        np.arange(len(grouped.index)),
        wrapped_labels([str(value) for value in grouped.index]),
        rotation=30,
        ha="right",
    )
    plt.grid(axis="y", alpha=0.25)
    finish_plot(plots_dir / "points_success_all_runs.png")


def plot_tool_error_rate_by_difficulty(df: pd.DataFrame, plots_dir: Path) -> None:
    grouped = (
        df.groupby(["modelLabel", "difficulty"], dropna=False)
        .apply(tool_error_rate)
        .rename("toolErrorRate")
        .reset_index()
    )
    if grouped.empty:
        return

    pivot = grouped.pivot(index="modelLabel", columns="difficulty", values="toolErrorRate")
    pivot = pivot.reindex(columns=ordered_difficulties(list(pivot.columns)))
    plot_grouped_bars(
        pivot,
        "Tool Error Rate by Difficulty",
        "failed tool calls / tool calls",
        plots_dir / "tool_error_rate_by_difficulty.png",
        ylim=(0.0, max(1.0, float(pivot.max().max()) * 1.1)),
        label_formatter=format_rate_label,
    )


def plot_tool_usage_by_difficulty(
    tool_usage: pd.DataFrame, plots_dir: Path, top_tools: int
) -> None:
    if tool_usage.empty:
        return

    for difficulty, difficulty_df in tool_usage.groupby("difficulty", dropna=False):
        top_names = (
            difficulty_df.groupby("toolName")["toolCallCount"]
            .sum()
            .sort_values(ascending=False)
            .head(top_tools)
            .index
        )
        plot_df = difficulty_df.copy()
        plot_df["plotToolName"] = np.where(
            plot_df["toolName"].isin(top_names), plot_df["toolName"], "other"
        )
        pivot = plot_df.pivot_table(
            index="modelLabel",
            columns="plotToolName",
            values="toolCallCount",
            aggfunc="sum",
            fill_value=0.0,
        )
        if pivot.empty:
            continue

        totals = pivot.sum(axis=1).sort_values(ascending=True)
        pivot = pivot.loc[totals.index]
        columns = pivot.sum(axis=0).sort_values(ascending=False).index.tolist()
        if "other" in columns:
            columns = [column for column in columns if column != "other"] + ["other"]
        pivot = pivot[columns]

        height = max(4.8, len(pivot.index) * 0.75)
        plt.figure(figsize=(10.5, height))
        axis = plt.gca()
        left = np.zeros(len(pivot.index))
        y = np.arange(len(pivot.index))
        for column in pivot.columns:
            values = pivot[column].to_numpy(dtype=float)
            plt.barh(y, values, left=left, label=str(column))
            for row_index, value in enumerate(values):
                if value <= 0:
                    continue
                axis.text(
                    left[row_index] + value / 2,
                    y[row_index],
                    format_number_label(float(value)),
                    ha="center",
                    va="center",
                    fontsize=8,
                )
            left += values

        plt.title(f"Tool Usage by Model: {difficulty}")
        plt.xlabel("tool call count")
        plt.yticks(y, wrapped_labels([str(value) for value in pivot.index], width=32))
        plt.grid(axis="x", alpha=0.25)
        plt.legend(title="tool", bbox_to_anchor=(1.02, 1), loc="upper left")
        finish_plot(plots_dir / f"tool_usage_{sanitize_filename(str(difficulty))}.png")


def plot_average_tokens_per_run_by_site(df: pd.DataFrame, plots_dir: Path) -> None:
    grouped = df.groupby(["modelLabel", "site"], dropna=False).apply(
        lambda group: safe_divide(group["totalTokens"].sum(), len(group))
    )
    grouped = grouped.rename("averageTokensPerRun").reset_index()
    if grouped.empty:
        return

    pivot = grouped.pivot(index="modelLabel", columns="site", values="averageTokensPerRun")
    plot_grouped_bars(
        pivot,
        "Average Tokens Per Run by Site",
        "average tokens per run",
        plots_dir / "average_tokens_per_run_by_site.png",
        legend_title="site",
        label_formatter=format_number_label,
    )


def write_plots(df: pd.DataFrame, tool_usage: pd.DataFrame, output_dir: Path, top_tools: int) -> None:
    plots_dir = output_dir / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)
    stale_total_tokens_plot = plots_dir / "total_tokens_by_model_difficulty.png"
    if stale_total_tokens_plot.exists():
        stale_total_tokens_plot.unlink()
    if df.empty:
        return

    plot_points_success_by_task(df, plots_dir)
    plot_points_success_all_runs(df, plots_dir)
    plot_tool_error_rate_by_difficulty(df, plots_dir)
    plot_tool_usage_by_difficulty(tool_usage, plots_dir, top_tools)
    plot_average_tokens_per_run_by_site(df, plots_dir)


def print_report(model_summary: pd.DataFrame, output_dir: Path) -> None:
    if model_summary.empty:
        print("No benchmark summaries found.")
        return

    columns = [
        "modelLabel",
        "runs",
        "pointsSuccessRate",
        "toolErrorRate",
        "toolCallCount",
        "totalTokens",
        "medianLatencyMs",
        "costUsd",
    ]
    print(model_summary[columns].to_string(index=False, float_format=lambda value: f"{value:.4f}"))
    print(f"\nWrote analysis outputs to {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", default="data/benchmark-runs", help="Benchmark run root directory")
    parser.add_argument(
        "--out",
        default="benchmarks/analysis/out",
        help="Directory for CSV and PNG analysis outputs",
    )
    parser.add_argument(
        "--top-tools",
        type=int,
        default=8,
        help="Number of tool names to show before grouping the rest as 'other'",
    )
    parser.add_argument("--no-plots", action="store_true", help="Only write CSV outputs")
    args = parser.parse_args()

    summaries = read_summaries(Path(args.dir))
    runs = build_runs_frame(summaries)
    model_summary, by_task_difficulty = build_summaries(runs)
    tool_usage = build_tool_usage_frame(runs)
    results_table = build_results_table(runs)
    output_dir = Path(args.out)

    write_outputs(
        runs,
        model_summary,
        by_task_difficulty,
        tool_usage,
        results_table,
        output_dir,
    )
    if not args.no_plots:
        write_plots(runs, tool_usage, output_dir, max(args.top_tools, 1))

    print_report(model_summary, output_dir)


if __name__ == "__main__":
    main()
