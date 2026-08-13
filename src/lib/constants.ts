/** Admin account: bulletin publish + can delete any announcement. */
export const ADMIN_EMAIL = 'menachemlabin@gmail.com';

/** @deprecated use ADMIN_EMAIL */
export const BULLETIN_ADMIN_EMAIL = ADMIN_EMAIL;

export function isAdmin(email: string) {
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function isBulletinAdmin(email: string) {
  return isAdmin(email);
}

export function canDeleteAnnouncement(viewerEmail: string, authorEmail: string) {
  const viewer = viewerEmail.trim().toLowerCase();
  return viewer === authorEmail.trim().toLowerCase() || isAdmin(viewer);
}
