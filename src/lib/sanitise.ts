// Strip characters that have special meaning to PostgREST `like` /
// `ilike` filters before interpolating user input into a search pattern.
// Doesn't prevent SQL injection (Supabase JS parameterises the value
// regardless), but stops admins from triggering pathological scans with
// `%_%_%_%`-style patterns and from PostgREST grammar weirdness with
// commas / parens / asterisks.
export function sanitiseLikeText(input: string): string {
  return input
    .replace(/[,()%_*]/g, " ")
    .trim()
    .slice(0, 100);
}
