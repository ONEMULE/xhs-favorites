function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows, columns) {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const value =
          typeof column.value === "function" ? column.value(row) : row[column.value];
        return escapeCsvValue(value);
      })
      .join(",")
  );

  return [header, ...lines].join("\n");
}
