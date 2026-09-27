// Triggering file downloads from the browser, shared by the JSON and PNG exports.
export function download(filename: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'blueprint'
}

/** Download a Blob, revoking the object URL once the browser has taken it. */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  download(filename, url)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
