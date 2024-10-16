export function validateCPF(cpf: string): boolean {
  // Remove non-numeric characters (if CPF is formatted with dots and dashes)
  cpf = cpf.replace(/\D+/g, "");

  // CPF must have exactly 11 digits
  if (cpf.length !== 11) return false;

  // CPF can't be all repeated numbers (e.g., "111.111.111-11")
  if (/^(\d)\1+$/.test(cpf)) return false;

  // Validate the first digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }

  let firstDigit = 11 - (sum % 11);
  if (firstDigit >= 10) firstDigit = 0;
  if (firstDigit !== parseInt(cpf.charAt(9))) return false;

  // Validate the second digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }

  let secondDigit = 11 - (sum % 11);
  if (secondDigit >= 10) secondDigit = 0;
  if (secondDigit !== parseInt(cpf.charAt(10))) return false;

  // CPF is valid
  return true;
}

export function validateCNPJ(cnpj: string): boolean {
  // Remove non-numeric characters (if CNPJ is formatted with dots, slashes, and dashes)
  cnpj = cnpj.replace(/\D+/g, "");

  // CNPJ must have exactly 14 digits
  if (cnpj.length !== 14) return false;

  // CNPJ can't be all repeated numbers (e.g., "11.111.111/1111-11")
  if (/^(\d)\1+$/.test(cnpj)) return false;

  // Validation of the first check digit
  let length = 12;
  let numbers = cnpj.substring(0, length);
  const digits = cnpj.substring(length);
  let sum = 0;
  let pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  // Validation of the second check digit
  length = 13;
  numbers = cnpj.substring(0, length);
  sum = 0;
  pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  // CNPJ is valid
  return true;
}

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
