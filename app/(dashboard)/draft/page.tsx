import { BrutalCard } from "@/components/ui/brutal-card";
import { BrutalButton } from "@/components/ui/brutal-button";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DraftDashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const drafts = await prisma.revision.findMany({
    where: {
      authorId: session.user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-12">
      <div className="flex justify-between items-end border-b-8 border-black pb-6">
        <div>
          <h1 className="text-6xl font-black uppercase tracking-tighter mix-blend-difference">
            Ops Center
          </h1>
          <p className="text-xl font-bold mt-2 text-hot-pink">
            YOUR DIGITAL WORKSHOP / DRAFTS & REVISIONS
          </p>
        </div>
        
        <Link href="/draft/new">
          <BrutalButton variant="primary" size="lg">
            + CREATE NEW SUBMISSION
          </BrutalButton>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {drafts.length === 0 ? (
          <div className="col-span-full py-12 text-center border-4 border-dashed border-black">
            <h2 className="text-3xl font-black text-gray-400">NO DRAFTS FOUND. START THE REBELLION.</h2>
          </div>
        ) : (
          drafts.map((draft) => (
            <BrutalCard key={draft.id} color="white" className="flex flex-col h-64 justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-2 py-1 text-xs font-black border-2 border-black ${
                    draft.status === 'DRAFT' ? 'bg-gray-200' :
                    draft.status === 'PENDING' ? 'bg-electric-blue text-white' :
                    draft.status === 'REJECTED' ? 'bg-hot-pink text-white' : 'bg-neon-green'
                  }`}>
                    {draft.status}
                  </span>
                  <span className="text-xs font-bold text-gray-500">
                    {draft.updatedAt.toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-2xl font-black line-clamp-2 uppercase tracking-tight">
                  {draft.title || "UNTITLED"}
                </h3>
                {draft.articleId && (
                  <p className="text-sm font-bold text-electric-blue mt-2">
                    → EDITING LIVE ARTICLE
                  </p>
                )}
              </div>
              
              <Link href={`/draft/${draft.id}`}>
                <BrutalButton variant="secondary" className="w-full mt-4">
                  {draft.status === 'DRAFT' || draft.status === 'REJECTED' ? 'EDIT DRAFT' : 'VIEW DETAIL'}
                </BrutalButton>
              </Link>
            </BrutalCard>
          ))
        )}
      </div>
    </div>
  );
}