const Database = require("better-sqlite3");

const db = new Database("codea11y.db");
const matchPath = "%footer.jsx%";

const auditRows = db
  .prepare(
    "select ar.id, ar.guideline, ar.source, ar.line_number, ar.selector, ar.issue_description, ar.snippet from audit_results ar join files f on f.id=ar.file_id where lower(replace(f.path, char(92), '/')) like ? order by ar.id"
  )
  .all(matchPath);

const guidelineRows = db
  .prepare(
    "select wcag_id, count(*) as c, min(g.id) as first_id, max(g.id) as last_id from guidelines g join files f on f.id=g.file_id where lower(replace(f.path, char(92), '/')) like ? group by wcag_id order by c desc, wcag_id"
  )
  .all(matchPath);

const burstRows = db
  .prepare(
    "select min(ar.id) as start_id, max(ar.id) as end_id, count(*) as c from audit_results ar join files f on f.id=ar.file_id where lower(replace(f.path, char(92), '/')) like ? group by cast((ar.id-1)/25 as int) order by start_id"
  )
  .all(matchPath);

function normalizeGuideline(value) {
  const text = String(value || "").trim();
  const match = text.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : text;
}

const duplicateMap = new Map();
for (const row of auditRows) {
  const key = [
    normalizeGuideline(row.guideline),
    row.line_number || "",
    row.selector || "",
    String(row.snippet || "").trim(),
  ].join("|");
  const list = duplicateMap.get(key) || [];
  list.push(row);
  duplicateMap.set(key, list);
}

const duplicateGroups = [...duplicateMap.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([key, rows]) => ({
    key,
    count: rows.length,
    ids: rows.map((row) => row.id),
    guidelines: [...new Set(rows.map((row) => row.guideline))],
  }));

console.log(
  JSON.stringify(
    {
      auditRowCount: auditRows.length,
      duplicateGroupCount: duplicateGroups.length,
      duplicateGroups: duplicateGroups.slice(0, 50),
      guidelineRows,
      bursts: burstRows,
    },
    null,
    2
  )
);