export function useUser() {
  const user = useState<{ name: string; role: 'customer' | 'admin' } | undefined>('user');
  const signIn = (name: string, role: 'customer' | 'admin' = 'customer') => {
    user.value = { name, role };
    useNotice().show(`Welcome, ${name}`);
  };
  const signOut = () => {
    user.value = undefined;
  };
  return { user, signIn, signOut };
}
