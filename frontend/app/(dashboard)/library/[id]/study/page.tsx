import { redirect } from 'next/navigation'

/** Old Study with Flow links now enter the single Flow surface with Source context. */
export default function StudyWithFlowRedirect({ params }: { params: { id: string } }) {
  redirect(`/ai?resource=${encodeURIComponent(params.id)}`)
}
