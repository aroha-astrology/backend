export async function register() {
  // no-op — required export for Next.js instrumentation lifecycle
}

export async function onRequestError(
  error: Error & { digest?: string },
  request: { path: string; method: string; headers: { [key: string]: string } },
  _context: { routerKind: string; routePath: string; routeType: string }
): Promise<void> {
  // Catches server-side errors that are NOT caught by route handlers (unhandled throws).
  // For handled errors in catch blocks, use serverError() from lib/telegram.ts instead.
  const { notifyBackendError } = await import('@/lib/telegram');
  await notifyBackendError(`${request.method} ${request.path}`, error);
}
