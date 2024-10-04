export function generateCPF(): string {
  const rand = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  // Generate the first 9 random digits
  const n = Array(9)
    .fill(0)
    .map(() => rand(0, 9));

  // Calculate the first verification digit (10th digit)
  const firstDigit =
    11 -
    ((n[0] * 10 +
      n[1] * 9 +
      n[2] * 8 +
      n[3] * 7 +
      n[4] * 6 +
      n[5] * 5 +
      n[6] * 4 +
      n[7] * 3 +
      n[8] * 2) %
      11);
  n.push(firstDigit >= 10 ? 0 : firstDigit); // Apply the rule for 10 or greater

  // Calculate the second verification digit (11th digit)
  const secondDigit =
    11 -
    ((n[0] * 11 +
      n[1] * 10 +
      n[2] * 9 +
      n[3] * 8 +
      n[4] * 7 +
      n[5] * 6 +
      n[6] * 5 +
      n[7] * 4 +
      n[8] * 3 +
      n[9] * 2) %
      11);
  n.push(secondDigit >= 10 ? 0 : secondDigit); // Apply the rule for 10 or greater

  return n.join("");
}
