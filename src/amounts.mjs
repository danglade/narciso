// Decimal inputs avoid floating-point drift. This verifies arithmetic, not
// whether a source amount represents a settled or legitimate transaction.
export function sumAmounts(items, currency) {
  const sources = new Set();
  let cents = 0n;
  for (const {source, amount} of items) {
    if (!source || sources.has(source)) throw new Error('Unsupported total: duplicate or missing source. Count each transaction once.');
    sources.add(source);
    if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(amount)) throw new Error('Unsupported amount: use decimal strings without commas or currency signs.');
    const negative = amount.startsWith('-');
    const [whole, fraction = ''] = amount.replace(/^-/, '').split('.');
    cents += (negative ? -1n : 1n) * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  }
  const absolute = cents < 0n ? -cents : cents;
  return {currency, count: items.length, total: `${cents < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`,
    sources: [...sources], note: 'Arithmetic checked from supplied inputs only. Verify amounts, currency and transaction identity in the source; never call this proof that payments settled or charges were authorized.'};
}
