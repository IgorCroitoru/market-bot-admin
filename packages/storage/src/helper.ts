export function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required option: ${name}`);
  }

  return value;
}