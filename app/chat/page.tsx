import { redirect } from 'next/navigation';
// The conversation is the home page now; this path is kept only so older
// links to /chat still land on it rather than 404.
export default function Page() { redirect('/'); }
