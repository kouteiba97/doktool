import { Suspense } from 'react';
import { SignInForm } from './sign-in-form';

/** /sign-in: the sign-in form, centred. */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <SignInForm />
      </Suspense>
    </main>
  );
}
