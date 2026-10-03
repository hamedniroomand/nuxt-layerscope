export function useToast() {
  const message = useState<string | null>('toast', () => null);
  const show = (text: string) => {
    message.value = text;
  };
  return { message, show };
}
