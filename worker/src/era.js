// The "reminiscence bump": people remember most vividly what happened
// between roughly age 10 and age 30.
export function memoryYears(birthYear, now = new Date().getFullYear()) {
  return { from: birthYear + 10, to: Math.min(birthYear + 30, now) };
}

// Qloo's age groups, picked from the person's age today.
export function ageBucket(birthYear, now = new Date().getFullYear()) {
  const age = now - birthYear;
  if (age >= 55) return '55_and_older';
  if (age >= 45) return '45_to_54';
  if (age >= 35) return '35_to_44';
  if (age >= 30) return '30_to_34';
  if (age >= 25) return '25_to_29';
  return '24_and_younger';
}

// An artist "fits" the memory years if they were plausibly performing then:
// born no more than 35 years before the person and no more than 12 after.
// Bands and artists without a birth date are kept.
export function artistFits(artist, birthYear) {
  if (!artist.born) return true;
  return artist.born >= birthYear - 35 && artist.born <= birthYear + 12;
}

export function inYears(year, years) {
  return typeof year === 'number' && year >= years.from && year <= years.to;
}
