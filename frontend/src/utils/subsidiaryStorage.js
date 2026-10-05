const STORAGE_KEY = 'eics_active_subsidiary'

export function readStoredSubsidiaryId() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw === 'uae' || raw === 'saudi' || raw === 'india' ? raw : null
  } catch {
    return null
  }
}

export function writeStoredSubsidiaryId(id) {
  try {
    sessionStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function clearStoredSubsidiary() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
