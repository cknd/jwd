const fs = require("fs/promises");
const path = require("path");

async function summarizeJSCoverage(entries, origin, repoRoot) {
  const perFile = new Map();

  for (const entry of entries) {
    const filePath = normalizeCoveragePath(entry.url, origin);
    if (!filePath || !filePath.startsWith("src/")) {
      continue;
    }

    const textLength = await resolveSourceLength(entry, filePath, repoRoot);
    const ranges = [];
    for (const fn of entry.functions || []) {
      for (const range of fn.ranges || []) {
        if (range.count > 0) {
          ranges.push({ start: range.startOffset, end: range.endOffset });
        }
      }
    }

    perFile.set(filePath, buildCoverageRecord(filePath, textLength, ranges, "js"));
  }

  return Array.from(perFile.values()).sort(sortCoverageRecords);
}

async function summarizeCSSCoverage(entries, origin, repoRoot) {
  const summaries = [];

  for (const entry of entries) {
    const filePath = normalizeCoveragePath(entry.url, origin);
    if (!filePath || !filePath.endsWith("styles.css")) {
      continue;
    }

    summaries.push(
      buildCoverageRecord(
        filePath,
        await resolveSourceLength(entry, filePath, repoRoot),
        (entry.ranges || []).map((range) => ({ start: range.start, end: range.end })),
        "css",
      ),
    );
  }

  return summaries.sort(sortCoverageRecords);
}

async function resolveSourceLength(entry, filePath, repoRoot) {
  if (entry.text?.length) {
    return entry.text.length;
  }

  try {
    const absolutePath = path.resolve(repoRoot, filePath);
    const text = await fs.readFile(absolutePath, "utf8");
    return text.length;
  } catch {
    return 0;
  }
}

function buildCoverageRecord(filePath, totalBytes, ranges, type) {
  const coveredBytes = computeCoveredBytes(ranges);
  const percent = totalBytes > 0 ? (coveredBytes / totalBytes) * 100 : 0;

  return {
    filePath,
    type,
    totalBytes,
    coveredBytes,
    uncoveredBytes: Math.max(0, totalBytes - coveredBytes),
    coveragePercent: Number(percent.toFixed(1)),
  };
}

function computeCoveredBytes(ranges) {
  if (!ranges.length) {
    return 0;
  }

  const merged = ranges
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((left, right) => left.start - right.start)
    .reduce((accumulator, range) => {
      const previous = accumulator[accumulator.length - 1];
      if (!previous || range.start > previous.end) {
        accumulator.push({ ...range });
      } else if (range.end > previous.end) {
        previous.end = range.end;
      }
      return accumulator;
    }, []);

  return merged.reduce((sum, range) => sum + (range.end - range.start), 0);
}

function normalizeCoveragePath(url, origin) {
  if (!url || !url.startsWith(origin)) {
    return null;
  }

  return url.slice(origin.length).replace(/^\//, "");
}

function sortCoverageRecords(left, right) {
  if (left.coveragePercent !== right.coveragePercent) {
    return left.coveragePercent - right.coveragePercent;
  }
  return left.filePath.localeCompare(right.filePath);
}

function buildCoverageReport({ jsSummary, cssSummary }) {
  const totals = [...jsSummary, ...cssSummary].reduce(
    (accumulator, entry) => {
      accumulator.totalBytes += entry.totalBytes;
      accumulator.coveredBytes += entry.coveredBytes;
      return accumulator;
    },
    { totalBytes: 0, coveredBytes: 0 },
  );

  const overallPercent = totals.totalBytes > 0 ? Number(((totals.coveredBytes / totals.totalBytes) * 100).toFixed(1)) : 0;

  return {
    generatedAt: new Date().toISOString(),
    overall: {
      totalBytes: totals.totalBytes,
      coveredBytes: totals.coveredBytes,
      uncoveredBytes: Math.max(0, totals.totalBytes - totals.coveredBytes),
      coveragePercent: overallPercent,
    },
    jsSummary,
    cssSummary,
  };
}

async function writeCoverageReport(report, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "coverage-summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "coverage-summary.md"), buildCoverageMarkdown(report));
}

function buildCoverageMarkdown(report) {
  const lines = [
    "# Coverage Summary",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Overall rough byte coverage: **${report.overall.coveragePercent}%** (${report.overall.coveredBytes}/${report.overall.totalBytes} bytes)`,
    "",
  ];

  if (report.jsSummary.length) {
    lines.push("## JavaScript", "", "| File | Coverage | Covered / Total |", "| --- | ---: | ---: |");
    for (const entry of report.jsSummary) {
      lines.push(`| \`${entry.filePath}\` | ${entry.coveragePercent}% | ${entry.coveredBytes} / ${entry.totalBytes} |`);
    }
    lines.push("");
  }

  if (report.cssSummary.length) {
    lines.push("## CSS", "", "| File | Coverage | Covered / Total |", "| --- | ---: | ---: |");
    for (const entry of report.cssSummary) {
      lines.push(`| \`${entry.filePath}\` | ${entry.coveragePercent}% | ${entry.coveredBytes} / ${entry.totalBytes} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  summarizeJSCoverage,
  summarizeCSSCoverage,
  buildCoverageReport,
  writeCoverageReport,
};
