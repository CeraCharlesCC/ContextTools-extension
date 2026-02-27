export function isFailureConclusion(conclusion: string | null | undefined): boolean {
  return (conclusion ?? '').toLowerCase() === 'failure';
}
