export const passwordMinimum = 12;
export const passwordHint = "Use at least 12 characters, including uppercase and lowercase letters, a number, and a symbol.";

export function requireStrongPassword(password) {
  if (typeof password !== "string" || password.length < passwordMinimum
      || !/[A-Z]/.test(password) || !/[a-z]/.test(password)
      || !/[0-9]/.test(password) || !/[!-\/:-@[-`{-~]/.test(password)) {
    throw new Error(passwordHint);
  }
  if (new TextEncoder().encode(password).length > 72)
    throw new Error("Use a password no longer than 72 bytes.");
}
