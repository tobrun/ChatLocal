import { ChatView } from "@/components/chat/ChatView";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;
  return <ChatView sessionId={sessionId} />;
}
