const BASE_URL = 'http://127.0.0.1:8000'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!res.ok) {
    let message = 'Request failed'
    try {
      const data = await res.json()
      message = data.detail || message
    } catch {
      // noop
    }
    throw new Error(message)
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  listNotes: () => request('/notes'),
  getNote: (id) => request(`/notes/${id}`),
  createNote: (payload) => request('/notes', { method: 'POST', body: JSON.stringify(payload) }),
  updateNote: (id, payload) => request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
  searchNotes: (q) => request(`/search?q=${encodeURIComponent(q)}`),
  addTag: (id, name) => request(`/notes/${id}/tags`, { method: 'POST', body: JSON.stringify({ name }) }),
  removeTag: (id, tag) => request(`/notes/${id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' }),
  createLink: (payload) => request('/links', { method: 'POST', body: JSON.stringify(payload) }),
  deleteLink: (id) => request(`/links/${id}`, { method: 'DELETE' }),
  getGraph: () => request('/graph'),
}
