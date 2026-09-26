import { db } from '../db'
import { deleteNote, restoreNote } from '../stores/notes'
import { showToast } from '../stores/toast'

/** Borra al instante (sin diálogo) y ofrece deshacer. */
export async function deleteWithUndo(id: string) {
  const note = await db.notes.get(id)
  await deleteNote(id)
  const title = note?.title?.trim() || 'Untitled'
  showToast(`Deleted “${title.length > 40 ? `${title.slice(0, 40)}…` : title}”`, { label: 'Undo', run: () => void restoreNote(id) })
}
