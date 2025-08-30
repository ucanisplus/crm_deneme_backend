const standardizeHasirTipi = (value) => {
  if (!value) return '';
  
  let standardized = value.toUpperCase().replace(/\s+/g, '');
  
  if (!/^(Q|R|TR)/.test(standardized)) return value;
  
  // For Q-types with slash format, preserve exactly as-is (both Q221/443 and Q221/221)
  const qTypeMatch = standardized.match(/^Q(\d+)\/(\d+)$/);
  if (qTypeMatch) {
    const first = qTypeMatch[1];
    const second = qTypeMatch[2];
    return `Q${first}/${second}`;  // Always preserve full format
  }
  
  // For R and TR types, still simplify duplicate suffixes: TR257/257 -> TR257
  const nonQDuplicateMatch = standardized.match(/^(R|TR)(\d+)\/\2$/);
  if (nonQDuplicateMatch) {
    standardized = nonQDuplicateMatch[1] + nonQDuplicateMatch[2]; // R + 257
  }
  
  return standardized;
};

console.log('Testing Q221/443:', standardizeHasirTipi('Q221/443'));
console.log('Testing Q221/221:', standardizeHasirTipi('Q221/221'));  
console.log('Testing Q257:', standardizeHasirTipi('Q257'));
console.log('Testing Q257/257:', standardizeHasirTipi('Q257/257'));
