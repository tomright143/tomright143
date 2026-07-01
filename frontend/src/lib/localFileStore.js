// In-memory handoff for locally-picked video files (never uploaded).
// Blob/File objects only live for the browser session; keyed by review id.
const store = new Map();
export const setLocalFile = (id, file) => store.set(id, file);
export const getLocalFile = (id) => store.get(id);
export const clearLocalFile = (id) => store.delete(id);
