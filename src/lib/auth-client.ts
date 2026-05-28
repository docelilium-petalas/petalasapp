export async function signIn(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const data = await res.json();
    return { success: false, message: data.error ?? 'Login failed' };
  }
  return { success: true };
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' });
}
