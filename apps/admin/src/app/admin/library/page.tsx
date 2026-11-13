import { redirect } from 'next/navigation';

/** /admin/library opens the ordonnances. */
export default function Page() {
  redirect('/admin/library/ordonnances');
}
