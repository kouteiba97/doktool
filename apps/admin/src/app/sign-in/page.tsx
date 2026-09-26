import { Suspense } from 'react';
import { SignInForm } from './sign-in-form';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <SignInForm />
      </Suspense>
    </main>
  );
}
