export function setDocumentTitle(title) {
  if (typeof document !== 'undefined') {
    document.title = title
  }
}
