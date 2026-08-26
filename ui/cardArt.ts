/** Convert a card title to the matching generated-art filename. */
export function cardArtSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function cardArtPath(name: string): string {
  return `/assets/cards/${cardArtSlug(name)}.png`;
}
