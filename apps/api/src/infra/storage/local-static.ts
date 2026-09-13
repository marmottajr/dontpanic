/**
 * Where the `local` storage driver has to be mounted so that the URLs it hands
 * out actually resolve.
 *
 * LocalStorageAdapter builds every public URL as
 * `${LOCAL_STORAGE_PUBLIC_URL}/${key}`, and nothing else in the API knows that
 * value. Serving the upload directory anywhere else — or not at all, which is
 * what happened before — produces avatars whose URL is written to the database
 * and answers 404 for ever. So the mount point is DERIVED from the same setting
 * instead of being a second constant that drifts from the first.
 *
 * The URL may legitimately be absolute (`http://localhost:4201/files`, dev) or
 * path-only (`/files`, behind a reverse proxy that already routes the host), so
 * both are accepted and only the path survives.
 */
export function localStaticPrefix(publicUrl: string): string {
  const raw = publicUrl.trim();
  // `new URL` needs a base for the path-only form; the base is thrown away with
  // the rest of the origin, so any absolute URL would do here.
  const path = URL.canParse(raw) ? new URL(raw).pathname : new URL(raw, 'http://x').pathname;

  const normalised = `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  // Mounting at `/` would put the upload directory in front of every API route,
  // including `/api/*` — a misconfiguration that silently turns user-uploaded
  // files into the thing that answers before the application does.
  if (normalised === '/') {
    throw new Error(
      'LOCAL_STORAGE_PUBLIC_URL must contain a path (e.g. http://localhost:4201/files). ' +
        'Serving uploads at the root would shadow the API routes.',
    );
  }
  return normalised;
}
