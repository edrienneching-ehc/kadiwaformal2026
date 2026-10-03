export function tableText(table) {
  const n = Number(table);
  return Number.isInteger(n) && n >= 1 && n <= 15 ? `Table ${n}` : 'Registration desk';
}

export function extractToken(value, siteUrl) {
  const input = String(value).trim();
  if (/^[a-f0-9]{64}$/.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { throw new Error('This is not a KADIWA Formal pass.'); }
  const site = new URL(siteUrl);
  if (url.origin !== site.origin || url.pathname !== site.pathname) throw new Error('This pass is for a different website.');
  const token = url.searchParams.get('pass');
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw new Error('The guest pass is incomplete.');
  return token;
}

export function passUrl(token, siteUrl) {
  const url = new URL(siteUrl);
  url.searchParams.set('pass', token);
  return url.href;
}

export function csv(rows) {
  return rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}

export function filteredGuests(guests, query, filter) {
  const q = query.trim().toLocaleLowerCase();
  return guests.filter(g => `${g.name} ${g.congregation} ${g.role} ${tableText(g.table)}`.toLocaleLowerCase().includes(q)
    && (filter === 'all' || (filter === 'arrived' ? Boolean(g.checkedInAt) : !g.checkedInAt)));
}
