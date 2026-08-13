/** Only this account may publish to the bulletin board. Everyone can read. */
export const BULLETIN_ADMIN_EMAIL = 'menachemlabib@gmail.com';

export function isBulletinAdmin(email: string) {
  return email.trim().toLowerCase() === BULLETIN_ADMIN_EMAIL;
}
