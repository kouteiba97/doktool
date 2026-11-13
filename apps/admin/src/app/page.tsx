import { redirect } from 'next/navigation';

/** The site root sends to the console. */
export default function Root() {
  redirect('/admin');
}
