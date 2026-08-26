import JourneyWorld from '@/components/journey-world/JourneyWorld'

export default function JourneyWorldPage({ params }: { params: { id: string } }) {
  return <JourneyWorld pathId={params.id} />
}
