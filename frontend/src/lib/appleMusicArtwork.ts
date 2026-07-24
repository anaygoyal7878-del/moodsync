/** Apple Music API artwork URLs contain literal `{w}` and `{h}` template
 * placeholders the caller substitutes with the pixel size actually
 * needed (documented Apple Music API behavior, not MoodSync's own
 * convention) — e.g. `.../100x100bb.jpg` becomes a real URL only after
 * this substitution. */
export function artworkUrl(artwork: MusicKit.Artwork | undefined, size = 300): string | null {
  if (!artwork?.url) return null;
  return artwork.url.replace("{w}", String(size)).replace("{h}", String(size));
}
