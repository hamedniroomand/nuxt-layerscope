export function useNotice() {
  const message = useState<string>('notice', () => '');
  const show = (text: string) => {
    message.value = text;
  };
  return { message, show };
}
