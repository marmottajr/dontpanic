import { AuthShell } from '@/components/auth-shell';

/**
 * `/invite` cannot live in the `(auth)` route group: that group's own layout is
 * the same one used here, but the group is also where the "already signed in?
 * go home" pages live conceptually. Keeping the route separate and borrowing
 * the shell gives the invitee the same screen without entangling the two.
 */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
