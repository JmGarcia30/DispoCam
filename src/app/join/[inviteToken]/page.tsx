import { WeddingJoin } from "@/components/join/wedding-join";

export default async function JoinPage({ params }: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await params;
  return <WeddingJoin inviteToken={inviteToken} />;
}
