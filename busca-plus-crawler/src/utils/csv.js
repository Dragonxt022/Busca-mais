function escapeCsvValue(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function serializeCsv(rows, columns) {
  const header = columns.map((column) => escapeCsvValue(column.key)).join(',');
  const body = rows.map((row) => (
    columns.map((column) => escapeCsvValue(column.getter(row))).join(',')
  ));

  return [header, ...body].join('\n');
}

function parseCsv(text) {
  const input = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let currentValue = '';
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentValue += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      currentRow.push(currentValue);
      currentValue = '';
    } else if (char === '\n') {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
    } else if (char !== '\r') {
      currentValue += char;
    }
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows.shift().map((item) => String(item || '').trim());

  return rows
    .filter((row) => row.some((cell) => String(cell || '').trim() !== ''))
    .map((row) => headers.reduce((acc, header, index) => {
      acc[header] = String(row[index] || '').trim();
      return acc;
    }, {}));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y', 'on'].includes(normalized);
}

function parseNullableInt(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

module.exports = {
  parseBoolean,
  parseCsv,
  parseNullableInt,
  serializeCsv,
};
