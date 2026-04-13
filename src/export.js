import fs from "node:fs";
import path from "node:path";
import { APP_HOME, DEFAULT_CHANNEL } from "./constants.js";
import { toCsv } from "./csv.js";
import { listBoardItems, listSavedBoards, listSavedNotes } from "./service.js";

function slugTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function coalesce(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      continue;
    }
    return value;
  }
  return null;
}

function maxNullable(a, b) {
  if (a === null || a === undefined) {
    return b ?? null;
  }
  if (b === null || b === undefined) {
    return a;
  }
  return Math.max(a, b);
}

function mergeRecord(existing, incoming, boardName = null) {
  if (!existing) {
    return {
      selected: false,
      selected_box: "☐",
      review_status: "pending",
      needs_detail: false,
      needs_detail_box: "☐",
      note_id: incoming.note_id,
      title: incoming.title ?? null,
      author: incoming.author ?? null,
      note_url: incoming.note_url ?? null,
      cover_url: incoming.cover_url ?? null,
      xsec_token: incoming.xsec_token ?? null,
      like_count: incoming.like_count ?? null,
      comment_count: incoming.comment_count ?? null,
      board_names: boardName ? [boardName] : [],
      source_main_favorites: false,
      source_boards: false
    };
  }

  existing.title = coalesce(existing.title, incoming.title);
  existing.author = coalesce(existing.author, incoming.author);
  existing.note_url = coalesce(existing.note_url, incoming.note_url);
  existing.cover_url = coalesce(existing.cover_url, incoming.cover_url);
  existing.xsec_token = coalesce(existing.xsec_token, incoming.xsec_token);
  existing.like_count = maxNullable(existing.like_count, incoming.like_count);
  existing.comment_count = maxNullable(existing.comment_count, incoming.comment_count);

  if (boardName && !existing.board_names.includes(boardName)) {
    existing.board_names.push(boardName);
  }

  return existing;
}

function buildRows(mainFavorites, boardsWithItems) {
  const byNoteId = new Map();

  for (const note of mainFavorites.items) {
    const merged = mergeRecord(byNoteId.get(note.note_id), note);
    merged.source_main_favorites = true;
    byNoteId.set(note.note_id, merged);
  }

  for (const board of boardsWithItems) {
    for (const item of board.items) {
      const merged = mergeRecord(byNoteId.get(item.note_id), item, board.board_name);
      merged.source_boards = true;
      byNoteId.set(item.note_id, merged);
    }
  }

  return Array.from(byNoteId.values())
    .map((row) => ({
      ...row,
      board_count: row.board_names.length,
      board_names: row.board_names.join(" | ")
    }))
    .sort((left, right) => {
      const leftLikes = left.like_count ?? -1;
      const rightLikes = right.like_count ?? -1;
      return rightLikes - leftLikes;
    });
}

function csvColumns() {
  return [
    { header: "selected_box", value: "selected_box" },
    { header: "needs_detail_box", value: "needs_detail_box" },
    { header: "review_status", value: "review_status" },
    { header: "selected", value: (row) => (row.selected ? "TRUE" : "FALSE") },
    { header: "needs_detail", value: (row) => (row.needs_detail ? "TRUE" : "FALSE") },
    { header: "note_id", value: "note_id" },
    { header: "title", value: "title" },
    { header: "author", value: "author" },
    { header: "like_count", value: "like_count" },
    { header: "comment_count", value: "comment_count" },
    { header: "board_count", value: "board_count" },
    { header: "board_names", value: "board_names" },
    { header: "source_main_favorites", value: (row) => (row.source_main_favorites ? "TRUE" : "FALSE") },
    { header: "source_boards", value: (row) => (row.source_boards ? "TRUE" : "FALSE") },
    { header: "note_url", value: "note_url" },
    { header: "cover_url", value: "cover_url" },
    { header: "xsec_token", value: "xsec_token" }
  ];
}

function buildReviewHtml({ rows, metadata, title }) {
  const embeddedRows = JSON.stringify(rows);
  const embeddedMetadata = JSON.stringify(metadata);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      --bg: #f7f1e7;
      --panel: #fffaf2;
      --ink: #1f1a17;
      --muted: #6d635d;
      --line: #d7c9bc;
      --accent: #9d2a17;
      --accent-soft: #f3d6c4;
      --chip: #efe4d7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, #fffdf7 0, #fff7eb 28%, transparent 60%),
        linear-gradient(180deg, #f4ecdf 0%, #f0e5d8 100%);
    }
    .shell {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }
    .hero {
      background: linear-gradient(135deg, rgba(157, 42, 23, 0.08), rgba(255,255,255,0.65));
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 18px 40px rgba(73, 44, 25, 0.08);
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.1;
    }
    .lede {
      margin-top: 10px;
      color: var(--muted);
      max-width: 72ch;
      font-size: 16px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 20px;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px 16px;
    }
    .stat-label {
      color: var(--muted);
      font-size: 13px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .stat-value {
      margin-top: 6px;
      font-size: 24px;
      font-weight: 700;
    }
    .toolbar {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr auto auto auto;
      gap: 10px;
      margin-top: 18px;
      align-items: center;
    }
    input, select, button {
      min-height: 42px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fffdf9;
      color: var(--ink);
      padding: 0 12px;
      font-size: 14px;
    }
    button {
      cursor: pointer;
      background: var(--panel);
    }
    button.primary {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }
    .table-wrap {
      margin-top: 18px;
      background: rgba(255,255,255,0.78);
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 18px 40px rgba(73, 44, 25, 0.08);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead {
      background: rgba(157, 42, 23, 0.08);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    th, td {
      padding: 12px 10px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
      font-size: 14px;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    tr:hover td {
      background: rgba(255, 248, 239, 0.9);
    }
    .title-cell a {
      color: var(--ink);
      text-decoration: none;
      font-weight: 700;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--chip);
      color: var(--muted);
      font-size: 12px;
    }
    .cover {
      width: 84px;
      height: 112px;
      object-fit: cover;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: #f2ebe2;
    }
    .counter {
      white-space: nowrap;
    }
    .footer {
      margin-top: 14px;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 1000px) {
      .toolbar {
        grid-template-columns: 1fr 1fr;
      }
      .table-wrap {
        overflow-x: auto;
      }
      table {
        min-width: 1100px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <h1>小红书收藏审核台</h1>
      <p class="lede">这份页面用于人工勾选后续需要做详细内容抓取的收藏笔记。勾选会自动保存在浏览器本地，并且可以随时导出最新 CSV。</p>
      <div class="stats">
        <div class="stat"><div class="stat-label">唯一笔记数</div><div class="stat-value" id="stat-total">0</div></div>
        <div class="stat"><div class="stat-label">已勾选需深挖</div><div class="stat-value" id="stat-selected">0</div></div>
        <div class="stat"><div class="stat-label">来自主收藏流</div><div class="stat-value" id="stat-main">0</div></div>
        <div class="stat"><div class="stat-label">来自收藏夹</div><div class="stat-value" id="stat-board">0</div></div>
      </div>
      <div class="toolbar">
        <input id="search" type="search" placeholder="搜索标题、作者、收藏夹" />
        <select id="scope">
          <option value="all">显示全部</option>
          <option value="selected">只看已勾选</option>
          <option value="unselected">只看未勾选</option>
        </select>
        <select id="source">
          <option value="all">全部来源</option>
          <option value="main">主收藏流</option>
          <option value="board">收藏夹</option>
        </select>
        <button id="select-visible">勾选当前筛选结果</button>
        <button id="clear-visible">取消当前筛选结果</button>
        <button class="primary" id="download">导出 CSV</button>
      </div>
    </section>

    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>勾选</th>
            <th>封面</th>
            <th>标题与标签</th>
            <th>作者</th>
            <th>点赞</th>
            <th>评论</th>
            <th>收藏夹</th>
            <th>链接</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </section>

    <div class="footer" id="footer"></div>
  </div>

  <script>
    const rows = ${embeddedRows};
    const metadata = ${embeddedMetadata};
    const storageKey = "xhs-favorites-review-selections";
    const selectedSet = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));

    function saveSelection() {
      localStorage.setItem(storageKey, JSON.stringify([...selectedSet]));
    }

    function csvEscape(value) {
      if (value === null || value === undefined) return "";
      const text = String(value);
      if (/[",\\n\\r]/.test(text)) {
        return '"' + text.replace(/"/g, '""') + '"';
      }
      return text;
    }

    function rowsForDownload() {
      return rows.map((row) => ({
        ...row,
        selected: selectedSet.has(row.note_id) ? "TRUE" : "FALSE",
        selected_box: selectedSet.has(row.note_id) ? "☑" : "☐",
        needs_detail: selectedSet.has(row.note_id) ? "TRUE" : "FALSE",
        needs_detail_box: selectedSet.has(row.note_id) ? "☑" : "☐"
      }));
    }

    function downloadCsv() {
      const columns = [
        "selected_box",
        "needs_detail_box",
        "selected",
        "needs_detail",
        "review_status",
        "note_id",
        "title",
        "author",
        "like_count",
        "comment_count",
        "board_count",
        "board_names",
        "source_main_favorites",
        "source_boards",
        "note_url",
        "cover_url",
        "xsec_token"
      ];
      const lines = [columns.join(",")];
      for (const row of rowsForDownload()) {
        lines.push(columns.map((column) => csvEscape(row[column])).join(","));
      }
      const blob = new Blob([lines.join("\\n")], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = metadata.export_file_name;
      link.click();
      URL.revokeObjectURL(link.href);
    }

    function filteredRows() {
      const query = document.getElementById("search").value.trim().toLowerCase();
      const scope = document.getElementById("scope").value;
      const source = document.getElementById("source").value;

      return rows.filter((row) => {
        const haystack = [row.title, row.author, row.board_names].join(" ").toLowerCase();
        if (query && !haystack.includes(query)) return false;

        const selected = selectedSet.has(row.note_id);
        if (scope === "selected" && !selected) return false;
        if (scope === "unselected" && selected) return false;

        if (source === "main" && !row.source_main_favorites) return false;
        if (source === "board" && !row.source_boards) return false;

        return true;
      });
    }

    function render() {
      const tbody = document.getElementById("rows");
      const visible = filteredRows();
      tbody.innerHTML = "";

      for (const row of visible) {
        const tr = document.createElement("tr");

        const checked = selectedSet.has(row.note_id);
        tr.innerHTML = \`
          <td>
            <input type="checkbox" data-note-id="\${row.note_id}" \${checked ? "checked" : ""} />
          </td>
          <td>
            \${row.cover_url ? \`<img class="cover" src="\${row.cover_url}" alt="">\` : ""}
          </td>
          <td class="title-cell">
            <a href="\${row.note_url}" target="_blank" rel="noreferrer">\${row.title || "(无标题)"}</a>
            <div class="meta">
              \${row.source_main_favorites ? '<span class="chip">主收藏流</span>' : ""}
              \${row.source_boards ? '<span class="chip">收藏夹</span>' : ""}
              \${row.board_count ? \`<span class="chip">\${row.board_count} 个收藏夹</span>\` : ""}
            </div>
          </td>
          <td>\${row.author || ""}</td>
          <td class="counter">\${row.like_count ?? ""}</td>
          <td class="counter">\${row.comment_count ?? ""}</td>
          <td>\${row.board_names || ""}</td>
          <td><a href="\${row.note_url}" target="_blank" rel="noreferrer">打开</a></td>
        \`;

        tbody.appendChild(tr);
      }

      document.querySelectorAll('input[type="checkbox"][data-note-id]').forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const noteId = checkbox.getAttribute("data-note-id");
          if (checkbox.checked) {
            selectedSet.add(noteId);
          } else {
            selectedSet.delete(noteId);
          }
          saveSelection();
          updateStats();
        });
      });

      updateStats(visible);
    }

    function updateStats(visible = filteredRows()) {
      document.getElementById("stat-total").textContent = rows.length;
      document.getElementById("stat-selected").textContent = selectedSet.size;
      document.getElementById("stat-main").textContent = rows.filter((row) => row.source_main_favorites).length;
      document.getElementById("stat-board").textContent = rows.filter((row) => row.source_boards).length;
      document.getElementById("footer").textContent =
        \`当前筛选结果 \${visible.length} 条，导出时间 \${metadata.exported_at}，主收藏流抓取 \${metadata.main_items} 条，收藏夹 \${metadata.board_count} 个。\`;
    }

    function setVisibleSelection(value) {
      for (const row of filteredRows()) {
        if (value) {
          selectedSet.add(row.note_id);
        } else {
          selectedSet.delete(row.note_id);
        }
      }
      saveSelection();
      render();
    }

    document.getElementById("search").addEventListener("input", render);
    document.getElementById("scope").addEventListener("change", render);
    document.getElementById("source").addEventListener("change", render);
    document.getElementById("select-visible").addEventListener("click", () => setVisibleSelection(true));
    document.getElementById("clear-visible").addEventListener("click", () => setVisibleSelection(false));
    document.getElementById("download").addEventListener("click", downloadCsv);

    render();
  </script>
</body>
</html>`;
}

async function collectBoardsWithItems({
  boards,
  headless,
  channel,
  boardItemsScroll,
  boardItemsLimit,
  onProgress
}) {
  const output = [];

  for (let index = 0; index < boards.items.length; index += 1) {
    const board = boards.items[index];
    onProgress?.(`Reading board ${index + 1}/${boards.items.length}: ${board.board_name || board.board_id}`);
    const result = await listBoardItems({
      boardId: board.board_id,
      limit: boardItemsLimit,
      scroll: boardItemsScroll,
      headless,
      channel
    });

    output.push({
      board_id: board.board_id,
      board_name: board.board_name,
      item_count: board.item_count,
      has_more: result.has_more,
      next_cursor: result.next_cursor,
      items: result.items
    });
  }

  return output;
}

export async function exportReviewBundle({
  outDir = path.join(APP_HOME, "exports", slugTimestamp()),
  headless = true,
  channel = DEFAULT_CHANNEL,
  notesLimit = 100000,
  notesScroll = 600,
  boardsLimit = 10000,
  boardItemsLimit = 100000,
  boardItemsScroll = 300,
  onProgress = null
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });

  onProgress?.("Reading main favorites feed");
  const mainFavorites = await listSavedNotes({
    limit: notesLimit,
    scroll: notesScroll,
    headless,
    channel
  });

  onProgress?.("Reading favorite boards");
  const boards = await listSavedBoards({
    limit: boardsLimit,
    headless,
    channel
  });

  const boardsWithItems = await collectBoardsWithItems({
    boards,
    headless,
    channel,
    boardItemsScroll,
    boardItemsLimit,
    onProgress
  });

  const rows = buildRows(mainFavorites, boardsWithItems);

  const metadata = {
    exported_at: new Date().toISOString(),
    profile_id: mainFavorites.profile_id ?? boards.profile_id ?? null,
    main_items: mainFavorites.items.length,
    main_has_more: mainFavorites.has_more,
    board_count: boards.items.length,
    total_unique_notes: rows.length,
    export_file_name: "favorites_review_updated.csv"
  };

  const csv = toCsv(rows, csvColumns());
  const jsonPayload = {
    metadata,
    rows,
    boards: boardsWithItems
  };

  const csvPath = path.join(outDir, "favorites_review.csv");
  const jsonPath = path.join(outDir, "favorites_review.json");
  const htmlPath = path.join(outDir, "favorites_review.html");
  const summaryPath = path.join(outDir, "favorites_review_summary.json");

  fs.writeFileSync(csvPath, csv, "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
  fs.writeFileSync(summaryPath, JSON.stringify(metadata, null, 2), "utf8");
  fs.writeFileSync(
    htmlPath,
    buildReviewHtml({
      rows,
      metadata,
      title: "小红书收藏审核台"
    }),
    "utf8"
  );

  return {
    out_dir: outDir,
    csv_path: csvPath,
    json_path: jsonPath,
    html_path: htmlPath,
    summary_path: summaryPath,
    metadata
  };
}
