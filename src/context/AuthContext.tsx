"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { signOut } from "@/lib/auth-client";

interface User {
  id: string;
  email: string;
  nome: string;
  sobrenome?: string;
  role: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  logout: async () => {},
  setUser: () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me")
      .then(r => r.json())
      .then((d: { authenticated: boolean; user: User }) => {
        if (!cancelled && d.authenticated) setUser(d.user);
      })
      .catch(() => { /* network error — stay unauthenticated */ })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const logout = async () => {
    await signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
